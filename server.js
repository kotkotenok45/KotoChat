const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const userRoles = {
  'kotkotenok43434343@yandex.ru': { role: 'Создатель', password: 'creatorpass' },
  'admin@example.com': { role: 'Админ', password: 'admin123' },
  'guest@example.com': { role: 'Гость', password: '' }
};

const clients = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'join') {
        const userData = userRoles[data.userId.toLowerCase()];
        let role = 'Пользователь';

        if (userData) {
          if (userData.password && data.password !== userData.password) {
            ws.send(JSON.stringify({ type: 'notification', text: '❌ Неверный пароль' }));
            ws.close();
            return;
          }
          role = userData.role;
        }

        ws.username = data.username;
        ws.role = role;
        clients.set(ws, data.username);

        broadcast({ type: 'notification', text: `🔔 ${data.username} (${role}) вошёл в чат` });
      }

      if (data.type === 'message') {
        broadcast({ type: 'message', username: ws.username, text: data.text, role: ws.role });
      }
    } catch (e) {
      console.error("Ошибка:", e.message);
    }
  });

  ws.on('close', () => {
    if (ws.username) {
      broadcast({ type: 'notification', text: `🚪 ${ws.username} вышел` });
      clients.delete(ws);
    }
  });
});

function broadcast(data) {
  const json = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

server.listen(10000, () => {
  console.log('Сервер работает на порту 10000');
});
