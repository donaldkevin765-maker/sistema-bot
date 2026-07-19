/**
 * Run 'n Gun — 2D side-scrolling run and gun
 * Auto-scrolling action platformer with jumping, shooting, and bosses.
 */
(function(){'use strict';var E;var player,bullets,enemies,platforms,particles,coins,stars;var state='ready',score=0,coinsCollected=0,scrollX=0,scrollSpeed=2;var fireTimer=0,enemyTimer=0,jumpTimer=0,invincibleTimer=0;var gameWidth=0,gameHeight=0;var LEVEL_LENGTH=2000;
function init(eng){E=eng;gameWidth=E.width||800;gameHeight=E.height||600;resetGame();state='ready';E.emit('gameReady',{name:'Run n Gun'});}
function resetGame(){score=0;coinsCollected=0;scrollX=0;bullets=[];enemies=[];platforms=[];particles=[];coins=[];stars=[];fireTimer=0;enemyTimer=0;jumpTimer=0;invincibleTimer=0;createPlayer();createStars();buildLevel();}
function createPlayer(){player={x:100,y:300,w:16,h:20,vy:0,hp:5,maxHp:5,onGround:true,jumps:2,jumpsLeft:2,speed:3,bulletType:'normal'};}
function createStars(){stars=[];for(var i=0;i<30;i++){stars.push({x:Math.random()*gameWidth,y:Math.random()*gameHeight,speed:0.5+Math.random()*1,bright:0.3+Math.random()*0.7});}}
function buildLevel(){platforms=[];var groundY=gameHeight-40;for(var x=0;x<LEVEL_LENGTH;x+=60){platforms.push({x:x,y:groundY,w:60,h:10,type:'ground'});}
var gaps=[300,600,900,1200,1500];for(var g=0;g<gaps.length;g++){var gx=gaps[g];for(var p=platforms.length-1;p>=0;p--){if(platforms[p].x>=gx&&platforms[p].x<gx+80){platforms.splice(p,1);}}}
// Floating platforms
var fpx=[150,250,500,650,850,1050,1300,1500,1700,1850];for(var fi=0;fi<fpx.length;fi++){var fy=200+Math.sin(fi)*100;platforms.push({x:fpx[fi],y:fy,w:60,h:8,type:'float'});}}
function spawnEnemy(){var etypes=['walker','flyer','jumper','turret'];var type=etypes[Math.floor(Math.random()*etypes.length)];var ex=scrollX+gameWidth+20;var ey=gameHeight-80;var hp=2,spd=1,color='#ff4444';switch(type){case'walker':hp=3;spd=1.5;color='#ff6644';break;case'flyer':hp=2;spd=2;ey=100+Math.random()*150;color='#ff44ff';break;case'jumper':hp=1;spd=0;ey=gameHeight-80;color='#ffaa00';break;case'turret':hp=5;spd=0;ey=gameHeight-160;color='#8844ff';break;}
enemies.push({x:ex,y:ey,w:20,h:20,hp:hp,maxHp:hp,speed:spd,type:type,color:color,shootTimer:Math.random()*3,hitFlash:0,vy:0});}
function createBullet(x,y,dx,dy,isEnemy){bullets.push({x:x,y:y,dx:dx,dy:dy,life:2,isEnemy:isEnemy||false,size:isEnemy?3:5});}
function createParticles(x,y,color,count){for(var i=0;i<(count||5);i++){particles.push({x:x,y:y,dx:(Math.random()-0.5)*5,dy:(Math.random()-0.5)*5-2,life:0.5+Math.random()*0.5,color:color||'#ffaa00',size:2+Math.random()*3});}}
function spawnCoin(x,y){coins.push({x:x,y:y,life:10,bob:Math.random()*Math.PI*2});}
function update(dt,input){if(state==='ready'){if(input.action){state='playing';resetGame();}return;}
if(state==='gameover'){if(input.action){resetGame();state='playing';}return;}
gameWidth=E.width||800;gameHeight=E.height||600;
if(!player)return;
// Scroll
scrollX+=scrollSpeed;
// Player gravity
player.vy+=0.8;player.y+=player.vy;player.onGround=false;
for(var pi=0;pi<platforms.length;pi++){var pf=platforms[pi];if(pf.x<scrollX-100||pf.x>scrollX+gameWidth+100)continue;var relX=pf.x-scrollX;if(player.x+player.w/2>relX&&player.x-player.w/2<relX+pf.w&&player.y+player.h/2>pf.y&&player.y-player.h/2<pf.y+player.h/2){if(player.vy>0){player.y=pf.y-player.h/2;player.vy=0;player.onGround=true;player.jumpsLeft=player.jumps;}}}
// Ground
if(player.y+player.h/2>gameHeight-40){player.y=gameHeight-40-player.h/2;player.vy=0;player.onGround=true;player.jumpsLeft=player.jumps;}
if(player.y>gameHeight+50){player.hp=0;}
// Player movement
if(input.left)player.x-=player.speed;if(input.right)player.x+=player.speed;player.x=Math.max(30,Math.min(gameWidth-30,player.x));
// Jump
if(input.action&&player.jumpsLeft>0&&jumpTimer<=0){player.vy=-8;jumpTimer=0.3;player.jumpsLeft--;if(!player.onGround){player.vy=-9;}player.onGround=false;E.playBeep(500,0.08,'sine',0.1);}
jumpTimer=Math.max(0,jumpTimer-dt);
invincibleTimer=Math.max(0,invincibleTimer-dt);
// Shoot
fireTimer-=dt;if(input.shoot&&fireTimer<=0){fireTimer=0.15;createBullet(player.x,player.y-5,5,0,false);E.playBeep(700,0.04,'square',0.05);}
// Enemy spawn
enemyTimer-=dt;if(enemyTimer<=0&&scrollX<LEVEL_LENGTH-500){spawnEnemy();enemyTimer=0.8+Math.random()*1.5;}
// Enemy update
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];e.x-=scrollSpeed+e.speed*dt;
if(e.type==='walker'||e.type==='jumper'){e.hitFlash=Math.max(0,e.hitFlash-dt);}
if(e.type==='flyer'){e.y+=Math.sin(scrollX*0.01+ei)*1.5;}
if(e.type==='turret'){e.shootTimer-=dt;if(e.shootTimer<=0){createBullet(e.x-10,e.y,0,5,true);e.shootTimer=1.5;}}
if(e.x<-100){enemies.splice(ei,1);continue;}
// Player collision
if(Math.abs(e.x-player.x)<20&&Math.abs(e.y-player.y)<20&&invincibleTimer<=0){player.hp--;invincibleTimer=1;createParticles(player.x,player.y,'#ff4444',6);E.playBeep(200,0.15,'sawtooth',0.1);if(player.hp<=0){state='gameover';E.playBeep(100,0.4,'sawtooth',0.2);}}}
// Bullets
for(var bi=bullets.length-1;bi>=0;bi--){var b=bullets[bi];b.x+=b.dx;b.y+=b.dy;b.life-=dt;
if(b.x<-20||b.x>gameWidth+20||b.y<-20||b.y>gameHeight+20||b.life<=0){bullets.splice(bi,1);continue;}
if(!b.isEnemy){for(var ei2=enemies.length-1;ei2>=0;ei2--){var e2=enemies[ei2];if(Math.abs(b.x-e2.x)<e2.w/2+5&&Math.abs(b.y-e2.y)<e2.h/2+5){e2.hp--;bullets.splice(bi,1);if(e2.hp<=0){score+=50;createParticles(e2.x,e2.y,e2.color,8);if(Math.random()<0.3)spawnCoin(e2.x,e2.y);E.playBeep(300,0.1,'square',0.1);enemies.splice(ei2,1);}else{e2.hitFlash=0.15;}break;}}}else{if(Math.abs(b.x-player.x)<player.w&&Math.abs(b.y-player.y)<player.h&&invincibleTimer<=0){player.hp--;invincibleTimer=1;bullets.splice(bi,1);if(player.hp<=0){state='gameover';E.playBeep(100,0.4,'sawtooth',0.2);}}}}
// Coins
for(var ci=coins.length-1;ci>=0;ci--){var cn=coins[ci];cn.life-=dt;cn.bob+=0.1;cn.y+=Math.sin(cn.bob)*0.5;if(cn.life<=0){coins.splice(ci,1);continue;}
if(Math.abs(cn.x-player.x)<20&&Math.abs(cn.y-player.y)<20){coinsCollected++;score+=25;E.playBeep(800,0.1,'sine',0.12);coins.splice(ci,1);}}
// Particles
for(var pi2=particles.length-1;pi2>=0;pi2--){var p2=particles[pi2];p2.x+=p2.dx;p2.y+=p2.dy;p2.life-=dt;p2.dy+=0.3;if(p2.life<=0)particles.splice(pi2,1);}
// Level complete
if(scrollX>=LEVEL_LENGTH&&enemies.length===0){state='ready';score+=1000;if(coinsCollected>0)score+=coinsCollected*50;}}
function render(ctx){if(!E||!ctx)return;
ctx.clearRect(0,0,gameWidth,gameHeight);
var grad=ctx.createLinearGradient(0,0,0,gameHeight);grad.addColorStop(0,'#0a0a2a');grad.addColorStop(1,'#1a1a3a');ctx.fillStyle=grad;ctx.fillRect(0,0,gameWidth,gameHeight);
// Stars
for(var si=0;si<stars.length;si++){var s=stars[si];s.y+=s.speed*0.5;if(s.y>gameHeight){s.y=0;s.x=Math.random()*gameWidth;}ctx.globalAlpha=s.bright;ctx.fillStyle='#fff';ctx.fillRect(s.x,s.y,1.5,1.5);}ctx.globalAlpha=1;
if(state==='ready'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#ff8844';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('RUN n GUN',gameWidth/2,gameHeight/2-30);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('WASD/Arrow move · Space/Click jump · Auto-run shooter',gameWidth/2,gameHeight/2+10);ctx.fillStyle='#ff8844';ctx.font='bold 18px Arial';var p=0.5+Math.sin(Date.now()*0.003)*0.5;ctx.fillText('PRESS ENTER TO START',gameWidth/2,gameHeight/2+60);return;}
if(state==='gameover'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#ff4444';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('GAME OVER',gameWidth/2,gameHeight/2-20);ctx.fillStyle='#fff';ctx.font='18px Arial';ctx.fillText('Score: '+score,gameWidth/2,gameHeight/2+20);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('Press Enter to restart',gameWidth/2,gameHeight/2+50);return;}
if(!player)return;
// Platforms
ctx.fillStyle='#445566';for(var pi=0;pi<platforms.length;pi++){var pf=platforms[pi];if(pf.x<scrollX-100||pf.x>scrollX+gameWidth+100)continue;var relX=pf.x-scrollX;ctx.fillRect(relX,pf.y,pf.w,pf.h);if(pf.type==='ground'){ctx.fillStyle='#556677';ctx.fillRect(relX+2,pf.y+2,pf.w-4,3);ctx.fillStyle='#445566';}}
// Player
ctx.save();ctx.translate(player.x,player.y);
if(invincibleTimer>0&&Math.floor(invincibleTimer*10)%2===0)ctx.globalAlpha=0.5;
ctx.fillStyle='#4488ff';ctx.fillRect(-player.w/2,-player.h/2,player.w,player.h);
ctx.fillStyle='#66aaee';ctx.fillRect(-2,-8,4,4);
ctx.fillStyle='#888';ctx.fillRect(-4,6,8,5);
ctx.fillStyle='#4488ff';ctx.fillRect(-4,4,8,3);
ctx.restore();
// Enemies
for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];ctx.fillStyle=e.hitFlash>0?'#fff':e.color;ctx.fillRect(e.x-e.w/2,e.y-e.h/2,e.w,e.h);
ctx.fillStyle='rgba(255,0,0,0.5)';ctx.fillRect(e.x-e.w/2,e.y-e.h/2-5,e.w*(e.hp/e.maxHp),3);}
// Bullets
for(var bi=0;bi<bullets.length;bi++){var b=bullets[bi];ctx.fillStyle=b.isEnemy?'#ff4444':'#ffff44';ctx.beginPath();ctx.arc(b.x,b.y,b.size,0,Math.PI*2);ctx.fill();}
// Coins
for(var ci=0;ci<coins.length;ci++){var cn=coins[ci];ctx.fillStyle='#ffdd00';ctx.beginPath();ctx.arc(cn.x,cn.y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#aa8800';ctx.beginPath();ctx.arc(cn.x-1,cn.y-1,2,0,Math.PI*2);ctx.fill();}
// Particles
for(var pii=0;pii<particles.length;pii++){var pt=particles[pii];ctx.globalAlpha=pt.life;ctx.fillStyle=pt.color;ctx.fillRect(pt.x-pt.size/2,pt.y-pt.size/2,pt.size,pt.size);}ctx.globalAlpha=1;
// HUD
ctx.fillStyle='#fff';ctx.font='14px Arial';ctx.textAlign='left';ctx.fillText('HP: ',10,20);ctx.fillStyle='#44ff44';ctx.fillRect(40,8,player.hp/player.maxHp*60,10);
ctx.fillStyle='#fff';ctx.fillText('Score: '+score,10,40);ctx.fillText('Coins: '+coinsCollected,10,55);
var pct=Math.min(100,scrollX/LEVEL_LENGTH*100);ctx.fillStyle='#888';ctx.fillRect(gameWidth/2-50,10,100,5);ctx.fillStyle='#44ff44';ctx.fillRect(gameWidth/2-50,10,pct,5);
if(enemies.length>0){ctx.fillStyle='#888';ctx.font='10px Arial';ctx.textAlign='right';ctx.fillText('Enemies: '+enemies.length,gameWidth-10,20);}}
window.Rungun={init:init,update:update,render:render,name:'Run n Gun',description:'2D Side-scrolling run and gun — Auto-run action platformer',genre:'rungun'};
console.log('[Rungun] Loaded.');
})();