/**
 * Fortress Outpost — 3D Tower Defense
 * Build towers, upgrade them, survive endless waves of enemies.
 */
(function(){'use strict';var E,THREE;var st='ready',gold=150,score=0,wave=0,lives=20,playTime=0;var level,towers=[],enemies=[],projectiles=[],hud=null;
var TOWER_TYPES={cannon:{cost:50,dmg:15,range:8,rate:1.5,color:0x4488ff},arrow:{cost:30,dmg:8,range:10,rate:0.8,color:0x44ff44},magic:{cost:80,dmg:25,range:6,rate:2.5,color:0xcc44ff}};
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildLevel();buildHUD();st='ready';E.emit('gameReady',{name:'Fortress Outpost'});}
function reset(){gold=150;score=0;wave=0;lives=20;playTime=0;towers=[];enemies=[];projectiles=[];}
function buildLevel(){if(level)E.scene.remove(level);level=new THREE.Group();
var ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x2a4a2a,roughness:0.9}));ground.rotation.x=-Math.PI/2;ground.position.y=-0.05;ground.receiveShadow=true;level.add(ground);
// Path
var pathMat=new THREE.MeshStandardMaterial({color:0x8a7a5a,roughness:0.95});var pts=[[-8,0,-8],[-4,0,-6],[0,0,-8],[4,0,-6],[8,0,-4],[6,0,0],[8,0,4],[4,0,6],[0,0,8],[-4,0,6],[-8,0,4],[-6,0,0],[-8,0,-8]];for(var i=0;i<pts.length-1;i++){var nx=pts[i][0],nz=pts[i][2];var nnx=pts[i+1][0],nnz=pts[i+1][2];var seg=new THREE.Mesh(new THREE.BoxGeometry(Math.abs(nx-nnx)+0.5,0.1,Math.abs(nz-nnz)+0.5),pathMat);seg.position.set((nx+nnx)/2,-0.02,(nz+nnz)/2);level.add(seg);}
// Tower spots
var spotMat=new THREE.MeshBasicMaterial({color:0x666666,transparent:true,opacity:0.3});var spots=[[-2,0,-2],[0,0,-4],[2,0,-2],[-6,0,0],[6,0,0],[-2,0,2],[0,0,4],[2,0,2],[4,0,0],[-4,0,0]];for(var si=0;si<spots.length;si++){var s=spots[si];var spot=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.8,0.1,8),spotMat);spot.position.set(s[0],0.05,s[2]);spot.userData={gridX:si,occupied:false};level.add(spot);}
E.scene.add(level);}
function buildHUD(){hud=E.createHUD('<div id="td-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#aa8844;">FORTRESS OUTPOST</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:13px;">WAVE: <span id="td-wave">0</span> | LIVES: <span id="td-lives">20</span></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;text-align:right;">💰 <span id="td-gold">150</span> | SCORE: <span id="td-score">0</span></div>'+
'<div style="position:absolute;bottom:60px;left:50%;transform:translateX(-50%);display:flex;gap:6px;">'+
'<div id="td-btn-cannon" style="padding:6px 12px;background:#4488ff;color:#fff;border:1px solid #66aaff;border-radius:4px;font-size:11px;cursor:pointer;pointer-events:auto;">CANNON 50💰</div>'+
'<div id="td-btn-arrow" style="padding:6px 12px;background:#44ff44;color:#000;border:1px solid #66ff66;border-radius:4px;font-size:11px;cursor:pointer;pointer-events:auto;">ARROW 30💰</div>'+
'<div id="td-btn-magic" style="padding:6px 12px;background:#cc44ff;color:#fff;border:1px solid #dd66ff;border-radius:4px;font-size:11px;cursor:pointer;pointer-events:auto;">MAGIC 80💰</div></div>'+
'<div id="td-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#aa8844;text-shadow:0 0 20px rgba(170,136,68,0.5);">FORTRESS OUTPOST</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">Click tower spot to build · Survive the waves!</div>'+
'<div id="td-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#aa8844;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO BEGIN</div></div>'+
'<div id="td-msg" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ffdd00;opacity:0;"></div></div>');
setTimeout(function(){['cannon','arrow','magic'].forEach(function(t){var btn=document.getElementById('td-btn-'+t);if(btn)btn.onclick=function(){selectedType=t;msg('Place '+t+' tower on a spot',1000);};});},100);}
var selectedType='cannon';
function msg(t,d){var el=document.getElementById('td-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function placeTower(pos,type){var tt=TOWER_TYPES[type];var mat=new THREE.MeshStandardMaterial({color:tt.color,emissive:tt.color,emissiveIntensity:0.2});var tower=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.5,0.6,8),mat);tower.position.copy(pos);tower.position.y=0.3;tower.castShadow=true;tower.userData={type:type,range:tt.range,dmg:tt.dmg,rate:tt.rate,timer:0,level:1};E.scene.add(tower);towers.push(tower);}
function spawnWave(){wave++;gold+=20*wave;var count=5+wave*2;for(var i=0;i<count;i++){var mat=new THREE.MeshStandardMaterial({color:0xff4444,roughness:0.7});var e=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.4),mat);var pathPos=Math.random();var a=pathPos*Math.PI*2;e.position.set(Math.cos(a)*12,0.2,Math.sin(a)*12);e.userData={hp:20+wave*5,maxHp:20+wave*5,speed:1+wave*0.1,pathPos:0,goldValue:5+wave};E.scene.add(e);enemies.push(e);}
document.getElementById('td-wave').textContent=wave;msg('Wave '+wave+'! ('+count+' enemies)',2000);}
function updateHUD(){document.getElementById('td-gold').textContent=Math.floor(gold);document.getElementById('td-score').textContent=score;document.getElementById('td-lives').textContent=lives;if(st==='ready'){var btn=document.getElementById('td-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('td-ready').style.display='none';spawnWave();}updateHUD();return;}
playTime+=dt;if(lives<=0){msg('Outpost fallen! Score: '+score,5000);st='ready';setTimeout(function(){if(E)init(E);},3000);return;}
// Tower placement
if(input.action&&input.mouseWorld){var raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(0,0),E.camera);var spots=[];level.children.forEach(function(c){if(c.geometry&&c.geometry.type==='CylinderGeometry'&&c.position.y<0.1){spots.push(c);}});var intersects=raycaster.intersectObjects(spots);if(intersects.length>0){var spot=intersects[0].object;if(!spot.userData.occupied&&gold>=TOWER_TYPES[selectedType].cost){spot.userData.occupied=true;gold-=TOWER_TYPES[selectedType].cost;placeTower(spot.position,selectedType);E.playBeep(600,0.1,'sine',0.12);}}}
// Towers
for(var ti=0;ti<towers.length;ti++){var t=towers[ti];t.userData.timer-=dt;if(t.userData.timer<=0){var nearest=null,nDist=t.userData.range;for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];var d=t.position.distanceTo(e.position);if(d<nDist){nDist=d;nearest=e;}}
if(nearest){t.userData.timer=1/t.userData.rate;var dir=new THREE.Vector3(nearest.position.x-t.position.x,0,nearest.position.z-t.position.z);dir.normalize();var p=new THREE.Mesh(new THREE.SphereGeometry(0.1,4,4),new THREE.MeshBasicMaterial({color:0xffff44}));p.position.copy(t.position);p.position.y+=0.3;p.userData={target:nearest,speed:15,life:2,dmg:t.userData.dmg};E.scene.add(p);projectiles.push(p);E.playBeep(700,0.04,'sine',0.06);}}}
// Projectiles
for(var pi=projectiles.length-1;pi>=0;pi--){var p=projectiles[pi];if(p.userData.target){var dir=new THREE.Vector3(p.userData.target.position.x-p.position.x,0,p.userData.target.position.z-p.position.z);var dist=dir.length();if(dist>0.2){dir.normalize();p.position.x+=dir.x*p.userData.speed*dt;p.position.z+=dir.z*p.userData.speed*dt;}else{p.userData.target.userData.hp-=p.userData.dmg;E.scene.remove(p);projectiles.splice(pi,1);}}}
// Enemies
for(var ei=enemies.length-1;ei>=0;ei--){var e=enemies[ei];e.userData.pathPos+=e.userData.speed*dt*0.3;var angle=e.userData.pathPos*Math.PI*2;e.position.x=Math.cos(angle)*12*(1-e.userData.pathPos*0.02);e.position.z=Math.sin(angle)*12*(1-e.userData.pathPos*0.02);
if(e.userData.pathPos>12){lives--;E.scene.remove(e);enemies.splice(ei,1);continue;}
if(e.userData.hp<=0){gold+=e.userData.goldValue;score+=10*wave;E.playBeep(300,0.1,'sawtooth',0.1);E.scene.remove(e);enemies.splice(ei,1);}}
if(enemies.length===0&&st==='playing'){spawnWave();}
updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(level)E.scene.remove(level);for(var i=0;i<towers.length;i++)E.scene.remove(towers[i]);for(var ei=0;i<enemies.length;i++)E.scene.remove(enemies[i]);for(var pi=0;i<projectiles.length;i++)E.scene.remove(projectiles[i]);towers=[];enemies=[];projectiles=[];E=null;THREE=null;}
window.FortressOutpost={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Fortress Outpost',description:'3D Tower Defense — Build towers, survive endless waves',genre:'tower-defense'};
console.log('[FortressOutpost] Loaded. Defend the outpost!');
})();