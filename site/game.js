import * as THREE from 'three';
import { ARENA, BOXES, MEDKITS, WEAPONS } from './world.js';

const $=id=>document.getElementById(id);
const menu=$('menu'),hud=$('hud'),canvas=$('game'),message=$('menuMessage');
const isTouch=matchMedia('(pointer:coarse)').matches;
let ws=null, localId='', room='PUBLIC', players=[], actors=new Map(), active=false;
let yaw=0,pitch=-0.06,dragLook=null, mouseFire=false, touchFire=false, aiming=false, sprintTouch=false;
let jumpQueued=false,joyX=0,joyY=0,prevTime=performance.now(),lastHud=0,lastNet=0,killFlash=0,noticeTimer=0,hitTimer=0;
let audio=null,muted=false,quality='high';
const keys=new Set(),tracers=[],sparkles=[],pickupObjects=[],decorAnimations=[];
let lightDust=null;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x121c2b);
scene.fog=new THREE.FogExp2(0x172436,0.0082);
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,0.1,260);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.48;
renderer.outputColorSpace=THREE.SRGBColorSpace;
camera.position.set(1,6,30);
const ambient=new THREE.HemisphereLight(0xb6d5ed,0x3b3425,2.1);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffe5ba,3.25);sun.position.set(-20,48,20);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.bias=-0.00045;scene.add(sun);
const blueLight=new THREE.DirectionalLight(0x4c8ad8,1.0);blueLight.position.set(35,15,-25);scene.add(blueLight);

