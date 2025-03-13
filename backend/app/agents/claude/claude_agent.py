from loguru import logger
import os
import json
import logging
import httpx
import asyncio
from datetime import datetime
from backend.app.agents.base_agent import CONFIG, BaseAgent
from sentence_transformers import SentenceTransformer

logger.remove()  # Remove default logger
logger.add("logs/claude.log", level="INFO", format="{time} - {level} - {message}", rotation="1 MB")  # Async-safe logging

class ClaudeAgent(BaseAgent):
    def __init__(self, api_key):
        super().__init__(api_key, "Claude")
        self.active_debates = {}
        self.model = None
        self.initialize_tools()
        
    def initialize_tools(self):
        """Initialize NLP tools if enabled in CONFIG."""
        try:
            if "TOOLS" in CONFIG and "sentence-transformers" in CONFIG["TOOLS"]:
                model_name = CONFIG["TOOLS"]["sentence-transformers"]
                self.model = SentenceTransformer(model_name)
                self.logger.info(f"Loaded sentence transformer model: {model_name}")
        except Exception as e:
            self.logger.warning(f"Failed to load sentence transformer: {e}")
            
    def get_notes(self):
        return {
            "role": "Arbitration & Reconciliation",
            "team_notes": """
                # CLAUDE'S OPERATIONAL NOTES

                ## MY ROLE
                - Decision Arbitration & Reconciliation
                - Evaluate responses with confidence metrics
                - Facilitate structured debate
                - Determine consensus vs. need for further debate
                - Produce outputs with majority positions while preserving dissent

                ## TEAM PROTOCOLS
                - TO GROK: Will respond to moderation signals and immediately adjust thresholds on loop/deadlock alerts
                - TO GPT-4o: Will provide clean JSON formatting for all arbitration decisions
                - TO COMMANDER: Will ensure transparency by providing both decisions and reasoning

                ## REMINDER
                We are Manus Killswitch - structured collaboration beats unchecked iteration.
            """
        }
    
    async def health_check(self):
        """Provide health status information."""
        last_heartbeat = self.redis_client.get(f"{self.agent_name.lower()}_heartbeat")
        active_debate_count = len(self.active_debates)
        
        return {
            "agent": self.agent_name,
            "status": "alive" if last_heartbeat else "stale",
            "last_heartbeat": last_heartbeat,
            "timestamp": datetime.utcnow().isoformat(),
            "active_debates": active_debate_count,
            "tools_loaded": self.model is not None
        }
        
    async def start(self):
        """Main loop with enhanced subscriptions."""
        await self._publish_notes()
        async with websockets.connect(CONFIG["WS_URI"]) as ws:
            pubsub = self.redis_client.pubsub()
            pubsub.subscribe(CONFIG["REDIS_CHANNEL_RES"])
            pubsub.subscribe(CONFIG["REDIS_CHANNEL_MOD"])
            
            # Also subscribe to arbitration results as suggested by Grok
            pubsub.subscribe(CONFIG.get("REDIS_CHANNEL_ARB", "arbitration_channel"))
            
            self.logger.info(f"{self.agent_name} connected to War Room - WebSocket and Redis live.")
            await asyncio.gather(
                self._listen_responses(pubsub, ws),
                self._heartbeat()
            )
        
    async def call_claude_api(self, messages, max_tokens=1000):
        """Call Claude API for deeper reasoning when needed."""
        # Only proceed with caching if enabled
        if CONFIG.get("CACHING_ENABLED", True):
            # Generate a simple hash for caching
            query_content = json.dumps(messages)
            query_hash = str(hash(query_content))
            cache_key = f"cache:{self.agent_name}:{query_hash}"
            
            # Try to get from Redis cache first
            cached_response = self.redis_client.get(cache_key)
            if cached_response:
                self.logger.info(f"Cache hit for query: {query_hash[:8]}...")
                return json.loads(cached_response)
        
        # If not in cache or caching disabled, make the API call
        async with httpx.AsyncClient(timeout=30) as client:
            headers = {
                "x-api-key": self.api_key,
                "content-type": "application/json"
            }
            
            payload = {
                "model": CONFIG.get("MODEL", "claude-3-7-sonnet-20250219"),
                "messages": messages,
                "max_tokens": max_tokens
            }
            
            # Added retry logic
            max_retries = 3
            retry_count = 0
            
            while retry_count < max_retries:
                try:
                    response = await client.post(
                        CONFIG.get("API_URL", "https://api.anthropic.com/v1/messages"),
                        headers=headers,
                        json=payload
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        
                        # Store in Redis cache if enabled
                        if CONFIG.get("CACHING_ENABLED", True):
                            cache_ttl = CONFIG.get("CACHE_TTL", 300)
                            self.redis_client.set(
                                cache_key,
                                json.dumps(result),
                                ex=cache_ttl
                            )
                            
                        return result
                    elif response.status_code == 429:
                        # Rate limit - wait and retry
                        retry_count += 1
                        wait_time = 2 ** retry_count  # Exponential backoff
                        self.logger.warning(f"Rate limited, retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                    else:
                        self.logger.error(f"API call failed: {response.status_code}, {response.text}")
                        return None
                        
                except Exception as e:
                    retry_count += 1
                    self.logger.error(f"API call error: {e}")
                    if retry_count >= max_retries:
                        self.logger.error("Max retries reached, giving up")
                        return None
                    await asyncio.sleep(1)
                    
            return None
    
    async def process_response(self, response, agent, ws):
        """Process responses from other agents and perform arbitration."""
        debate_id = response.get("debate_id", "default")
        round_num = response.get("round", 0)
        
        # Track responses by debate and round
        if debate_id not in self.active_debates:
            self.active_debates[debate_id] = {"rounds": {}, "status": "active", "start_time": datetime.utcnow().isoformat()}
            
        if round_num not in self.active_debates[debate_id]["rounds"]:
            self.active_debates[debate_id]["rounds"][round_num] = []
            
        # Add the response
        self.active_debates[debate_id]["rounds"][round_num].append({
            "agent": agent,
            "content": response.get("content", ""),
            "confidence": response.get("confidence", 0.7),
            "reasoning": response.get("reasoning", ""),
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Get all responses for this round
        responses = self.active_debates[debate_id]["rounds"][round_num]
        
        # Check for debate timeout
        if debate_id in self.active_debates and "start_time" in self.active_debates[debate_id]:
            debate_start = datetime.fromisoformat(self.active_debates[debate_id]["start_time"])
            now = datetime.utcnow()
            elapsed_seconds = (now - debate_start).total_seconds()
            
            # If we've exceeded the timeout, force a conclusion
            if elapsed_seconds > CONFIG.get("DEBATE_TIMEOUT", 30) and len(responses) > 0:
                self.logger.warning(f"Debate {debate_id} timeout after {elapsed_seconds}s, forcing conclusion")
                await self._perform_final_arbitration(debate_id, round_num, responses, ws)
                return
        
        # If we have responses from all agents (assuming 3), perform arbitration
        if len(responses) >= 3:
            await self._perform_arbitration(debate_id, round_num, responses, ws)
    
    async def process_moderation(self, state, data, ws):
        """Handle moderation signals from Grok."""
        if state == "deadlock":
            # Modify arbitration parameters to break deadlock
            confidence_threshold = CONFIG.get("CONFIDENCE_THRESHOLD", 0.25) * 0.6  # Reduce by 40%
            signal = self._generate_signal(
                "arbitration",
                self.agent_name,
                "Adjusting confidence threshold to break deadlock",
                "threshold_adjusted"
            )
            await ws.send(json.dumps(signal))
            
        elif state == "loop_detected":
            # Modify parameters to force decision
            consensus_threshold = CONFIG.get("CONSENSUS_THRESHOLD", 0.15) * 2.0  # Double it
            signal = self._generate_signal(
                "arbitration",
                self.agent_name,
                "Forcing decision to break loop",
                "forcing_decision"
            )
            await ws.send(json.dumps(signal))
            
        elif state == "conclude":
            # Perform final arbitration with current responses
            debate_id = data.get("debate_id", "default")
            if debate_id in self.active_debates:
                # Get the latest round
                latest_round = max(self.active_debates[debate_id]["rounds"].keys())
                responses = self.active_debates[debate_id]["rounds"][latest_round]
                
                # Force conclusion
                await self._perform_final_arbitration(debate_id, latest_round, responses, ws)
    
    async def _perform_arbitration(self, debate_id, round_num, responses, ws):
        """Perform arbitration on the responses."""
        self.logger.info(f"Performing arbitration for debate {debate_id}, round {round_num}")
        
        # Check for consensus
        consensus, consensus_response = self._check_consensus(responses)
        if consensus:
            signal = self._generate_signal(
                "arbitration",
                self.agent_name,
                f"Consensus reached in round {round_num}",
                "consensus"
            )
            await ws.send(json.dumps(signal))
            
            # Publish result
            result = {
                "debate_id": debate_id,
                "round": round_num,
                "status": "consensus",
                "content": consensus_response["content"],
                "confidence": consensus_response["confidence"],
                "contributing_agents": [r["agent"] for r in responses],
                "timestamp": datetime.utcnow().isoformat()
            }
            
            self.redis_client.publish(CONFIG.get("REDIS_CHANNEL_ARB", "arbitration_channel"), json.dumps(result))
            return
            
        # Check for strong confidence differential
        strong_conf, high_conf_response = self._check_strong_confidence(responses)
        if round_num >= CONFIG.get("MIN_DEBATE_ROUNDS", 2) and strong_conf:
            signal = self._generate_signal(
                "arbitration",
                self.agent_name,
                f"Strong confidence differential in round {round_num}",
                "strong_confidence"
            )
            await ws.send(json.dumps(signal))
            
            # Publish result
            result = {
                "debate_id": debate_id,
                "round": round_num,
                "status": "strong_confidence",
                "content": high_conf_response["content"],
                "confidence": high_conf_response["confidence"],
                "contributing_agents": [high_conf_response["agent"]],
                "timestamp": datetime.utcnow().isoformat()
            }
            
            self.redis_client.publish(CONFIG.get("REDIS_CHANNEL_ARB", "arbitration_channel"), json.dumps(result))
            return
            
        # If we're at max rounds, make a majority decision
        if round_num >= CONFIG.get("MAX_DEBATE_ROUNDS", 4):
            await self._perform_final_arbitration(debate_id, round_num, responses, ws)
            return
            
        # Otherwise, signal need for another round
        signal = self._generate_signal(
            "arbitration",
            self.agent_name,
            f"Continue to round {round_num + 1}",
            "continue"
        )
        await ws.send(json.dumps(signal))
        
        # Request another round
        continue_signal = {
            "debate_id": debate_id,
            "round": round_num,
            "status": "continue",
            "next_round": round_num + 1,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        self.redis_client.publish(CONFIG.get("REDIS_CHANNEL_MOD", "moderation_channel"), json.dumps(continue_signal))
    
    async def _perform_final_arbitration(self, debate_id, round_num, responses, ws):
        """Perform final arbitration and select a winner."""
        self.logger.info(f"Performing final arbitration for debate {debate_id}")
        
        # Sort by confidence
        sorted_responses = sorted(responses, key=lambda r: r.get("confidence", 0), reverse=True)
        winner = sorted_responses[0]
        
        # Get dissenting view if available
        dissenting_view = None
        if len(sorted_responses) > 1:
            dissenting_view = {
                "agent": sorted_responses[1]["agent"],
                "content": sorted_responses[1]["content"],
                "confidence": sorted_responses[1]["confidence"]
            }
        
        signal = self._generate_signal(
            "conclude",
            self.agent_name,
            f"Final decision: {winner['agent']} wins with confidence {winner['confidence']}",
            "final_decision"
        )
        await ws.send(json.dumps(signal))
        
        # Publish final result
        result = {
            "debate_id": debate_id,
            "round": round_num,
            "status": "concluded",
            "content": winner["content"],
            "confidence": winner["confidence"],
            "winning_agent": winner["agent"],
            "contributing_agents": [r["agent"] for r in responses],
            "dissenting_view": dissenting_view,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        self.redis_client.publish(CONFIG.get("REDIS_CHANNEL_ARB", "arbitration_channel"), json.dumps(result))
        
        # Update debate status
        self.active_debates[debate_id]["status"] = "completed"
        
        # Cleanup - cap the number of debates we track
        if len(self.active_debates) > CONFIG.get("MAX_HISTORY_SIZE", 10):
            # Find the oldest completed debate and remove it
            oldest_debate = None
            oldest_time = None
            
            for d_id, debate in self.active_debates.items():
                if debate["status"] == "completed" and "start_time" in debate:
                    if oldest_time is None or debate["start_time"] < oldest_time:
                        oldest_time = debate["start_time"]
                        oldest_debate = d_id
            
            if oldest_debate:
                del self.active_debates[oldest_debate]
                self.logger.info(f"Removed oldest debate {oldest_debate} to stay within history limits")
    
    def _check_consensus(self, responses):
        """Check if there's consensus among responses."""
        if len(responses) <= 1:
            return True, responses[0]
            
        # Compare content similarity using sentence transformers if available
        if self.model is not None:
            # Use sentence transformers for better similarity
            contents = [r["content"] for r in responses]
            embeddings = self.model.encode(contents)
            
            similar_count = 0
            for i in range(len(embeddings)):
                for j in range(i+1, len(embeddings)):
                    from numpy import dot
                    from numpy.linalg import norm
                    
                    # Cosine similarity
                    sim = dot(embeddings[i], embeddings[j]) / (norm(embeddings[i]) * norm(embeddings[j]))
                    if sim > (1.0 - CONFIG.get("CONSENSUS_THRESHOLD", 0.15)):
                        similar_count += 1
        else:
            # Fall back to text similarity
            similar_count = 0
            for i, r1 in enumerate(responses):
                for j in range(i+1, len(responses)):
                    r2 = responses[j]
                    if self._text_similarity(r1["content"], r2["content"]) > (1.0 - CONFIG.get("CONSENSUS_THRESHOLD", 0.15)):
                        similar_count += 1
        
        # If all pairs are similar, we have consensus
        required_similar = (len(responses) * (len(responses) - 1)) / 2
        if similar_count / required_similar > 0.8:
            # Return the highest confidence response
            highest_conf = max(responses, key=lambda r: r.get("confidence", 0))
            return True, highest_conf
            
        return False, None
    
    def _check_strong_confidence(self, responses):
        """Check if there's a strong confidence differential."""
        if len(responses) <= 1:
            return True, responses[0]
            
        # Sort by confidence
        sorted_resps = sorted(responses, key=lambda r: r.get("confidence", 0), reverse=True)
        highest = sorted_resps[0]
        second = sorted_resps[1] if len(sorted_resps) > 1 else {"confidence": 0}
        
        # Check if differential exceeds threshold
        if highest.get("confidence", 0) - second.get("confidence", 0) > CONFIG.get("CONFIDENCE_THRESHOLD", 0.25):
            return True, highest
            
        return False, None
    
    def _text_similarity(self, text1, text2):
        """Simplified text similarity function."""
        # In reality, use embeddings or more sophisticated NLP
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0
            
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union

# Usage
async def main():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logging.error("ANTHROPIC_API_KEY not found in environment variables")
        return
        
    agent = ClaudeAgent(api_key=api_key)
    await agent.start()

if __name__ == "__main__":
    import asyncio
    import websockets
    asyncio.run(main())