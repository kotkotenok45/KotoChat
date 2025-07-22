const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const app = express();

app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const userRoles = {
  'kotkotenok43434343@gmail.com': { role: 'Создатель', password: 'kotkotenok43' },
  'admin@example.com': { role: 'Админ', password: 'admin123' },
  'guest@example.com': { role: 'Гость', password: '' }
};

const clients = new Map(); // ws -> { username, userId, role }
const bans = new Set();
const mutes = new Set();

function broadcast(data) {
  const str = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(str);
  }
}

function noAccess() {
  return JSON.stringify({ type: 'error', text: '❌ Недостаточно прав' });
}

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.type === 'join') {
      const userId = data.userId.toLowerCase();
      const userData = userRoles[userId] || { role: 'Гость', password: '' };

      // Проверяем пароль
      if (userData.password && data.password !== userData.password) {
        ws.send(JSON.stringify({ type: 'error', text: 'Неверный пароль' }));
        ws.close();
        return;
      }

      ws.username = data.username;
      ws.userId = userId;
      ws.role = userData.role;

      clients.set(ws, { username: ws.username, userId, role: ws.role });

      broadcast({ type: 'notification', text: `🔔 ${ws.username} (${ws.role}) подключился.` });
    }

    if (data.type === 'message') {
      if (!ws.username) return;

      const text = data.text.trim();
      if (bans.has(ws.userId)) {
        ws.send(JSON.stringify({ type: 'error', text: 'Вы забанены' }));
        return;
      }
      if (mutes.has(ws.userId)) {
        ws.send(JSON.stringify({ type: 'error', text: 'Вы замучены' }));
        return;
      }

      if (text.startsWith('/')) {
        const [cmd, arg] = text.split(' ');
        const isAdmin = ws.role === 'Админ' || ws.role === 'Создатель';

        switch (cmd) {
          case '/ban':
            if (!isAdmin) return ws.send(noAccess());
            bans.add(arg.toLowerCase());
            broadcast({ type: 'notification', text: `🚫 ${arg} забанен` });
            break;

          case '/unban':
            if (!isAdmin) return ws.send(noAccess());
            bans.delete(arg.toLowerCase());
            broadcast({ type: 'notification', text: `✅ ${arg} разбанен` });
            break;

          case '/mute':
            if (!isAdmin) return ws.send(noAccess());
            mutes.add(arg.toLowerCase());
            broadcast({ type: 'notification', text: `🔇 ${arg} замучен` });
            break;

          case '/unmute':
            if (!isAdmin) return ws.send(noAccess());
            mutes.delete(arg.toLowerCase());
            broadcast({ type: 'notification', text: `🔊 ${arg} размучен` });
            break;

          case '/clear':
            if (ws.role !== 'Создатель') return ws.send(noAccess());
            broadcast({ type: 'notification', text: '🧹 Чат очищен создателем.' });
            break;

          case '/status':
            ws.send(JSON.stringify({
              type: 'notification',
              text: `👤 Вы: ${ws.username}, Роль: ${ws.role}, Бан: ${bans.has(ws.userId)}, Мут: ${mutes.has(ws.userId)}`
            }));
            break;

          default:
            ws.send(JSON.stringify({ type: 'error', text: 'Неизвестная команда' }));
        }
        return;
      }

      // Обычное сообщение
      broadcast({ type: 'message', username: ws.username, text, role: ws.role });
    }
  });

  ws.on('close', () => {
    if (ws.username) {
      broadcast({ type: 'notification', text: `🚪 ${ws.username} покинул чат.` });
      clients.delete(ws);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
