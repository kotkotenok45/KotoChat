import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Структуры данных
const users = {}; 
const groups = {}; 

// Роли: Гость, Пользователь, Админ, Создатель

// Создать пользователя или вернуть существующего
function ensureUser(username, password) {
  if (!users[username]) {
    users[username] = { password, role: "Пользователь", chats: {}, groups: [] };
  }
  return users[username];
}

// Авторизация / регистрация
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (users[username]) {
    if (users[username].password === password) return res.json({ ok: true });
    else return res.status(400).json({ error: "Неверный пароль" });
  } else {
    // Создаем нового пользователя
    ensureUser(username, password);
    return res.json({ ok: true, message: "Новый аккаунт создан" });
  }
});

// Отправка личного сообщения
app.post("/api/send", (req, res) => {
  const { from, to, text } = req.body;
  if (!users[from]) return res.status(400).json({ error: "Отправитель не существует" });
  ensureUser(to, ""); // создаём если нет
  if (!users[to].chats[from]) users[to].chats[from] = [];
  users[to].chats[from].push({ from, text, ts: Date.now() });
  return res.json({ ok: true });
});

// Получение сообщений
app.get("/api/messages/:username", (req, res) => {
  const { username } = req.params;
  ensureUser(username, "");
  const allMsgs = [];
  for (const chatWith in users[username].chats) {
    allMsgs.push(...users[username].chats[chatWith]);
    users[username].chats[chatWith] = []; // очищаем после выдачи
  }
  res.json(allMsgs);
});

// Создание группы
app.post("/api/creategroup", (req, res) => {
  const { creator, name } = req.body;
  if (!users[creator]) return res.status(400).json({ error: "Пользователь не найден" });
  if (groups[name]) return res.status(400).json({ error: "Группа уже существует" });
  groups[name] = { creator, members: { [creator]: "Создатель" }, messages: [] };
  users[creator].groups.push(name);
  res.json({ ok: true });
});

// Добавление пользователя в группу
app.post("/api/addtogroup", (req, res) => {
  const { group, user, by } = req.body;
  if (!groups[group]) return res.status(400).json({ error: "Группа не найдена" });
  if (!users[by] || groups[group].members[by] === undefined) return res.status(400).json({ error: "Нет прав" });
  groups[group].members[user] = "Участник";
  if (!users[user].groups.includes(group)) users[user].groups.push(group);
  res.json({ ok: true });
});

// Изменение роли
app.post("/api/changerole", (req, res) => {
  const { group, user, role, by } = req.body;
  if (!groups[group]) return res.status(400).json({ error: "Группа не найдена" });
  if (groups[group].members[by] !== "Создатель" && groups[group].members[by] !== "Модератор")
    return res.status(400).json({ error: "Нет прав" });
  if (!groups[group].members[user]) return res.status(400).json({ error: "Пользователь не в группе" });
  groups[group].members[user] = role;
  res.json({ ok: true });
});

app.get("/healthz", (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("KotoChat HTTPS Server running on", PORT));
