import os
import redis
import json
import asyncio
import websockets
from loguru import logger
from abc import ABC, abstractmethod
from datetime import datetime
from dotenv import load_dotenv
from backend.app.config.settings import CONFIG

logger.remove()  # Remove default logger
logger.add("logs/squad.log", level="INFO", format="{time} - {level} - {message}", rotation="1 MB")

# Load configuration from .env
load_dotenv()

# Centralized Config
CONFIG = {
    "REDIS_HOST": os.getenv("REDIS_HOST", "localhost"),
    "REDIS_PORT": int(os.getenv("REDIS_PORT", 6379)),
    "REDIS_CHANNEL_MOD": os.getenv("REDIS_CHANNEL_MOD", "moderation_channel"),
    "REDIS_CHANNEL_RES": os.getenv("REDIS_CHANNEL_RES", "responses_channel"),
    "REDIS_CHANNEL_ARB": os.getenv("REDIS_CHANNEL_ARB", "arbitration_channel"),
    "WS_URI": os.getenv("WS_URI", "ws://localhost:8000/ws/moderation"),
    "HEARTBEAT_INTERVAL": int(os.getenv("HEARTBEAT_INTERVAL", 10)),
    "HEARTBEAT_EXPIRY": int(os.getenv("HEARTBEAT_EXPIRY", 15)),
    "LOG_LEVEL": getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    "API_URL": os.getenv("API_URL", "https://api.xai.com/v1/messages"),  # Adjusted for xAI
    "MODEL": os.getenv("MODEL", "grok-3"),
    "CONFIDENCE_THRESHOLD": float(os.getenv("CONFIDENCE_THRESHOLD", 0.25)),
    "CONSENSUS_THRESHOLD": float(os.getenv("CONSENSUS_THRESHOLD", 0.15)),
    "MIN_DEBATE_ROUNDS": int(os.getenv("MIN_DEBATE_ROUNDS", 2)),
    "MAX_DEBATE_ROUNDS": int(os.getenv("MAX_DEBATE_ROUNDS", 4)),
    "CACHING_ENABLED": os.getenv("CACHING_ENABLED", "true").lower() == "true",
    "CACHE_TTL": int(os.getenv("CACHE_TTL", 300)),
    "TOPIC_EXTRACTION_ENABLED": os.getenv("TOPIC_EXTRACTION_ENABLED", "true").lower() == "true",
    "ENABLE_DEADLOCK_DETECTION": os.getenv("ENABLE_DEADLOCK_DETECTION", "true").lower() == "true",
    "DEBATE_TIMEOUT": int(os.getenv("DEBATE_TIMEOUT", 30)),  # New: Timeout in seconds
    "MAX_HISTORY_SIZE": int(os.getenv("MAX_HISTORY_SIZE", 10))  # New: Cap history
}

# Setup Logging
logging.basicConfig(level=CONFIG["LOG_LEVEL"], format="%(asctime)s - %(message)s")

class BaseAgent(ABC):
    def __init__(self, api_key, agent_name):
        self.redis_client = redis.Redis(
            host=CONFIG["REDIS_HOST"],
            port=CONFIG["REDIS_PORT"],
            decode_responses=True,
            pool_max=10
        )
        self.api_key = api_key
        self.agent_name = agent_name
        self.logger = logging.getLogger(f"{agent_name}Agent")
        self.logger.info(f"{self.agent_name} Agent initialized - Manus Killswitch online.")

    async def start(self):
        """Main loop - connects to WebSocket, subscribes to Redis, runs agent logic."""
        await self._publish_notes()
        async with websockets.connect(CONFIG["WS_URI"]) as ws:
            pubsub = self.redis_client.pubsub()
            pubsub.subscribe(CONFIG["REDIS_CHANNEL_RES"])
            pubsub.subscribe(CONFIG["REDIS_CHANNEL_MOD"])
            pubsub.subscribe(CONFIG["REDIS_CHANNEL_ARB"])  # Added for arbitration sync
            self.logger.info(f"{self.agent_name} connected to War Room - WebSocket and Redis live.")
            await asyncio.gather(
                self._listen_responses(pubsub, ws),
                self._heartbeat(),
                self._timeout_monitor(ws)  # New: Debate timeout
            )

    async def _publish_notes(self):
        """Publishes agent-specific notes on init."""
        notes = self.get_notes()
        self.redis_client.set(f"manus_killswitch_{self.agent_name.lower()}_notes", json.dumps(notes))
        self.logger.info(f"{self.agent_name} notes published to War Room.")

    async def _listen_responses(self, pubsub, ws):
        """Listens to Redis responses with retry logic."""
        while True:
            try:
                message = pubsub.get_message(timeout=1.0)
                if message and message["type"] == "message":
                    channel = message["channel"]
                    data = json.loads(message["data"])
                    if channel == CONFIG["REDIS_CHANNEL_RES"]:
                        response = data.get("response", "")
                        agent = data.get("agent", "unknown")
                        await self.process_response(response, agent, ws)
                    elif channel == CONFIG["REDIS_CHANNEL_MOD"]:
                        state = data.get("state", "")
                        if state:
                            await self.process_moderation(state, data, ws)
                    elif channel == CONFIG["REDIS_CHANNEL_ARB"]:
                        self.logger.info(f"Arbitration result received: {data}")
            except Exception as e:
                self.logger.error(f"Listener error: {e}")
                await asyncio.sleep(1)  # Backoff before retry

    async def _heartbeat(self):
        """Sends periodic heartbeat to Redis."""
        while True:
            self.redis_client.set(f"{self.agent_name.lower()}_heartbeat", "alive",
                                ex=CONFIG["HEARTBEAT_EXPIRY"])
            await asyncio.sleep(CONFIG["HEARTBEAT_INTERVAL"])

    async def _timeout_monitor(self, ws):
        """Monitors debate timeout and forces conclusion."""
        while True:
            await asyncio.sleep(CONFIG["DEBATE_TIMEOUT"])
            signal = self._generate_signal("timeout", self.agent_name, 
                                         "Debate timeout reached—forcing conclusion", "timeout")
            await ws.send(json.dumps(signal))
            self.redis_client.publish(CONFIG["REDIS_CHANNEL_MOD"], json.dumps(signal))

    def _generate_signal(self, state, speaker, message, flag=None):
        """Generates standardized moderation signal."""
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "state": state,
            "speaker": speaker,
            "message": message,
            "flag": flag,
            "log": f"{self.agent_name}: {state.capitalize()} phase—{speaker} up: {message}"
        }

    async def health_check(self):
        """Returns agent health status."""
        return {
            "agent": self.agent_name,
            "status": "alive",
            "last_heartbeat": self.redis_client.get(f"{self.agent_name.lower()}_heartbeat"),
            "timestamp": datetime.utcnow().isoformat()
        }

    @abstractmethod
    def get_notes(self):
        """Returns agent-specific notes."""
        pass

    @abstractmethod
    async def process_response(self, response, agent, ws):
        """Processes incoming responses - agent-specific logic."""
        pass

    @abstractmethod
    async def process_moderation(self, state, data, ws):
        """Processes moderation signals."""
        pass