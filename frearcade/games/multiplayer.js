/**
 * Multiplayer Mayhem — 2D Local Multiplayer Arena
 * Up to 4 players locally. Each player fights in a shared arena. Last one standing wins.
 */
(function(){'use strict';var E;var players=[],bullets=[],powerups=[],particles=[];var state='ready',round=1,winner=null,roundTimer=0;var gameWidth=0,gameHeight=0;var NUM_PLAYERS=2;
var PLAYER_COLORS=['#4488ff','#ff4444','#44ff44','#ffaa00'];var PLAYER_NAMES=['Blue','Red','Green','Orange'];
var KEYS_CFG=[[{left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',shoot:'KeyM'}],[{left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS',shoot:'KeyF'}],[{left:'KeyJ',right:'KeyL',up:'KeyI',down:'KeyK',shoot:'KeyU'}],[{left:'KeyN',right:'KeyM',up:'Comma',down:'Period',shoot:'KeyO'}]];
function init(eng){E=eng;gameWidth=E.width||800;gameHeight=E.height||600;resetGame();state='ready';E.emit('gameReady',{name:'Multiplayer Mayhem'});}
function resetGame(){round=1;winner=null;roundTimer=0;players=[];bullets=[];powerups=[];particles=[];NUM_PLAYERS=2;createPlayers();}
function createPlayers(){for(var i=0;i<NUM_PLAYERS;i++){var angle=i/NUM_PLAYERS*Math.PI*2+Math.PI/4;players.push({x:gameWidth/2+Math.cos(angle)*150,y:gameHeight/2+Math.sin(angle)*150,vx:0,vy:0,w:16,h:16,hp:5,maxHp:5,color:PLAYER_COLORS[i],name:PLAYER_NAMES[i],index:i,keys:KEYS_CFG[i],fireTimer:0,invincibleTimer:0,alive:true,angle:0});}}
function createBullet(x,y,dx,dy,owner){bullets.push({x:x,y:y,dx:dx,dy:dy,owner:owner,life:3});}
function createParticles(x,y,color,count){for(var i=0;i<(count||8);i++){particles.push({x:x,y:y,dx:(Math.random()-0.5)*7,dy:(Math.random()-0.5)*7,life:0.3+Math.random()*0.4,color:color,size:3+Math.random()*3});}}
function spawnPowerup(){var types=['health','speed'];var t=types[Math.floor(Math.random()*types.length)];powerups.push({x:50+Math.random()*(gameWidth-100),y:50+Math.random()*(gameHeight-100),type:t,life:10});}
function update(dt,input){if(state==='ready'){if(input.action||input.keysPressed['Enter']){state='playing';}render(dt);return;}
if(state==='gameover'){if(input.action||input.keysPressed['Enter']){resetGame();state='playing';}render(dt);return;}
gameWidth=E.width||800;gameHeight=E.height||600;
roundTimer+=dt;
// Count alive
var alive=0,lastAlive=null;for(var pi=0;pi<players.length;pi++){if(players[pi].alive){alive++;lastAlive=players[pi];}}
if(alive<=1&&players.length>0){winner=lastAlive;state='gameover';E.playBeep(500,0.3,'square',0.2);render(dt);return;}
if(roundTimer>60){round++;roundTimer=0;for(var ri=0;ri<players.length;ri++){players[ri].alive=true;players[ri].hp=players[ri].maxHp;}render(dt);}
// Each player
for(var pi=0;pi<players.length;pi++){var p=players[pi];if(!p.alive)continue;
var keys=p.keys[0];var dx=0,dy=0;
if(input.keys[keys.left])dx-=1;if(input.keys[keys.right])dx+=1;if(input.keys[keys.up])dy-=1;if(input.keys[keys.down])dy+=1;
if(dx!==0&&dy!==0){dx*=0.707;dy*=0.707;}
p.vx=dx*3;p.vy=dy*3;
p.x+=p.vx;p.y+=p.vy;
p.x=Math.max(10,Math.min(gameWidth-10,p.x));p.y=Math.max(10,Math.min(gameHeight-10,p.y));
p.angle=Math.atan2(dy,dx);
var shootKey=keys.shoot;if(input.keysPressed[shootKey]&&p.fireTimer<=0){p.fireTimer=0.2;var cos=Math.cos(p.angle),sin=Math.sin(p.angle);if(dx===0&&dy===0){cos=0;sin=-1;}createBullet(p.x,p.y,cos*6,sin*6,pi);E.playBeep(600+pi*50,0.05,'square',0.05);}
if(p.fireTimer>0)p.fireTimer-=dt;
p.invincibleTimer=Math.max(0,p.invincibleTimer-dt);}
// Bullets
for(var bi=bullets.length-1;bi>=0;bi--){var b=bullets[bi];b.x+=b.dx;b.y+=b.dy;b.life-=dt;
if(b.x<-20||b.x>gameWidth+20||b.y<-20||b.y>gameHeight+20||b.life<=0){bullets.splice(bi,1);continue;}
for(var pi2=0;pi2<players.length;pi2++){var p2=players[pi2];if(!p2.alive||pi2===b.owner)continue;if(Math.abs(b.x-p2.x)<p2.w+3&&Math.abs(b.y-p2.y)<p2.h+3&&p2.invincibleTimer<=0){p2.hp--;p2.invincibleTimer=0.5;createParticles(p2.x,p2.y,p2.color,8);bullets.splice(bi,1);if(p2.hp<=0){p2.alive=false;createParticles(p2.x,p2.y,p2.color,20);E.playBeep(100,0.3,'sawtooth',0.2);}else{E.playBeep(200,0.08,'sawtooth',0.1);}break;}}}
// Powerups
for(var pi3=0;pi3<powerups.length;pi3++){var pu=powerups[pi3];pu.life-=dt;if(pu.life<=0){powerups.splice(pi3,1);continue;}
for(var pi4=0;pi4<players.length;pi4++){var p4=players[pi4];if(!p4.alive)continue;if(Math.abs(pu.x-p4.x)<20&&Math.abs(pu.y-p4.y)<20){if(pu.type==='health'){p4.hp=Math.min(p4.maxHp,p4.hp+2);}else{p4.vx*=1.5;p4.vy*=1.5;}E.playBeep(800,0.12,'sine',0.12);powerups.splice(pi3,1);break;}}}
// Spawn powerups
if(Math.random()<0.005&&powerups.length<3){spawnPowerup();}
// Particles
for(var pii=particles.length-1;pii>=0;pii--){var pt=particles[pii];pt.x+=pt.dx;pt.y+=pt.dy;pt.life-=dt;pt.dx*=0.95;pt.dy*=0.95;if(pt.life<=0)particles.splice(pii,1);}
render(dt);}
function render(dt){if(!E||!E.ctx)return;var ctx=E.ctx;
ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,gameWidth,gameHeight);
// Arena border
ctx.strokeStyle='#4466aa';ctx.lineWidth=3;ctx.strokeRect(10,10,gameWidth-20,gameHeight-20);
ctx.strokeStyle='rgba(68,102,170,0.3)';ctx.lineWidth=1;ctx.strokeRect(20,20,gameWidth-40,gameHeight-40);
if(state==='ready'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#ff8844';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('MULTIPLAYER MAYHEM',gameWidth/2,gameHeight/2-40);
ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('P1: Arrow keys + M to shoot',gameWidth/2,gameHeight/2);
ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('P2: WASD + F to shoot',gameWidth/2,gameHeight/2+20);
ctx.fillStyle='#888';ctx.font='12px Arial';ctx.fillText('Last one standing wins the round!',gameWidth/2,gameHeight/2+50);
var p=0.5+Math.sin(Date.now()*0.003)*0.5;ctx.fillStyle='#ff8844';ctx.font='bold 18px Arial';ctx.fillText('PRESS ENTER TO START',gameWidth/2,gameHeight/2+90);return;}
if(state==='gameover'&&winner){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle=winner.color;ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText(winner.name+' WINS!',gameWidth/2,gameHeight/2-20);ctx.fillStyle='#fff';ctx.font='18px Arial';ctx.fillText('Round '+round,gameWidth/2,gameHeight/2+20);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('Press Enter for next round',gameWidth/2,gameHeight/2+50);return;}
// Players
for(var pi=0;pi<players.length;pi++){var p=players[pi];if(!p.alive)continue;
ctx.save();ctx.translate(p.x,p.y);
if(p.invincibleTimer>0&&Math.floor(p.invincibleTimer*10)%2===0)ctx.globalAlpha=0.4;
ctx.fillStyle=p.color;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
ctx.fillStyle='#fff';var ex=Math.cos(p.angle)*7,ey=Math.sin(p.angle)*7;ctx.fillRect(ex-2,ey-2,4,4);
ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(-3,5,6,4);
ctx.restore();
// Health bar
ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(p.x-15,p.y-p.h/2-8,30,4);ctx.fillStyle='#44ff44';ctx.fillRect(p.x-15,p.y-p.h/2-8,30*(p.hp/p.maxHp),4);
ctx.fillStyle=p.color;ctx.font='9px Arial';ctx.textAlign='center';ctx.fillText(p.name,p.x,p.y-p.h/2-14);}
// Bullets
for(var bi=0;bi<bullets.length;bi++){var b=bullets[bi];ctx.fillStyle='#ffff44';ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();}
// Powerups
for(var pi=0;pi<powerups.length;pi++){var pu=powerups[pi];ctx.fillStyle=pu.type==='health'?'#44ff44':'#ffaa44';ctx.beginPath();ctx.arc(pu.x,pu.y,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='8px Arial';ctx.textAlign='center';ctx.fillText(pu.type[0].toUpperCase(),pu.x,pu.y+3);}
// Particles
for(var pii=0;pii<particles.length;pii++){var pt=particles[pii];ctx.globalAlpha=pt.life;ctx.fillStyle=pt.color;ctx.fillRect(pt.x-pt.size/2,pt.y-pt.size/2,pt.size,pt.size);}ctx.globalAlpha=1;
// HUD
ctx.fillStyle='#fff';ctx.font='12px Arial';ctx.textAlign='left';ctx.fillText('Round: '+round,10,20);
var status='';for(var si=0;si<players.length;si++){status+=players[si].name+':'+players[si].hp+' '+(players[si].alive?'✓':'✗')+' ';}ctx.fillStyle='#888';ctx.font='10px Arial';ctx.textAlign='right';ctx.fillText(status,gameWidth-10,20);}
window.MultiplayerMayhem={init:init,update:update,render:render,name:'Multiplayer Mayhem',description:'2D Local Multiplayer Arena — Fight friends, last one standing wins',genre:'multiplayer'};
console.log('[MultiplayerMayhem] Loaded.');
})();