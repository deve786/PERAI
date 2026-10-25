import os
import sys
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import DocumentAttributeFilename

load_dotenv()

API_ID = os.getenv("TG_API_ID")
API_HASH = os.getenv("TG_API_HASH")
SESSION_STR = os.getenv("TG_SESSION_STRING")

if not API_ID or not API_HASH:
    print("[Warning] TG_API_ID or TG_API_HASH not set in .env. Please run python login.py first.")

client: TelegramClient = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    if API_ID and API_HASH and SESSION_STR:
        print(f"[Bridge] Initializing Telethon client with api_id {API_ID}...")
        client = TelegramClient(StringSession(SESSION_STR), int(API_ID), API_HASH)
        await client.connect()
        if not await client.is_user_authorized():
            print("[Warning] Session is not authorized. Please run python login.py.")
        else:
            me = await client.get_me()
            print(f"[Bridge] Connected successfully as: {me.first_name} (@{me.username or me.phone})")
    else:
        print("[Bridge] Running in unconfigured mode. Set credentials in .env to enable downloading.")
    yield
    if client and client.is_connected():
        await client.disconnect()

app = FastAPI(title="PERAI Telegram Media Bridge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    authorized = False
    if client and client.is_connected():
        authorized = await client.is_user_authorized()
    return {
        "status": "ok",
        "service": "perai-telegram-bridge",
        "authenticated": authorized
    }

@app.get("/download")
async def download_file(
    channel: str = Query(..., description="Channel username (e.g. lakport)"),
    post: int = Query(..., description="Post message ID (e.g. 102099)")
):
    global client
    if not client or not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected. Check bridge credentials.")

    clean_channel = channel.replace("@", "").strip()
    try:
        # Fetch the message from the public channel
        message = await client.get_messages(clean_channel, ids=post)
        if not message:
            raise HTTPException(status_code=404, detail=f"Message {post} not found in @{clean_channel}")

        if not message.media:
            raise HTTPException(status_code=404, detail=f"No media/document attached to post {post}")

        # Extract file name
        filename = f"{clean_channel}_{post}.pdf"
        mime_type = "application/pdf"

        if hasattr(message, "document") and message.document:
            mime_type = message.document.mime_type or "application/pdf"
            for attr in message.document.attributes:
                if isinstance(attr, DocumentAttributeFilename):
                    filename = attr.file_name
                    break

        print(f"[Bridge] Downloading {filename} from @{clean_channel} post {post}...")
        file_bytes = await client.download_media(message, file=bytes)

        if not file_bytes:
            raise HTTPException(status_code=500, detail="Failed to retrieve binary bytes from Telegram")

        print(f"[Bridge] Successfully streamed {filename} ({len(file_bytes)} bytes)")
        return Response(
            content=file_bytes,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Content-Length": str(len(file_bytes)),
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Bridge] Error fetching post {post} from @{clean_channel}:", e)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("server:app", host=host, port=port, reload=True)
