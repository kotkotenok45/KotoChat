const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map(); // ws => {username, userId, role}
const groups = new Map(); // groupName => Set(ws)
const messages = new Map(); // groupName => [{username, text, timestamp, role}]

// Пользователи с паролями и ролями — Замените на свои реальные
const userDB = {
  'kotkotenok43434343@gmail.com': { password: 'kotkotenok43', role: 'Создатель' },
  'admin@example.com': { password: 'adminpass', role: 'Админ' },
  'guest@example.com': { password: 'guestpass', role: 'Гость' },
};

function broadcast(group, data) {
  if (!groups.has(group)) return;
  for (const client of groups.get(group)) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      switch(data.type) {
        case 'join': {
          const userRecord = userDB[data.userId.toLowerCase()];
          if (!userRecord || userRecord.password !== data.password) {
            ws.send(JSON.stringify({ type: 'login_result', success: false, message: 'Неверный логин или пароль' }));
            ws.close();
            return;
          }

          const role = userRecord.role || 'Пользователь';
          clients.set(ws, { username: data.username, userId: data.userId, role, group: 'Общий' });
          if (!groups.has('Общий')) groups.set('Общий', new Set());
          groups.get('Общий').add(ws);

          // Отправляем историю
          ws.send(JSON.stringify({ type: 'history', messages: messages.get('Общий') || [] }));

          broadcast('Общий', { type: 'notification', text: `${data.username} (${role}) присоединился к Общий` });
          ws.send(JSON.stringify({ type: 'login_result', success: true, role }));

          break;
        }
        case 'message': {
          const sender = clients.get(ws);
          if (!sender) return;
          if (sender.role === 'Гость') {
            ws.send(JSON.stringify({ type: 'notification', text: 'У вас нет прав писать сообщения' }));
            return;
          }
          const msgObj = { username: sender.username, text: data.text, timestamp: Date.now(), role: sender.role };
          if (!messages.has(sender.group)) messages.set(sender.group, []);
          messages.get(sender.group).push(msgObj);

          broadcast(sender.group, { type: 'message', ...msgObj });
          break;
        }
        case 'signal': {
          const sender = clients.get(ws);
          if (!sender) return;
          if (!groups.has(sender.group)) return;
          for (const client of groups.get(sender.group)) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'signal', from: sender.username, signalData: data.signalData }));
            }
          }
          break;
        }
        default:
          ws.send(JSON.stringify({ type: 'notification', text: `Неизвестный тип сообщения: ${data.type}` }));
          break;
      }
    } catch (e) {
      console.error('Invalid message:', e);
      ws.send(JSON.stringify({ type: 'notification', text: 'Ошибка обработки сообщения' }));
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      clients.delete(ws);
      if (groups.has(info.group)) {
        groups.get(info.group).delete(ws);
        broadcast(info.group, { type: 'notification', text: `${info.username} (${info.role}) покинул чат` });
      }
    }
  });
});

// Проверка живости подключений (ping-pong)
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
