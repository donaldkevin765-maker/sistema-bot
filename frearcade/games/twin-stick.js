/**
 * Twin Stick Fury — 2D Twin-stick shooter
 * Left stick moves, right stick shoots. Survive endless robot waves.
 */
(function(){'use strict';var E;var player,bullets,enemies,particles,powerups;var state='ready',score=0,wave=0,waveTimer=0,enemiesSpawned=0,killsToNext=5;var fireTimer=0,invincibleTimer=0;var gameWidth=0,gameHeight=0;
function init(eng){E=eng;gameWidth=E.width||800;gameHeight=E.height||600;resetGame();state='ready';E.emit('gameReady',{name:'Twin Stick Fury'});}
function resetGame(){score=0;wave=0;waveTimer=1;enemiesSpawned=0;killsToNext=5;fireTimer=0;invincibleTimer=0;bullets=[];enemies=[];particles=[];powerups=[];player={x:gameWidth/2,y:gameHeight/2,w:14,h:14,speed:3,hp:5,maxHp:5,aimAngle:0,rapidTimer:0,shieldTimer:0};}
function spawnEnemy(){var types=['drone','tank','runner','bomber'];var type=types[Math.floor(Math.random()*types.length)];var hp=2,spd=1.5,size=10,color='#ff4444',dmg=1;switch(type){case'drone':hp=1+wave*0.3;spd=2.5+wave*0.03;size=8;color='#ff8800';break;case'tank':hp=5+wave*1;spd=0.6+wave*0.02;size=14;color='#8844ff';dmg=2;break;case'runner':hp=2+wave*0.2;spd=3+wave*0.05;size=9;color='#ffaa00';break;case'bomber':hp=3+wave*0.5;spd=1.2;size=12;color='#ff4444';dmg=3;break;}
var angle=Math.random()*Math.PI*2;var dist=400+Math.random()*100;enemies.push({x:player.x+Math.cos(angle)*dist,y:player.y+Math.sin(angle)*dist,hp:hp,maxHp:hp,speed:spd,size:size,color:color,type:type,dmg:dmg,shootTimer:1+Math.random()*2,hitFlash:0,knockbackX:0,knockbackY:0});}
function createBullet(x,y,dx,dy,isEnemy){bullets.push({x:x,y:y,dx:dx,dy:dy,life:2,isEnemy:isEnemy||false,size:isEnemy?3:4});}
function createParticles(x,y,color,count){for(var i=0;i<(count||8);i++){particles.push({x:x,y:y,dx:(Math.random()-0.5)*6,dy:(Math.random()-0.5)*6,life:0.4+Math.random()*0.4,color:color||'#ffaa00',size:2+Math.random()*4});}}
function spawnPowerup(x,y){var types=['health','rapid','shield'];var t=types[Math.floor(Math.random()*types.length)];powerups.push({x:x,y:y,type:t,life:8,size:8,bob:0});}
function update(dt,input){if(state==='ready'){if(input.action){state='playing';}render(dt);return;}
if(state==='gameover'){if(input.action){resetGame();state='playing';}render(dt);return;}
gameWidth=E.width||800;gameHeight=E.height||600;
if(!player)return;
// Wave management
if(enemies.length===0&&enemiesSpawned>=killsToNext){wave++;killsToNext=5+wave*2;enemiesSpawned=0;waveTimer=1.5;E.playBeep(500,0.2,'square',0.1);}
if(enemiesSpawned<killsToNext&&waveTimer<=0){spawnEnemy();enemiesSpawned++;}else{waveTimer-=dt;}
// Player movement (left stick)
var dx=0,dy=0;if(input.left)dx-=1;if(input.right)dx+=1;if(input.up)dy-=1;if(input.down)dy+=1;if(dx!==0&&dy!==0){dx*=0.707;dy*=0.707;}
player.x+=dx*player.speed;player.y+=dy*player.speed;
player.x=Math.max(15,Math.min(gameWidth-15,player.x));player.y=Math.max(15,Math.min(gameHeight-15,player.y));
// Aim (right stick - mouse)
var aimDx=input.mouseX-player.x,aimDy=input.mouseY-player.y;var aimDist=Math.sqrt(aimDx*aimDx+aimDy*aimDy);if(aimDist>5){player.aimAngle=Math.atan2(aimDy,aimDx);}
invincibleTimer=Math.max(0,invincibleTimer-dt);
// Shoot
fireTimer-=dt;if(input.shoot&&fireTimer<=0){var cos=Math.cos(player.aimAngle),sin=Math.sin(player.aimAngle);createBullet(player.x,player.y,cos*8,sin*8,false);if(player.rapidTimer>0){createBullet(player.x-cos*6-sin*4,player.y-sin*6+cos*4,cos*8,sin*8,false);createBullet(player.x-cos*6+sin*4,player.y-sin*6-cos*4,cos*8,sin*8,false);}E.playBeep(700,0.04,'square',0.04);fireTimer=player.rapidTimer>0?0.08:0.15;}
if(player.rapidTimer>0)player.rapidTimer-=dt;
if(player.shieldTimer>0)player.shieldTimer-=dt;
// Enemies
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];var edx=player.x-e.x,edy=player.y-e.y;var edist=Math.sqrt(edx*edx+edy*edy);
if(edist>e.speed&&e.type!='bomber'){e.x+=edx/edist*e.speed;e.y+=edy/edist*e.speed;}
if(e.type==='bomber'&&edist<200){e.x+=edx/edist*e.speed*2;e.y+=edy/edist*e.speed*2;}
e.hitFlash=Math.max(0,e.hitFlash-dt);
// Enemy shoot
e.shootTimer-=dt;if(e.shootTimer<=0&&edist<300){var sdx=player.x-e.x,sdy=player.y-e.y;var sdist=Math.sqrt(sdx*sdx+sdy*sdy);if(sdist>0){createBullet(e.x,e.y,sdx/sdist*3,sdy/sdist*3,true);}e.shootTimer=1+Math.random()*2;}}
// Bullets
for(var bi=bullets.length-1;bi>=0;bi--){var b=bullets[bi];b.x+=b.dx;b.y+=b.dy;b.life-=dt;
if(b.x<-20||b.x>gameWidth+20||b.y<-20||b.y>gameHeight+20||b.life<=0){bullets.splice(bi,1);continue;}
if(!b.isEnemy){for(var ei2=enemies.length-1;ei2>=0;ei2--){var e2=enemies[ei2];if(Math.abs(b.x-e2.x)<e2.size+4&&Math.abs(b.y-e2.y)<e2.size+4){e2.hp--;e2.hitFlash=0.15;bullets.splice(bi,1);if(e2.hp<=0){score+=20+wave*2;createParticles(e2.x,e2.y,e2.color,10);if(Math.random()<0.2)spawnPowerup(e2.x,e2.y);E.playBeep(300,0.08,'square',0.08);enemies.splice(ei2,1);}break;}}}else{if(Math.abs(b.x-player.x)<player.w+4&&Math.abs(b.y-player.y)<player.h+4&&invincibleTimer<=0){player.hp-=1;invincibleTimer=0.5;bullets.splice(bi,1);createParticles(player.x,player.y,'#ff4444',6);if(player.hp<=0){state='gameover';E.playBeep(100,0.4,'sawtooth',0.2);}else{E.playBeep(200,0.1,'sawtooth',0.1);}}}}
// Powerups
for(var pi=powerups.length-1;pi>=0;pi--){var pu=powerups[pi];pu.bob+=dt*3;pu.y+=Math.sin(pu.bob)*0.5;pu.life-=dt;if(pu.life<=0){powerups.splice(pi,1);continue;}
if(Math.abs(pu.x-player.x)<20&&Math.abs(pu.y-player.y)<20){if(pu.type==='health'){player.hp=Math.min(player.maxHp,player.hp+2);}else if(pu.type==='rapid'){player.rapidTimer=5;}else if(pu.type==='shield'){player.shieldTimer=5;}E.playBeep(800,0.15,'sine',0.15);powerups.splice(pi,1);}}
// Particles
for(var pii=particles.length-1;pii>=0;pii--){var pt=particles[pii];pt.x+=pt.dx;pt.y+=pt.dy;pt.life-=dt;pt.dx*=0.96;pt.dy*=0.96;if(pt.life<=0)particles.splice(pii,1);}
render(dt);}
function render(dt){if(!E||!E.ctx)return;var ctx=E.ctx;
ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,gameWidth,gameHeight);
if(state==='ready'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#44aaff';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('TWIN STICK FURY',gameWidth/2,gameHeight/2-30);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('WASD Move · Mouse aim · Click shoot · Survive robot waves',gameWidth/2,gameHeight/2+10);var p=0.5+Math.sin(Date.now()*0.003)*0.5;ctx.fillStyle='#44aaff';ctx.font='bold 18px Arial';ctx.fillText('PRESS ENTER TO START',gameWidth/2,gameHeight/2+60);return;}
if(state==='gameover'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#ff4444';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('SYSTEM OFFLINE',gameWidth/2,gameHeight/2-20);ctx.fillStyle='#fff';ctx.font='18px Arial';ctx.fillText('Score: '+score+' | Wave: '+wave,gameWidth/2,gameHeight/2+20);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('Press Enter to restart',gameWidth/2,gameHeight/2+50);return;}
if(!player)return;
// Grid
ctx.strokeStyle='rgba(255,255,255,0.03)';ctx.lineWidth=1;for(var gx=0;gx<gameWidth;gx+=40){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,gameHeight);ctx.stroke();}for(var gy=0;gy<gameHeight;gy+=40){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(gameWidth,gy);ctx.stroke();}
// Player
ctx.save();ctx.translate(player.x,player.y);
ctx.fillStyle=player.shieldTimer>0?'#44aaff':'#4488ff';ctx.beginPath();ctx.arc(0,0,player.w,0,Math.PI*2);ctx.fill();
ctx.fillStyle='#88ccff';ctx.fillRect(-2,-7,4,4);
// Aim line
ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(Math.cos(player.aimAngle)*10,Math.sin(player.aimAngle)*10);ctx.lineTo(Math.cos(player.aimAngle)*25,Math.sin(player.aimAngle)*25);ctx.stroke();
ctx.restore();
// Enemies
for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];ctx.fillStyle=e.hitFlash>0?'#fff':e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.size,0,Math.PI*2);ctx.fill();
ctx.fillStyle='rgba(255,0,0,0.5)';ctx.fillRect(e.x-e.size,e.y-e.size-5,e.size*2*(e.hp/e.maxHp),3);}
// Bullets
for(var bi=0;bi<bullets.length;bi++){var b=bullets[bi];ctx.fillStyle=b.isEnemy?'#ff4444':'#ffff44';ctx.beginPath();ctx.arc(b.x,b.y,b.size,0,Math.PI*2);ctx.fill();}
// Powerups
for(var pi=0;pi<powerups.length;pi++){var pu=powerups[pi];ctx.fillStyle=pu.type==='health'?'#44ff44':pu.type==='rapid'?'#ffaa44':'#44aaff';ctx.beginPath();ctx.arc(pu.x,pu.y,pu.size,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='8px Arial';ctx.textAlign='center';ctx.fillText(pu.type[0].toUpperCase(),pu.x,pu.y+3);}
// Particles
for(var pii=0;pii<particles.length;pii++){var pt=particles[pii];ctx.globalAlpha=Math.min(1,pt.life*2);ctx.fillStyle=pt.color;ctx.fillRect(pt.x-pt.size/2,pt.y-pt.size/2,pt.size,pt.size);}ctx.globalAlpha=1;
// HUD
ctx.fillStyle='#fff';ctx.font='14px Arial';ctx.textAlign='left';ctx.fillText('HP: ',10,20);ctx.fillStyle='#44ff44';ctx.fillRect(40,8,player.hp/player.maxHp*60,10);
ctx.fillStyle='#fff';ctx.fillText('Wave: '+wave,10,40);ctx.fillText('Score: '+score,10,55);
if(player.rapidTimer>0){ctx.fillStyle='#ffaa44';ctx.font='10px Arial';ctx.fillText('RAPID FIRE',10,70);}
if(player.shieldTimer>0){ctx.fillStyle='#44aaff';ctx.font='10px Arial';ctx.fillText('SHIELD',10,85);}
ctx.fillStyle='#888';ctx.font='10px Arial';ctx.textAlign='right';ctx.fillText('Enemies: '+enemies.length,gameWidth-10,20);}
window.TwinStickFury={init:init,update:update,render:render,name:'Twin Stick Fury',description:'2D Twin-stick shooter — Left move, right aim, survive waves',genre:'twin-stick'};
console.log('[TwinStickFury] Loaded.');
})();