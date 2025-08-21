// server.js — KotoChat Server (Render-ready, HTTPS domain)
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import http from "http";

const app = express();
app.set("trust proxy", 1);

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || "https://kotochat-e22r.onrender.com";

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// Хранилища (память, лучше потом БД)
const users = new Map();
const sessions = new Map();
const inbox = new Map();

const Roles = { USER: "user", OWNER: "owner" };

// bootstrap владельца
(function () {
  const username = "creator";
  const password = "creator";
  if (!users.has(username)) {
    const hash = bcrypt.hashSync(password, 12);
    users.set(username, { id: nanoid(), username, hash, role: Roles.OWNER });
    inbox.set(username, []);
    console.log("Создан владелец:", username, "/", password);
  }
})();

// регистрация
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "missing" });
  if (users.has(username)) return res.status(409).json({ error: "taken" });
  const hash = await bcrypt.hash(password, 12);
  users.set(username, { id: nanoid(), username, hash, role: Roles.USER });
  inbox.set(username, []);
  res.json({ ok: true });
});

// логин
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = users.get(username);
  if (!user) return res.status(401).json({ error: "bad_credentials" });
  const ok = await bcrypt.compare(password, user.hash);
  if (!ok) return res.status(401).json({ error: "bad_credentials" });
  const token = nanoid(64);
  sessions.set(token, { username, role: user.role });
  res.json({ token, username, role: user.role });
});

app.get("/healthz", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function authFromQuery(url) {
  try {
    const q = new URL(url, "http://x");
    return sessions.get(q.searchParams.get("token"));
  } catch {
    return null;
  }
}

function wsSend(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {}
}

const online = new Map();

wss.on("connection", (ws, req) => {
  const sess = authFromQuery(req.url);
  if (!sess) return ws.close(4001, "unauthorized");
  online.set(sess.username, ws);
  wsSend(ws, { type: "hello", user: sess.username });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.type === "send") {
      const msg = {
        id: nanoid(),
        from: sess.username,
        to: data.to,
        text: data.text,
        ts: Date.now(),
      };
      const target = online.get(data.to);
      if (target) wsSend(target, { type: "message", payload: msg });
      else (inbox.get(data.to) || []).push(msg);
      wsSend(ws, { type: "ack", id: msg.id });
    }
  });

  ws.on("close", () => online.delete(sess.username));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server on " + PORT));
