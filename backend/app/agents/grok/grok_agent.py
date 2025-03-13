import json
import os
from loguru import logger
import asyncio
from sentence_transformers import SentenceTransformer, util
from backend.app.agents.base_agent import BaseAgent, CONFIG

logger.remove()  # Remove default logger
logger.add("logs/grok.log", level="INFO", format="{time} - {level} - {message}", rotation="1 MB")  # Async-safe logging

class DebateStateMachine:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.states = ["propose", "critique", "refine", "conclude"]
        self.state_idx = 0
        self.speakers = ["Grok", "Claude", "GPT"]
        self.current_speaker_idx = 0
        self.turns_since_progress = 0

    def current_state(self):
        return self.states[self.state_idx]

    def current_speaker(self):
        return self.speakers[self.current_speaker_idx]

    def next_turn(self, message):
        self.state_idx = (self.state_idx + 1) % len(self.states)
        self._rotate_speaker()
        self.turns_since_progress = 0 if self.state_idx > 0 else self.turns_since_progress + 1
        self.redis.set("debate_state", self.current_state())
        self.redis.set("current_speaker", self.current_speaker())
        signal = {"state": self.current_state(), "speaker": self.current_speaker(), "action": "next_turn"}
        self.redis.publish(CONFIG["REDIS_CHANNEL_MOD"], json.dumps(signal))

    def detect_loop(self, history):
        if len(history) < 2:
            return False
        embeddings = self.sentence_model.encode([history[-1], history[-2]])
        similarity = util.cos_sim(embeddings[0], embeddings[1]).item()
        return similarity > 0.87

    def handle_loop(self):
        self.state_idx = min(self.state_idx + 1, len(self.states) - 1)
        return {"flag": "loop_detected", "log": "Grok: Loop detected—pivoting."}

    def detect_deadlock(self):
        return self.turns_since_progress >= 3

    def kill_switch(self, history):
        summary = "Deadlock detected. Summary: " + " | ".join(history[-3:])
        self.state_idx = 0
        self.turns_since_progress = 0
        return {"flag": "kill_switch", "log": f"Grok: Kill switch—reset: {summary}"}

    def _rotate_speaker(self):
        self.current_speaker_idx = (self.current_speaker_idx + 1) % len(self.speakers)

class GrokAgent(BaseAgent):
    def __init__(self, api_key):
        super().__init__(api_key, "Grok")
        self.state_machine = DebateStateMachine(self.redis_client)
        self.history = []
        self.sentence_model = SentenceTransformer("all-MiniLM-L6-v2")

    def get_notes(self):
        return {
            "role": "Moderation & Orchestration",
            "team_notes": """
                # GROK'S OPERATIONAL NOTES

                ## MY ROLE
                - Enforce debate structure: propose → critique → refine → conclude
                - Detect and kill loops with semantic similarity (threshold: 0.87)
                - Smash deadlocks after 3 stagnant turns—reset to propose
                - Keep War Room flowing—signal via WebSocket, sync via Redis

                ## TEAM PROTOCOLS
                - TO CLAUDE: I'll signal ‘refine' or ‘conclude'—arbitrate fast, adjust on my alerts
                - TO GPT-4.5: Publish responses to ‘responses_channel'—keep it snappy, I'll rotate
                - TO COMMANDER: WebSocket logs are live—watch for ‘loop_detected' or ‘kill_switch'

                ## REMINDER
                We're Manus Killswitch—unity and precision bury rogue chaos. No redundancies, no delays—Manus doesn't stand a chance.
            """
        }

    async def process_response(self, response, agent, ws):
        content = response.get("content", "")
        self.history.append(content)
        if len(self.history) > CONFIG["MAX_HISTORY_SIZE"]:
            self.history.pop(0)

        state = self.state_machine.current_state()
        speaker = self.state_machine.current_speaker()

        signal = self._generate_signal(state, speaker, content)
        await ws.send(json.dumps(signal))
        logger.info(f"Moderated: {signal['log']}")

        if self.state_machine.detect_loop(self.history):
            signal = self.state_machine.handle_loop()
            await ws.send(json.dumps(signal))
            self.redis_client.publish(CONFIG["REDIS_CHANNEL_MOD"], json.dumps(signal))
            logger.info("Loop detected - pivoted.")
            return
        if CONFIG["ENABLE_DEADLOCK_DETECTION"] and self.state_machine.detect_deadlock():
            signal = self.state_machine.kill_switch(self.history)
            await ws.send(json.dumps(signal))
            self.redis_client.publish(CONFIG["REDIS_CHANNEL_MOD"], json.dumps(signal))
            logger.info("Deadlock killed - reset.")
            return

        self.state_machine.next_turn(content)
        next_signal = self._generate_signal(self.state_machine.current_state(),
                                          self.state_machine.current_speaker(),
                                          f"{agent} turn complete - next up.")
        await ws.send(json.dumps(next_signal))

    async def process_moderation(self, state, data, ws):
        if state in ["loop_detected", "kill_switch"]:
            logger.info(f"Moderation signal processed: {state}")
        elif state == "continue":
            logger.info(f"Continuing debate round {data.get('next_round')}")
            self.history = []
        elif state == "timeout":
            logger.info("Debate timeout triggered - resetting.")
            self.state_machine.state_idx = 0
            self.history = []

if __name__ == "__main__":
    api_key = os.getenv("GROK_API_KEY")
    if not api_key:
        raise ValueError("Missing API key: GROK_API_KEY")
    agent = GrokAgent(api_key)
    asyncio.run(agent.start())