const mat=(color,metalness=.3,roughness=.68,emissive=0,emissiveIntensity=0)=>new THREE.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity});
const concrete=mat(0x3d4b55,.18,.9),steel=mat(0x30414a,.7,.33),edge=mat(0x182936,.75,.35),lime=mat(0xcef45b,.38,.33,0x95d524,.5),orange=mat(0xffad56,.32,.35,0xe36c19,.45),sand=mat(0x5d675f,.1,.9),roof=mat(0x182730,.55,.41),dark=mat(0x0c1824,.65,.28),cyan=mat(0x6cdcf9,.3,.28,0x1189a6,1.3);
function box(parent,w,h,d,x,y,z,material,shadow=true){const obj=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);obj.position.set(x,y,z);obj.castShadow=shadow;obj.receiveShadow=true;parent.add(obj);return obj;}
function cylinder(parent,radTop,radBottom,height,x,y,z,material,segments=12){const obj=new THREE.Mesh(new THREE.CylinderGeometry(radTop,radBottom,height,segments),material);obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;}
function pipe(parent,x,y,z,len,material,axis='z',radius=.11){const obj=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,len,8),material);obj.rotation[axis==='z'?'x':axis==='x'?'z':'y']=Math.PI/2;obj.position.set(x,y,z);obj.castShadow=true;parent.add(obj);return obj;}
function textTexture(text,color='#d8ff78',background='transparent'){
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');
  if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,512,128);}
  ctx.font='900 66px Impact,Arial Narrow, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.shadowBlur=9;ctx.shadowColor=color;ctx.fillText(text,256,67,480);
  return new THREE.CanvasTexture(c);
}
function sign(parent,text,x,y,z,scale=4,color='#c9ff5c',rotation=0){
  const material=new THREE.MeshBasicMaterial({map:textTexture(text,color),transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(scale,scale*.25),material);mesh.position.set(x,y,z);mesh.rotation.y=rotation;parent.add(mesh);return mesh;
}
function stripe(x,z,w,d,color=0xc4f93e){box(scene,w,.025,d,x,.037,z,mat(color,.35,.4,color,.12),false);}
function makeGround(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#535e59';ctx.fillRect(0,0,256,256);
  let seed=15295;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let i=0;i<5200;i++){let v=Math.floor(random()*90+65);ctx.fillStyle=`rgba(${v},${v+9},${v+5},${random()*.17})`;ctx.fillRect(random()*256,random()*256,random()*3+1,random()*3+1);}
  ctx.strokeStyle='rgba(12,25,23,.25)';ctx.lineWidth=2;
  for(let i=0;i<=256;i+=64){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}
  const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(12,12);tex.colorSpace=THREE.SRGBColorSpace;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(190,190),new THREE.MeshStandardMaterial({map:tex,roughness:.92,metalness:.05}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  for(let i=-38;i<=38;i+=19){box(scene,.1,.018,75,i,.026,0,mat(0x7c8877,.1,.9),false);box(scene,75,.018,.1,0,.026,i,mat(0x7c8877,.1,.9),false);}
  stripe(-38,-38,5,.22);stripe(38,38,5,.22);stripe(-38,38,5,.22);stripe(38,-38,5,.22);
  // Runway markings and center platform.
  box(scene,12,.07,10,0,.045,0,mat(0x1c2b32,.7,.5),false);
  for(let i=-4;i<=4;i+=2){stripe(i,-33,.3,4,0xbdccbc);stripe(i,33,.3,4,0xbdccbc);}
  for(let a=0;a<4;a++){
    const x=a<2?-ARENA:ARENA,z=a%2===0?-ARENA:ARENA;
    cylinder(scene,.56,.68,7,x,3.5,z,steel);box(scene,1,1,1,x,7.3,z,lime);
    const pl=new THREE.PointLight(0xcaff68,16,19,2);pl.position.set(x,7.5,z);scene.add(pl);
  }
  // Large perimeter and orange neon on the walls.
  const wallMat=mat(0x263b48,.35,.65);
  [ [-42,0,.4,5,84],[42,0,.4,5,84],[0,-42,84,5,.4],[0,42,84,5,.4] ].forEach(([x,z,w,h,d])=>{
    box(scene,w,h,d,x,h/2,z,wallMat);
    if(w>d)box(scene,w,.10,.12,x,4.7,z,orange,false);else box(scene,.12,.10,d,x,4.7,z,orange,false);
  });
  // Outside city silhouettes, background depth.
  for(let i=0;i<70;i++){
    const angle=i*2.399,dist=57+(i%5)*6, x=Math.sin(angle)*dist,z=Math.cos(angle)*dist;
    const h=8+(i*37%19);const b=box(scene,4+(i%5),h,4+(i%4),x,h/2-1,z,mat(i%3===0?0x203a44:0x162631,.1,.92),false);
    if(i%4===0){const lightBar=box(scene,1,.06,.04,x,h/2-1,z+3,cyan,false);}
  }
}
function decorateStructures(){
  for(const [i,b] of BOXES.entries()){
    const g=new THREE.Group();g.position.set(b.x,0,b.z);scene.add(g);
    let base;
    if(b.kind==='command'){
      base=box(g,b.w,b.h,b.d,0,b.h/2,0,mat(0x3a4c58,.55,.4));
      box(g,b.w+.6,.35,b.d+.6,0,b.h+.1,0,roof);
      box(g,b.w*.72,1.15,.15,0,3.15,b.d/2+.1,dark);
      sign(g,'DARK // DROP',0,3.25,b.d/2+.21,5.7);
      for(const x of [-3.3,3.3]){box(g,.3,4,.3,x,2.4,b.d/2+.25,edge);box(g,.4,3,.26,x,2.1,-b.d/2-.2,steel);}
      cylinder(g,.22,.30,7,0,b.h+3.7,0,steel);cylinder(g,1.4,1.4,.18,0,b.h+7,0,lime,20);
      const beacon=new THREE.PointLight(0xcfff55,8,24,2);beacon.position.set(0,b.h+6,0);g.add(beacon);
    } else if(b.kind==='hangar'){
      base=box(g,b.w,b.h,b.d,0,b.h/2,0,concrete);
      box(g,b.w+.35,.35,b.d+.35,0,b.h+.1,0,roof);
      const frontMat=mat(0x192832,.82,.4);
      box(g,b.w*.56,b.h*.72,.16,0,b.h*.40,b.d/2+.12,frontMat);
      for(let k=0;k<6;k++)box(g,b.w*.55,.035,.10,0,.9+k*.59,b.d/2+.23,steel,false);
      for(const x of [-b.w/2+.45,b.w/2-.45])box(g,.23,b.h,.36,x,b.h/2,b.d/2+.2,orange);
      const title=i%2?'BLOCK 0'+i:'HANGAR 0'+i;
      sign(g,title,0,b.h-.55,b.d/2+.26,b.w*.54,'#ffe6aa');
      for(let x=-b.w/2+1;x<b.w/2-1;x+=2){box(g,1.0,.16,.11,x,b.h-.35,-b.d/2-.06,cyan,false);}
    }else if(b.kind==='container'){
      base=box(g,b.w,b.h,b.d,0,b.h/2,0,mat(i%2?0x3c626b:0x7d6651,.55,.52));
      for(let d=-b.d/2+.45;d<b.d/2;d+=.72){box(g,b.w+.03,b.h-.25,.045,0,b.h/2,d,edge);}
      for(let x=-b.w/2+.3;x<b.w/2;x+=.78){box(g,.035,b.h-.12,b.d+.06,x,b.h/2,0,steel,false);}
      sign(g,'CARGO - 45',0,b.h*.53,b.d/2+.055,b.w*.79,'#e5f0d5');
      box(g,b.w+.12,.18,b.d+.12,0,b.h+.06,0,roof);
    }else if(b.kind==='barricade'){
      base=box(g,b.w,b.h,b.d,0,b.h/2,0,mat(0x42525a,.32,.75));
      for(let k=-b.w/2+1;k<b.w/2;k+=3){box(g,2,.3,b.d+.1,k,b.h*.65,0,orange);}
      box(g,b.w+.4,.25,b.d+.4,0,b.h+.10,0,steel);
    }else{
      base=box(g,b.w,b.h,b.d,0,b.h/2,0,mat(0x82735d,.2,.9));
      for(let x of [-1,1])box(g,.13,b.h+.04,b.d+.02,x*b.w*.32,b.h/2,0,steel);
      for(let z of [-1,1])box(g,b.w+.04,.15,.13,0,b.h*.25,z*b.d*.38,steel);
      sign(g,'SUPPLY',0,b.h*.61,b.d/2+.08,b.w*.9,'#f2df9d');
    }
    if(base){base.receiveShadow=true;}
  }
}
function makeDecor(){
  const palette=[0x6c9d85,0x8a9c88,0x808b77];
  for(let i=0;i<35;i++){
    const a=i*2.399963,rad=27+(i%5)*2.7,x=Math.cos(a)*rad,z=Math.sin(a)*rad;
    if(BOXES.some(b=>Math.abs(x-b.x)<b.w/2+3&&Math.abs(z-b.z)<b.d/2+3))continue;
    const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
    cylinder(g,.14,.25,2.2,0,1.1,0,mat(0x535447,.1,.92));
    for(let n=0;n<3;n++){
      const c=new THREE.Mesh(new THREE.IcosahedronGeometry(1.4+(n%2)*.15,1),mat(palette[(i+n)%3],.08,.95));c.position.set((n-1)*.58,2.2+n*.29,((n+1)%2)*.38);c.castShadow=true;g.add(c);
    }
  }
  for(const [x,z] of [[-38,24],[38,-24],[-33,-2],[33,2]]){
    const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
    cylinder(g,.15,.19,8,0,4,0,steel);box(g,2.5,.4,.8,0,8,0,cyan);
    const l=new THREE.PointLight(0x65d3ff,6,16,2);l.position.y=7.8;g.add(l);
  }
  for(let i=0;i<180;i++){
    const x=(Math.random()-.5)*75,z=(Math.random()-.5)*75;
    if(BOXES.some(b=>Math.abs(x-b.x)<b.w/2+1&&Math.abs(z-b.z)<b.d/2+1))continue;
    box(scene,Math.random()*.26+.12,.045,Math.random()*.25+.08,x,.045,z,mat(i%6?0x6f8279:0xc2ba87,0,.96),false);
  }
  const pts=new Float32Array(900*3);
  for(let i=0;i<pts.length;i+=3){pts[i]=(Math.random()-.5)*160;pts[i+1]=Math.random()*24+1;pts[i+2]=(Math.random()-.5)*160;}
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(pts,3));
  lightDust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xe8d9b3,size:.08,transparent:true,opacity:.65,depthWrite:false}));scene.add(lightDust);
}
function createMedkits(){
  for(let i=0;i<MEDKITS.length;i++){
    const [x,z]=MEDKITS[i],g=new THREE.Group();g.position.set(x,.4,z);scene.add(g);
    cylinder(g,1.05,1.05,.05,0,-.31,0,cyan,24);
    box(g,.85,.55,.85,0,.38,0,mat(0xeaf0e0,.25,.3,0x49665c,.15));
    box(g,.15,.04,.6,0,.68,0,lime);box(g,.6,.04,.15,0,.68,0,lime);
    const torus=new THREE.Mesh(new THREE.TorusGeometry(.76,.025,6,40),new THREE.MeshBasicMaterial({color:0xcaff4b}));torus.rotation.x=Math.PI/2;torus.position.y=.9;g.add(torus);
    pickupObjects.push({id:i,g,torus});
  }
}
makeGround();decorateStructures();makeDecor();createMedkits();

