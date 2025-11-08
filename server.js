const http = require('http');
const WebSocket = require('ws');

// HTTP-сервер (обязателен для Render)
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>✅ KotoChat Server</title></head>
      <body>
        <h2>✅ Это WebSocket-сервер KotoChat</h2>
        <p><strong>WebSocket:</strong> <code>wss://kotochat-e22r.onrender.com</code></p>
        <p>Подключайтесь из HTML-клиента</p>
        <p>Версия: 1.1 (аккаунты + онлайн)</p>
      </body></html>
    `);
  } else {
    res.writeHead(404).end('404 Not Found');
  }
});

// WebSocket-сервер
const wss = new WebSocket.Server({ server });

// Хранилища
const GROUPS = ['Общий', 'Работа', 'Друзья'];
const groups = {};
GROUPS.forEach(g => groups[g] = new Set());

const accounts = new Map();      // accountId → { ws, username, group }
const usernames = new Set();     // для проверки уникальности имён

// Вспомогательные функции
function broadcast(groupName, data) {
  if (!groups[groupName]) return;
  const message = JSON.stringify(data);
  groups[groupName].forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

function updateOnlineCount() {
  GROUPS.forEach(group => {
    const count = groups[group].size;
    broadcast(group, { type: 'online_update', count });
  });
}

// Обработка подключений
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      // 1. Вход в аккаунт
      if (msg.type === 'login') {
        const { username, accountId } = msg;
        if (!username || !accountId || username.length < 2 || username.length > 20) {
          ws.send(JSON.stringify({ type: 'login_failure', reason: 'invalid_name' }));
          return ws.close(4001, 'Invalid username');
        }

        if (usernames.has(username)) {
          ws.send(JSON.stringify({ type: 'login_failure', username }));
          return ws.close(4002, 'Username taken');
        }

        // Регистрируем
        accounts.set(accountId, { ws, username, group: null });
        usernames.add(username);
        ws.accountId = accountId;
        ws.username = username;

        ws.send(JSON.stringify({ type: 'login_success', username, accountId }));
        console.log(`✅ ${username} (${accountId}) вошёл`);
        return;
      }

      // Проверка: вошёл ли пользователь?
      if (!ws.accountId) {
        ws.send(JSON.stringify({ type: 'notification', text: 'Требуется вход' }));
        return ws.close(4000, 'Unauthorized');
      }

      // 2. Вступление в группу
      if (msg.type === 'join' && msg.group && groups[msg.group]) {
        const acc = accounts.get(ws.accountId);
        const oldGroup = acc?.group;

        // Покинуть старую группу
        if (oldGroup && oldGroup !== msg.group) {
          groups[oldGroup].delete(ws);
          broadcast(oldGroup, {
            type: 'notification',
            text: `${ws.username} покинул группу`
          });
        }

        // Войти в новую
        acc.group = msg.group;
        groups[msg.group].add(ws);

        // Уведомление
        broadcast(msg.group, {
          type: 'notification',
          text: `${ws.username} присоединился к группе`
        });

        // Подтверждение
        ws.send(JSON.stringify({
          type: 'join_ack',
          group: msg.group,
          onlineCount: groups[msg.group].size
        }));

        updateOnlineCount();
        return;
      }

      // 3. Отправка сообщения
      if (msg.type === 'message' && msg.text && ws.accountId) {
        const acc = accounts.get(ws.accountId);
        if (!acc?.group) return;

        broadcast(acc.group, {
          type: 'message',
          username: ws.username,
          accountId: ws.accountId,
          text: msg.text,
          timestamp: Date.now()
        });
        return;
      }

      // 4. WebRTC сигналы (рассылка по группе)
      if (msg.type === 'signal' && msg.to && msg.signalData) {
        const acc = accounts.get(ws.accountId);
        if (!acc?.group || msg.to !== acc.group) return;

        broadcast(acc.group, {
          type: 'signal',
          from: ws.accountId,
          username: ws.username,
          signalData: msg.signalData
        });
        return;
      }

    } catch (e) {
      console.error('Ошибка обработки:', e);
      ws.send?.(JSON.stringify({ type: 'notification', text: '❌ Ошибка сервера' }));
    }
  });

  // Обработка отключения
  ws.on('close', (code, reason) => {
    if (ws.accountId) {
      const acc = accounts.get(ws.accountId);
      if (acc) {
        // Покинуть группу
        if (acc.group && groups[acc.group]) {
          groups[acc.group].delete(ws);
          broadcast(acc.group, {
            type: 'notification',
            text: `${acc.username} отключился`
          });
        }
        // Очистка
        usernames.delete(acc.username);
        accounts.delete(ws.accountId);
        updateOnlineCount();
        console.log(`🔌 ${acc.username} (${ws.accountId}) вышел`);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WS error:', err);
  });
});

// Запуск
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ KotoChat Server v1.1 запущен на порту ${PORT}`);
  console.log(`📡 WebSocket: wss://kotochat-e22r.onrender.com`);
  console.log(`👥 Поддержка аккаунтов и онлайн-статуса`);
});
