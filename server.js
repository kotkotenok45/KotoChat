const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const nodemailer = require('nodemailer');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const otpStore = new Map();

// Хранилище ролей
const userRoles = {
  'admin@example.com': 'admin',
  'creator@example.com': 'creator',
};

// Email конфиг
const transporter = nodemailer.createTransport({
  host: 'smtp.yandex.ru',
  port: 465,
  secure: true,
  auth: {
    user: 'kotkotenok43434343@yandex.ru',
    pass: 'fjmbcssgznvqqild',
  },
});

// Генерация кода подтверждения
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

wss.on('connection', ws => {
  ws.on('message', message => {
    let data;
    try { data = JSON.parse(message); } catch { return; }

    // Запрос кода
    if (data.type === 'request_otp') {
      const email = data.userId;
      const code = generateOtp();
      otpStore.set(email, code);
      transporter.sendMail({
        from: '"KotoChat" <kotkotenok43434343@yandex.ru>',
        to: email,
        subject: 'Код подтверждения',
        text: `Ваш код: ${code}`,
      }).then(() => {
        ws.send(JSON.stringify({ type: 'otp_sent' }));
      }).catch(err => {
        ws.send(JSON.stringify({ type: 'otp_failed', error: err.message }));
      });
      return;
    }

    // Проверка кода
    if (data.type === 'verify_otp') {
      const saved = otpStore.get(data.userId);
      const success = saved && data.code === saved;
      if (success) otpStore.delete(data.userId);
      ws.send(JSON.stringify({ type: 'otp_verified', success }));
      return;
    }

    // Подключение к чату
    if (data.type === 'join') {
      const role = userRoles[data.userId] || 'guest';
      ws.username = data.username;
      ws.userId = data.userId;
      ws.role = role;

      ws.send(JSON.stringify({ type: 'role', role }));

      broadcast({
        type: 'system',
        message: `${ws.username} вошёл в чат как ${role}`,
      });
      return;
    }

    // Сообщение
    if (data.type === 'message') {
      broadcast({
        type: 'message',
        user: ws.username,
        text: data.text,
        role: ws.role,
      });
    }
  });

  ws.on('close', () => {
    if (ws.username) {
      broadcast({
        type: 'system',
        message: `${ws.username} вышел из чата`,
      });
    }
  });
});

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

app.use(express.static('public'));

server.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});