function createAvatar(p){
  const root=new THREE.Group();root.position.set(p.x,p.y,p.z);scene.add(root);
  const colors=p.bot?[0xe87d50,0xd97e49,0xb76370,0xf4ba53]:[0x8bdaec,0xcfe79a,0x91bded,0xaddcaa];
  const index=Array.from(p.id).reduce((x,c)=>x+c.charCodeAt(0),0)%colors.length;
  const suit=mat(colors[index],.4,.48),bodyMat=mat(0x283743,.62,.5),metal=mat(0x0d1b22,.8,.35),visor=mat(p.bot?0xffbb64:0x86edff,.6,.2,p.bot?0xdd6220:0x1d8199,.64),accent=mat(p.bot?0xe9a149:0xccf96e,.48,.36);
  const body=new THREE.Group();root.add(body);
  box(body,.91,.82,.49,0,1.24,0,suit);
  box(body,.65,.60,.57,0,1.26,-.3,bodyMat);
  box(body,.60,.16,.12,0,1.46,-.64,accent);
  box(body,.84,.25,.46,0,.79,.03,bodyMat);
  for(const x of [-1,1]){
    box(body,.24,.66,.25,x*.25,.36,0,bodyMat);
    box(body,.28,.23,.30,x*.25,.1,-.08,metal);
    box(body,.28,.42,.29,x*.59,1.26,-.02,suit);
    box(body,.24,.32,.24,x*.62,.91,-.27,bodyMat);
    box(body,.36,.25,.51,x*.46,1.58,0,bodyMat);
  }
  // Visored helmet and luminous faceplate.
  const head=new THREE.Mesh(new THREE.SphereGeometry(.35,12,10),metal);head.scale.set(1.03,.89,.98);head.position.set(0,1.86,-.02);head.castShadow=true;body.add(head);
  box(body,.54,.19,.09,0,1.88,-.31,visor);
  box(body,.55,.11,.24,0,2.08,-.06,bodyMat);
  box(body,.53,.65,.24,0,1.19,.36,metal);
  for(const x of [-.18,.18])box(body,.10,.36,.08,x,1.27,.50,accent);
  // The rifle follows the torso and points to -Z.
  const gun=new THREE.Group();gun.position.set(.42,1.2,-.58);body.add(gun);
  box(gun,.17,.23,.78,0,0,-.12,metal);
  box(gun,.23,.14,.4,0,.05,-.18,steel);
  box(gun,.10,.06,.64,0,.02,-.64,metal);
  box(gun,.16,.23,.18,0,-.2,.02,steel);
  box(gun,.12,.10,.27,0,.2,-.04,accent);
  const muzzle=new THREE.Vector3(.42,1.22,-1.18);
  const spriteMaterial=new THREE.SpriteMaterial({map:textTexture(p.name.toUpperCase(),p.bot?'#ffad75':'#d1ff71'),transparent:true,depthTest:false});
  const label=new THREE.Sprite(spriteMaterial);label.position.set(0,2.55,0);label.scale.set(2.6,.65,1);root.add(label);
  const hpBacking=box(root,1.12,.07,.025,0,2.29,0,mat(0x171f28),false);
  const hpBar=box(root,1.08,.047,.03,0,2.29,.02,mat(p.bot?0xffb873:0xcaff62),false);
  return {root,body,gun,muzzle,label,hpBacking,hpBar,prevX:p.x,prevZ:p.z,prevY:p.y};
}
function syncAvatarObjects(dt){
  const ids=new Set(players.map(p=>p.id));
  for(const [id,act] of actors)if(!ids.has(id)){scene.remove(act.root);act.root.traverse(obj=>{if(obj.geometry)obj.geometry.dispose();if(obj.material?.map)obj.material.map.dispose();if(obj.material)obj.material.dispose();});actors.delete(id);}
  for(const p of players){
    let act=actors.get(p.id);if(!act){act=createAvatar(p);actors.set(p.id,act);}
    act.root.visible=p.hp>0;
    const t=Math.min(1,dt*(p.id===localId?22:13));
    act.root.position.x=THREE.MathUtils.lerp(act.root.position.x,p.x,t);
    act.root.position.z=THREE.MathUtils.lerp(act.root.position.z,p.z,t);
    act.root.position.y=THREE.MathUtils.lerp(act.root.position.y,p.y,t);
    const desired=p.id===localId?yaw:p.yaw;
    const delta=Math.atan2(Math.sin(desired-act.root.rotation.y),Math.cos(desired-act.root.rotation.y));
    act.root.rotation.y+=delta*t;
    act.body.position.y=Math.sin(performance.now()*.014)*.035*Math.min(1,p.speed/5);
    act.body.rotation.x=-(p.pitch||0)*.3;
    act.hpBar.scale.x=Math.max(.01,p.hp/100);act.hpBar.position.x=-(1-p.hp/100)*.54;
    if(p.id===localId){act.label.visible=false;act.hpBacking.visible=false;act.hpBar.visible=false;}
  }
}
function addTracer(ev){
  const from=new THREE.Vector3(ev.from.x,ev.from.y,ev.from.z),to=new THREE.Vector3(ev.to.x,ev.to.y,ev.to.z);
  if(from.distanceTo(to)===0)return;
  const color=ev.id===localId?0xe3ff73:0xffb767;
  const points=[from,to];const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:.97,depthWrite:false}));scene.add(line);
  const impact=new THREE.Mesh(new THREE.SphereGeometry(ev.hit?.14:.08,8,6),new THREE.MeshBasicMaterial({color:ev.hit?0xf3f78d:0xffba52,transparent:true,opacity:1}));impact.position.copy(to);scene.add(impact);
  tracers.push({line,impact,life:.20});
  const actor=actors.get(ev.id);
  if(actor){const flash=new THREE.Mesh(new THREE.SphereGeometry(.18,8,8),new THREE.MeshBasicMaterial({color:0xffe8ac,transparent:true,opacity:1}));flash.position.copy(actor.muzzle);actor.gun.add(flash);sparkles.push({mesh:flash,life:.07});}
  const me=players.find(p=>p.id===localId),shooter=players.find(p=>p.id===ev.id);
  const volume=ev.id===localId?.2:(me&&shooter?Math.max(.015,.11-Math.hypot(me.x-shooter.x,me.z-shooter.z)*.002):.05);
  sfx('shot',volume);
}
function sfx(kind,volume=.1){
  if(muted)return;
  try{
    audio??=new (window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume();
    const t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
    osc.type=kind==='shot'?'sawtooth':kind==='hit'?'triangle':'sine';
    const f=kind==='shot'?160:kind==='hit'?720:540;
    osc.frequency.setValueAtTime(f,t);osc.frequency.exponentialRampToValueAtTime(kind==='shot'?55:kind==='hit'?230:100,t+(kind==='shot'?.12:.18));
    gain.gain.setValueAtTime(Math.max(.0001,volume),t);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.17);
    osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.18);
  }catch{}
}
function showNotice(text,duration=2300){
  const node=$('centerNotice');node.textContent=text;node.style.opacity='1';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>node.style.opacity='0',duration);
}
function feed(killer,victim,head){
  const div=document.createElement('div');div.className='feed-row';
  const b=document.createElement('b');b.textContent=killer;div.append(b,document.createTextNode(head?' ✦ HEADSHOT  ':' ▸ '),document.createTextNode(victim));
  const f=$('killfeed');f.prepend(div);while(f.children.length>4)f.lastElementChild.remove();setTimeout(()=>div.remove(),5500);
}
function decode(msg){
  if(msg.type==='welcome'){
    localId=msg.id;room=msg.room;active=true;menu.classList.add('hidden');hud.classList.remove('hidden');
    $('roomLabel').textContent=room;sfx('start',.08);showNotice('DROP SUCCESSFUL • ELIMINATE HOSTILES');
    if(!isTouch)canvas.requestPointerLock?.();
  }else if(msg.type==='state'){
    players=msg.players;$('onlineLabel').textContent=msg.humans;
    for(const kit of pickupObjects)kit.g.visible=msg.medkits.includes(kit.id);
  }else if(msg.type==='shot')addTracer(msg);
  else if(msg.type==='hit'){
    const hm=$('hitMarker');hm.style.opacity='1';hm.style.color=msg.head?'#ff8f69':'#d3ff56';clearTimeout(hitTimer);hitTimer=setTimeout(()=>hm.style.opacity='0',120);
    sfx('hit',.1);
    if(msg.down){const el=$('elimination');el.style.opacity='1';setTimeout(()=>el.style.opacity='0',1300);}
  }else if(msg.type==='damaged'){
    const f=$('damageFlash');f.style.opacity=String(Math.min(.8,Number(msg.damage)/60+.12));setTimeout(()=>f.style.opacity='0',210);
  }else if(msg.type==='kill'){
    feed(msg.killer,msg.victim,msg.head);
    if(players.find(p=>p.id===localId)?.name===msg.killer)sfx('start',.15);
  }else if(msg.type==='reload'){
    showNotice('RELOADING',650);sfx('reload',.06);
  }else if(msg.type==='notice')showNotice(msg.text,2000);
  else if(msg.type==='error'){message.className='menu-message error';message.textContent=msg.text||'Server error.';}
}
function serverWsAddress(value){
  let v=(value||location.origin).trim();if(!v) v=location.origin;
  const u=new URL(v);
  if(u.protocol==='http:')u.protocol='ws:';else if(u.protocol==='https:')u.protocol='wss:';
  if(u.protocol!=='ws:'&&u.protocol!=='wss:')throw new Error('Use an HTTP or HTTPS server address.');
  u.pathname='/ws';u.search='';u.hash='';return u.toString();
}
function begin(practice){
  if(ws&&ws.readyState<=1)return;
  const name=$('nickname').value.trim()||'OPERATOR';
  let code=$('roomCode').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g,'')||'PUBLIC';
  if(practice)code='PRACTICE-'+Math.random().toString(36).slice(2,9).toUpperCase();
  localStorage.setItem('dd-name',name);localStorage.setItem('dd-url',$('serverUrl').value.trim());localStorage.setItem('dd-quality',$('quality').value);
  localStorage.setItem('dd-room',$('roomCode').value.trim());
  setQuality($('quality').value);
  let url;try{url=serverWsAddress($('serverUrl').value);}catch(e){message.className='menu-message error';message.textContent=e.message;return;}
  message.className='menu-message';message.textContent='CONNECTING TO COMBAT SERVER…';
  $('join').disabled=$('practice').disabled=true;
  let opened=false;
  try{ws=new WebSocket(url);}catch{message.className='menu-message error';message.textContent='INVALID SERVER ADDRESS';$('join').disabled=$('practice').disabled=false;return;}
  ws.onopen=()=>{opened=true;ws.send(JSON.stringify({type:'join',name,room:code}));};
  ws.onmessage=e=>{try{decode(JSON.parse(e.data));}catch(err){console.warn('Bad game packet:',err);}};
  ws.onerror=()=>{if(!opened)message.textContent='CONNECTION FAILED • CHECK THE MULTIPLAYER SERVER URL';};
  ws.onclose=()=>{
    ws=null;const wasActive=active;active=false;localId='';players=[];
    for(const a of actors.values())scene.remove(a.root);actors.clear();
    document.exitPointerLock?.();hud.classList.add('hidden');menu.classList.remove('hidden');
    $('join').disabled=$('practice').disabled=false;
    message.className='menu-message error';message.textContent=wasActive?'DISCONNECTED FROM MATCH • RECONNECT TO DEPLOY':'SERVER UNREACHABLE • DEPLOY THE NODE.JS SERVER OR ENTER ITS URL';
  };
}
function send(obj){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function currentPlayer(){return players.find(p=>p.id===localId);}
function changeWeapon(key){if(WEAPONS[key]){send({type:'weapon',key});document.querySelectorAll('.wp').forEach(b=>b.classList.toggle('selected',b.dataset.weapon===key));sfx('reload',.05);}}
function reload(){send({type:'reload'});}
function exitMatch(){ws?.close();}
function updateHud(now){
  if(now-lastHud<105)return;lastHud=now;
  const me=currentPlayer();if(!me)return;
  $('killCount').textContent=String(me.kills).padStart(2,'0');$('deathCount').textContent=String(me.deaths).padStart(2,'0');
  $('healthText').textContent=me.hp+' HP';$('healthBar').style.width=me.hp+'%';$('armorText').textContent=me.armor;$('armorBar').style.width=me.armor*2+'%';
  $('ammo').textContent=String(me.ammo).padStart(2,'0');$('reserve').textContent=me.reserve;
  $('weaponName').textContent=WEAPONS[me.weapon]?.name||me.weapon;
  $('reloadStatus').textContent=me.reloading?'RELOADING…':me.ammo===0?'EMPTY • PRESS R':'R TO RELOAD • 1/2/3 TO SWITCH';
  $('respawn').style.opacity=me.hp===0?'1':'0';
  document.querySelectorAll('.wp').forEach(b=>b.classList.toggle('selected',b.dataset.weapon===me.weapon));
  const sb=$('scoreboard');if(!sb.classList.contains('hidden'))renderScore();
}
function renderScore(){
  const sorted=[...players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths);const container=$('scoreRows');container.replaceChildren();
  for(const p of sorted){
    const row=document.createElement('div');row.className='score-row';
    const n=document.createElement('span');n.textContent=p.name+(p.id===localId?' (YOU)':'');
    const k=document.createElement('span');k.textContent=p.kills;
    const d=document.createElement('span');d.textContent=p.deaths;
    const status=document.createElement('span');status.textContent=p.bot?'BOT':'HUMAN';status.className=p.bot?'bot':'human';
    row.append(n,k,d,status);container.append(row);
  }
}
function setQuality(value){
  quality=value;const high=quality==='high';
  renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.65:1));
  sun.castShadow=high;renderer.shadowMap.enabled=high;
  renderer.toneMappingExposure=high?1.48:1.7;
  if(lightDust)lightDust.visible=high;
}

