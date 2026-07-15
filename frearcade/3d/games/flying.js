/**
 * Sky Reaver — 3D Flying Game
 * Dogfight in the sky. Shoot down enemies, dodge missiles, collect power-ups.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,kills=0,health=100,playTime=0;var player,skybox,enemies=[],bullets=[],missiles=[],explosions=[],clouds=[],hud=null;
var pitch=0,yaw=0,roll=0,speed=20,boost=100;
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildSky();buildPlayer();buildHUD();st='ready';E.emit('gameReady',{name:'Sky Reaver'});}
function reset(){score=0;kills=0;health=100;playTime=0;pitch=0;yaw=0;roll=0;speed=20;boost=100;enemies=[];bullets=[];missiles=[];clouds=[];explosions=[];}
function buildSky(){if(skybox)E.scene.remove(skybox);skybox=new THREE.Group();
var skyGeo=new THREE.SphereGeometry(200,32,32);var skyMat=new THREE.MeshBasicMaterial({color:0x4488cc,side:THREE.BackSide});var sky=new THREE.Mesh(skyGeo,skyMat);skybox.add(sky);
var sun=new THREE.Mesh(new THREE.SphereGeometry(5,16,16),new THREE.MeshBasicMaterial({color:0xffff88}));sun.position.set(50,80,-100);skybox.add(sun);
for(var i=0;i<60;i++){var c=new THREE.Mesh(new THREE.SphereGeometry(1+Math.random()*3,6,6),new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.3+Math.random()*0.4}));c.position.set((Math.random()-0.5)*300,Math.random()*100+10,(Math.random()-0.5)*300);c.userData={drift:Math.random()*2};skybox.add(c);clouds.push(c);}
var ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:0x226644,roughness:0.9}));ground.rotation.x=-Math.PI/2;ground.position.y=-5;skybox.add(ground);
E.scene.add(skybox);
var dirLight=new THREE.DirectionalLight(0xffffff,1);dirLight.position.set(50,80,-100);E.scene.add(dirLight);E.scene.add(new THREE.AmbientLight(0x446688,0.5));}
function buildPlayer(){player={position:new THREE.Vector3(0,20,0),quaternion:new THREE.Quaternion(),speed:speed,boost:boost};}
function buildHUD(){hud=E.createHUD('<div id="sr-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#88ccff;">SKY REAVER</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:12px;">SPEED: <span id="sr-speed">20</span></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;text-align:right;">KILLS: <span id="sr-kills">0</span><br>SCORE: <span id="sr-score">0</span></div>'+
'<div style="position:absolute;bottom:20px;left:20px;width:150px;">'+
'<div style="font-size:10px;color:#888;">BOOST</div>'+
'<div style="width:100%;height:4px;background:#333;border-radius:2px;"><div id="sr-boost" style="width:100%;height:100%;background:#ffaa44;border-radius:2px;"></div></div></div>'+
'<div style="position:absolute;bottom:20px;right:20px;text-align:right;width:150px;">'+
'<div style="font-size:10px;color:#888;">HEALTH</div>'+
'<div style="width:100%;height:4px;background:#333;border-radius:2px;"><div id="sr-hp" style="width:100%;height:100%;background:#44aa44;border-radius:2px;"></div></div></div>'+
'<div id="sr-crosshair" style="position:absolute;top:50%;left:50%;width:20px;height:20px;transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,0.5);border-radius:50%;"></div>'+
'<div id="sr-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#88ccff;text-shadow:0 0 20px rgba(136,204,255,0.5);">SKY REAVER</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">WASD pitch/roll · Mouse aim · Click shoot · Shift boost</div>'+
'<div id="sr-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#4488cc;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO TAKE OFF</div></div>'+
'<div id="sr-msg" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ffdd00;opacity:0;"></div></div>');}
function msg(t,d){var el=document.getElementById('sr-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function spawnEnemy(){var mat=new THREE.MeshStandardMaterial({color:0xcc4444,metalness:0.3});var e=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.4,2),mat);
var a=Math.random()*Math.PI*2;e.position.set(player.position.x+Math.cos(a)*(30+Math.random()*40),10+Math.random()*40,player.position.z+Math.sin(a)*(30+Math.random()*40));
e.rotation.y=Math.atan2(player.position.x-e.position.x,player.position.z-e.position.z);
e.userData={hp:20+3*kills,speed:8+Math.random()*5,turnRate:0.5+Math.random()*0.5,shootTimer:Math.random()*2};E.scene.add(e);enemies.push(e);}
function fireBullet(pos,dir){var b=new THREE.Mesh(new THREE.SphereGeometry(0.15,4,4),new THREE.MeshBasicMaterial({color:0xffff44}));b.position.copy(pos);b.userData={dir:dir.clone(),life:3,speed:60};E.scene.add(b);bullets.push(b);}
function spawnExplosion(pos,color,count){for(var i=0;i<(count||8);i++){var p=new THREE.Mesh(new THREE.SphereGeometry(0.1+Math.random()*0.2,4,4),new THREE.MeshBasicMaterial({color:color||0xff8800}));p.position.copy(pos);p.userData={vel:new THREE.Vector3((Math.random()-0.5)*5,(Math.random()-0.5)*5,(Math.random()-0.5)*5),life:0.5+Math.random()*0.3};E.scene.add(p);explosions.push(p);}}
function updateHUD(){document.getElementById('sr-speed').textContent=Math.round(speed);document.getElementById('sr-kills').textContent=kills;document.getElementById('sr-score').textContent=score;document.getElementById('sr-boost').style.width=Math.max(0,boost)+'%';document.getElementById('sr-hp').style.width=Math.max(0,health)+'%';if(st==='ready'){var btn=document.getElementById('sr-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('sr-ready').style.display='none';msg('Incoming hostiles! Engage!',2000);for(var i=0;i<5;i++)spawnEnemy();}updateHUD();return;}
playTime+=dt;if(!player||health<=0){if(health<=0&&st!=='ready'){msg('Shot down! Score: '+score,5000);st='ready';setTimeout(function(){if(E)init(E);},3000);}updateHUD();return;}
// Controls
var pitchInput=0,rollInput=0;if(input.up)pitchInput-=1;if(input.down)pitchInput+=1;if(input.left)rollInput-=1;if(input.right)rollInput+=1;
pitch+=pitchInput*dt*2;roll+=rollInput*dt*2;yaw+=input.mouseDeltaX*0.005;
pitch=Math.max(-1,Math.min(1,pitch));roll*=0.95;
if(input.keysPressed['ShiftLeft']||input.keysPressed['ShiftRight']){if(boost>0){speed=35;boost-=10*dt;}}else{speed+=((20+boost*0.05)-speed)*dt;}
var euler=new THREE.Euler(pitch,0,roll,'YXZ');player.quaternion.setFromEuler(euler);
var forward=new THREE.Vector3(0,0,-1);forward.applyQuaternion(player.quaternion);
player.position.x+=forward.x*speed*dt;player.position.y+=forward.y*speed*dt;player.position.z+=forward.z*speed*dt;
player.position.y=Math.max(2,Math.min(80,player.position.y));
if(input.shoot&&playTime>0.3){var dir=forward.clone();fireBullet(player.position.clone().add(dir.clone().multiplyScalar(2)),dir);E.playBeep(300,0.05,'square',0.08);}
// Camera
var camPos=player.position.clone().add(forward.clone().multiplyScalar(-8)).add(new THREE.Vector3(0,2,0));E.camera.position.lerp(camPos,5*dt);E.camera.lookAt(player.position.clone().add(forward.clone().multiplyScalar(10)));E.camera.up.set(0,1,0);
// Clouds
for(var ci=0;ci<clouds.length;ci++){var c=clouds[ci];c.position.x-=forward.x*dt*5;c.position.z-=forward.z*dt*5;if(Math.abs(c.position.x)>200)c.position.x=-Math.sign(c.position.x)*200;if(Math.abs(c.position.z)>200)c.position.z=-Math.sign(c.position.z)*200;}
// Bullets
for(var bi=bullets.length-1;bi>=0;bi--){var b=bullets[bi];b.position.x+=b.userData.dir.x*b.userData.speed*dt;b.position.y+=b.userData.dir.y*b.userData.speed*dt;b.position.z+=b.userData.dir.z*b.userData.speed*dt;b.userData.life-=dt;if(b.userData.life<=0){E.scene.remove(b);bullets.splice(bi,1);continue;}
for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];if(b.position.distanceTo(e.position)<2){e.userData.hp-=10;E.scene.remove(b);bullets.splice(bi,1);if(e.userData.hp<=0){E.scene.remove(e);enemies.splice(ei,1);kills++;score+=100;spawnExplosion(e.position,0xff8800,15);E.playBeep(100,0.2,'sawtooth',0.15);if(Math.random()<0.3)spawnEnemy();}break;}}}
// Enemies
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];var tdx=player.position.x-e.position.x;var tdz=player.position.z-e.position.z;var tyr=player.position.y-e.position.y;var tdist=Math.sqrt(tdx*tdx+tyr*tyr+tdz*tdz);var targetAngle=Math.atan2(tdx,tdz);var currentAngle=e.rotation.y;var diff=targetAngle-currentAngle;while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;e.rotation.y+=Math.sign(diff)*Math.min(Math.abs(diff),e.userData.turnRate*dt);
var euler2=new THREE.Euler(0,-Math.atan2(tyr,tdist),0);e.rotation.x+=(-Math.atan2(tyr,tdist)-e.rotation.x)*dt;
var fwd=new THREE.Vector3(0,0,1);fwd.applyQuaternion(e.quaternion);e.position.x+=fwd.x*e.userData.speed*dt;e.position.y+=fwd.y*e.userData.speed*dt;e.position.z+=fwd.z*e.userData.speed*dt;
e.userData.shootTimer-=dt;if(e.userData.shootTimer<=0&&tdist<30){var dir=new THREE.Vector3(player.position.x-e.position.x,player.position.y-e.position.y,player.position.z-e.position.z);dir.normalize();var m=new THREE.Mesh(new THREE.SphereGeometry(0.12,4,4),new THREE.MeshBasicMaterial({color:0xff4444}));m.position.copy(e.position);m.userData={dir:dir.clone(),speed:25,life:3};E.scene.add(m);missiles.push(m);e.userData.shootTimer=1+Math.random()*2;}}
for(var mi=missiles.length-1;mi>=0;mi--){var m=missiles[mi];m.position.x+=m.userData.dir.x*m.userData.speed*dt;m.position.y+=m.userData.dir.y*m.userData.speed*dt;m.position.z+=m.userData.dir.z*m.userData.speed*dt;m.userData.life-=dt;if(m.userData.life<=0){E.scene.remove(m);missiles.splice(mi,1);continue;}
if(m.position.distanceTo(player.position)<2){health-=15;E.playBeep(80,0.2,'sawtooth',0.2);spawnExplosion(m.position,0xff4444,10);E.scene.remove(m);missiles.splice(mi,1);}}
for(var ei=explosions.length-1;ei>=0;ei--){var ex=explosions[ei];ex.position.x+=ex.userData.vel.x*dt;ex.position.y+=ex.userData.vel.y*dt;ex.position.z+=ex.userData.vel.z*dt;ex.userData.life-=dt;if(ex.userData.life<=0){E.scene.remove(ex);explosions.splice(ei,1);}}
if(enemies.length<3+kills*0.1&&Math.random()<0.01)spawnEnemy();
if(boost<100)boost+=3*dt;
updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(skybox)E.scene.remove(skybox);for(var i=0;i<enemies.length;i++)E.scene.remove(enemies[i]);for(var bi=0;i<bullets.length;i++)E.scene.remove(bullets[i]);for(var mi=0;i<missiles.length;i++)E.scene.remove(missiles[i]);for(var ei=0;i<explosions.length;i++)E.scene.remove(explosions[i]);enemies=[];bullets=[];missiles=[];explosions=[];player=null;E=null;THREE=null;}
window.SkyReaver={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Sky Reaver',description:'3D Flying/Dogfight — Aerial combat high above the world',genre:'flying'};
console.log('[SkyReaver] Loaded. Take to the skies!');
})();