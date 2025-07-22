const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

const transporter = nodemailer.createTransport({
  service: 'Yandex',
  auth: {
    user: 'kotkotenok43434343@yandex.ru',
    pass: 'fjmbcssgznvqqild',
  }
});

const emailCodes = new Map(); // email => код
const verifiedEmails = new Set(); // подтверждённые email

app.post('/send-code', (req, res) => {
  const { email } = req.body;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  emailCodes.set(email, code);

  transporter.sendMail({
    from: 'kotkotenok43434343@yandex.ru',
    to: email,
    subject: 'Код подтверждения',
    text: `Ваш код подтверждения: ${code}`
  }, (err, info) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Ошибка при отправке кода');
    }
    res.send('Код отправлен');
  });
});

app.post('/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (emailCodes.get(email) === code) {
    verifiedEmails.add(email);
    res.send('OK');
  } else {
    res.status(400).send('Неверный код');
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Map(); // ws => {username, group, role}
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
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      switch (data.type) {
        case 'join':
          const role = data.username === 'kotkotenok' ? 'Создатель' : (data.username === 'admin' ? 'Админ' : 'Гость');
          clients.set(ws, { username: data.username, group: data.group, role });
          if (!groups.has(data.group)) groups.set(data.group, new Set());
          groups.get(data.group).add(ws);
          ws.send(JSON.stringify({ type: 'history', messages: messages.get(data.group) || [] }));
          broadcast(data.group, { type: 'notification', text: `${data.username} (${role}) вошёл в ${data.group}` });
          break;

        case 'message':
          const sender = clients.get(ws);
          if (!sender) return;
          const msgObj = { username: sender.username, text: data.text, timestamp: Date.now(), role: sender.role };
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
    } catch (e) {
      console.error('Ошибка сообщения', e);
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