// Mouse and keyboard controls.
addEventListener('keydown',e=>{
  if(!active)return;
  if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);
  if(e.code==='Space'&&!e.repeat)jumpQueued=true;
  if(e.code==='KeyR'&&!e.repeat)reload();
  if(e.code==='Digit1')changeWeapon('rifle');if(e.code==='Digit2')changeWeapon('smg');if(e.code==='Digit3')changeWeapon('dmr');
  if(e.code==='Tab'&&!e.repeat){$('scoreboard').classList.toggle('hidden');renderScore();}
  if(e.code==='Escape')$('scoreboard').classList.add('hidden');
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();mouseFire=false;touchFire=false;});
addEventListener('mousemove',e=>{
  if(active&&document.pointerLockElement===canvas){yaw-=e.movementX*.0027;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.00225,-.7,.65);}
});
canvas.addEventListener('pointerdown',e=>{
  if(!active||isTouch)return;
  if(e.button===0){mouseFire=true;if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.();}
  if(e.button===2)aiming=true;
});
addEventListener('pointerup',e=>{if(e.button===0)mouseFire=false;if(e.button===2)aiming=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('join').onclick=()=>begin(false);$('practice').onclick=()=>begin(true);
$('settingsToggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;};
$('quality').onchange=e=>setQuality(e.target.value);
$('exitBtn').onclick=exitMatch;
$('soundBtn').onclick=()=>{muted=!muted;$('soundBtn').textContent=muted?'♪̸':'♫';};
$('scoreBtn').onclick=()=>{$('scoreboard').classList.toggle('hidden');renderScore();};
$('closeScore').onclick=()=>$('scoreboard').classList.add('hidden');
document.querySelectorAll('.wp').forEach(btn=>btn.onclick=()=>changeWeapon(btn.dataset.weapon));
const params=new URLSearchParams(location.search);
$('nickname').value=localStorage.getItem('dd-name')||'OPERATOR';
$('roomCode').value=params.get('room')||localStorage.getItem('dd-room')||'PUBLIC';
$('serverUrl').value=params.get('server')||localStorage.getItem('dd-url')||'';
$('quality').value=localStorage.getItem('dd-quality')||(isTouch?'low':'high');setQuality($('quality').value);

// Mobile dual-touch stick and aiming area.
const joy=$('joystick'),knob=$('stick');let joyPointer=null;
function stickAt(e){const r=joy.getBoundingClientRect(),radius=r.width*.40,centerX=r.left+r.width/2,centerY=r.top+r.height/2;const dx=e.clientX-centerX,dy=e.clientY-centerY,dist=Math.max(1,Math.hypot(dx,dy)),k=Math.min(radius,dist)/dist;joyX=dx*k/radius;joyY=-dy*k/radius;knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;}
joy.addEventListener('pointerdown',e=>{joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);stickAt(e);e.preventDefault();});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)stickAt(e);});
function resetJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;joyX=joyY=0;knob.style.transform='translate(0,0)';}
joy.addEventListener('pointerup',resetJoy);joy.addEventListener('pointercancel',resetJoy);
const look=$('lookArea');
look.addEventListener('pointerdown',e=>{dragLook={id:e.pointerId,x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId);e.preventDefault();});
look.addEventListener('pointermove',e=>{
  if(!dragLook||dragLook.id!==e.pointerId)return;
  const dx=e.clientX-dragLook.x,dy=e.clientY-dragLook.y;dragLook.x=e.clientX;dragLook.y=e.clientY;
  yaw-=dx*.007;pitch=THREE.MathUtils.clamp(pitch-dy*.006,-.72,.65);
});
look.addEventListener('pointerup',e=>{if(dragLook?.id===e.pointerId)dragLook=null;});
look.addEventListener('pointercancel',e=>{if(dragLook?.id===e.pointerId)dragLook=null;});
const fireBtn=$('touchFire');
fireBtn.addEventListener('pointerdown',e=>{touchFire=true;fireBtn.classList.add('active');fireBtn.setPointerCapture(e.pointerId);e.preventDefault();});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])fireBtn.addEventListener(ev,()=>{touchFire=false;fireBtn.classList.remove('active');});
$('touchJump').addEventListener('pointerdown',e=>{jumpQueued=true;e.preventDefault();});
$('touchReload').addEventListener('pointerdown',e=>{reload();e.preventDefault();});
$('touchAim').addEventListener('pointerdown',e=>{aiming=!aiming;$('touchAim').classList.toggle('active',aiming);e.preventDefault();});
$('touchSprint').addEventListener('pointerdown',e=>{sprintTouch=!sprintTouch;$('touchSprint').classList.toggle('active',sprintTouch);e.preventDefault();});

