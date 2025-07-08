const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();

// Раздача статических файлов из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Если нужна простая страница для проверки
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Map(); // ws => {username, group}
let groups = new Map(); // groupName => Set(ws)
let messages = new Map(); // groupName => [{username, text, timestamp}]

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

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      switch(data.type) {
        case 'join':
          clients.set(ws, { username: data.username, group: data.group });
          if (!groups.has(data.group)) groups.set(data.group, new Set());
          groups.get(data.group).add(ws);

          ws.send(JSON.stringify({ type: 'history', messages: messages.get(data.group) || [] }));

          broadcast(data.group, { type: 'notification', text: `${data.username} joined ${data.group}` });
          break;

        case 'message':
          const sender = clients.get(ws);
          if (!sender) return;

          const msgObj = { username: sender.username, text: data.text, timestamp: Date.now() };
          if (!messages.has(sender.group)) messages.set(sender.group, []);
          messages.get(sender.group).push(msgObj);

          broadcast(sender.group, { type: 'message', ...msgObj });
          break;

        case 'signal':
          // Для WebRTC: переслать сигнал конкретному пользователю
          for (const [client, info] of clients.entries()) {
            if (info.username === data.to) {
              client.send(JSON.stringify({ type: 'signal', from: clients.get(ws).username, signalData: data.signalData }));
              break;
            }
          }
          break;

        default:
          // Игнорируем неизвестные типы
          break;
      }
    } catch (e) {
      console.error('Invalid message', e);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      const { username, group } = info;
      clients.delete(ws);
      if (groups.has(group)) {
        groups.get(group).delete(ws);
        broadcast(group, { type: 'notification', text: `${username} left ${group}` });
      }
    }
  });
});

// Пинг для обнаружения "мертвых" соединений
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
