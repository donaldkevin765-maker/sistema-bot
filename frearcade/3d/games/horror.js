/**
 * Dark Corridor — 3D Horror Game
 * Navigate dark corridors, manage flashlight battery, survive encounters.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,health=100,sanity=100,battery=100,playTime=0;var player,level,enemies=[],items=[],hud=null,camPivot=null;
var pulsePhase=0,footstepTimer=0,encounterTimer=0;var SCARE_SOUNDS=[200,150,120,180,160];
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildLevel();buildPlayer();buildHUD();spawnEnemies();st='ready';E.emit('gameReady',{name:'Dark Corridor'});}
function reset(){score=0;health=100;sanity=100;battery=100;playTime=0;enemies=[];items=[];pulsePhase=0;footstepTimer=0;encounterTimer=0;}
function buildLevel(){if(level)E.scene.remove(level);level=new THREE.Group();
var floorMat=new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:0.95});for(var x=-10;x<=10;x+=2){for(var z=-10;z<=10;z+=2){var tile=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.1,1.9),floorMat);tile.position.set(x,-0.05,z);level.add(tile);}}
var wallMat=new THREE.MeshStandardMaterial({color:0x2a2a2a,roughness:0.9});
var wallLayout=[[-10,0,-10,-10,3,10],[10,0,-10,10,3,10],[-10,0,-10,10,3,-10],[-10,0,10,10,3,10]];
for(var wi=0;wi<wallLayout.length;wi++){var w=wallLayout[wi];var dx=w[3]-w[0],dz=w[5]-w[2];var len=Math.sqrt(dx*dx+dz*dz);if(len===0)continue;var wall=new THREE.Mesh(new THREE.BoxGeometry(dx===0?0.1:len,3,dz===0?0.1:len),wallMat);wall.position.set((w[0]+w[3])/2,1.5,(w[2]+w[5])/2);level.add(wall);}
var innerWalls=[[-5,0,-2,-5,3,2],[5,0,-2,5,3,2],[-2,0,-5,2,3,-5],[-2,0,5,2,3,5],[0,0,-8,0,3,-4],[-8,0,0,-4,3,0],[8,0,0,4,3,0],[0,0,4,0,3,8]];
for(var ii=0;ii<innerWalls.length;ii++){var iw=innerWalls[ii];var idx=iw[3]-iw[0],idz=iw[5]-iw[2];var ilen=Math.sqrt(idx*idx+idz*idz);if(ilen===0)continue;var iwall=new THREE.Mesh(new THREE.BoxGeometry(idx===0?0.1:ilen,2.5,idz===0?0.1:ilen),wallMat);iwall.position.set((iw[0]+iw[3])/2,1.25,(iw[2]+iw[5])/2);level.add(iwall);}
// Ambient lighting
var amb=new THREE.AmbientLight(0x111122,0.3);level.add(amb);
for(var eli=0;eli<5;eli++){var flicker=new THREE.Mesh(new THREE.SphereGeometry(0.1,4,4),new THREE.MeshBasicMaterial({color:0xff6600}));flicker.position.set((Math.random()-0.5)*14,2+(Math.random()*2),(Math.random()-0.5)*14);flicker.userData=flicker.material.clone();level.add(flicker);}
E.scene.add(level);}
function buildPlayer(){var group=new THREE.Group();var body=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.7,0.3),new THREE.MeshStandardMaterial({color:0x222233}));body.position.y=0.65;body.castShadow=true;group.add(body);group.position.set(0,0.5,0);E.scene.add(group);player={group:group,yaw:0,speed:3,flashlight:true,flickerTimer:0};camPivot=new THREE.Object3D();E.scene.add(camPivot);
// Flashlight
var spotLight=new THREE.SpotLight(0xffffaa,1,20,Math.PI/6,0.5,1);spotLight.position.set(0,1.5,-1);spotLight.target.position.set(0,0,-5);group.add(spotLight);group.add(spotLight.target);player.spotLight=spotLight;}
function updateCamera(dt){if(!player)return;var behind=new THREE.Vector3(0,1.8,1.5);var rotated=new THREE.Vector3(behind.x*Math.cos(player.yaw)-behind.z*Math.sin(player.yaw),behind.y,behind.x*Math.sin(player.yaw)+behind.z*Math.cos(player.yaw));var target=player.group.position.clone().add(rotated);E.camera.position.lerp(target,4*dt);E.camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,0.8,0)));}
function spawnEnemies(){var positions=[[-7,0.5,-7],[7,0.5,7],[-7,0.5,7],[7,0.5,-7],[0,0.5,-8],[8,0.5,0],[-8,0.5,0],[0,0.5,8]];for(var i=0;i<6;i++){var p=positions[i];var e=new THREE.Mesh(new THREE.BoxGeometry(0.5,1.2,0.3),new THREE.MeshStandardMaterial({color:0x111111,emissive:0x440000,emissiveIntensity:0.1}));e.position.set(p[0],p[1],p[2]);e.castShadow=true;e.userData={hp:20,state:'idle',speed:1.5,detectRange:6,attackTimer:0,idlePos:p,phase:Math.random()*Math.PI*2};E.scene.add(e);enemies.push(e);}}
function buildHUD(){hud=E.createHUD('<div id="dh-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#884444;">DARK CORRIDOR</div>'+
'<div style="position:absolute;bottom:20px;left:20px;width:200px;">'+
'<div style="font-size:10px;color:#888;">HEALTH</div><div style="width:100%;height:4px;background:#333;border-radius:2px;"><div id="dh-hp" style="width:100%;height:100%;background:#44aa44;border-radius:2px;"></div></div>'+
'<div style="font-size:10px;color:#888;margin-top:4px;">SANITY</div><div style="width:100%;height:4px;background:#333;border-radius:2px;"><div id="dh-san" style="width:100%;height:100%;background:#8844cc;border-radius:2px;"></div></div>'+
'<div style="font-size:10px;color:#888;margin-top:4px;">BATTERY</div><div style="width:100%;height:4px;background:#333;border-radius:2px;"><div id="dh-bat" style="width:100%;height:100%;background:#ffaa44;border-radius:2px;"></div></div></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;text-align:right;">SCORE: <span id="dh-score">0</span><br>TIME: <span id="dh-time">0</span></div>'+
'<div id="dh-vignette" style="position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,0.7) 100%);pointer-events:none;"></div>'+
'<div id="dh-jumpscare" style="position:absolute;top:0;left:0;width:100%;height:100%;display:none;background:rgba(255,0,0,0.5);z-index:10;"></div>'+
'<div id="dh-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);">'+
'<div style="font-size:36px;font-weight:bold;color:#884444;text-shadow:0 0 20px rgba(136,68,68,0.5);">DARK CORRIDOR</div>'+
'<div style="font-size:14px;color:#666;margin-top:10px;">WASD move · Mouse look · F flashlight · Survive the darkness</div>'+
'<div id="dh-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#884444;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO ENTER</div></div>'+
'<div id="dh-msg" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ff4444;opacity:0;"></div></div>');}
function msg(t,d){var el=document.getElementById('dh-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function updateHUD(){document.getElementById('dh-hp').style.width=Math.max(0,health)+'%';document.getElementById('dh-san').style.width=Math.max(0,sanity)+'%';document.getElementById('dh-bat').style.width=Math.max(0,battery)+'%';document.getElementById('dh-score').textContent=score;document.getElementById('dh-time').textContent=Math.floor(playTime);if(st==='ready'){var btn=document.getElementById('dh-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('dh-ready').style.display='none';msg('Find the exit. Avoid the darkness...',3000);}updateHUD();return;}
playTime+=dt;if(!player||health<=0){if(health<=0&&st!=='ready'){msg('Consumed by darkness... Score: '+score,5000);st='ready';setTimeout(function(){if(E)init(E);},3000);}updateHUD();return;}
var dx=0,dz=0;if(input.left)dx-=1;if(input.right)dx+=1;if(input.up)dz-=1;if(input.down)dz+=1;if(dx!==0&&dz!==0){dx*=0.707;dz*=0.707;}
var wdx=dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw);var wdz=dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw);
player.group.position.x+=wdx*player.speed*dt;player.group.position.z+=wdz*player.speed*dt;
player.group.position.x=Math.max(-9,Math.min(9,player.group.position.x));player.group.position.z=Math.max(-9,Math.min(9,player.group.position.z));
if(dx!==0||dz!==0){player.group.rotation.y=Math.atan2(wdx,wdz);footstepTimer+=dt;if(footstepTimer>0.5){footstepTimer=0;E.playBeep(80+Math.random()*20,0.04,'sine',0.03);}}
if(input.pointerLocked)player.yaw-=input.mouseDeltaX*0.003;
if(input.keysPressed['KeyF']){player.flashlight=!player.flashlight;if(player.spotLight)player.spotLight.visible=player.flashlight;}
if(!player.flashlight&&Math.random()<0.001){battery+=0.5;}
// Battery drain
if(player.flashlight){battery-=2*dt;if(battery<=0){battery=0;player.flashlight=false;if(player.spotLight)player.spotLight.visible=false;}}
// Sanity
var distToEnemy=100;for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];var d=player.group.position.distanceTo(e.position);if(d<distToEnemy)distToEnemy=d;}
if(!player.flashlight){sanity-=3*dt;}
if(distToEnemy<5){sanity-=5*dt;}else{sanity+=1*dt;}
sanity=Math.max(0,Math.min(100,sanity));
// Enemies
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];var tpx=player.group.position.x,tpz=player.group.position.z;var edx=tpx-e.position.x;var edz=tpz-e.position.z;var edist=Math.sqrt(edx*edx+edz*edz);
if(edist<e.userData.detectRange&&player.flashlight){e.userData.state='chase';}
if(e.userData.state==='idle'){e.userData.phase+=dt;e.position.x=e.userData.idlePos[0]+Math.sin(e.userData.phase)*2;e.position.z=e.userData.idlePos[2]+Math.cos(e.userData.phase)*2;}else if(e.userData.state==='chase'){e.position.x+=edx/edist*e.userData.speed*dt;e.position.z+=edz/edist*e.userData.speed*dt;
if(edist<1.5){e.userData.attackTimer-=dt;if(e.userData.attackTimer<=0){health-=15;E.playBeep(SCARE_SOUNDS[Math.floor(Math.random()*SCARE_SOUNDS.length)],0.3,'sawtooth',0.2);e.userData.attackTimer=1.5;var js=document.getElementById('dh-jumpscare');if(js)js.style.display='block';setTimeout(function(){if(js)js.style.display='none';},200);}}
if(edist>20)e.userData.state='idle';}
// Damage enemy with flashlight
if(edist<3&&player.flashlight){e.userData.hp-=5*dt;if(e.userData.hp<=0){E.scene.remove(e);enemies.splice(ei,1);score+=200;E.playBeep(400,0.2,'sawtooth',0.15);msg('Entity banished!',1500);}}}
// Scatter items
if(Math.random()<0.002){var ix=(Math.random()-0.5)*16,iz=(Math.random()-0.5)*16;var itm=new THREE.Mesh(new THREE.SphereGeometry(0.1,4,4),new THREE.MeshBasicMaterial({color:0x44ff88}));itm.position.set(ix,0.2,iz);itm.userData={type:'battery'};E.scene.add(itm);items.push(itm);}
for(var ii=items.length-1;ii>=0;ii--){var it=items[ii];if(player.group.position.distanceTo(it.position)<1){if(it.userData.type==='battery'){battery=Math.min(100,battery+20);E.playBeep(600,0.1,'sine',0.1);}E.scene.remove(it);items.splice(ii,1);}}
pulsePhase+=dt;var pulse=0.5+Math.sin(pulsePhase*3)*0.5;var vignette=document.getElementById('dh-vignette');if(vignette)vignette.style.opacity=sanity<30?0.3+(30-sanity)/100*0.7:0.3;
updateCamera(dt);updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(player&&player.group)E.scene.remove(player.group);if(camPivot)E.scene.remove(camPivot);if(level)E.scene.remove(level);for(var i=0;i<enemies.length;i++)E.scene.remove(enemies[i]);for(var ii=0;ii<items.length;ii++)E.scene.remove(items[ii]);enemies=[];items=[];player=null;E=null;THREE=null;}
window.DarkCorridor={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Dark Corridor',description:'3D Horror — Survive the darkness, manage sanity & battery',genre:'horror'};
console.log('[DarkCorridor] Loaded. Stay in the light.');
})();