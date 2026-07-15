/**
 * Apex Island — 3D Battle Royale
 * 100-player battle royale with bots. Loot, circle, eliminate.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,kills=0,health=100,shield=0,playTime=0,circleRadius=60,circleShrink=0;var player,island,enemies=[],lootItems=[],projectiles=[];var hud=null;
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildIsland();buildPlayer();buildHUD();spawnBots();st='ready';E.emit('gameReady',{name:'Apex Island'});}
function reset(){score=0;kills=0;health=100;shield=0;playTime=0;circleRadius=60;enemies=[];lootItems=[];projectiles=[];}
function buildIsland(){if(island)E.scene.remove(island);island=new THREE.Group();
var ground=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshStandardMaterial({color:0x3a7a3a,roughness:0.9}));ground.rotation.x=-Math.PI/2;ground.position.y=-0.05;ground.receiveShadow=true;island.add(ground);
var grid=new THREE.GridHelper(120,30,0x448844,0x336633);grid.position.y=0.01;island.add(grid);
for(var i=0;i<30;i++){var tree=new THREE.Group();var trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.15,1,4),new THREE.MeshStandardMaterial({color:0x4a3520}));trunk.position.y=0.5;tree.add(trunk);var leaf=new THREE.Mesh(new THREE.SphereGeometry(0.6,4,4),new THREE.MeshStandardMaterial({color:0x2a7a2a}));leaf.position.y=1.5;tree.add(leaf);var a=Math.random()*Math.PI*2;var d=3+Math.random()*50;tree.position.set(Math.cos(a)*d,0,Math.sin(a)*d);island.add(tree);}
for(var bi=0;bi<15;bi++){var bldg=new THREE.Mesh(new THREE.BoxGeometry(1.5+Math.random()*2,1+Math.random()*2,1.5+Math.random()*2),new THREE.MeshStandardMaterial({color:0x666688}));var ba=Math.random()*Math.PI*2;var bd=5+Math.random()*40;bldg.position.set(Math.cos(ba)*bd,0.5+Math.random()*1,Math.sin(ba)*bd);bldg.castShadow=true;island.add(bldg);}
E.scene.add(island);}
function buildPlayer(){var group=new THREE.Group();var body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.8,0.3),new THREE.MeshStandardMaterial({color:0x4488cc}));body.position.y=0.9;body.castShadow=true;group.add(body);var head=new THREE.Mesh(new THREE.SphereGeometry(0.18,6,6),new THREE.MeshStandardMaterial({color:0xddbb88}));head.position.set(0,1.45,0);group.add(head);group.position.set(0,0,0);E.scene.add(group);player={group:group,yaw:0,speed:6,attackTimer:0,weapon:'rifle',ammo:30};camPivot=new THREE.Object3D();E.scene.add(camPivot);}
var camPivot;
function updateCamera(dt){if(!player)return;var behind=new THREE.Vector3(0,3,5);var rotated=new THREE.Vector3(behind.x*Math.cos(player.yaw)-behind.z*Math.sin(player.yaw),behind.y,behind.x*Math.sin(player.yaw)+behind.z*Math.cos(player.yaw));var target=player.group.position.clone().add(rotated);E.camera.position.lerp(target,3*dt);var look=player.group.position.clone();look.y+=1;E.camera.lookAt(look);}
function spawnBots(){var names=['Shadow','Blitz','Frost','Venom','Cypher','Raven','Phantom','Striker','Vortex','Blaze','Glacier','Storm','Wraith','Grizzly','Sniper','Ninja','Joker','Ace','Bolt','Crimson'];for(var i=0;i<40;i++){var body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.8,0.3),new THREE.MeshStandardMaterial({color:0x888888+Math.floor(Math.random()*0x444444)}));body.position.set((Math.random()-0.5)*80,0.5,(Math.random()-0.5)*80);body.castShadow=true;body.userData={hp:100,damage:5+Math.floor(Math.random()*10),speed:2+Math.random()*3,name:names[i%names.length],state:'idle',timer:Math.random()*3,shots:10};E.scene.add(body);enemies.push(body);}}
function buildHUD(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);hud=E.createHUD('<div id="apex-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;bottom:20px;left:20px;"><div style="font-size:22px;font-weight:bold;text-shadow:0 0 10px rgba(255,0,0,0.5);">'+
'<span id="apex-hp">100</span></div><div style="font-size:10px;color:#88aacc;">HP</div>'+
'<div style="width:120px;height:4px;background:rgba(0,0,0,0.5);border-radius:2px;"><div id="apex-shield-fill" style="width:0%;height:100%;background:#44aaff;border-radius:2px;"></div></div></div>'+
'<div style="position:absolute;bottom:20px;right:20px;text-align:right;font-size:10px;">'+
'KILLS: <span id="apex-kills">0</span><br>SCORE: <span id="apex-score">0</span><br>ALIVE: <span id="apex-alive">41</span></div>'+
'<div id="apex-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#ff8800;text-shadow:0 0 20px rgba(255,136,0,0.5);">APEX ISLAND</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">40 enemies · Last one standing wins!</div>'+
'<div id="apex-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ff8800;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO JUMP</div></div>'+
'<div id="apex-msg" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#ffdd00;text-shadow:0 0 20px rgba(255,221,0,0.5);opacity:0;"></div>'+
'</div>');}
function msg(t,d){var el=document.getElementById('apex-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function updateHUD(){document.getElementById('apex-hp').textContent=Math.ceil(health);document.getElementById('apex-kills').textContent=kills;document.getElementById('apex-score').textContent=score;document.getElementById('apex-alive').textContent=enemies.length+1;if(st==='ready'){var btn=document.getElementById('apex-start');var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('apex-ready').style.display='none';msg('Drop in! Loot and survive!',2500);circleShrink=playTime+30;}updateHUD();return;}
playTime+=dt;if(!player)return;
var dx=0,dz=0;if(input.left)dx-=1;if(input.right)dx+=1;if(input.up)dz-=1;if(input.down)dz+=1;if(dx!==0&&dz!==0){dx*=0.707;dz*=0.707;}
var wdx=dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw);var wdz=dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw);
player.group.position.x+=wdx*player.speed*dt;player.group.position.z+=wdz*player.speed*dt;player.group.position.x=Math.max(-55,Math.min(55,player.group.position.x));player.group.position.z=Math.max(-55,Math.min(55,player.group.position.z));
if(dx!==0||dz!==0)player.group.rotation.y=Math.atan2(wdx,wdz);
if(input.pointerLocked)player.yaw-=input.mouseDeltaX*0.003;
if(input.shoot&&player.attackTimer<=0){player.attackTimer=0.3;E.playBeep(500,0.06,'square',0.1);
var origin=player.group.position.clone();origin.y+=0.8;var dir=new THREE.Vector3(0,0,-1);dir.applyQuaternion(E.camera.quaternion);
for(var i=enemies.length-1;i>=0;i--){var e=enemies[i];if(origin.distanceTo(e.position)<3){e.userData.hp-=15;if(e.userData.hp<=0){E.scene.remove(e);enemies.splice(i,1);kills++;score+=50;E.playBeep(300,0.15,'sawtooth',0.15);if(enemies.length===0){msg('VICTORY! Last one standing!',5000);st='ready';}}else{e.material.color.setHex(0xffffff);var that=e;setTimeout(function(){if(that.material)that.material.color.setHex(0x888888);},80);}break;}}}
if(player.attackTimer>0)player.attackTimer-=dt;
// Enemies
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];e.userData.timer-=dt;var tp=player.group.position;var dx2=tp.x-e.position.x,dz2=tp.z-e.position.z;var dist=Math.sqrt(dx2*dx2+dz2*dz2);
if(e.userData.timer<=0&&dist<20){var spd=e.userData.speed*dt;e.position.x+=dx2/dist*spd;e.position.z+=dz2/dist*spd;e.rotation.y=Math.atan2(dx2,dz2);}
if(dist<2){health-=e.userData.damage*dt*2;E.playBeep(100,0.05,'sawtooth',0.08);if(health<=0){health=0;msg('Eliminated! Score: '+score,3000);st='ready';setTimeout(function(){if(E)init(E);},2000);}}}
// Circle
if(playTime>circleShrink&&circleRadius>5){circleRadius-=4*dt;}
var distFromCenter=Math.sqrt(player.group.position.x*player.group.position.x+player.group.position.z*player.group.position.z);if(distFromCenter>circleRadius){health-=8*dt;msg('Outside the circle! Move in!',1000);}
updateCamera(dt);updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(player&&player.group)E.scene.remove(player.group);if(camPivot)E.scene.remove(camPivot);if(island)E.scene.remove(island);for(var i=0;i<enemies.length;i++)E.scene.remove(enemies[i]);enemies=[];player=null;E=null;THREE=null;}
window.ApexIsland={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Apex Island',description:'3D Battle Royale — 40 bots, last one standing wins',genre:'battle-royale'};
console.log('[ApexIsland] Loaded. Drop in!');
})();
