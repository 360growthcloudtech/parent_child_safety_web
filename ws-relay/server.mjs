import http from "node:http";
import { parse as parseUrl } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env.PORT || "8080", 10);
const INGEST_TOKEN = process.env.INGEST_TOKEN || "";

/**
 * In-memory storage for active subscriptions:
 * key: `${deviceId}:${channel}` -> Set<WebSocket>
 */
const subscribers = new Map();

/**
 * Cache latest frame per channel for instant preview on subscriber join:
 * key: `${deviceId}:${channel}` -> Buffer
 */
const latestFrames = new Map();

/**
 * Track publishers:
 * ws -> { deviceId, channel }
 */
const publishers = new Map();

const server = http.createServer((req, res) => {
  const parsed = parseUrl(req.url, true);

  // Health check endpoint for Render/Railway/Docker
  if (parsed.pathname === "/health" || parsed.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        channels: subscribers.size,
        publishers: publishers.size,
        timestamp: Date.now(),
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const { pathname } = parseUrl(request.url, true);

  if (pathname === "/ws/publish" || pathname === "/ws/subscribe") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws, request) => {
  const parsed = parseUrl(request.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query || {};

  const deviceId = (query.deviceId || "").trim();
  const channel = (query.channel || "camera").trim().toLowerCase();
  const token = (query.token || "").trim();

  if (!deviceId) {
    ws.close(4001, "deviceId is required");
    return;
  }

  const roomKey = `${deviceId}:${channel}`;
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // ----------------------------------------------------
  // PUBLISHER MODE (Child Phone streaming frames)
  // ----------------------------------------------------
  if (pathname === "/ws/publish") {
    if (INGEST_TOKEN && token !== INGEST_TOKEN) {
      console.warn(`[Publisher Auth Failed] deviceId=${deviceId}`);
      ws.close(4003, "Unauthorized token");
      return;
    }

    publishers.set(ws, { deviceId, channel, roomKey });
    console.log(`[Publisher Connected] ${roomKey} (total publishers: ${publishers.size})`);

    ws.on("message", (data, isBinary) => {
      // Save latest frame buffer for instant delivery to new subscribers
      if (isBinary && Buffer.isBuffer(data)) {
        latestFrames.set(roomKey, data);
      }

      // Fast broadcast to all listening parent subscribers
      const subs = subscribers.get(roomKey);
      if (subs && subs.size > 0) {
        for (const sub of subs) {
          if (sub.readyState === WebSocket.OPEN) {
            sub.send(data, { binary: isBinary });
          }
        }
      }
    });

    ws.on("close", () => {
      publishers.delete(ws);
      console.log(`[Publisher Disconnected] ${roomKey}`);
    });

    ws.on("error", (err) => {
      console.error(`[Publisher Error] ${roomKey}:`, err.message);
    });
    return;
  }

  // ----------------------------------------------------
  // SUBSCRIBER MODE (Parent Dashboard viewing stream)
  // ----------------------------------------------------
  if (pathname === "/ws/subscribe") {
    if (!subscribers.has(roomKey)) {
      subscribers.set(roomKey, new Set());
    }
    const roomSubs = subscribers.get(roomKey);
    roomSubs.add(ws);

    console.log(`[Subscriber Joined] ${roomKey} (subs in room: ${roomSubs.size})`);

    // Instantly send cached latest frame so there's zero black screen delay
    const cached = latestFrames.get(roomKey);
    if (cached && ws.readyState === WebSocket.OPEN) {
      ws.send(cached, { binary: true });
    }

    ws.on("close", () => {
      const current = subscribers.get(roomKey);
      if (current) {
        current.delete(ws);
        if (current.size === 0) {
          subscribers.delete(roomKey);
        }
      }
      console.log(`[Subscriber Left] ${roomKey}`);
    });

    ws.on("error", (err) => {
      console.error(`[Subscriber Error] ${roomKey}:`, err.message);
    });
  }
});

// Periodic ping/pong to clean up dead connections through cloud proxies (Render/Railway/Cloudflare)
const pingInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

wss.on("close", () => {
  clearInterval(pingInterval);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`====================================================`);
  console.log(`🚀 Child Safety WebSocket Relay Server Running`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 Health Check: http://0.0.0.0:${PORT}/health`);
  console.log(`📹 Publisher endpoint:  ws://0.0.0.0:${PORT}/ws/publish?deviceId=...&token=...`);
  console.log(`📺 Subscriber endpoint: ws://0.0.0.0:${PORT}/ws/subscribe?deviceId=...`);
  console.log(`====================================================`);
});

const handleShutdown = () => {
  console.log("Shutting down WebSocket Relay Server...");
  clearInterval(pingInterval);
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
