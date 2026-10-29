import os
import sys
from dotenv import load_dotenv
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

load_dotenv()

print("=" * 60)
print(" PERAI Telegram Bridge - Session Authorizer")
print("=" * 60)

api_id_env = os.getenv("TG_API_ID")
api_hash_env = os.getenv("TG_API_HASH")

if not api_id_env:
    api_id_input = input("Enter your Telegram App api_id: ").strip()
else:
    api_id_input = api_id_env

if not api_hash_env:
    api_hash_input = input("Enter your Telegram App api_hash: ").strip()
else:
    api_hash_input = api_hash_env

try:
    api_id = int(api_id_input)
except ValueError:
    print("[Error] api_id must be an integer.")
    sys.exit(1)

api_hash = str(api_hash_input).strip()

print(f"\nConnecting with api_id: {api_id}...")
with TelegramClient(StringSession(), api_id, api_hash) as client:
    session_str = client.session.save()
    print("\n" + "=" * 60)
    print(" AUTHORIZATION SUCCESSFUL!")
    print("=" * 60)
    print("\nYour TG_SESSION_STRING has been generated.\n")

    # Update or create .env file
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    env_lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.startswith("TG_API_ID=") and not line.startswith("TG_API_HASH=") and not line.startswith("TG_SESSION_STRING="):
                    env_lines.append(line.rstrip())

    env_lines.append(f"TG_API_ID={api_id}")
    env_lines.append(f"TG_API_HASH={api_hash}")
    env_lines.append(f"TG_SESSION_STRING={session_str}")
    env_lines.append("PORT=8000")
    env_lines.append("HOST=0.0.0.0")

    with open(env_path, "w", encoding="utf-8") as f:
        f.write("\n".join(env_lines) + "\n")

    print(f"Saved credentials to: {env_path}")
    print("\nYou can now start the bridge server with:")
    print("  python server.py\n")
