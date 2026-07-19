/**
 * Arena Shooter — 2D top-down wave-based arena combat
 * Survival arena shooter with progressively harder waves, power-ups, and high scores.
 * Upgrade your weapons between waves. Multiple enemy types.
 */
(function(){'use strict';var E;var player,bullets,enemies,particles,powerups,stars;var state='loading',score=0,wave=0,waveEnemies=0,enemiesSpawned=0,enemiesKilled=0;var fireTimer=0,waveTimer=0,invincibleTimer=0,comboCount=0,comboTimer=0;var gameWidth=0,gameHeight=0;var MAX_ENEMIES=15,WAVE_BASE=8;
function init(eng){E=eng;gameWidth=E.width||800;gameHeight=E.height||600;resetGame();state='ready';E.emit('gameReady',{name:'Arena Shooter'});}
function resetGame(){score=0;wave=0;waveEnemies=0;enemiesSpawned=0;enemiesKilled=0;fireTimer=0;waveTimer=1;invincibleTimer=0;comboCount=0;comboTimer=0;bullets=[];enemies=[];particles=[];powerups=[];stars=[];createPlayer();createStars();}
function createPlayer(){player={x:gameWidth/2,y:gameHeight-80,w:16,h:16,speed:4,hp:5,maxHp:5,weapon:'pistol',damage:1,fireRate:0.2,shieldTimer:0,powerLevel:1};}
function createStars(){stars=[];for(var i=0;i<40;i++){stars.push({x:Math.random()*gameWidth,y:Math.random()*gameHeight,speed:0.5+Math.random()*1.5,bright:0.3+Math.random()*0.7});}}
function spawnEnemy(){var types=['basic','fast','tank','sniper'];var type='basic';var hp,spd,dmg,size,color;var wl=Math.min(wave,50);if(wl>3&&Math.random()<0.25)type='fast';if(wl>5&&Math.random()<0.2)type='tank';if(wl>8&&Math.random()<0.15)type='sniper';
switch(type){case'basic':hp=2+wl*0.5;spd=1+wl*0.05;dmg=1;size=10;color='#ff4444';break;case'fast':hp=1+wl*0.3;spd=2.5+wl*0.08;dmg=1;size=8;color='#ff8800';break;case'tank':hp=5+wl*1;spd=0.6+wl*0.03;dmg=2;size=14;color='#8844ff';break;case'sniper':hp=1+wl*0.3;spd=0.8;dmg=2;size=7;color='#ff44ff';break;}
var x=Math.random()*gameWidth;var y=-20;if(Math.random()>0.5){x=Math.random()>0.5?-20:gameWidth+20;y=Math.random()*gameHeight*0.5;}
enemies.push({x:x,y:y,hp:hp,maxHp:hp,speed:spd,dmg:dmg,size:size,color:color,type:type,shootTimer:1+Math.random()*2,hitFlash:0});}
function createBullet(x,y,dx,dy,damage,isEnemy){bullets.push({x:x,y:y,dx:dx,dy:dy,damage:damage||1,isEnemy:isEnemy||false,life:2,size:isEnemy?3:4});}
function createParticles(x,y,color,count){for(var i=0;i<(count||6);i++){particles.push({x:x,y:y,dx:(Math.random()-0.5)*4,dy:(Math.random()-0.5)*4,life:0.5+Math.random()*0.5,color:color||'#ffaa00',size:2+Math.random()*3});}}
function createPowerup(x,y){var types=['health','rapid','shield'];var t=types[Math.floor(Math.random()*types.length)];powerups.push({x:x,y:y,type:t,life:8,size:8,bob:0});}
function update(dt,input){if(state==='ready'){if(input.action){state='playing';score=0;resetGame();state='playing';}return;}
if(state==='gameover'){if(input.action){resetGame();state='playing';}return;}
gameWidth=E.width||800;gameHeight=E.height||600;
if(!player)return;
// Wave management
waveTimer-=dt;if(waveTimer<=0){wave++;waveEnemies=WAVE_BASE+wave*3;enemiesSpawned=0;enemiesKilled=0;fireTimer=0;if(wave>1)E.playBeep(600,0.15,'square',0.1);waveTimer=3;}
var enemiesToSpawn=Math.min(MAX_ENEMIES,waveEnemies);if(enemies.length<enemiesToSpawn&&enemiesSpawned<waveEnemies){enemySpawnTimer-=dt;if(enemySpawnTimer<=0){spawnEnemy();enemiesSpawned++;enemySpawnTimer=0.3+Math.random()*0.5;}}else{enemySpawnTimer=0.5;}
// Player movement
var dx=0,dy=0;if(input.left)dx-=1;if(input.right)dx+=1;if(input.up)dy-=1;if(input.down)dy+=1;if(dx!==0&&dy!==0){dx*=0.707;dy*=0.707;}
player.x+=dx*player.speed;player.y+=dy*player.speed;
player.x=Math.max(10,Math.min(gameWidth-10,player.x));player.y=Math.max(10,Math.min(gameHeight-10,player.y));
invincibleTimer=Math.max(0,invincibleTimer-dt);
// Shooting
fireTimer-=dt;var shooting=input.action||input.shoot;if(shooting&&fireTimer<=0){var cx=player.x,cy=player.y-10;createBullet(cx,cy,0,-10,player.damage,false);if(player.weapon==='rapid'){createBullet(cx-4,cy,-0.3,-10,player.damage,false);createBullet(cx+4,cy,0.3,-10,player.damage,false);}E.playBeep(800,0.04,'square',0.05);fireTimer=player.fireRate;}
// Enemy update
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];var edx=player.x-e.x,edy=player.y-e.y;var edist=Math.sqrt(edx*edx+edy*edy);
if(edist>e.speed){e.x+=edx/edist*e.speed;e.y+=edy/edist*e.speed;}
if(e.x<-40||e.x>gameWidth+40||e.y>gameHeight+40){enemies.splice(ei,1);continue;}
if(e.type==='sniper'&&edist<300){e.shootTimer-=dt;if(e.shootTimer<=0){var sdx=player.x-e.x,sdy=player.y-e.y;var sdist=Math.sqrt(sdx*sdx+sdy*sdy);createBullet(e.x,e.y,sdx/sdist*4,sdy/sdist*4,1,true);e.shootTimer=1.5;}}
e.hitFlash=Math.max(0,e.hitFlash-dt);}
// Bullets
for(var bi=bullets.length-1;bi>=0;bi--){var b=bullets[bi];b.x+=b.dx;b.y+=b.dy;b.life-=dt;
if(b.x<-20||b.x>gameWidth+20||b.y<-20||b.y>gameHeight+20||b.life<=0){bullets.splice(bi,1);continue;}
if(!b.isEnemy){for(var ei2=enemies.length-1;ei2>=0;ei2--){var e2=enemies[ei2];if(Math.abs(b.x-e2.x)<e2.size&&Math.abs(b.y-e2.y)<e2.size){e2.hp-=b.damage;e2.hitFlash=0.1;bullets.splice(bi,1);if(e2.hp<=0){comboCount++;comboTimer=1;var comboBonus=Math.min(comboCount,10);score+=10+comboBonus*2;createPowerup(e2.x+Math.random()*20-10,e2.y+Math.random()*20-10);createParticles(e2.x,e2.y,e2.color,8);E.playBeep(300+comboCount*30,0.1,'square',0.1);enemies.splice(ei2,1);enemiesKilled++;}break;}}}else{if(Math.abs(b.x-player.x)<player.w&&Math.abs(b.y-player.y)<player.h&&invincibleTimer<=0){player.hp-=b.damage;invincibleTimer=0.5;bullets.splice(bi,1);createParticles(player.x,player.y,'#ff4444',5);if(player.hp<=0){state='gameover';E.playBeep(100,0.4,'sawtooth',0.2);}E.playBeep(200,0.1,'sawtooth',0.1);}}}
// Powerups
for(var pi=powerups.length-1;pi>=0;pi--){var pu=powerups[pi];pu.bob+=dt*3;pu.y+=Math.sin(pu.bob)*0.3;pu.life-=dt;if(pu.life<=0){powerups.splice(pi,1);continue;}
if(Math.abs(pu.x-player.x)<20&&Math.abs(pu.y-player.y)<20){if(pu.type==='health'){player.hp=Math.min(player.maxHp,player.hp+2);}else if(pu.type==='rapid'){player.weapon='rapid';player.fireRate=0.08;}else if(pu.type==='shield'){player.shieldTimer=5;}E.playBeep(600,0.15,'sine',0.15);powerups.splice(pi,1);}}
// Particles
for(var pi2=particles.length-1;pi2>=0;pi2--){var p2=particles[pi2];p2.x+=p2.dx;p2.y+=p2.dy;p2.life-=dt;p2.dy+=0.2;if(p2.life<=0)particles.splice(pi2,1);}
comboTimer-=dt;if(comboTimer<=0)comboCount=0;
if(enemiesKilled>=waveEnemies&&enemies.length===0){waveTimer=Math.min(waveTimer+dt*2,2);}}
function render(ctx){if(!E||!ctx)return;
ctx.clearRect(0,0,gameWidth,gameHeight);
ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,gameWidth,gameHeight);
// Stars
ctx.fillStyle='#fff';for(var si=0;si<stars.length;si++){var s=stars[si];s.y+=s.speed;if(s.y>gameHeight){s.y=0;s.x=Math.random()*gameWidth;}ctx.globalAlpha=s.bright;ctx.fillRect(s.x,s.y,1.5,1.5);}ctx.globalAlpha=1;
if(state==='ready'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#ff8844';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('ARENA SHOOTER',gameWidth/2,gameHeight/2-30);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('WASD Move · Click/Enter Shoot · Survive the waves',gameWidth/2,gameHeight/2+10);ctx.fillStyle='#ff8844';ctx.font='bold 18px Arial';var p=0.5+Math.sin(Date.now()*0.003)*0.5;ctx.fillText('PRESS ENTER TO START',gameWidth/2,gameHeight/2+60);return;}
if(state==='gameover'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#ff4444';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('GAME OVER',gameWidth/2,gameHeight/2-20);ctx.fillStyle='#fff';ctx.font='18px Arial';ctx.fillText('Score: '+score+' | Wave: '+wave,gameWidth/2,gameHeight/2+20);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('Press Enter to restart',gameWidth/2,gameHeight/2+50);return;}
if(!player)return;
// Player
ctx.save();ctx.translate(player.x,player.y);
if(invincibleTimer>0&&Math.floor(invincibleTimer*10)%2===0){ctx.globalAlpha=0.5;}
ctx.fillStyle=player.shieldTimer>0?'#44aaff':'#4488ff';ctx.fillRect(-player.w/2,-player.h/2,player.w,player.h);
ctx.fillStyle='#88ccff';ctx.fillRect(-3,-10,6,4);
ctx.fillStyle='#888';ctx.fillRect(-4,4,8,4);
if(player.weapon==='rapid'){ctx.fillStyle='#ffaa44';ctx.fillRect(-5,8,10,2);}
ctx.restore();
// Enemies
for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];ctx.fillStyle=e.hitFlash>0?'#fff':e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.size,0,Math.PI*2);ctx.fill();
ctx.fillStyle='#ff4444';var hpPct=e.hp/e.maxHp;ctx.fillRect(e.x-e.size,e.y-e.size-4,e.size*2*hpPct,2);}
// Bullets
ctx.fillStyle='#ffff44';for(var bi=0;bi<bullets.length;bi++){var b=bullets[bi];if(!b.isEnemy){ctx.beginPath();ctx.arc(b.x,b.y,b.size,0,Math.PI*2);ctx.fill();}else{ctx.fillStyle='#ff4444';ctx.fillRect(b.x-2,b.y-2,4,4);}}
// Powerups
for(var pi=0;pi<powerups.length;pi++){var pu=powerups[pi];ctx.fillStyle=pu.type==='health'?'#44ff44':pu.type==='rapid'?'#ffaa44':'#44aaff';ctx.beginPath();ctx.arc(pu.x,pu.y,pu.size,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='8px Arial';ctx.textAlign='center';ctx.fillText(pu.type[0].toUpperCase(),pu.x,pu.y+3);}
// HUD
ctx.fillStyle='#fff';ctx.font='14px Arial';ctx.textAlign='left';ctx.fillText('HP: ',10,20);ctx.fillStyle='#44ff44';ctx.fillRect(40,8,player.hp/player.maxHp*60,10);ctx.fillStyle='#fff';ctx.fillText('Wave: '+wave,10,40);ctx.fillText('Score: '+score,10,55);
if(comboCount>1){ctx.fillStyle='#ffdd00';ctx.font='bold 16px Arial';ctx.textAlign='right';ctx.fillText(comboCount+'x COMBO!',gameWidth-10,25);}
ctx.fillStyle='#888';ctx.font='10px Arial';ctx.textAlign='right';ctx.fillText('Enemies: '+enemies.length,gameWidth-10,gameHeight-10);}
window.ArenaShooter={init:init,update:update,render:render,name:'Arena Shooter',description:'2D Top-down arena wave shooter — Survive endless waves',genre:'arena-shooter'};
console.log('[ArenaShooter] Loaded.');
})();