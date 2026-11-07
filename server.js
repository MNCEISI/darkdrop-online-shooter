import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { ARENA, BOXES, MEDKITS, SPAWNS, WEAPONS } from './site/world.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site');
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const rooms = new Map();
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const now = () => Date.now();
const limit = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const rand = (a,b) => a+Math.random()*(b-a);
const send = (ws,data) => { if(ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const giveWeaponBank = () => Object.fromEntries(Object.entries(WEAPONS).map(([key,w])=>[key,{ammo:w.mag,reserve:w.reserve}]));

function spawnPoint(players) {
  const ranked = SPAWNS.map(([x,z]) => ({x,z,score:[...players.values()].filter(p=>p.hp>0).reduce((sum,p)=>sum+Math.min(60,Math.hypot(p.x-x,p.z-z)),0)}));
  ranked.sort((a,b)=>b.score-a.score);
  const pick = ranked[Math.floor(Math.random()*Math.min(3,ranked.length))];
  return {x:pick.x+rand(-1,1),z:pick.z+rand(-1,1)};
}
function makeFighter(id,name,bot,room) {
  const pt=spawnPoint(room.fighters);
  return { id,name,bot,x:pt.x,z:pt.z,y:0,vy:0,yaw:rand(-3.14,3.14),pitch:0,
    hp:100, armor:50,kills:0,deaths:0,weapon:'rifle',bank:giveWeaponBank(),reloadEnd:0,
    respawnAt:0,shieldUntil:now()+2400,lastShot:0,forward:0,strafe:0,sprint:false,jump:false,
    ws:null, target:null,thinkAt:0, botShotAt:0, speed:0, lastInputAt:0 };
}
function roomFor(key) {
  if(!rooms.has(key)) rooms.set(key,{ key, fighters:new Map(), humans:new Map(), medkits:MEDKITS.map((p,i)=>({id:i,x:p[0],z:p[1],available:true,respawnAt:0})), lastActive:now(), events:[] });
  return rooms.get(key);
}
function createBots(room) {
  const humans=room.humans.size;
  const want=room.key.startsWith('PRACTICE-') ? 5 : Math.max(0,4-humans);
  const botList=[...room.fighters.values()].filter(p=>p.bot);
  while(botList.length>want){const bot=botList.pop();room.fighters.delete(bot.id);}
  const names=['NOVA','ROGUE','VIPER','ECHO','RAVEN','GHOST','BLAZE'];
  while(botList.length<want){const id='bot-'+Math.random().toString(36).slice(2,9);const bot=makeFighter(id,names[botList.length%names.length]+' • AI',true,room);room.fighters.set(id,bot);botList.push(bot);}
}
function blocked(x,z,r=0.43) {
  if(Math.abs(x)>ARENA-1.7-r || Math.abs(z)>ARENA-1.7-r)return true;
  return BOXES.some(b=>Math.abs(x-b.x)<b.w/2+r && Math.abs(z-b.z)<b.d/2+r);
}
function move(p, dx, dz) {
  const nx=p.x+dx,nz=p.z+dz;
  if(!blocked(nx,p.z))p.x=nx;
  if(!blocked(p.x,nz))p.z=nz;
}
function respawn(p,room){
  const pt=spawnPoint(room.fighters);Object.assign(p,{x:pt.x,z:pt.z,y:0,vy:0,hp:100,armor:50,respawnAt:0,shieldUntil:now()+2200,reloadEnd:0});
  p.bank[p.weapon].ammo=WEAPONS[p.weapon].mag;
  send(p.ws,{type:'notice',text:'REDEPLOYED • 2S SPAWN PROTECTION'});
}
function rayBox(origin,dir,b,range) {
  const mins=[b.x-b.w/2,0,b.z-b.d/2],maxs=[b.x+b.w/2,b.h,b.z+b.d/2];
  let near=0,far=range;
  const o=[origin.x,origin.y,origin.z],d=[dir.x,dir.y,dir.z];
  for(let i=0;i<3;i++){
    if(Math.abs(d[i])<1e-8){if(o[i]<mins[i]||o[i]>maxs[i])return Infinity;continue;}
    let t1=(mins[i]-o[i])/d[i],t2=(maxs[i]-o[i])/d[i];
    if(t1>t2)[t1,t2]=[t2,t1];near=Math.max(near,t1);far=Math.min(far,t2);
    if(near>far)return Infinity;
  }
  return near;
}
function rayFighter(origin,dir,p,range) {
  // Infinite vertical cylinder, then reject impacts outside standing body height.
  const ox=origin.x-p.x,oz=origin.z-p.z;
  const a=dir.x*dir.x+dir.z*dir.z;
  if(a<1e-9)return Infinity;
  const b=2*(ox*dir.x+oz*dir.z),c=ox*ox+oz*oz-0.66*0.66;
  const delta=b*b-4*a*c;if(delta<0)return Infinity;
  const t1=(-b-Math.sqrt(delta))/(2*a),t2=(-b+Math.sqrt(delta))/(2*a);
  for(const t of [t1,t2]) if(t>=0&&t<=range){const y=origin.y+dir.y*t;if(y>=p.y+0.2 && y<=p.y+1.94)return t;}
  return Infinity;
}
function broadcast(room,obj){ for(const ws of room.humans.values())send(ws,obj); }
function fire(room,shooter,aimYaw=shooter.yaw,aimPitch=shooter.pitch){
  const tm=now(),spec=WEAPONS[shooter.weapon],bank=shooter.bank[shooter.weapon];
  if(shooter.hp<=0 || tm<shooter.shieldUntil-2100 || tm-shooter.lastShot<spec.cooldown || shooter.reloadEnd)return;
  if(bank.ammo<=0){send(shooter.ws,{type:'dry'});return;}
  shooter.lastShot=tm;bank.ammo--;
  // Controlled spread, server decides actual hits.
  const yaw=aimYaw+rand(-spec.spread,spec.spread),pitch=aimPitch+rand(-spec.spread,spec.spread);
  const dir={x:Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
  const origin={x:shooter.x,y:shooter.y+1.52,z:shooter.z};
  let best=spec.range,hit=null,kind='miss';
  for(const b of BOXES){const t=rayBox(origin,dir,b,best);if(t<best){best=t;hit=null;kind='wall';}}
  for(const p of room.fighters.values()){
    if(p.id===shooter.id||p.hp<=0||p.shieldUntil>tm)continue;
    const t=rayFighter(origin,dir,p,best);
    if(t<best){best=t;hit=p;kind='player';}
  }
  const end={x:origin.x+dir.x*best,y:origin.y+dir.y*best,z:origin.z+dir.z*best};
  broadcast(room,{type:'shot',id:shooter.id,weapon:shooter.weapon,from:origin,to:end,hit:hit?.id||null});
  if(!hit)return;
  const head=end.y>hit.y+1.49;
  let raw=Math.round(spec.damage*(head?1.65:1));
  const armourTaken=Math.min(hit.armor,Math.ceil(raw*0.45));
  hit.armor-=armourTaken;raw-=armourTaken;
  hit.hp=Math.max(0,hit.hp-raw);
  send(shooter.ws,{type:'hit',damage:raw,head,down:hit.hp===0});
  send(hit.ws,{type:'damaged',by:shooter.name,damage:raw,dir:shooter.yaw});
  if(hit.hp===0){
    hit.deaths++;shooter.kills++;hit.respawnAt=tm+2600;
    broadcast(room,{type:'kill',killer:shooter.name,victim:hit.name,head});
  }
}
function reload(p){
  const spec=WEAPONS[p.weapon],bank=p.bank[p.weapon];
  if(p.hp<=0||p.reloadEnd||bank.ammo>=spec.mag||bank.reserve<=0)return;
  p.reloadEnd=now()+spec.reload;send(p.ws,{type:'reload',ms:spec.reload});
}
function updateBots(room,dt,tm){
  const humans=[...room.fighters.values()].filter(p=>!p.bot&&p.hp>0);
  for(const bot of room.fighters.values()){
    if(!bot.bot||bot.hp<=0)continue;
    const targets=humans.filter(p=>p.shieldUntil<=tm);
    if(!targets.length)continue;
    const target=targets.reduce((a,b)=>Math.hypot(a.x-bot.x,a.z-bot.z)<Math.hypot(b.x-bot.x,b.z-bot.z)?a:b);
    const dx=target.x-bot.x,dz=target.z-bot.z,dist=Math.hypot(dx,dz);
    bot.yaw=Math.atan2(dx,-dz);bot.pitch=Math.atan2((target.y+1.30)-(bot.y+1.52),Math.max(1,dist));
    if(tm>bot.thinkAt){bot.thinkAt=tm+rand(500,1100);bot.sidestep=Math.random()<0.5?-1:1;}
    if(dist>10){move(bot,(dx/dist*3.15 + (-dz/dist)*(bot.sidestep||1)*1.55)*dt,(dz/dist*3.15 + (dx/dist)*(bot.sidestep||1)*1.55)*dt);}
    else if(dist>2){move(bot,-dz/dist*(bot.sidestep||1)*2.7*dt,dx/dist*(bot.sidestep||1)*2.7*dt);}
    if(dist<34 && tm>bot.botShotAt){
      bot.botShotAt=tm+rand(600,1120);
      // Bots are intentionally less accurate than people.
      fire(room,bot,bot.yaw+rand(-0.065,0.065),bot.pitch+rand(-0.055,0.055));
    }
    if(bot.bank.rifle.ammo===0 && !bot.reloadEnd)reload(bot);
  }
}
function tick(dt){
  const tm=now();
  for(const room of rooms.values()){
    if(room.humans.size===0){ if(tm-room.lastActive>15000)rooms.delete(room.key);continue; }
    for(const p of room.fighters.values()){
      if(p.hp===0){if(tm>=p.respawnAt)respawn(p,room);continue;}
      if(p.reloadEnd&&tm>=p.reloadEnd){const w=WEAPONS[p.weapon],b=p.bank[p.weapon],amount=Math.min(w.mag-b.ammo,b.reserve);b.ammo+=amount;b.reserve-=amount;p.reloadEnd=0;send(p.ws,{type:'reloaded'});}
      if(!p.bot){
        const f=limit(p.forward,-1,1),s=limit(p.strafe,-1,1),m=Math.max(1,Math.hypot(f,s)),speed=p.sprint?7.9:5.45;
        const fx=Math.sin(p.yaw),fz=-Math.cos(p.yaw),rx=Math.cos(p.yaw),rz=Math.sin(p.yaw);
        const dx=(fx*f+rx*s)/m*speed*dt,dz=(fz*f+rz*s)/m*speed*dt;
        move(p,dx,dz);p.speed=Math.hypot(dx,dz)/Math.max(dt,.001);
        if(p.jump && p.y<0.02){p.vy=6.9;p.jump=false;}
      }
      p.vy-=17*dt;p.y=Math.max(0,p.y+p.vy*dt);if(p.y===0)p.vy=0;
      for(const med of room.medkits){
        if(med.available && p.hp<94 && Math.hypot(med.x-p.x,med.z-p.z)<1.75){p.hp=Math.min(100,p.hp+44);med.available=false;med.respawnAt=tm+22000;send(p.ws,{type:'notice',text:'MEDKIT +44 HP'});}
      }
    }
    for(const med of room.medkits) if(!med.available && med.respawnAt<tm)med.available=true;
    updateBots(room,dt,tm);
  }
}
function snapshot(){
  const tm=now();
  for(const room of rooms.values()){
    if(!room.humans.size)continue;
    const fighters=[...room.fighters.values()].map(p=>({id:p.id,name:p.name,bot:p.bot,x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2),yaw:+p.yaw.toFixed(3),pitch:+p.pitch.toFixed(3),hp:p.hp,armor:p.armor,kills:p.kills,deaths:p.deaths,weapon:p.weapon,speed:p.speed,protected:p.shieldUntil>tm,ammo:p.bank[p.weapon].ammo,reserve:p.bank[p.weapon].reserve,reloading:p.reloadEnd?Math.max(0,p.reloadEnd-tm):0}));
    const data={type:'state',t:tm,players:fighters,medkits:room.medkits.filter(m=>m.available).map(m=>m.id),humans:room.humans.size};
    broadcast(room,data);
  }
}
function validateOrigin(req){
  if(origins.length===0)return true;
  const origin=req.headers.origin;
  return !origin||origins.includes(origin);
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:true,rooms:rooms.size,players:[...rooms.values()].reduce((s,r)=>s+r.humans.size,0)}));return;
  }
  let pathname=url.pathname==='/'?'/index.html':url.pathname;
  let file=path.resolve(ROOT,'.'+pathname);
  if(!(file===ROOT||file.startsWith(ROOT+path.sep))){res.writeHead(403);res.end('Forbidden');return;}
  try {
    const buf=await readFile(file);
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('.html')?'no-store':'public, max-age=600','X-Content-Type-Options':'nosniff'});res.end(buf);
  }catch{res.writeHead(404);res.end('Not found');}
});
const wss=new WebSocketServer({server,path:'/ws',verifyClient:({req},done)=>done(validateOrigin(req))});
wss.on('connection',ws=>{
  let player=null,room=null;ws.isAlive=true;
  ws.on('pong',()=>{ws.isAlive=true;});
  ws.on('message',raw=>{
    if(raw.length>1200)return;
    let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
    if(!msg||typeof msg!=='object'||typeof msg.type!=='string')return;
    if(msg.type==='join' && !player){
      const name=String(msg.name||'OPERATIVE').trim().slice(0,17).replace(/[<>]/g,'')||'OPERATIVE';
      const code=String(msg.room||'PUBLIC').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,18)||'PUBLIC';
      room=roomFor(code);
      if(room.humans.size>=16){send(ws,{type:'error',text:'Room full (16 players max).'});ws.close();return;}
      const id='p-'+Math.random().toString(36).slice(2,10);
      player=makeFighter(id,name,false,room);player.ws=ws;room.fighters.set(id,player);room.humans.set(id,ws);room.lastActive=now();
      createBots(room);
      send(ws,{type:'welcome',id,room:code,serverTime:now()});
      broadcast(room,{type:'notice',text:`${name} DROPPED INTO THE ARENA`});
      return;
    }
    if(!player||!room)return;
    if(msg.type==='input'){
      player.forward=limit(Number(msg.f)||0,-1,1);
      player.strafe=limit(Number(msg.s)||0,-1,1);
      player.sprint=Boolean(msg.run);
      if(Number.isFinite(msg.yaw))player.yaw=limit(msg.yaw,-10000,10000);
      if(Number.isFinite(msg.pitch))player.pitch=limit(msg.pitch,-0.8,0.8);
      if(msg.jump)player.jump=true;
      if(msg.fire)fire(room,player);
      player.lastInputAt=now();
    }else if(msg.type==='reload')reload(player);
    else if(msg.type==='weapon'){
      const weapon=String(msg.key);
      if(WEAPONS[weapon]&&weapon!==player.weapon){player.weapon=weapon;player.reloadEnd=0;player.lastShot=now()-WEAPONS[weapon].cooldown+200;}
    }
  });
  ws.on('close',()=>{
    if(player&&room){room.fighters.delete(player.id);room.humans.delete(player.id);room.lastActive=now();createBots(room);broadcast(room,{type:'notice',text:`${player.name} LEFT THE ARENA`});}
  });
});
const pingInterval=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);
const gameInterval=setInterval(()=>tick(1/30),1000/30);
const stateInterval=setInterval(snapshot,1000/15);
server.listen(PORT,HOST,()=>console.log(`DARK//DROP on http://localhost:${PORT} (WebSocket multiplayer enabled)`));
const shutdown=()=>{clearInterval(pingInterval);clearInterval(gameInterval);clearInterval(stateInterval);wss.close();server.close(()=>process.exit(0));};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
