const express = require('express');
const nodemailer = require('nodemailer');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());

const codes = {}; // временное хранилище кодов

const transporter = nodemailer.createTransport({
  service: 'Yandex',
  auth: {
    user: 'kotkotenok43434343@yandex.ru',
    pass: 'fjmbcssgznvqqild', // пароль приложения
  },
});

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/send-code', async (req, res) => {
  const { email } = req.body;
  const code = generateCode();
  codes[email] = code;

  try {
    await transporter.sendMail({
      from: '"KotoChat" <kotkotenok43434343@yandex.ru>',
      to: email,
      subject: 'Ваш код подтверждения',
      text: `Ваш код: ${code}`,
    });
    res.sendStatus(200);
  } catch (err) {
    console.error('Ошибка отправки:', err);
    res.sendStatus(500);
  }
});

app.post('/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (codes[email] === code) {
    res.cookie('session', email, { httpOnly: true });
    delete codes[email];
    res.send('Успешно! Вы вошли.');
  } else {
    res.status(400).send('Неверный код!');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('Сервер запущен на порту ' + PORT);
});
