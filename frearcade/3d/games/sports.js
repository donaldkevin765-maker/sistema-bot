/**
 * Strike Zone — 3D Sports Game
 * Futuristic arena sports — dodgeball with power-ups.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,round=1,playTime=0,myHP=3;var player,arena,balls=[],enemies=[],powerups=[],hud=null,charge=0,ballCount=0,activeBall=null,camPivot=null;
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildArena();buildPlayer();spawnEnemies();buildHUD();st='ready';E.emit('gameReady',{name:'Strike Zone'});}
function reset(){score=0;round=1;playTime=0;myHP=3;charge=0;ballCount=0;activeBall=null;balls=[];enemies=[];powerups=[];}
function buildArena(){if(arena)E.scene.remove(arena);arena=new THREE.Group();
var floor=new THREE.Mesh(new THREE.CircleGeometry(14,32),new THREE.MeshStandardMaterial({color:0x224466,roughness:0.6,metalness:0.3}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;arena.add(floor);
var wallMat=new THREE.MeshStandardMaterial({color:0x4488aa,transparent:true,opacity:0.4});
for(var i=0;i<16;i++){var a=i/16*Math.PI*2;var seg=new THREE.Mesh(new THREE.BoxGeometry(0.1,2,1.5),wallMat);seg.position.set(Math.cos(a)*14,1,Math.sin(a)*14);seg.rotation.y=-a;arena.add(seg);}
var grid=new THREE.RingGeometry(0.5,14,24);var gridMesh=new THREE.Mesh(grid,new THREE.MeshBasicMaterial({color:0x4488aa,wireframe:true,transparent:true,opacity:0.15}));gridMesh.rotation.x=-Math.PI/2;gridMesh.position.y=0.01;arena.add(gridMesh);
var centerCircle=new THREE.Mesh(new THREE.RingGeometry(2,2.2,24),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.2}));centerCircle.rotation.x=-Math.PI/2;centerCircle.position.y=0.01;arena.add(centerCircle);
E.scene.add(arena);}
function buildPlayer(){var group=new THREE.Group();var body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.3),new THREE.MeshStandardMaterial({color:0x44aaff}));body.position.y=0.65;body.castShadow=true;group.add(body);var head=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,8),new THREE.MeshStandardMaterial({color:0xddbb88}));head.position.set(0,1.1,0);group.add(head);group.position.set(0,0.5,-10);E.scene.add(group);player={group:group,yaw:0,speed:7,throwCooldown:0};camPivot=new THREE.Object3D();E.scene.add(camPivot);}
function updateCamera(dt){if(!player)return;var behind=new THREE.Vector3(0,5,8);var rotated=new THREE.Vector3(behind.x*Math.cos(player.yaw)-behind.z*Math.sin(player.yaw),behind.y,behind.x*Math.sin(player.yaw)+behind.z*Math.cos(player.yaw));var target=player.group.position.clone().add(rotated);E.camera.position.lerp(target,3*dt);E.camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,0.8,0)));}
function spawnEnemies(){if(enemies.length>0){for(var i=enemies.length-1;i>=0;i--){E.scene.remove(enemies[i]);}enemies=[];}var colors=[0xff4444,0xff6600,0xff2288,0xaa44ff];var angles=[0,Math.PI/2,Math.PI,3*Math.PI/2];var count=3+round;for(var ei=0;ei<count;ei++){var a=angles[ei%angles.length]+(Math.random()-0.5);var e=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.65,0.3),new THREE.MeshStandardMaterial({color:colors[ei%colors.length]}));e.position.set(Math.cos(a)*8,0.65,Math.sin(a)*8);e.castShadow=true;e.userData={hp:3,maxHp:3,speed:1.5+Math.random(),throwTimer:Math.random()*3,state:'idle',hitFlash:0};E.scene.add(e);enemies.push(e);}}
function buildHUD(){hud=E.createHUD('<div id="sz-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;">STRIKE ZONE</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:13px;">ROUND <span id="sz-round">1</span></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;text-align:right;"><span id="sz-hp">3</span> HP | SCORE: <span id="sz-score">0</span></div>'+
'<div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-size:12px;color:#88ccff;">CHARGE: <span id="sz-charge">0</span>%</div>'+
'<div id="sz-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#44aaff;text-shadow:0 0 20px rgba(68,170,255,0.5);">STRIKE ZONE</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">WASD move · Hold click to charge · Release to throw</div>'+
'<div id="sz-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#44aaff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO PLAY</div></div>'+
'<div id="sz-msg" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#ffdd00;opacity:0;"></div></div>');}
function msg(t,d){var el=document.getElementById('sz-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function throwBall(from,dir,speed,isEnemy){var ball=new THREE.Mesh(new THREE.SphereGeometry(0.2,8,8),new THREE.MeshBasicMaterial({color:isEnemy?0xff4444:0x44ff88}));ball.position.copy(from);ball.userData={dir:dir.clone(),speed:speed||12,life:3,isEnemy:isEnemy};E.scene.add(ball);balls.push(ball);return ball;}
function updateHUD(){document.getElementById('sz-hp').textContent=Math.max(0,myHP);document.getElementById('sz-score').textContent=score;document.getElementById('sz-round').textContent=round;document.getElementById('sz-charge').textContent=Math.round(charge*100);if(st==='ready'){var btn=document.getElementById('sz-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('sz-ready').style.display='none';msg('Round 1! Dodge, charge, and strike!',2000);}updateHUD();return;}
playTime+=dt;if(!player||myHP<=0){updateHUD();if(input.action){myHP=3;score=0;round=1;spawnEnemies();}return;}
var dx=0,dz=0;if(input.left)dx-=1;if(input.right)dx+=1;if(input.up)dz-=1;if(input.down)dz+=1;if(dx!==0&&dz!==0){dx*=0.707;dz*=0.707;}
var wdx=dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw);var wdz=dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw);
player.group.position.x+=wdx*player.speed*dt;player.group.position.z+=wdz*player.speed*dt;
var maxR=12;var dist=Math.sqrt(player.group.position.x*player.group.position.x+player.group.position.z*player.group.position.z);if(dist>maxR){player.group.position.x*=maxR/dist;player.group.position.z*=maxR/dist;}
if(input.shoot){charge=Math.min(1,charge+dt*2);}else if(charge>0){if(enemies.length>0){var nearestE=enemies[0],nearestDist=100;for(var eti=0;eti<enemies.length;eti++){var d=enemies[eti].position.distanceTo(player.group.position);if(d<nearestDist){nearestDist=d;nearestE=enemies[eti];}}var dir=new THREE.Vector3(nearestE.position.x-player.group.position.x,0,nearestE.position.z-player.group.position.z);dir.normalize();dir.y=0.1+charge*0.3;throwBall(player.group.position.clone().add(new THREE.Vector3(0,0.8,0)),dir,8+charge*8,false);E.playBeep(500+charge*300,0.1,'sine',0.15);}charge=0;}
if(input.pointerLocked)player.yaw-=input.mouseDeltaX*0.003;
for(var bi=balls.length-1;bi>=0;bi--){var b=balls[bi];b.position.x+=b.userData.dir.x*b.userData.speed*dt;b.position.y+=b.userData.dir.y*b.userData.speed*dt;b.position.z+=b.userData.dir.z*b.userData.speed*dt;b.userData.life-=dt;
b.position.y-=5*dt;
if(b.userData.life<=0||Math.abs(b.position.x)>15||Math.abs(b.position.z)>15||b.position.y<0){E.scene.remove(b);balls.splice(bi,1);continue;}
if(b.userData.isEnemy){if(b.position.distanceTo(player.group.position)<0.8){myHP--;E.playBeep(150,0.15,'sawtooth',0.15);E.scene.remove(b);balls.splice(bi,1);if(myHP<=0){msg('Game Over!',3000);st='ready';setTimeout(function(){if(E)init(E);},2000);}}continue;}
for(var hi=0;hi<enemies.length;hi++){var e=enemies[hi];if(b.position.distanceTo(e.position)<0.8){e.userData.hp--;e.material.color.setHex(0xffffff);var col=e.material.color.getHex();setTimeout(function(m,c){m.color.setHex(c);},100,e.material,col);E.scene.remove(b);balls.splice(bi,1);if(e.userData.hp<=0){E.scene.remove(e);enemies.splice(hi,1);score+=100;E.playBeep(800,0.1,'sine',0.15);if(enemies.length===0){round++;score+=200;spawnEnemies();msg('Round '+round+'!',2000);}}break;}}}
if(dx!==0||dz!==0)player.group.rotation.y=Math.atan2(wdx,wdz);
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];e.userData.throwTimer-=dt;var toPlayer=new THREE.Vector3(player.group.position.x-e.position.x,0,player.group.position.z-e.position.z);var eDist=toPlayer.length();if(eDist>3){toPlayer.normalize();e.position.x+=toPlayer.x*e.userData.speed*dt;e.position.z+=toPlayer.z*e.userData.speed*dt;e.rotation.y=Math.atan2(toPlayer.x,toPlayer.z);}
if(e.userData.throwTimer<=0&&eDist<12){var dir=new THREE.Vector3(player.group.position.x-e.position.x,0.3,player.group.position.z-e.position.z);dir.normalize();throwBall(e.position.clone().add(new THREE.Vector3(0,0.6,0)),dir,6+round,true);e.userData.throwTimer=1.5+Math.random()*2;}}
updateCamera(dt);updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(player&&player.group)E.scene.remove(player.group);if(camPivot)E.scene.remove(camPivot);if(arena)E.scene.remove(arena);for(var i=0;i<balls.length;i++)E.scene.remove(balls[i]);for(var ei=0;ei<enemies.length;ei++)E.scene.remove(enemies[ei]);balls=[];enemies=[];E=null;THREE=null;}
window.StrikeZone={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Strike Zone',description:'3D Sports — Futuristic dodgeball arena combat',genre:'sports'};
console.log('[StrikeZone] Loaded. Ready, set, strike!');
})();