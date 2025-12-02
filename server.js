const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
const PORT = process.env.PORT || 10000;

// WebSocket сервер
const wss = new WebSocket.Server({ noServer: true });
const clients = new Map();

wss.on('connection', (ws, request) => {
    const userId = `user_${Date.now()}`;
    clients.set(userId, { ws, userData: {} });
    
    ws.on('message', (data) => {
        const message = JSON.parse(data);
        broadcast(message, userId);
    });
    
    ws.on('close', () => {
        clients.delete(userId);
    });
});

function broadcast(message, senderId) {
    clients.forEach((client, userId) => {
        if (userId !== senderId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    });
}

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});