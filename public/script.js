let ws;
let username = "";

function connect() {
  username = document.getElementById('username').value;
  const url = document.getElementById('ngrok').value;

  ws = new WebSocket(url);
  ws.onopen = () => {
    document.getElementById('login').style.display = "none";
    document.getElementById('chat').style.display = "block";
    notify("Подключено к серверу!");
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'message';
    div.textContent = `${data.name}: ${data.text}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;

    if (data.name !== username) notify(`${data.name}: ${data.text}`);
  };
}

function sendMessage() {
  const text = document.getElementById('msg').value;
  ws.send(JSON.stringify({ name: username, text }));
  document.getElementById('msg').value = "";
}

// Уведомления
function notify(msg) {
  if (Notification.permission === "granted") {
    new Notification(msg);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") new Notification(msg);
    });
  }
}
