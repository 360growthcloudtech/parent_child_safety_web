# Child Safety WebSocket Relay Server

High-performance, ultra-low-latency WebSocket relay service for Child Safety live camera & screen mirroring.

## 🚀 How to Run Locally

```bash
# In parent-dashboard root:
npm run relay
```
The relay will start on `http://localhost:8080` (or `PORT` from `.env.local`).

---

## ☁️ How to Deploy on Render (Free & Fast)

1. Go to [render.com](https://render.com) and create a **New Web Service**.
2. Connect your GitHub repository (`parent_child_safety_web`).
3. Configure the settings:
   - **Root Directory**: `ws-relay`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.mjs`
   - **Environment Variables**:
     - `INGEST_TOKEN`: `<your-ingest-token>`
     - `PORT`: `10000`
4. Deploy! Render will give you an assigned URL like:
   `https://child-safety-ws-relay.onrender.com`
5. Change `https://` to `wss://`:
   `wss://child-safety-ws-relay.onrender.com`
6. Add this URL to your Vercel Dashboard Environment Variables:
   - Variable: `NEXT_PUBLIC_WS_URL`
   - Value: `wss://child-safety-ws-relay.onrender.com`

---

## 🚂 How to Deploy on Railway

1. Go to [railway.app](https://railway.app) and create a **New Project** from GitHub.
2. Set Root Directory to `/ws-relay`.
3. Add Environment Variable `PORT=8080` and `INGEST_TOKEN`.
4. Generate a public Domain in Railway networking settings.
5. Add `NEXT_PUBLIC_WS_URL=wss://<railway-domain>` to Vercel.
