from fastapi import FastAPI, WebSocket
import redis
import json
import asyncio
from loguru import logger

app = FastAPI()
redis_client = redis.Redis(host="redis", port=6379, decode_responses=True)
logger.add("logs/websocket.log", level="INFO", format="{time} - {level} - {message}", rotation="1 MB")

@app.websocket("/ws/moderation")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    pubsub = redis_client.pubsub()
    pubsub.subscribe("moderation_channel")
    logger.info("WebSocket connected - subscribing to moderation_channel")

    while True:
        message = pubsub.get_message(timeout=1.0)
        if message and message["type"] == "message":
            await websocket.send_text(message["data"])
        await asyncio.sleep(0.1)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)