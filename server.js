const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid'); // Для генерации токена подтверждения

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Map(); // ws => {username, group, role}
let groups = new Map(); // groupName => Set(ws)
let messages = new Map(); // groupName => [{username, text, timestamp}]
let pendingVerifications = new Map(); // email => {code, timestamp}
let verifiedEmails = new Set(); // список подтверждённых email-ов

// === SMTP ===
const transporter = nodemailer.createTransport({
  service: 'Yandex',
  auth: {
    user: 'kotkotenok43434343@yandex.ru',
    pass: 'fjmbcssgznvqqild'
  }
});

// === Отправка кода на email ===
app.post('/verify', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  pendingVerifications.set(email, { code, timestamp: Date.now() });

  try {
    await transporter.sendMail({
      from: '"KotoChat" <kotkotenok43434343@yandex.ru>',
      to: email,
      subject: 'Код подтверждения',
      text: `Ваш код подтверждения: ${code}`
    });
    res.json({ message: 'Код отправлен на email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка отправки письма' });
  }
});

// === Проверка кода ===
app.post('/verify-code', (req, res) => {
  const { email, code } = req.body;
  const entry = pendingVerifications.get(email);

  if (entry && entry.code === code) {
    verifiedEmails.add(email);
    pendingVerifications.delete(email);
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, message: 'Неверный код' });
  }
});

// === WS Chat ===
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

      switch (data.type) {
        case 'join':
          clients.set(ws, { username: data.username, group: data.group, role: data.role || 'Гость' });
          if (!groups.has(data.group)) groups.set(data.group, new Set());
          groups.get(data.group).add(ws);

          ws.send(JSON.stringify({ type: 'history', messages: messages.get(data.group) || [] }));
          broadcast(data.group, { type: 'notification', text: `${data.username} вошёл в ${data.group}` });
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
          for (const [client, info] of clients.entries()) {
            if (info.username === data.to) {
              client.send(JSON.stringify({ type: 'signal', from: clients.get(ws).username, signalData: data.signalData }));
              break;
            }
          }
          break;
      }
    } catch (err) {
      console.error('Ошибка обработки сообщения:', err);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      const { username, group } = info;
      clients.delete(ws);
      if (groups.has(group)) {
        groups.get(group).delete(ws);
        broadcast(group, { type: 'notification', text: `${username} вышел из ${group}` });
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
  console.log(`Server running on port ${PORT}`);
});
