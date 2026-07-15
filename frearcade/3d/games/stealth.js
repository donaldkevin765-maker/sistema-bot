/**
 * Shadow Ops — 3D Stealth Game
 * Infiltrate enemy bases. Avoid detection. Use shadows and noise.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,detection=0,health=3,tools=3,playTime=0;var player,base,enemies=[],cameras=[],guards=[];var hud=null,alertTimer=0;
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildBase();buildPlayer();buildHUD();spawnGuards();st='ready';E.emit('gameReady',{name:'Shadow Ops'});}
function reset(){score=0;detection=0;health=3;tools=3;playTime=0;enemies=[];cameras=[];guards=[];alertTimer=0;}
function buildBase(){if(base)E.scene.remove(base);base=new THREE.Group();
var floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0x1a1a2e,roughness:0.8}));floor.rotation.x=-Math.PI/2;floor.position.y=-0.05;floor.receiveShadow=true;base.add(floor);
var wallMat=new THREE.MeshStandardMaterial({color:0x2a2a4a,roughness:0.7,metalness:0.3});
// Outer walls
var w=-19;for(var wi=0;wi<4;wi++){var wpos=[[0,2,w],[0,2,-w],[w,2,0],[-w,2,0]][wi];var wrot=[0,0,Math.PI/2,Math.PI/2][wi];var wl=new THREE.Mesh(new THREE.BoxGeometry(wi<2?40:40,4,1),wallMat);wl.position.set(wpos[0],wpos[1],wpos[2]);wl.rotation.y=wrot;wl.castShadow=true;base.add(wl);}
// Interior rooms
var roomMat=new THREE.MeshStandardMaterial({color:0x333355,roughness:0.6});
var rooms=[[-4,0,-4,4,2.5,4],[-10,0,4,4,2.5,4],[8,0,-6,4,2.5,4],[12,0,8,3,2.5,3],[-12,0,-8,3,2.5,3]];
for(var ri=0;ri<rooms.length;ri++){var r=rooms[ri];for(var ww=0;ww<4;ww++){var wx=r[0]+(ww==1?r[3]/2:0)-(ww==3?r[3]/2:0);var wz=r[2]+(ww==0?r[5]/2:0)-(ww==2?r[5]/2:0);var rw=new THREE.Mesh(new THREE.BoxGeometry(ww<2?r[3]+1:0.2,r[4],ww>=2?r[5]+1:0.2),roomMat);rw.position.set(wx,r[4]/2,wz);base.add(rw);}}
// Security lights
var spotMat=new THREE.MeshBasicMaterial({color:0xffff88,transparent:true,opacity:0.1});
for(var li=0;li<8;li++){var la=li/8*Math.PI*2;var lr=10+Math.random()*5;var spot=new THREE.Mesh(new THREE.ConeGeometry(0.3,0.1,6),new THREE.MeshBasicMaterial({color:0xffff44}));spot.position.set(Math.cos(la)*lr,3.5,Math.sin(la)*lr);base.add(spot);var cone=new THREE.Mesh(new THREE.ConeGeometry(1.5,3,8),spotMat);cone.position.set(Math.cos(la)*lr,1.5,Math.sin(la)*lr);cone.rotation.x=Math.PI;cone.userData={angle:la,sweep:0.5,dir:1};base.add(cone);cameras.push(cone);}
// Vault (objective)
var vaultMat=new THREE.MeshStandardMaterial({color:0x44ff88,emissive:0x44ff88,emissiveIntensity:0.3,metalness:0.8});var vault=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.5,1.5),vaultMat);vault.position.set(0,0.75,0);base.add(vault);
E.scene.add(base);}
function buildPlayer(){var group=new THREE.Group();var body=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.7,0.3),new THREE.MeshStandardMaterial({color:0x222244}));body.position.y=0.7;body.castShadow=true;group.add(body);var head=new THREE.Mesh(new THREE.SphereGeometry(0.14,6,6),new THREE.MeshStandardMaterial({color:0x222222}));head.position.set(0,1.15,0);group.add(head);group.position.set(-14,0.5,10);E.scene.add(group);player={group:group,yaw:0,speed:4,crouching:false};camPivot=new THREE.Object3D();E.scene.add(camPivot);}
var camPivot;
function updateCamera(dt){if(!player)return;var h=player.crouching?2:4;var behind=new THREE.Vector3(0,h,5+player.crouching*2);var rotated=new THREE.Vector3(behind.x*Math.cos(player.yaw)-behind.z*Math.sin(player.yaw),behind.y,behind.x*Math.sin(player.yaw)+behind.z*Math.cos(player.yaw));var target=player.group.position.clone().add(rotated);E.camera.position.lerp(target,3*dt);E.camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,0.8,0)));}
function spawnGuards(){var colors=[0xff4444,0xff6600,0xff4488,0xffaa00,0xff2222];var pathPts=[[-8,0,-4,8,0,-4],[-4,0,6,4,0,6],[-6,0,-8,6,0,-8],[10,0,4,10,0,-6],[-12,0,4,-12,0,-6]];for(var i=0;i<5;i++){var g=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.9,0.4),new THREE.MeshStandardMaterial({color:colors[i]}));g.position.set(pathPts[i][0],0.5,pathPts[i][2]);g.castShadow=true;g.userData={hp:100,state:'patrol',path:pathPts[i],targetIdx:0,timer:Math.random()*2,detectRange:5,viewAngle:1,speed:2};E.scene.add(g);guards.push(g);}}
function buildHUD(){hud=E.createHUD('<div id="sh-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;bottom:20px;left:20px;">DETECTION: <span id="sh-det">0</span>%'+
'<div style="width:120px;height:6px;background:rgba(0,0,0,0.5);border-radius:3px;overflow:hidden;"><div id="sh-det-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#44ff44,#ffaa00,#ff4444);border-radius:3px;"></div></div></div>'+
'<div style="position:absolute;bottom:20px;right:20px;text-align:right;font-size:11px;">TOOLS: <span id="sh-tools">3</span><br>SCORE: <span id="sh-score">0</span></div>'+
'<div id="sh-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#444;text-shadow:0 0 20px rgba(68,68,68,0.5);">SHADOW OPS</div>'+
'<div style="font-size:14px;color:#88aacc;margin-top:10px;">WASD move · C crouch · E disable · Stay in shadows!</div>'+
'<div id="sh-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#4466ff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO INFILTRATE</div></div>'+
'<div id="sh-msg" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ffdd00;opacity:0;"></div></div>');}
function msg(t,d){var el=document.getElementById('sh-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function updateHUD(){document.getElementById('sh-det').textContent=Math.round(detection);document.getElementById('sh-det-fill').style.width=Math.min(100,detection)+'%';document.getElementById('sh-tools').textContent=tools;document.getElementById('sh-score').textContent=score;if(st==='ready'){var btn=document.getElementById('sh-start');var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('sh-ready').style.display='none';msg('Infiltrate the base. Avoid detection. Reach the vault.',3000);}updateHUD();return;}
playTime+=dt;if(!player)return;
var speedMult=player.crouching?0.4:1;var dx=0,dz=0;if(input.left)dx-=1;if(input.right)dx+=1;if(input.up)dz-=1;if(input.down)dz+=1;if(dx!==0&&dz!==0){dx*=0.707;dz*=0.707;}
var wdx=dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw);var wdz=dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw);
player.group.position.x+=wdx*player.speed*speedMult*dt;player.group.position.z+=wdz*player.speed*speedMult*dt;player.group.position.x=Math.max(-18,Math.min(18,player.group.position.x));player.group.position.z=Math.max(-18,Math.min(18,player.group.position.z));
if(dx!==0||dz!==0)player.group.rotation.y=Math.atan2(wdx,wdz);
if(input.keysPressed['KeyC'])player.crouching=!player.crouching;
if(input.pointerLocked)player.yaw-=input.mouseDeltaX*0.003;
// Detection decrease when not seen
if(detection>0)detection-=2*dt;
// Guard AI
for(var gi=0;gi<guards.length;gi++){var g=guards[gi];var path=g.userData.path;var tpx=player.group.position.x;var tpz=player.group.position.z;var gdx=tpx-g.position.x;var gdz=tpz-g.position.z;var dist=Math.sqrt(gdx*gdx+gdz*gdz);
// Patrol
if(g.userData.state==='patrol'){var tx=path[g.userData.targetIdx*3];var tz=path[g.userData.targetIdx*3+2];var pdx=tx-g.position.x;var pdz=tz-g.position.z;var pDist=Math.sqrt(pdx*pdx+pdz*pdz);if(pDist<1){g.userData.targetIdx=(g.userData.targetIdx+1)%2;}var spd=g.userData.speed*dt;g.position.x+=pdx/pDist*spd;g.position.z+=pdz/pDist*spd;g.rotation.y=Math.atan2(pdx,pdz);
// Detect player
if(dist<g.userData.detectRange){var angle=Math.atan2(gdx,gdz)-g.rotation.y;while(angle>Math.PI)angle-=2*Math.PI;while(angle<-Math.PI)angle+=2*Math.PI;if(Math.abs(angle)<g.userData.viewAngle){detection+=12*dt;alertTimer=0.5;g.userData.state='alert';}}}
else if(g.userData.state==='alert'){g.userData.timer-=dt;g.rotation.y=Math.atan2(gdx,gdz);detection+=25*dt;if(g.userData.timer<=0||dist>8){g.userData.state='patrol';g.userData.timer=1+Math.random()*2;}}
// Disable (E key)
if(input.keysPressed['KeyE']&&tools>0&&dist<1.5){g.visible=false;guards.splice(gi,1);tools--;score+=100;E.playBeep(300,0.1,'sawtooth',0.1);msg('Guard disabled!',1500);gi--;}}
// Camera detection
for(var ci=0;ci<cameras.length;ci++){var cam=cameras[ci];var cdx=player.group.position.x-cam.position.x;var cdz=player.group.position.z-cam.position.z;var cDist=Math.sqrt(cdx*cdx+cdz*cdz);if(cDist<4&&player.crouching===false){detection+=8*dt;}}
// Vault reached?
var vDist=Math.sqrt(player.group.position.x*player.group.position.x+player.group.position.z*player.group.position.z);if(vDist<2&&guards.length===0){msg('VAULT SECURED! Mission complete! Score: '+score,5000);st='ready';setTimeout(function(){if(detection<100)score+=500;msg('Bonus: Low detection! +500',2000);},500);}
if(detection>=100){msg('DETECTED! Mission failed.',3000);st='ready';setTimeout(function(){if(E)init(E);},2000);}
updateCamera(dt);updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(player&&player.group)E.scene.remove(player.group);if(camPivot)E.scene.remove(camPivot);if(base)E.scene.remove(base);for(var i=0;i<guards.length;i++)E.scene.remove(guards[i]);guards=[];cameras=[];player=null;E=null;THREE=null;}
window.ShadowOps={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Shadow Ops',description:'3D Stealth — Infiltrate, avoid detection, complete the mission',genre:'stealth'};
console.log('[ShadowOps] Loaded. Stay in the shadows.');
})();
