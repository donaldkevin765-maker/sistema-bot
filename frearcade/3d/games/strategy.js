/**
 * Iron Command — 3D Strategy / RTS
 * Build a base, train units, defeat enemy waves.
 */
(function(){'use strict';var E,THREE;var st='ready',gold=200,mins=100,score=0,wave=0,playTime=0;var player,ground,units=[],enemies=[],buildings=[];
var hud=null,selectedUnit=null,spawnTimer=0,trainQueue=[];var UNIT_TYPES={warrior:{cost:50,hp:80,dmg:10,speed:4,range:1.5},archer:{cost:80,hp:50,dmg:8,speed:3,range:6},knight:{cost:120,hp:150,dmg:15,speed:5,range:1.5}};
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildTerrain();buildHUD();st='ready';E.emit('gameReady',{name:'Iron Command'});}
function reset(){gold=200;mins=100;score=0;wave=0;playTime=0;units=[];enemies=[];buildings=[];spawnTimer=0;trainQueue=[];}
function buildTerrain(){if(ground)E.scene.remove(ground);ground=new THREE.Group();
var baseFloor=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({color:0x2a4a2a,roughness:0.9}));baseFloor.rotation.x=-Math.PI/2;baseFloor.position.y=-0.05;baseFloor.receiveShadow=true;ground.add(baseFloor);
var grid=new THREE.GridHelper(60,20,0x3a5a3a,0x2a4a2a);grid.position.y=0.01;ground.add(grid);
// Base HQ
var hqMat=new THREE.MeshStandardMaterial({color:0x4466aa,metalness:0.5});var hq=new THREE.Mesh(new THREE.BoxGeometry(2,1.5,2),hqMat);hq.position.set(-10,0.75,0);hq.castShadow=true;hq.userData={type:'hq',hp:500,maxHp:500};ground.add(hq);buildings.push(hq);
// Gold mine
var gmMat=new THREE.MeshStandardMaterial({color:0xffaa44,emissive:0xffaa44,emissiveIntensity:0.2});var gm=new THREE.Mesh(new THREE.SphereGeometry(0.8,8,8),gmMat);gm.position.set(8,0.8,8);gm.userData={type:'mine',maxHp:200,hp:200};ground.add(gm);buildings.push(gm);
var gm2=gm.clone();gm2.position.set(8,0.8,-8);gm2.userData={...gm.userData};ground.add(gm2);buildings.push(gm2);
// Barracks
var barMat=new THREE.MeshStandardMaterial({color:0xaa4444});var bar1=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.2,1.5),barMat);bar1.position.set(-6,0.6,3);bar1.castShadow=true;bar1.userData={type:'barracks',hp:300,maxHp:300};ground.add(bar1);buildings.push(bar1);
var bar2=bar1.clone();bar2.position.set(-6,0.6,-3);ground.add(bar2);buildings.push(bar2);
// Walls
var wMat=new THREE.MeshStandardMaterial({color:0x667788});for(var wi=0;wi<6;wi++){var wall=new THREE.Mesh(new THREE.BoxGeometry(2,1,0.3),wMat);wall.position.set(-13+wi*4,0.5,-10);wall.userData={type:'wall',hp:100,maxHp:100};ground.add(wall);buildings.push(wall);}
for(var wj=0;wj<6;wj++){var wall2=new THREE.Mesh(new THREE.BoxGeometry(2,1,0.3),wMat);wall2.position.set(-13+wj*4,0.5,10);wall2.userData={type:'wall',hp:100,maxHp:100};ground.add(wall2);buildings.push(wall2);}
E.scene.add(ground);}
function buildHUD(){hud=E.createHUD('<div id="sc-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;">IRON COMMAND</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:13px;">WAVE: <span id="sc-wave">0</span></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;">'+
'<span style="color:#ffaa44;">💰 <span id="sc-gold">200</span></span> | '+
'<span style="color:#44ff44;">⛏️ <span id="sc-mins">100</span></span> | '+
'SCORE: <span id="sc-score">0</span></div>'+
'<div style="position:absolute;bottom:60px;left:50%;transform:translateX(-50%);display:flex;gap:6px;">'+
'<div id="sc-btn-warrior" style="padding:6px 14px;background:#666;color:#fff;border:1px solid #888;border-radius:4px;font-size:11px;cursor:pointer;pointer-events:auto;">WARRIOR 50💰</div>'+
'<div id="sc-btn-archer" style="padding:6px 14px;background:#666;color:#fff;border:1px solid #888;border-radius:4px;font-size:11px;cursor:pointer;pointer-events:auto;">ARCHER 80💰</div>'+
'<div id="sc-btn-knight" style="padding:6px 14px;background:#666;color:#fff;border:1px solid #888;border-radius:4px;font-size:11px;cursor:pointer;pointer-events:auto;">KNIGHT 120💰</div></div>'+
'<div id="sc-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#4466aa;text-shadow:0 0 20px rgba(68,102,170,0.5);">IRON COMMAND</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">Build your army. Defend the base. Survive!</div>'+
'<div id="sc-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#4466aa;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO COMMAND</div></div>'+
'<div id="sc-msg" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ffdd00;opacity:0;"></div></div>');
// Button events
setTimeout(function(){['warrior','archer','knight'].forEach(function(t){var btn=document.getElementById('sc-btn-'+t);if(btn)btn.onclick=function(){trainUnit(t);};});},100);}
function trainUnit(type){var cost=UNIT_TYPES[type].cost;if(gold<cost)return;gold-=cost;trainQueue.push(type);msg('Training '+type+'!',1000);}
function msg(t,d){var el=document.getElementById('sc-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function spawnUnit(type){var ut=UNIT_TYPES[type];var color=type==='warrior'?0x4488ff:type==='archer'?0x44dd88:0xff8844;var mesh=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.5,0.3),new THREE.MeshStandardMaterial({color:color}));mesh.position.set(-12+Math.random()*2,0.25,3+Math.random()*2);mesh.castShadow=true;mesh.userData={type:type,hp:ut.hp,maxHp:ut.hp,dmg:ut.dmg,speed:ut.speed,range:ut.range,state:'idle',target:null,attackTimer:0};E.scene.add(mesh);units.push(mesh);}
function spawnEnemyWave(){wave++;spawnTimer=3+wave*0.5;var count=3+wave*2;var colors=[0xff4444,0xff6600,0xff2288];for(var i=0;i<count;i++){var color=colors[Math.floor(Math.random()*colors.length)];var e=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.55,0.35),new THREE.MeshStandardMaterial({color:color}));var angle=Math.random()*Math.PI*2;var dist=18+Math.random()*5;e.position.set(Math.cos(angle)*dist,0.25,Math.sin(angle)*dist);e.castShadow=true;e.userData={hp:30+wave*5,maxHp:30+wave*5,dmg:5+wave*2,speed:1.5+wave*0.2,state:'move',target:null,attackTimer:0};E.scene.add(e);enemies.push(e);}
msg('Wave '+wave+' inbound! ('+count+' enemies)',2000);document.getElementById('sc-wave').textContent=wave;var btn=document.getElementById('sc-start');}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('sc-ready').style.display='none';spawnEnemyWave();}updateHUD();return;}
playTime+=dt;
// Income
gold+=0.5*dt;mins+=0.3*dt;
// Training
if(trainQueue.length>0&&spawnTimer<=0){spawnUnit(trainQueue.shift());}
// Spawn timer for wave
spawnTimer-=dt;if(spawnTimer<=0&&enemies.length===0)spawnEnemyWave();
// Unit AI
for(var ui=0;ui<units.length;ui++){var u=units[ui];u.userData.attackTimer-=dt;var nearest=null,nDist=20;for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];var d=u.position.distanceTo(e.position);if(d<nDist){nDist=d;nearest=e;}}
if(nearest&&nDist<u.userData.range+0.5){u.userData.state='attack';var dir=new THREE.Vector3(nearest.position.x-u.position.x,0,nearest.position.z-u.position.z);dir.normalize();if(nDist>u.userData.range*0.6){u.position.x+=dir.x*u.userData.speed*dt;u.position.z+=dir.z*u.userData.speed*dt;}
if(u.userData.attackTimer<=0){u.userData.attackTimer=1;nearest.userData.hp-=u.userData.dmg;E.playBeep(400+Math.random()*200,0.06,'square',0.08);if(nearest.userData.hp<=0){E.scene.remove(nearest);var idx=enemies.indexOf(nearest);if(idx>-1)enemies.splice(idx,1);score+=20+wave*5;gold+=5;}}}
else{u.userData.state='idle';}}
// Enemy AI
for(var ei=enemies.length-1;ei>=0;ei--){var en=enemies[ei];en.userData.attackTimer-=dt;
// Find target (nearest building or unit)
var target=null;var tDist=30;
for(var bi=0;bi<buildings.length;bi++){var b=buildings[bi];var d=en.position.distanceTo(b.position);if(d<tDist){tDist=d;target=b;}}
for(var ui2=0;ui2<units.length;ui2++){var u2=units[ui2];var d2=en.position.distanceTo(u2.position);if(d2<tDist){tDist=d2;target=u2;}}
if(target){var ddx=target.position.x-en.position.x;var ddz=target.position.z-en.position.z;var dd=Math.sqrt(ddx*ddx+ddz*ddz);if(dd>1.5){en.position.x+=ddx/dd*en.userData.speed*dt;en.position.z+=ddz/dd*en.userData.speed*dt;}
if(dd<2&&en.userData.attackTimer<=0){en.userData.attackTimer=0.8;target.userData.hp-=en.userData.dmg;E.playBeep(150,0.08,'sawtooth',0.06);
if(target.userData.hp<=0){E.scene.remove(target);var ti=buildings.indexOf(target);if(ti>-1)buildings.splice(ti,1);var tiu=units.indexOf(target);if(tiu>-1)units.splice(tiu,1);}}}
// Remove dead enemies
if(en.userData.hp<=0){E.scene.remove(en);enemies.splice(ei,1);score+=10;gold+=3;}}
// Check lose condition (HQ destroyed)
var hqAlive=buildings.some(function(b){return b.userData.type==='hq';});if(!hqAlive){msg('BASE DESTROYED! Final score: '+score,5000);st='ready';setTimeout(function(){if(E)init(E);},3000);}
updateHUD();}
function updateHUD(){document.getElementById('sc-gold').textContent=Math.floor(gold);document.getElementById('sc-mins').textContent=Math.floor(mins);document.getElementById('sc-score').textContent=score;if(st==='ready'){var btn=document.getElementById('sc-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(ground)E.scene.remove(ground);for(var i=0;i<units.length;i++)E.scene.remove(units[i]);for(var ei=0;ei<enemies.length;ei++)E.scene.remove(enemies[ei]);units=[];enemies=[];buildings=[];selectedUnit=null;E=null;THREE=null;}
window.IronCommand={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Iron Command',description:'3D Strategy/RTS — Build units, defend your base, survive waves',genre:'strategy'};
console.log('[IronCommand] Loaded. For the kingdom!');
})();
