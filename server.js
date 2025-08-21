// server.js — KotoChat Server (Render-ready, HTTPS/WSS)
// deps: express, ws, bcryptjs, nanoid, cors
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const app = express();
app.set("trust proxy", 1);

// Разрешаем только твой домен
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://kotochat-e22r.onrender.com";
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// Память вместо БД (для простоты демонстрации)
const users = new Map();    // username -> {id, username, hash, role}
const sessions = new Map(); // token -> { username, role }
const inbox = new Map();    // username -> [msgs]
const online = new Map();   // username -> ws

const Roles = { USER: "user", OWNER: "owner" };

// bootstrap создателя
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

// Регистрация
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
