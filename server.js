const express=require('express'),http=require('http'),WebSocket=require('ws');
const app=express(),server=http.createServer(app),wss=new WebSocket.Server({server});
app.use(express.static('public'));

let usersDB={
  "kotkotenok43434343@gmail.com":{pass:"kotkotenok43",role:"Создатель"},
  "admin@foo":{pass:"admin",role:"Админ"}
};
let sockets=new Map(), groups=new Map(); // group -> Set(ws)
let history=new Map(); // group -> [messages]

wss.on('connection',ws=>{
  ws.on('message',msg=>{
    let d=JSON.parse(msg);
    if(d.type==='auth'){
      let rec = usersDB[d.email];
      if(!rec||rec.pass!==d.pass){
        ws.send(JSON.stringify({type:'auth_fail'})); return ws.close();
      }
      ws.user={email:d.email,username:d.username,role:rec.role||"Пользователь"};
      sockets.set(ws,ws.user);
      if(!groups.has('Общий')) groups.set('Общий',new Set());
      let mem = Array.from(groups.get('Общий'));
      let memEmails=mem.map(s=>sockets.get(s).email);
      groups.get('Общий').add(ws);
      history.has('Общий')||history.set('Общий',[]);
      ws.send(JSON.stringify({type:'auth_ok',user:ws.user,groups:Array.from(groups.keys()),members:memEmails}));
    }
    if(d.type==='create'){
      if(!groups.has(d.group)){groups.set(d.group,new Set()); history.set(d.group,[]);}
      broadcastGroups();
    }
    if(d.type==='join_group'){
      if(!groups.has(d.group)) return;
      groups.get(d.group).add(ws);
      let mems=Array.from(groups.get(d.group)).map(s=>sockets.get(s).email);
      ws.send(JSON.stringify({type:'joined',group:d.group,history:history.get(d.group),members:mems}));
    }
    if(d.type==='message'){
      let m={type:'message',group:d.group,from:ws.user.username,role:ws.user.role,text:d.text};
      history.get(d.group).push(m);
      groups.get(d.group).forEach(s=>s.send(JSON.stringify(m)));
    }
    if(d.type==='add_member'&& (ws.user.role==='Создатель'||ws.user.role==='Админ')){
      let g=groups.get(d.group);
      for(let [s,u] of sockets) if(u.email===d.email){g.add(s);ws.send(JSON.stringify({type:'member_added',members:Array.from(g).map(s2=>sockets.get(s2).email)}));}
    }
    if(d.type==='remove_member'&& (ws.user.role==='Создатель'||ws.user.role==='Админ')){
      let g=groups.get(d.group);
      for(let [s,u] of sockets) if(u.email===d.email){g.delete(s);ws.send(JSON.stringify({type:'member_removed',members:Array.from(g).map(s2=>sockets.get(s2).email)}));}
    }
    if(d.type==='save_name'){
      ws.user.username=d.username;
      ws.send(JSON.stringify({type:'name_saved'}));
    }
    if(d.type==='signal'){
      groups.get(d.group).forEach(s=>{
        if(s!==ws) s.send(JSON.stringify({type:'signal',from:ws.user.username,...d}));
      });
    }
  });
});

function broadcastGroups(){
  let g=Array.from(groups.keys());
  sockets.forEach((u,ws)=>{
    ws.send(JSON.stringify({type:'groups',groups:g}));
  });
}

setInterval(()=>{
  wss.clients.forEach(ws=>ws.isAlive?ws.isAlive=false:ws.terminate());
},30000);

server.listen(10000,()=>console.log('Server on :10000'));
