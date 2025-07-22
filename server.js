const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const users = {
  'kotkotenok43434343@gmail.com': { password: 'kotkotenok43', role: 'Создатель' },
  'admin@example.com': { password: 'adminpass', role: 'Админ' },
  'guest@example.com': { password: 'guestpass', role: 'Гость' },
  'user1@example.com': { password: 'userpass1', role: 'Пользователь' },
  'user2@example.com': { password: 'userpass2', role: 'Пользователь' },
};

const clients = new Map(); // ws => {email, username, role, currentGroup}
const groups = new Map();  // groupName => { members: Set(email), sockets: Set(ws) }
const messages = new Map(); // groupName => [{ from, text, timestamp, role }]
const privateMessages = new Map(); // key=email1|email2 => [{ from, to, text, timestamp }]

if(!groups.has('Общий')) groups.set('Общий', { members: new Set(), sockets: new Set() });
if(!messages.has('Общий')) messages.set('Общий', []);

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcastGroup(groupName, data) {
  if (!groups.has(groupName)) return;
  for (const ws of groups.get(groupName).sockets) {
    send(ws, data);
  }
}

function broadcastUser(email, data) {
  for (const [ws, info] of clients) {
    if (info.email === email && ws.readyState === WebSocket.OPEN) {
      send(ws, data);
    }
  }
}

function pmKey(email1, email2) {
  return [email1, email2].sort().join('|');
}

// Проверка, может ли юзер менять участников (создатель или админ)
function canManageMembers(role) {
  return role === 'Создатель' || role === 'Админ';
}

