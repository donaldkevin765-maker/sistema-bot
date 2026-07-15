/**
 * Skyward Run — 3D Platformer
 * Parkour platformer with jumping, dashing, wall-running, and collecting.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,health=3,coins=0,playTime=0;var player,level,platforms=[],collectibles=[],enemies=[];
var velY=0,onGround=false,canDoubleJump=true,dashTimer=0,wallRunTimer=0;
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;resetState();buildPlayer();buildLevel();buildHUD();st='ready';E.emit('gameReady',{name:'Skyward Run'});}
function resetState(){score=0;health=3;coins=0;playTime=0;platforms=[];collectibles=[];enemies=[];velY=0;onGround=false;canDoubleJump=true;dashTimer=0;wallRunTimer=0;}
function buildPlayer(){var group=new THREE.Group();var body=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.6,0.3),new THREE.MeshStandardMaterial({color:0x44aaff}));body.position.y=0.7;body.castShadow=true;group.add(body);var head=new THREE.Mesh(new THREE.SphereGeometry(0.15,6,6),new THREE.MeshStandardMaterial({color:0xddbb88}));head.position.set(0,1.1,0);group.add(head);group.position.set(0,0.5,0);E.scene.add(group);player={group:group,yaw:0,speed:8,jumpForce:10,sprinting:false};camPivot=new THREE.Object3D();E.scene.add(camPivot);}
var camPivot;
function updateCamera(dt){if(!player)return;var behind=new THREE.Vector3(0,4,7);var rotated=new THREE.Vector3(behind.x*Math.cos(player.yaw)-behind.z*Math.sin(player.yaw),behind.y,behind.x*Math.sin(player.yaw)+behind.z*Math.cos(player.yaw));var target=player.group.position.clone().add(rotated);E.camera.position.lerp(target,4*dt);E.camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,1,0)));}
function buildLevel(){if(level)E.scene.remove(level);level=new THREE.Group();
// Ground
var ground=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0x1a2a3a,roughness:0.9}));ground.rotation.x=-Math.PI/2;ground.position.y=-0.05;ground.receiveShadow=true;level.add(ground);
// Platforms
var platMat=new THREE.MeshStandardMaterial({color:0x44aaff,emissive:0x44aaff,emissiveIntensity:0.2});
var pos=[/* Ring 1 */[0,1,0],[3,2,-3],[-3,2,4],[5,1,-5],[-5,1,6],[2,3,-7],[-4,2,8],
/* Ring 2 */[8,2,0],[-8,1,2],[10,3,-4],[-10,2,-6],[12,1,8],[-12,2,-8],[0,4,12],
/* Ring 3 */[-14,3,5],[14,2,-5],[16,4,0],[-16,3,-2],[18,2,6],[-18,4,-6],[0,5,-15]];
for(var i=0;i<pos.length;i++){var p=pos[i];var plat=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.2,2.5),platMat);plat.position.set(p[0],p[1]+0.1,p[2]);plat.receiveShadow=true;level.add(plat);platforms.push(plat);
// Collectible above platform
var col=new THREE.Mesh(new THREE.SphereGeometry(0.15,6,6),new THREE.MeshBasicMaterial({color:0xffdd00}));col.position.set(p[0],p[1]+1,p[2]);col.userData={collected:false};level.add(col);collectibles.push(col);}
// Moving platforms
var moveMat=new THREE.MeshStandardMaterial({color:0xff8844,emissive:0xff8844,emissiveIntensity:0.1});
var movingPos=[[6,1.5,10,-2,0,0,3],[-7,1.5,-10,3,0,0,3],[10,2,-8,0,0,-3,2]];
for(var mi=0;mi<movingPos.length;mi++){var mp=movingPos[mi];var mplat=new THREE.Mesh(new THREE.BoxGeometry(2,0.2,2),moveMat);mplat.position.set(mp[0],mp[1],mp[2]);mplat.userData={startX:mp[0],startZ:mp[2],endX:mp[0]+mp[3],endZ:mp[2]+mp[5],speed:mp[6],phase:mi};level.add(mplat);platforms.push(mplat);}
E.scene.add(level);}
function buildHUD(){E.createHUD('<div id="sp-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;">SKYWARD RUN</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:13px;">⭐ <span id="sp-coins">0</span></div>'+
'<div style="position:absolute;top:15px;right:20px;text-align:right;font-size:12px;">SCORE: <span id="sp-score">0</span><br>HP: <span id="sp-hp">❤❤❤</span></div>'+
'<div style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:16px;color:#ffdd00;opacity:0;" id="sp-msg"></div>'+
'<div id="sp-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#44aaff;text-shadow:0 0 20px rgba(68,170,255,0.5);">SKYWARD RUN</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">WASD move · SPACE/Click jump · SHIFT dash</div>'+
'<div id="sp-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#44aaff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO START</div></div></div>');}
function updateHUD(){document.getElementById('sp-coins').textContent=coins;document.getElementById('sp-score').textContent=score;document.getElementById('sp-hp').textContent='❤'.repeat(Math.max(0,health));if(st==='ready'){var btn=document.getElementById('sp-start');var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('sp-ready').style.display='none';}updateHUD();return;}
playTime+=dt;if(!player||health<=0){updateHUD();if(input.action){health=3;coins=0;score=0;}return;}
var dx=0,dz=0;if(input.left)dx-=1;if(input.right)dx+=1;if(input.up)dz-=1;if(input.down)dz+=1;if(dx!==0&&dz!==0){dx*=0.707;dz*=0.707;}
var wdx=dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw);var wdz=dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw);
var sprint=input.keys['ShiftLeft']||input.keys['ShiftRight'];
var speed=player.speed*(sprint?1.6:1);
// Gravity
velY-=20*dt;if(!onGround)player.group.position.y+=velY*dt;
// Ground check
onGround=false;if(player.group.position.y<=0.5){player.group.position.y=0.5;velY=0;onGround=true;canDoubleJump=true;}
// Platform collision
for(var i=0;i<platforms.length;i++){var plat=platforms[i];var dxp=player.group.position.x-plat.position.x;var dzp=player.group.position.z-plat.position.z;var dist=Math.sqrt(dxp*dxp+dzp*dzp);if(dist<1.2&&Math.abs(player.group.position.y-plat.position.y-0.5)<0.6&&velY<0){player.group.position.y=plat.position.y+0.6;velY=0;onGround=true;canDoubleJump=true;}}
// Jump
if((input.keysPressed['Space']||input.action)&&(onGround||canDoubleJump)){if(!onGround)canDoubleJump=false;velY=player.jumpForce;onGround=false;E.playBeep(600,0.08,'sine',0.1);}
// Dash
if(input.keysPressed['KeyF']&&dashTimer<=0){dashTimer=0.5;var dashDir=new THREE.Vector3(wdx,0,wdz);if(dashDir.length()<0.1)dashDir.set(0,0,-1);dashDir.applyQuaternion(E.camera.quaternion);player.group.position.x+=dashDir.x*5;player.group.position.z+=dashDir.z*5;E.playBeep(800,0.1,'sine',0.15);}
if(dashTimer>0)dashTimer-=dt;
// Movement
player.group.position.x+=wdx*speed*dt;player.group.position.z+=wdz*speed*dt;
if(dx!==0||dz!==0)player.group.rotation.y=Math.atan2(wdx,wdz);
// Bounds
player.group.position.x=Math.max(-18,Math.min(18,player.group.position.x));
player.group.position.z=Math.max(-18,Math.min(18,player.group.position.z));
if(player.group.position.y<-10){health=0;}
// Moving platforms
for(var mi=0;mi<platforms.length;mi++){var p=platforms[mi];if(p.userData&&p.userData.startX!==undefined){p.position.x=p.userData.startX+Math.sin(playTime*p.userData.speed+p.userData.phase)*3;p.position.z=p.userData.startZ+Math.cos(playTime*p.userData.speed+p.userData.phase)*3;}}
// Collectibles
for(var ci=collectibles.length-1;ci>=0;ci--){var col=collectibles[ci];if(col.userData.collected)continue;var d=player.group.position.distanceTo(col.position);if(d<1.2){col.userData.collected=true;col.visible=false;coins++;score+=100;E.playBeep(1000,0.15,'sine',0.2);}}
// Mouse
if(input.pointerLocked)player.yaw-=input.mouseDeltaX*0.003;
updateCamera(dt);updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(player&&player.group)E.scene.remove(player.group);if(camPivot)E.scene.remove(camPivot);if(level)E.scene.remove(level);platforms=[];collectibles=[];enemies=[];player=null;E=null;THREE=null;}
window.SkywardRun={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Skyward Run',description:'3D Platformer — Parkour, collect, and reach new heights',genre:'platformer'};
console.log('[SkywardRun] Loaded. Reach the sky!');
})();
