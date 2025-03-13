from dotenv import load_dotenv
import os

load_dotenv()

def get_config():
    config = {
        "REDIS_HOST": os.getenv("REDIS_HOST", "localhost"),
        "REDIS_PORT": int(os.getenv("REDIS_PORT", 6379)),
        "REDIS_CHANNEL_MOD": os.getenv("REDIS_CHANNEL_MOD", "moderation_channel"),
        "REDIS_CHANNEL_RES": os.getenv("REDIS_CHANNEL_RES", "responses_channel"),
        "REDIS_CHANNEL_ARB": os.getenv("REDIS_CHANNEL_ARB", "arbitration_channel"),
        "WS_URI": os.getenv("WS_URI", "ws://localhost:8000/ws/moderation"),
        "HEARTBEAT_INTERVAL": int(os.getenv("HEARTBEAT_INTERVAL", 10)),
        "HEARTBEAT_EXPIRY": int(os.getenv("HEARTBEAT_EXPIRY", 15)),
        "LOG_LEVEL": os.getenv("LOG_LEVEL", "INFO"),
        "DEBATE_TIMEOUT": int(os.getenv("DEBATE_TIMEOUT", 30)),
        "MAX_HISTORY_SIZE": int(os.getenv("MAX_HISTORY_SIZE", 10)),
        "ENABLE_DEADLOCK_DETECTION": os.getenv("ENABLE_DEADLOCK_DETECTION", "true").lower() == "true"
    }
    return config

CONFIG = get_config()