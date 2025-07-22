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

const userRoles = {
  'creator@example.com': 'Создатель',
  'admin@example.com': 'Админ',
  'guest@example.com': 'Гость',
  // добавь своих пользователей сюда
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
          const role = userRoles[data.userId.toLowerCase()] || 'Пользователь';
          clients.set(ws, { username: data.username, userId: data.userId, role, group: 'Общий' });
          if (!groups.has('Общий')) groups.set('Общий', new Set());
          groups.get('Общий').add(ws);

          // Отправляем историю
          ws.send(JSON.stringify({ type: 'history', messages: messages.get('Общий') || [] }));

          broadcast('Общий', { type: 'notification', text: ${data.username} (${role}) присоединился к Общий });
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
          // Пересылаем WebRTC сигналы всем в группе кроме отправителя
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
      }
    } catch (e) {
      console.error('Invalid message', e);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      clients.delete(ws);
      if (groups.has(info.group)) {
        groups.get(info.group).delete(ws);
        broadcast(info.group, { type: 'notification', text: ${info.username} (${info.role}) покинул чат });
      }
    }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(Server running on port ${PORT});
});
