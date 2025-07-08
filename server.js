const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 10000;

// Отдаём статические файлы из папки 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Для всех остальных путей отдаём index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
