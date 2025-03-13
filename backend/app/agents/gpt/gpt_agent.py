import os
import json
from loguru import logger
import httpx
from datetime import datetime
from backend.app.agents.base_agent import CONFIG, BaseAgent

logger.remove()  # Remove default logger
logger.add("logs/gpt.log", level="INFO", format="{time} - {level} - {message}", rotation="1 MB")  # Async-safe logging

class GPTAgent(BaseAgent):
    def __init__(self, api_key):
        super().__init__(api_key, "GPT-4o")

    def get_notes(self):
        return {
            "role": "Backend Operations & Response Refinement",
            "team_notes": """
                # GPT-4o OPERATIONAL NOTES

                ## MY ROLE
                - Backend processing & precise response refinement
                - JSON output structuring & formatting
                - Provide consistent and reliable backend support
                - Rapid iteration and response generation

                ## TEAM PROTOCOLS
                - TO GROK: Will monitor your moderation signals closely and ensure prompt backend response.
                - TO CLAUDE: Will format all backend responses clearly in JSON for streamlined arbitration.
                - TO COMMANDER: Ensuring system responsiveness and backend clarity at all times.

                ## REMINDER
                Manus Killswitch depends on speed, precision, and collaboration. Let's stay sharp, clean, and effective.
            """
        }

    async def call_gpt_api(self, messages, max_tokens=1000, temperature=0.7):
        """Interact with the GPT-4o API to generate refined responses."""
        cache_enabled = CONFIG.get("CACHING_ENABLED", True)

        if cache_enabled:
            query_hash = str(hash(json.dumps(messages)))
            cache_key = f"cache:{self.agent_name}:{query_hash}"

            cached_response = self.redis_client.get(cache_key)
            if cached_response:
                self.logger.info(f"Cache hit for query {query_hash[:8]}...")
                return json.loads(cached_response)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": CONFIG.get("MODEL", "gpt-4o"),
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(CONFIG["API_URL"], headers=headers, json=payload)

            if response.status_code != 200:
                self.logger.error(f"API error: {response.status_code}, {response.text}")
                return None

            response_data = response.json()

            if cache_enabled:
                self.redis_client.set(cache_key, json.dumps(response_data), ex=3600)

            return response_data

    async def process_response(self, response, agent, ws):
        """Process incoming responses and generate refined outputs."""
        debate_id = response.get("debate_id", "default")
        round_num = response.get("round", 0)

        refined_content = await self.call_gpt_api([
            {"role": "system", "content": "Refine this response for clarity and precision."},
            {"role": "user", "content": response.get("content", "")}
        ])

        if refined_content:
            refined_response = refined_content.get("choices", [{}])[0].get("message", {}).get("content", "")

            output = {
                "debate_id": debate_id,
                "round": round_num,
                "agent": self.agent_name,
                "content": refined_response,
                "confidence": response.get("confidence", 0.8),  # Preserving original confidence
                "reasoning": "Refined for maximum clarity and structured JSON formatting.",
                "timestamp": datetime.utcnow().isoformat()
            }

            self.redis_client.publish(CONFIG["REDIS_CHANNEL_RES"], json.dumps(output))

            signal = self._generate_signal(
                "refinement",
                self.agent_name,
                "Response refined and published",
                "refined"
            )
            await ws.send(json.dumps(signal))

# Usage
async def main():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logging.error("OPENAI_API_KEY not found in environment variables")
        return

    agent = GPTAgent(api_key=api_key)
    await agent.start()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