wss.on('connection', (ws) => {
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      switch(data.type) {
        case 'login': {
          const { email, password, username } = data;
          if (!users[email] || users[email].password !== password) {
            send(ws, { type: 'error', text: 'Неверный email или пароль' });
            ws.close();
            return;
          }
          const role = users[email].role;
          clients.set(ws, { email, username, role, currentGroup: 'Общий' });
          if (!groups.has('Общий')) groups.set('Общий', { members: new Set(), sockets: new Set() });

          groups.get('Общий').members.add(email);
          groups.get('Общий').sockets.add(ws);

          send(ws, { type: 'login-success', role, currentGroup: 'Общий' });
          send(ws, { type: 'groups-list', groups: Array.from(groups.keys()) });
          send(ws, { type: 'history', group: 'Общий', messages: messages.get('Общий') || [] });

          // Отправить список участников текущей группы
          sendGroupMembers(ws, 'Общий');

          broadcastGroup('Общий', { type: 'notification', text: `${username} (${role}) присоединился к группе Общий` });
          break;
        }

        case 'create-group': {
          const info = clients.get(ws);
          if (!info) return;
          if (groups.has(data.group)) {
            send(ws, { type: 'error', text: `Группа ${data.group} уже существует` });
            return;
          }
          groups.set(data.group, { members: new Set([info.email]), sockets: new Set() });
          messages.set(data.group, []);
          send(ws, { type: 'groups-list', groups: Array.from(groups.keys()) });
          break;
        }

        case 'join-group': {
          const info = clients.get(ws);
          if (!info) return;
          const group = data.group;
          if (!groups.has(group)) {
            send(ws, { type: 'error', text: `Группа ${group} не найдена` });
            return;
          }

          // Проверяем, что пользователь входит в группу (т.е. в members)
          if (!groups.get(group).members.has(info.email)) {
            send(ws, { type: 'error', text: `Вы не состоите в группе ${group}` });
            return;
          }

          // Удаляем из старой группы
          if (groups.has(info.currentGroup)) groups.get(info.currentGroup).sockets.delete(ws);

          // Добавляем в новую
          groups.get(group).sockets.add(ws);
          info.currentGroup = group;

          send(ws, { type: 'history', group, messages: messages.get(group) || [] });
          send(ws, { type: 'joined-group', group });
          sendGroupMembers(ws, group);

          broadcastGroup(group, { type: 'notification', text: `${info.username} (${info.role}) вошёл в группу ${group}` });
          break;
        }

        case 'message': {
          const info = clients.get(ws);
          if (!info) return;

          if (info.role === 'Гость') {
            send(ws, { type: 'error', text: 'Гости не могут писать сообщения' });
            return;
          }

          const group = info.currentGroup;
          if (!groups.has(group)) return;

          const msgObj = { from: info.username, text: data.text, timestamp: Date.now(), role: info.role };

          if (!messages.has(group)) messages.set(group, []);
          messages.get(group).push(msgObj);

          broadcastGroup(group, { type: 'message', group, ...msgObj });
          break;
        }

        case 'private-message': {
          const info = clients.get(ws);
          if (!info) return;

          const { toEmail, text } = data;

          if (!users[toEmail]) {
            send(ws, { type: 'error', text: 'Пользователь не найден' });
            return;
          }

          const pmKeyStr = pmKey(info.email, toEmail);
          if (!privateMessages.has(pmKeyStr)) privateMessages.set(pmKeyStr, []);

          const msgObj = {
            from: info.email,
            to: toEmail,
            text,
            timestamp: Date.now(),
            fromName: info.username,
            role: info.role
          };

          privateMessages.get(pmKeyStr).push(msgObj);

          broadcastUser(info.email, { type: 'private-message', message: msgObj });
          broadcastUser(toEmail, { type: 'private-message', message: msgObj });

          break;
        }

        case 'get-private-history': {
          const info = clients.get(ws);
          if (!info) return;
          const otherEmail = data.withEmail;
          const pmKeyStr = pmKey(info.email, otherEmail);
          const history = privateMessages.get(pmKeyStr) || [];
          send(ws, { type: 'private-history', withEmail: otherEmail, messages: history });
          break;
        }

        // Добавление пользователя в группу (только для Создателя и Админа группы)
        case 'add-user-to-group': {
          const info = clients.get(ws);
          if (!info) return;

          const { group, userEmail } = data;

          if (!groups.has(group)) {
            send(ws, { type: 'error', text: `Группа ${group} не найдена` });
            return;
          }

          // Проверка прав
          if (!canManageMembers(info.role)) {
            send(ws, { type: 'error', text: 'У вас нет прав для добавления пользователей' });
            return;
          }

          if (!users[userEmail]) {
            send(ws, { type: 'error', text: `Пользователь ${userEmail} не найден` });
            return;
          }

          const grp = groups.get(group);

          if (grp.members.has(userEmail)) {
            send(ws, { type: 'error', text: `Пользователь уже в группе` });
            return;
          }

          grp.members.add(userEmail);

          // Если этот пользователь сейчас онлайн, добавим его сокеты в группу
          for (const [clientWs, clientInfo] of clients) {
            if (clientInfo.email === userEmail) {
              grp.sockets.add(clientWs);
              clientInfo.currentGroup = group;
              send(clientWs, { type: 'joined-group', group });
              sendGroupMembers(clientWs, group);
              send(clientWs, { type: 'history', group, messages: messages.get(group) || [] });
            }
          }

          broadcastGroup(group, { type: 'notification', text: `Пользователь ${userEmail} добавлен в группу ${group}` });
          broadcastGroupMembers(group);
          break;
        }

        // Удаление пользователя из группы
        case 'remove-user-from-group': {
          const info = clients.get(ws);
          if (!info) return;

          const { group, userEmail } = data;

          if (!groups.has(group)) {
            send(ws, { type: 'error', text: `Группа ${group} не найдена` });
            return;
          }

          if (!canManageMembers(info.role)) {
            send(ws, { type: 'error', text: 'У вас нет прав для удаления пользователей' });
            return;
          }

          const grp = groups.get(group);

          if (!grp.members.has(userEmail)) {
            send(ws, { type: 'error', text: `Пользователь не состоит в группе` });
            return;
          }

          grp.members.delete(userEmail);

          // Удаляем сокеты пользователя из группы
          for (const [clientWs, clientInfo] of clients) {
            if (clientInfo.email === userEmail) {
              grp.sockets.delete(clientWs);
              // Если он был в этой группе, переведем его в Общий (или null)
              if (clientInfo.currentGroup === group) {
                clientInfo.currentGroup = 'Общий';
                groups.get('Общий').sockets.add(clientWs);
                send(clientWs, { type: 'joined-group', group: 'Общий' });
                send(clientWs, { type: 'history', group: 'Общий', messages: messages.get('Общий') || [] });
                sendGroupMembers(clientWs, 'Общий');
              }
            }
          }

          broadcastGroup(group, { type: 'notification', text: `Пользователь ${userEmail} удалён из группы ${group}` });
          broadcastGroupMembers(group);
          break;
        }

        case 'get-group-members': {
          const info = clients.get(ws);
          if (!info) return;
          const group = data.group;
          sendGroupMembers(ws, group);
          break;
        }

        default:
          send(ws, { type: 'error', text: 'Неизвестный тип сообщения' });
      }
    } catch(e) {
      console.error('Ошибка при обработке сообщения:', e);
      send(ws, { type: 'error', text: 'Ошибка обработки сообщения' });
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      clients.delete(ws);
      if (groups.has(info.currentGroup)) {
        groups.get(info.currentGroup).sockets.delete(ws);
        broadcastGroup(info.currentGroup, { type: 'notification', text: `${info.username} (${info.role}) вышел из чата` });
      }
    }
  });
});

function sendGroupMembers(ws, group) {
  if (!groups.has(group)) {
    send(ws, { type: 'error', text: `Группа ${group} не найдена` });
    return;
  }
  const grp = groups.get(group);
  send(ws, { type: 'group-members', group, members: Array.from(grp.members) });
}

function broadcastGroupMembers(group) {
  if (!groups.has(group)) return;
  const grp = groups.get(group);
  const members = Array.from(grp.members);
  for (const ws of grp.sockets) {
    send(ws, { type: 'group-members', group, members });
  }
}

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
