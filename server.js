// server.js — для Render (Node.js)
const http = require('http');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('✅ KotoChat Server — ready for mobile & desktop clients\n');
  } else {
    res.writeHead(404).end();
  }
});

const wss = new WebSocket.Server({ server });

// Группы (теперь как "чаты")
const chats = {
  'Общий': new Set(),
  'Работа': new Set(),
  'Друзья': new Set()
};

// Аккаунты: { accountId → { ws, username, lastSeen } }
const accounts = new Map();
// Имена: { username → accountId } — для мгновенной проверки
const usernameToId = new Map();

// 👇 Исправление: очистка "зависших" аккаунтов при запуске
function cleanupStaleAccounts() {
  const now = Date.now();
  for (const [id, acc] of accounts) {
    // Если аккаунт без активного ws — удаляем
    if (!acc.ws || acc.ws.readyState !== WebSocket.OPEN) {
      usernameToId.delete(acc.username);
      accounts.delete(id);
      console.log(`🧹 Очищен зависший аккаунт: ${acc.username} (${id})`);
    }
  }
}

// Рассылка в чат
function broadcast(chatName, data) {
  const room = chats[chatName];
  if (!room) return;
  const msg = JSON.stringify(data);
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// Периодическая проверка соединений
setInterval(() => {
  for (const [id, acc] of accounts) {
    if (acc.ws && acc.ws.readyState !== WebSocket.OPEN) {
      // Принудительная очистка
      usernameToId.delete(acc.username);
      accounts.delete(id);
      if (acc.chat && chats[acc.chat]) {
        chats[acc.chat].delete(acc.ws);
      }
      console.log(`🧹 Автоочистка: ${acc.username}`);
    }
  }
}, 30000); // каждые 30 сек

wss.on('connection', (ws) => {
  // Уникальный временный ID до входа
  ws.tempId = 'tmp_' + Math.random().toString(36).substr(2, 6);
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      // 🔑 Вход: поддержка вашего никнейма kotkotenok43
      if (msg.type === 'login') {
        let { username, accountId } = msg;
        
        // Приведение к нижнему регистру + trim
        username = (username || '').trim();
        if (username.length < 2 || username.length > 20) {
          ws.send(JSON.stringify({ type: 'login_failure', reason: 'len' }));
          return ws.close(4001, 'Invalid name length');
        }

        // 🧠 Умная проверка: если вы — kotkotenok43 → разрешаем даже при "занятости"
        if (username.toLowerCase() === 'kotkotenok43') {
          // Удаляем старый аккаунт с этим именем, если есть
          const oldId = usernameToId.get(username);
          if (oldId && accounts.has(oldId)) {
            const oldAcc = accounts.get(oldId);
            if (oldAcc.ws && oldAcc.ws !== ws) {
              oldAcc.ws.close(1000, 'Replaced by owner');
            }
            accounts.delete(oldId);
          }
          usernameToId.delete(username);
          console.log(`👑 Привет, kotkotenok43! Старый аккаунт очищен.`);
        }

        // Проверяем, не занято ли имя
        if (usernameToId.has(username)) {
          ws.send(JSON.stringify({ type: 'login_failure', username }));
          return ws.close(4002, 'Username taken');
        }

        // Регистрируем
        accountId = accountId || ('u_' + Math.random().toString(36).substr(2, 9));
        accounts.set(accountId, { ws, username, chat: null, lastSeen: Date.now() });
        usernameToId.set(username, accountId);
        
        ws.accountId = accountId;
        ws.username = username;

        ws.send(JSON.stringify({ 
          type: 'login_success', 
          username, 
          accountId,
          chats: Object.keys(chats)
        }));
        console.log(`✅ ${username} (${accountId}) вошёл`);
        return;
      }

      if (!ws.accountId) {
        ws.send(JSON.stringify({ type: 'notification', text: 'Unauthorized' }));
        return ws.close(4000, 'No login');
      }

      // 📥 Вход в чат
      if (msg.type === 'join' && msg.chat && chats[msg.chat]) {
        const acc = accounts.get(ws.accountId);
        if (acc.chat && acc.chat !== msg.chat) {
          chats[acc.chat].delete(ws);
        }
        acc.chat = msg.chat;
        chats[msg.chat].add(ws);
        acc.lastSeen = Date.now();

        broadcast(msg.chat, {
          type: 'notification',
          text: `${ws.username} вошёл`,
          username: ws.username,
          timestamp: Date.now()
        });

        ws.send(JSON.stringify({
          type: 'join_ack',
          chat: msg.chat,
          online: Array.from(chats[msg.chat]).filter(w => w.readyState === WebSocket.OPEN).length
        }));
        return;
      }

      // 💬 Сообщение
      if (msg.type === 'message' && typeof msg.text === 'string') {
        const acc = accounts.get(ws.accountId);
        if (!acc?.chat) return;

        const payload = {
          type: 'message',
          from: ws.username,
          accountId: ws.accountId,
          text: msg.text,
          timestamp: Date.now(),
          chat: acc.chat
        };

        broadcast(acc.chat, payload);
        return;
      }

      // 📞 WebRTC сигнал (упрощённо)
      if (msg.type === 'signal' && msg.target && msg.data) {
        const acc = accounts.get(ws.accountId);
        if (acc?.chat) {
          broadcast(acc.chat, {
            type: 'signal',
            from: ws.accountId,
            username: ws.username,
            data: msg.data,
            target: msg.target
          });
        }
      }

    } catch (e) {
      console.error('Ошибка:', e.message);
      ws.send?.(JSON.stringify({ type: 'error', text: 'Bad request' }));
    }
  });

  // 🧹 При отключении — очистка
  const cleanup = () => {
    if (ws.accountId) {
      const acc = accounts.get(ws.accountId);
      if (acc) {
        if (acc.chat && chats[acc.chat]) {
          chats[acc.chat].delete(ws);
        }
        usernameToId.delete(acc.username);
        accounts.delete(ws.accountId);
        console.log(`👋 ${acc.username} вышел`);
      }
    }
  };

  ws.on('close', cleanup);
  ws.on('error', (e) => {
    console.error('WS error:', e.message);
    cleanup();
  });
});

// Запуск
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 KotoChat Server v2.0`);
  console.log(`   WebSocket: wss://kotochat-e22r.onrender.com`);
  console.log(`   Поддержка: kotkotenok43 (приоритетный вход)`);
  cleanupStaleAccounts(); // Очистка при старте
});
