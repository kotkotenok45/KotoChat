import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

// 🔥 Разрешаем CORS
app.use(cors({ origin: "*" })); // можно вместо "*" прописать твои домены
app.use(bodyParser.json());

// Пример маршрута логина
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  res.json({ ok: true, username, message: "Добро пожаловать!" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("KotoChat Server запущен на порту " + PORT));
