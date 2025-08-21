// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // папка с index.html

// Хранилище сообщений
let messages = []; // {user: 'Имя', text: 'Сообщение', time: timestamp}

// REST API для загрузки сообщений
app.get('/messages/kotochat', (req, res) => {
  res.json(messages);
});

// REST API для отправки сообщений
app.post('/messages/kotochat', (req, res) => {
  const { user, text } = req.body;
  if (!user || !text) return res.status(400).json({ error: 'Нет user или text' });

  const message = { user, text, time: Date.now() };
  messages.push(message);

  // Отправка через WebSocket всем подключённым клиентам
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });

  res.json({ status: 'ok' });
});

// WebSocket для реального времени
wss.on('connection', ws => {
  console.log('Новый клиент подключился');

  // Можно отправить текущие сообщения при подключении
  ws.send(JSON.stringify({ type: 'init', messages }));

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if(data.user && data.text){
        const message = { user: data.user, text: data.text, time: Date.now() };
        messages.push(message);

        wss.clients.forEach(client => {
          if(client.readyState === WebSocket.OPEN){
            client.send(JSON.stringify(message));
          }
        });
      }
    } catch(e){ console.log(e); }
  });

  ws.on('close', () => console.log('Клиент отключился'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
