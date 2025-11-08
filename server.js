// server.js — сервер (только WebSocket, без статики)
const http = require('http');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  // Health-check для Render
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('KotoChat WebSocket Server — OK\n');
    return;
  }
  res.writeHead(404).end('404');
});

const wss = new WebSocket.Server({ server });

const GROUPS = ['Общий', 'Работа', 'Друзья'];
const groups = {};
GROUPS.forEach(g => groups[g] = new Set());

const accounts = new Map();
const usernames = new Set();

function broadcast(groupName, data) {
  if (!groups[groupName]) return;
  const msg = JSON.stringify(data);
  groups[groupName].forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'login') {
        const { username, accountId } = msg;
        if (!username || !accountId || username.length < 2 || username.length > 20) {
          ws.send(JSON.stringify({ type: 'login_failure', reason: 'invalid' }));
          return ws.close();
        }
        if (usernames.has(username)) {
          ws.send(JSON.stringify({ type: 'login_failure', username }));
          return ws.close();
        }

        accounts.set(accountId, { ws, username, group: null });
        usernames.add(username);
        ws.accountId = accountId;
        ws.username = username;

        ws.send(JSON.stringify({ type: 'login_success', username, accountId }));
        return;
      }

      if (!ws.accountId) {
        ws.send(JSON.stringify({ type: 'notification', text: 'Требуется вход' }));
        return ws.close();
      }

      if (msg.type === 'join' && msg.group && groups[msg.group]) {
        const acc = accounts.get(ws.accountId);
        if (acc.group && acc.group !== msg.group) {
          groups[acc.group].delete(ws);
        }

        acc.group = msg.group;
        groups[msg.group].add(ws);

        broadcast(msg.group, { type: 'notification', text: `${ws.username} вошёл` });
        ws.send(JSON.stringify({ type: 'join_ack', group: msg.group, onlineCount: groups[msg.group].size }));
        return;
      }

      if (msg.type === 'message' && msg.text) {
        const acc = accounts.get(ws.accountId);
        if (acc?.group) {
          broadcast(acc.group, {
            type: 'message',
            username: ws.username,
            accountId: ws.accountId,
            text: msg.text,
            timestamp: Date.now()
          });
        }
      }

      if (msg.type === 'signal' && msg.to && msg.signalData) {
        const acc = accounts.get(ws.accountId);
        if (acc?.group && msg.to === acc.group) {
          broadcast(acc.group, {
            type: 'signal',
            from: ws.accountId,
            username: ws.username,
            signalData: msg.signalData
          });
        }
      }

    } catch (e) {
      ws.send?.(JSON.stringify({ type: 'notification', text: 'Ошибка' }));
    }
  });

  ws.on('close', () => {
    if (ws.accountId) {
      const acc = accounts.get(ws.accountId);
      if (acc) {
        if (acc.group && groups[acc.group]) {
          groups[acc.group].delete(ws);
        }
        usernames.delete(acc.username);
        accounts.delete(ws.accountId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ KotoChat Server запущен на порту ${PORT}`);
});