function sendMovement(t){
  if(!active||t-lastNet<45)return;lastNet=t;
  const f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)+joyY;
  const s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+joyX;
  send({type:'input',f:Math.max(-1,Math.min(1,f)),s:Math.max(-1,Math.min(1,s)),yaw,pitch,run:keys.has('ShiftLeft')||keys.has('ShiftRight')||sprintTouch,jump:jumpQueued,fire:mouseFire||touchFire});
  jumpQueued=false;
}
function updateCamera(dt){
  const me=currentPlayer();if(!me)return;
  const t=THREE.MathUtils.clamp(dt*13,0,1);
  const eye=new THREE.Vector3(me.x,me.y+1.45,me.z);
  const dir=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  const right=new THREE.Vector3(Math.cos(yaw),0,Math.sin(yaw));
  const distance=aiming?2.65:5.1,side=aiming?.67:1.15,up=aiming?.32:.7;
  const targetPos=eye.clone().addScaledVector(dir,-distance).addScaledVector(right,side).add(new THREE.Vector3(0,up,0));
  // Stop shoulder camera from crossing buildings.
  const back=targetPos.clone().sub(eye),ray=new THREE.Raycaster(eye,back.clone().normalize(),0.2,back.length());
  const hits=ray.intersectObjects(cameraMeshes,false);
  if(hits.length)targetPos.copy(eye).addScaledVector(back.normalize(),Math.max(.6,hits[0].distance-.2));
  camera.position.lerp(targetPos,t);
  const aimPoint=eye.clone().addScaledVector(dir,50);
  camera.lookAt(aimPoint);
  camera.fov=THREE.MathUtils.lerp(camera.fov,aiming?53:68,t);camera.updateProjectionMatrix();
  $('crosshair').classList.toggle('aiming',aiming);
}
function animate(t){
  requestAnimationFrame(animate);
  const dt=Math.min(.05,(t-prevTime)/1000||.016);prevTime=t;
  if(active){sendMovement(t);syncAvatarObjects(dt);updateCamera(dt);updateHud(t);}else{
    const orbit=t*.00008;
    const target=new THREE.Vector3(0,4,0);
    camera.position.set(Math.sin(orbit)*29,10+Math.sin(t*.0003)*2,Math.cos(orbit)*29);camera.lookAt(target);
  }
  if(lightDust)lightDust.rotation.y+=dt*.0007;
  for(const kit of pickupObjects){kit.g.rotation.y+=dt*.8;kit.g.position.y=.42+Math.sin(t*.002+kit.id*2)*.14;kit.torus.rotation.z+=dt*.45;}
  for(let i=tracers.length-1;i>=0;i--){const tr=tracers[i];tr.life-=dt;tr.line.material.opacity=Math.max(0,tr.life/.20);tr.impact.material.opacity=Math.max(0,tr.life/.20);tr.impact.scale.setScalar(Math.max(.15,tr.life/.18));if(tr.life<=0){scene.remove(tr.line,tr.impact);tr.line.geometry.dispose();tr.line.material.dispose();tr.impact.geometry.dispose();tr.impact.material.dispose();tracers.splice(i,1);}}
  for(let i=sparkles.length-1;i>=0;i--){const s=sparkles[i];s.life-=dt;s.mesh.material.opacity=Math.max(0,s.life/.07);s.mesh.scale.setScalar(1+Math.max(0,.07-s.life)*3);if(s.life<=0){s.mesh.parent?.remove(s.mesh);s.mesh.geometry.dispose();s.mesh.material.dispose();sparkles.splice(i,1);}}
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
// Camera occlusion is enforced using actual building meshes, not cosmetic effects.
const cameraMeshes=[];
for(const o of scene.children){if(o.isGroup && BOXES.some(b=>Math.abs(o.position.x-b.x)<.01&&Math.abs(o.position.z-b.z)<.01)){
  o.traverse(m=>{if(m.isMesh&&m.geometry?.type==='BoxGeometry'){m.userData.cameraBlock=true;cameraMeshes.push(m);}});
}}
