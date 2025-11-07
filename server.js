const http = require('http');
const WebSocket = require('ws');

// 1. Создаём HTTP-сервер (обязательно для wss:// на Render)
const server = http.createServer((req, res) => {
  // Опционально: отдать index.html, если захотите SPA
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>❌</title></head>
      <body>
        <h2>Это WebSocket-сервер ✅</h2>
        <p>Подключайтесь через <code>wss://${req.headers.host}</code></p>
        <p>Для чата откройте <a href="https://ваш-фронтенд.html">ваш HTML-файл</a></p>
      </body></html>
    `);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// 2. Подключаем WebSocket к HTTP-серверу
const wss = new WebSocket.Server({ server });

// 3. Хранение групп: { groupName: Set<WebSocket> }
const groups = {
  'Общий': new Set(),
  'Работа': new Set(),
  'Друзья': new Set()
};

// 4. Обработка подключений
wss.on('connection', (ws) => {
  let username = 'anon';
  let currentGroup = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'join' && msg.username && groups[msg.group]) {
        username = msg.username;
        // Покинуть старую группу
        if (currentGroup && groups[currentGroup].has(ws)) {
          groups[currentGroup].delete(ws);
        }
        // Вступить в новую
        currentGroup = msg.group;
        groups[currentGroup].add(ws);

        // Уведомление
        broadcast(currentGroup, {
          type: 'notification',
          text: `${username} присоединился к группе`
        });

      } else if (msg.type === 'message' && currentGroup && msg.text) {
        broadcast(currentGroup, {
          type: 'message',
          username,
          text: msg.text,
          timestamp: Date.now()
        });

      } else if (msg.type === 'signal' && msg.to && msg.signalData) {
        // Простая рассылка сигнала ВСЕМ в группе (для упрощения)
        // В production лучше использовать peer-to-peer или указывать получателя
        broadcast(msg.to, {
          type: 'signal',
          from: username,
          signalData: msg.signalData
        });
      }
    } catch (e) {
      console.error('Ошибка обработки сообщения:', e);
      ws.send(JSON.stringify({ type: 'notification', text: '⚠️ Ошибка в сообщении' }));
    }
  });

  ws.on('close', () => {
    if (currentGroup && groups[currentGroup]) {
      groups[currentGroup].delete(ws);
      if (username !== 'anon') {
        broadcast(currentGroup, {
          type: 'notification',
          text: `${username} покинул группу`
        });
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Вспомогательная функция: рассылка в группу
function broadcast(groupName, data) {
  if (!groups[groupName]) return;
  const message = JSON.stringify(data);
  groups[groupName].forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 5. Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`📡 WebSocket: wss://kotochat-e22r.onrender.com`);
});
