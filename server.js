import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(bodyParser.json());

const users = {};   // username -> password
const tokens = {};  // token -> username
const sockets = {}; // username -> ws

function makeToken() {
  return Math.random().toString(36).slice(2);
}

// Register
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (users[username]) return res.status(400).json({ error: "Exists" });
  users[username] = password;
  res.json({ ok: true });
});

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (users[username] !== password) return res.status(400).json({ error: "Invalid" });
  const token = makeToken();
  tokens[token] = username;
  res.json({ token });
});

// WebSocket
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  const token = url.searchParams.get("token");
  const username = tokens[token];
  if (!username) return ws.close();

  sockets[username] = ws;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.type === "send") {
      const to = sockets[data.to];
      if (to) {
        to.send(JSON.stringify({ type: "message", payload: { from: username, text: data.text } }));
      }
    }
  });

  ws.on("close", () => {
    delete sockets[username];
  });
});

app.get("/healthz", (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("KotoChat Server running on", PORT));
