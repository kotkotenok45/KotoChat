// ================================
//   KotoChat — WebSocket Server
//   Работает на Render
//   Автор: ты 😎
// ================================

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();

// Раздача статических страниц (index.html и mobile_index.html можно хранить в одном репо)
app.use(express.static(path.join(__dirname, ".")));

const server = http.createServer(app);

// WebSocket сервер
const wss = new WebSocket.Server({ server });

let clients = new Map(); // ws -> username

function broadcast(data) {
    const json = JSON.stringify(data);
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    }
}

wss.on("connection", (ws) => {
    console.log("Новый клиент подключился.");

    ws.on("message", (msg) => {
        let data;
        try { data = JSON.parse(msg); }
        catch { return; }

        // ========== ЛОГИН ==========
        if (data.type === "login") {
            clients.set(ws, data.user);
            console.log("Пользователь вошёл:", data.user);

            broadcast({
                type: "system",
                text: `${data.user} подключился`
            });
            return;
        }

        // ========== СООБЩЕНИЕ ==========
        if (data.type === "msg") {
            broadcast({
                type: "msg",
                user: data.user,
                text: data.text
            });
        }
    });

    ws.on("close", () => {
        const user = clients.get(ws);
        if (user) {
            console.log("Отключился:", user);
            broadcast({
                type: "system",
                text: `${user} вышел`
            });
        }
        clients.delete(ws);
    });
});

// Render использует PORT из окружения
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("KotoChat Server running on port", PORT);
});
