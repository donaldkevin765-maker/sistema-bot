/**
 * Fortress Siege — 2D Tower Defense
 * Build towers along a path, upgrade them, survive increasingly difficult waves.
 */
(function(){'use strict';var E;var towers=[],enemies=[],projectiles=[],particles=[];var state='ready',gold=100,score=0,wave=0,lives=20,waveTimer=0;var gameWidth=0,gameHeight=0;var pathPts=[];var selectedTowerType='arrow';var WAVE_BASE=5;
var TOWER_TYPES={arrow:{cost:30,dmg:5,range:100,rate:0.8,color:'#44ff44',name:'Arrow'},cannon:{cost:60,dmg:15,range:80,rate:1.5,color:'#4488ff',name:'Cannon'},magic:{cost:100,dmg:30,range:120,rate:2.2,color:'#cc44ff',name:'Magic'}};
var BUILD_SPOTS=[];
function init(eng){E=eng;gameWidth=E.width||800;gameHeight=E.height||600;resetGame();buildPath();findBuildSpots();state='ready';E.emit('gameReady',{name:'Fortress Siege'});}
function resetGame(){gold=100;score=0;wave=0;lives=20;waveTimer=2;towers=[];enemies=[];projectiles=[];particles=[];selectedTowerType='arrow';pathPts=[];BUILD_SPOTS=[];}
function buildPath(){var cx=gameWidth/2;var cy=80;pathPts=[];var segments=10;for(var i=0;i<=segments;i++){var t=i/segments;var x=cx+Math.sin(t*Math.PI*3)*250;var y=cy+t*(gameHeight-160);pathPts.push({x:x,y:y});}}
function findBuildSpots(){BUILD_SPOTS=[];for(var i=0;i<pathPts.length-1;i++){var p1=pathPts[i],p2=pathPts[i+1];var mx=(p1.x+p2.x)/2,my=(p1.y+p2.y)/2;var nx=-(p2.y-p1.y),ny=(p2.x-p1.x);var len=Math.sqrt(nx*nx+ny*ny);if(len>0){nx/=len;ny/=len;}
BUILD_SPOTS.push({x:mx+nx*40,y:my+ny*40,occupied:false});BUILD_SPOTS.push({x:mx-nx*40,y:my-ny*40,occupied:false});}}
function spawnWave(){wave++;var count=WAVE_BASE+wave*2;for(var i=0;i<count;i++){var hp=10+wave*3;var spd=0.5+wave*0.05+Math.random()*0.5;var color='#ff4444';if(wave>3&&Math.random()<0.2){hp*=2;color='#8844ff';spd*=0.7;}if(wave>7&&Math.random()<0.15){hp*=4;color='#ffaa00';spd*=0.5;}
enemies.push({pathPos:0,hp:hp,maxHp:hp,speed:spd,color:color,size:8,goldValue:5+wave});}waveTimer=3+wave*0.5;}
function createProjectile(tower,target){projectiles.push({x:tower.x,y:tower.y,target:target,dmg:tower.dmg,speed:6,life:2,color:tower.type==='magic'?'#cc44ff':'#ffff44'});}
function update(dt,input){if(state==='ready'){if(input.action){state='playing';spawnWave();}return;}
if(lives<=0){state='gameover';return;}
if(state==='gameover'){if(input.action){resetGame();buildPath();findBuildSpots();state='playing';spawnWave();}return;}
gameWidth=E.width||800;gameHeight=E.height||600;
// Wave timer
waveTimer-=dt;if(waveTimer<=0&&enemies.length===0){spawnWave();}
// Tower placement click
if(input.action&&selectedTowerType){var tt=TOWER_TYPES[selectedTowerType];if(tt&&gold>=tt.cost){var bestSpot=null,bestDist=50;for(var si=0;si<BUILD_SPOTS.length;si++){var s=BUILD_SPOTS[si];if(s.occupied)continue;var d=Math.sqrt((s.x-input.mouseX)*(s.x-input.mouseX)+(s.y-input.mouseY)*(s.y-input.mouseY));if(d<bestDist){bestDist=d;bestSpot=s;}}
if(bestSpot){bestSpot.occupied=true;gold-=tt.cost;towers.push({x:bestSpot.x,y:bestSpot.y,type:selectedTowerType,range:tt.range,dmg:tt.dmg,rate:tt.rate,timer:0,level:1,color:tt.color});E.playBeep(600,0.1,'sine',0.12);}}}
// Towers shoot
for(var ti=0;ti<towers.length;ti++){var t=towers[ti];t.timer-=dt;if(t.timer<=0){var nearest=null,nDist=t.range;for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];var d=Math.sqrt((e.x-t.x)*(e.x-t.x)+(e.y-t.y)*(e.y-t.y));if(d<nDist){nDist=d;nearest=e;}}
if(nearest){createProjectile(t,nearest);t.timer=1/t.rate;E.playBeep(700,0.03,'sine',0.04);}}}
// Projectiles
for(var pi=projectiles.length-1;pi>=0;pi--){var p=projectiles[pi];p.life-=dt;if(!p.target||p.life<=0){projectiles.splice(pi,1);continue;}
var dx=p.target.x-p.x,dy=p.target.y-p.y;var dist=Math.sqrt(dx*dx+dy*dy);if(dist>3){p.x+=dx/dist*p.speed;p.y+=dy/dist*p.speed;}else{p.target.hp-=p.dmg;projectiles.splice(pi,1);if(p.target.hp<=0){gold+=p.target.goldValue;score+=10*wave;E.playBeep(300,0.1,'square',0.08);var ei2=enemies.indexOf(p.target);if(ei2>-1){enemies.splice(ei2,1);}}}}
// Enemies
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];e.pathPos+=e.speed*dt;
var idx=Math.floor(e.pathPos);var frac=e.pathPos-idx;if(idx>=pathPts.length-1){lives--;enemies.splice(ei,1);continue;}
var p1=pathPts[idx],p2=pathPts[Math.min(idx+1,pathPts.length-1)];e.x=p1.x+(p2.x-p1.x)*frac;e.y=p1.y+(p2.y-p1.y)*frac;}
// Particles
for(var pii=particles.length-1;pii>=0;pii--){var pt=particles[pii];pt.x+=pt.dx;pt.y+=pt.dy;pt.life-=dt;if(pt.life<=0)particles.splice(pii,1);}}
function render(ctx){if(!E||!ctx)return;
ctx.fillStyle='#1a2a1a';ctx.fillRect(0,0,gameWidth,gameHeight);
// Path
ctx.strokeStyle='#8a7a5a';ctx.lineWidth=20;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();for(var i=0;i<pathPts.length;i++){if(i===0)ctx.moveTo(pathPts[i].x,pathPts[i].y);else ctx.lineTo(pathPts[i].x,pathPts[i].y);}ctx.stroke();
ctx.strokeStyle='#6a5a3a';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();for(var pi=0;pi<pathPts.length;pi++){if(pi===0)ctx.moveTo(pathPts[pi].x,pathPts[pi].y);else ctx.lineTo(pathPts[pi].x,pathPts[pi].y);}ctx.stroke();ctx.setLineDash([]);
// Build spots
for(var si=0;si<BUILD_SPOTS.length;si++){var s=BUILD_SPOTS[si];ctx.strokeStyle=s.occupied?'#666':'#888';ctx.lineWidth=2;ctx.strokeRect(s.x-12,s.y-12,24,24);if(!s.occupied){ctx.fillStyle='rgba(255,255,255,0.1)';ctx.fillRect(s.x-12,s.y-12,24,24);}}
if(state==='ready'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#aa8844';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('FORTRESS SIEGE',gameWidth/2,gameHeight/2-30);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('Click a build spot · Select tower type · Survive the waves',gameWidth/2,gameHeight/2+10);var p=0.5+Math.sin(Date.now()*0.003)*0.5;ctx.fillStyle='#aa8844';ctx.font='bold 18px Arial';ctx.fillText('PRESS ENTER TO BEGIN',gameWidth/2,gameHeight/2+60);return;}
if(state==='gameover'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,gameWidth,gameHeight);ctx.fillStyle='#ff4444';ctx.font='bold 36px Arial';ctx.textAlign='center';ctx.fillText('FALLEN',gameWidth/2,gameHeight/2-20);ctx.fillStyle='#fff';ctx.font='18px Arial';ctx.fillText('Score: '+score+' | Wave: '+wave,gameWidth/2,gameHeight/2+20);ctx.fillStyle='#aaa';ctx.font='14px Arial';ctx.fillText('Press Enter to restart',gameWidth/2,gameHeight/2+50);return;}
// Towers
for(var ti=0;ti<towers.length;ti++){var t=towers[ti];ctx.fillStyle=t.color;ctx.beginPath();ctx.arc(t.x,t.y,12,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(t.x,t.y,t.range,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff';ctx.font='10px Arial';ctx.textAlign='center';ctx.fillText('Lv'+t.level,t.x,t.y+18);}
// Enemies
for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.size,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,0,0,0.5)';ctx.fillRect(e.x-e.size,e.y-e.size-5,e.size*2*(e.hp/e.maxHp),3);}
// Projectiles
for(var pi=0;pi<projectiles.length;pi++){var p=projectiles[pi];ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();}
// HUD
ctx.fillStyle='#fff';ctx.font='14px Arial';ctx.textAlign='left';ctx.fillText('💰 '+Math.floor(gold)+' | Wave: '+wave+' | Lives: '+lives+' | Score: '+score,10,20);
ctx.fillStyle='#aa8844';ctx.font='12px Arial';ctx.textAlign='center';ctx.fillText('[1] Arrow 30💰 [2] Cannon 60💰 [3] Magic 100💰',gameWidth/2,gameHeight-10);
ctx.fillStyle='#ffdd00';ctx.font='10px Arial';ctx.textAlign='right';ctx.fillText('Selected: '+TOWER_TYPES[selectedTowerType].name,gameWidth-10,gameHeight-10);}
window.FortressSiege={init:init,update:update,render:render,name:'Fortress Siege',description:'2D Tower Defense — Build towers, defend the path, survive waves',genre:'fortress'};
console.log('[FortressSiege] Loaded.');
})();