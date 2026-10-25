# PERAI Telegram Media Bridge

Lightweight microservice allowing PERAI to automatically fetch and stream PDF documents from public channels (like `@lakport`) without user intervention.

---

## 🚀 Quick Setup (Local Machine)

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Authorize One-Time Session
Run the interactive login script:
```bash
python login.py
```
- Enter your **`api_id`** and **`api_hash`** from [my.telegram.org](https://my.telegram.org).
- Enter your phone number and the verification code sent to your Telegram app.
- This creates `.env` with your permanent `TG_SESSION_STRING`. You never have to log in again.

### 3. Start the Bridge Server
```bash
python server.py
```
The server will start at: `http://localhost:8000` (or `http://<your-local-ip>:8000`).

---

## 🌐 Free Cloud Deployment (Render.com / Railway)

1. Push this folder to a GitHub repository (or subdirectory).
2. Create a new **Web Service** on [Render.com](https://render.com) or [Railway.app](https://railway.app).
3. Set Environment Variables:
   - `TG_API_ID`
   - `TG_API_HASH`
   - `TG_SESSION_STRING` (copy value from your local `.env`)
4. Copy the public service URL (e.g. `https://my-perai-bridge.onrender.com`) and paste it into **PERAI Settings → Telegram Bridge URL**.
