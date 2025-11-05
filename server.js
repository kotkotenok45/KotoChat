const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let clients = new Map(); // client => { username, group }
let groups = new Map();  // groupName => Set of clients
let messages = new Map(); // groupName => [{ username, text, timestamp }]

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
      const senderInfo = clients.get(ws);

      switch (data.type) {
        case 'join':
          // data: { username, group }
          clients.set(ws, { username: data.username, group: data.group });
          if (!groups.has(data.group)) groups.set(data.group, new Set());
          groups.get(data.group).add(ws);

          // Send chat history to this client
          ws.send(JSON.stringify({ type: 'history', messages: messages.get(data.group) || [] }));

          broadcast(data.group, { 
            type: 'notification', 
            text: `${data.username} joined ${data.group}` 
          });
          break;

        case 'message':
          // data: { text }
          if (!senderInfo) return;
          const msgObj = { 
            username: senderInfo.username, 
            text: data.text, 
            timestamp: Date.now() 
          };
          if (!messages.has(senderInfo.group)) messages.set(senderInfo.group, []);
          const groupMessages = messages.get(senderInfo.group);
          // Ограничим историю 100 сообщениями, чтобы не утечка памяти
          if (groupMessages.length >= 100) groupMessages.shift();
          groupMessages.push(msgObj);
          broadcast(senderInfo.group, { type: 'message', ...msgObj });
          break;

        case 'signal':
          // data: { to: "groupName", signalData: ... }
          // В клиенте поле 'to' — это НАЗВАНИЕ ГРУППЫ, а не имя пользователя!
          if (!senderInfo) return;

          const targetGroup = data.to; // это группа
          if (groups.has(targetGroup)) {
            for (const client of groups.get(targetGroup)) {
              // Не отправляем сигнал самому себе
              if (client === ws) continue;
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'signal',
                  from: senderInfo.username, // кто прислал
                  signalData: data.signalData
                }));
              }
            }
          }
          break;

        default:
          break;
      }
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      const { username, group } = info;
      clients.delete(ws);
      if (groups.has(group)) {
        groups.get(group).delete(ws);
        broadcast(group, { 
          type: 'notification', 
          text: `${username} left ${group}` 
        });
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Ping clients to detect dead connections
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`🌐 WebSocket URL: ws://localhost:${PORT} (or wss://your-domain.onrender.com in production)`);
});const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let clients = new Map(); // client => { username, group }
let groups = new Map();  // groupName => Set of clients
let messages = new Map(); // groupName => [{ username, text, timestamp }]

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
      const senderInfo = clients.get(ws);

      switch (data.type) {
        case 'join':
          // data: { username, group }
          clients.set(ws, { username: data.username, group: data.group });
          if (!groups.has(data.group)) groups.set(data.group, new Set());
          groups.get(data.group).add(ws);

          // Send chat history to this client
          ws.send(JSON.stringify({ type: 'history', messages: messages.get(data.group) || [] }));

          broadcast(data.group, { 
            type: 'notification', 
            text: `${data.username} joined ${data.group}` 
          });
          break;

        case 'message':
          // data: { text }
          if (!senderInfo) return;
          const msgObj = { 
            username: senderInfo.username, 
            text: data.text, 
            timestamp: Date.now() 
          };
          if (!messages.has(senderInfo.group)) messages.set(senderInfo.group, []);
          const groupMessages = messages.get(senderInfo.group);
          // Ограничим историю 100 сообщениями, чтобы не утечка памяти
          if (groupMessages.length >= 100) groupMessages.shift();
          groupMessages.push(msgObj);
          broadcast(senderInfo.group, { type: 'message', ...msgObj });
          break;

        case 'signal':
          // data: { to: "groupName", signalData: ... }
          // В клиенте поле 'to' — это НАЗВАНИЕ ГРУППЫ, а не имя пользователя!
          if (!senderInfo) return;

          const targetGroup = data.to; // это группа
          if (groups.has(targetGroup)) {
            for (const client of groups.get(targetGroup)) {
              // Не отправляем сигнал самому себе
              if (client === ws) continue;
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'signal',
                  from: senderInfo.username, // кто прислал
                  signalData: data.signalData
                }));
              }
            }
          }
          break;

        default:
          break;
      }
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      const { username, group } = info;
      clients.delete(ws);
      if (groups.has(group)) {
        groups.get(group).delete(ws);
        broadcast(group, { 
          type: 'notification', 
          text: `${username} left ${group}` 
        });
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Ping clients to detect dead connections
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`🌐 WebSocket URL: ws://localhost:${PORT} (or wss://your-domain.onrender.com in production)`);
});
