/**
 * Ring of Fury — 3D Fighting Game
 * Arena combat with combos, blocking, and special moves.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,round=1,playTime=0;var player,opponent,arena,hud=null;
var playerHP=100,opponentHP=100,combo=0;var playerStamina=100,opponentStamina=100;var PUNCH_DMG=8,KICK_DMG=12,SPECIAL_DMG=25;
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildArena();buildFighters();buildHUD();st='ready';E.emit('gameReady',{name:'Ring of Fury'});}
function reset(){score=0;round=1;playTime=0;playerHP=100;opponentHP=100;combo=0;playerStamina=100;opponentStamina=100;}
function buildArena(){if(arena)E.scene.remove(arena);arena=new THREE.Group();
var floor=new THREE.Mesh(new THREE.CylinderGeometry(8,8,0.2,24),new THREE.MeshStandardMaterial({color:0xcc8844,roughness:0.6}));floor.position.y=-0.1;floor.receiveShadow=true;arena.add(floor);
var ringRope=new THREE.Mesh(new THREE.TorusGeometry(7.5,0.08,6,32),new THREE.MeshStandardMaterial({color:0xff4444}));ringRope.rotation.x=Math.PI/2;ringRope.position.y=1;arena.add(ringRope);
var ringRope2=new THREE.Mesh(new THREE.TorusGeometry(7.5,0.06,6,32),new THREE.MeshStandardMaterial({color:0xffffff}));ringRope2.rotation.x=Math.PI/2;ringRope2.position.y=0.5;arena.add(ringRope2);
for(var i=0;i<8;i++){var a=i/8*Math.PI*2;var post=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,1.2,6),new THREE.MeshStandardMaterial({color:0x888888}));post.position.set(Math.cos(a)*7.5,0.6,Math.sin(a)*7.5);arena.add(post);}
var crowdMat=new THREE.MeshStandardMaterial({color:0x222244});for(var ci=0;ci<20;ci++){var ca=ci/20*Math.PI*2+Math.random()*0.2;var cd=8+Math.random()*2;var c=new THREE.Mesh(new THREE.BoxGeometry(0.5,1+Math.random()*0.5,0.5),crowdMat.clone());c.material.color.setHex(0x222244+Math.floor(Math.random()*0x333333));c.position.set(Math.cos(ca)*cd,0.5,Math.sin(ca)*cd);arena.add(c);}
var amb=new THREE.AmbientLight(0x444466,0.5);arena.add(amb);var dir=new THREE.DirectionalLight(0xffffff,0.8);dir.position.set(5,10,5);arena.add(dir);
E.scene.add(arena);}
function buildFighters(){var pMat=new THREE.MeshStandardMaterial({color:0x4488ff});player=new THREE.Group();var pBody=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.3),pMat);pBody.position.y=0.65;player.add(pBody);var pHead=new THREE.Mesh(new THREE.SphereGeometry(0.18,8,8),new THREE.MeshStandardMaterial({color:0xddbb88}));pHead.position.set(0,1.1,0);player.add(pHead);var pArmL=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.4,0.08),pMat);pArmL.position.set(-0.3,0.55,0);player.add(pArmL);var pArmR=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.4,0.08),pMat);pArmR.position.set(0.3,0.55,0);player.add(pArmR);var pLegL=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.4,0.12),new THREE.MeshStandardMaterial({color:0x3355aa}));pLegL.position.set(-0.12,0.25,0);player.add(pLegL);var pLegR=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.4,0.12),new THREE.MeshStandardMaterial({color:0x3355aa}));pLegR.position.set(0.12,0.25,0);player.add(pLegR);player.position.set(0,0.5,3);player.userData={hp:100,stamina:100,armR:pArmR,punchAnim:0,state:'idle'};E.scene.add(player);
var oMat=new THREE.MeshStandardMaterial({color:0xff4444});opponent=new THREE.Group();var oBody=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.3),oMat);oBody.position.y=0.65;opponent.add(oBody);var oHead=new THREE.Mesh(new THREE.SphereGeometry(0.18,8,8),new THREE.MeshStandardMaterial({color:0xaa8866}));oHead.position.set(0,1.1,0);opponent.add(oHead);var oArmL=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.4,0.08),oMat);oArmL.position.set(-0.3,0.55,0);opponent.add(oArmL);var oArmR=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.4,0.08),oMat);oArmR.position.set(0.3,0.55,0);opponent.add(oArmR);var oLegL=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.4,0.12),new THREE.MeshStandardMaterial({color:0xaa3355}));oLegL.position.set(-0.12,0.25,0);opponent.add(oLegL);var oLegR=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.4,0.12),new THREE.MeshStandardMaterial({color:0xaa3355}));oLegR.position.set(0.12,0.25,0);opponent.add(oLegR);opponent.position.set(0,0.5,-3);opponent.rotation.y=Math.PI;opponent.userData={hp:100,stamina:100,armR:oArmR,punchAnim:0,state:'idle',attackTimer:Math.random()*2};E.scene.add(opponent);}
function buildHUD(){hud=E.createHUD('<div id="rf-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#ff8844;">RING OF FURY</div>'+
'<div style="position:absolute;top:15px;left:50%;transform:translateX(-50%);font-size:14px;">ROUND <span id="rf-round">1</span></div>'+
'<div style="position:absolute;top:40px;left:15px;width:45%;"><div style="font-size:10px;color:#88ccff;">PLAYER HP</div><div style="width:100%;height:8px;background:#333;border-radius:4px;"><div id="rf-php" style="width:100%;height:100%;background:linear-gradient(90deg,#44ff44,#ffaa00,#ff4444);border-radius:4px;"></div></div></div>'+
'<div style="position:absolute;top:40px;right:15px;width:45%;"><div style="font-size:10px;color:#ff8888;text-align:right;">OPPONENT HP</div><div style="width:100%;height:8px;background:#333;border-radius:4px;"><div id="rf-ohp" style="width:100%;height:100%;background:linear-gradient(90deg,#ff4444,#ffaa00,#44ff44);border-radius:4px;float:right;"></div></div></div>'+
'<div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-size:11px;color:#888;">Punch:Click · Kick:F · Special:G · Block:Shift</div>'+
'<div id="rf-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#ff8844;text-shadow:0 0 20px rgba(255,136,68,0.5);">RING OF FURY</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">Fight your opponent. 3 rounds. Last one standing wins!</div>'+
'<div id="rf-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ff8844;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO FIGHT</div></div>'+
'<div id="rf-msg" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:22px;color:#ffdd00;opacity:0;"></div></div>');}
function msg(t,d){var el=document.getElementById('rf-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function dealDamage(target,amount){target.userData.hp-=amount;if(target===opponent){score+=amount;combo++;E.playBeep(500+amount*5,0.1,'square',0.12);}else{E.playBeep(200,0.1,'sawtooth',0.1);}}
function updateHUD(){if(!player||!opponent)return;var php=Math.max(0,player.userData.hp);var ohp=Math.max(0,opponent.userData.hp);document.getElementById('rf-php').style.width=php+'%';document.getElementById('rf-ohp').style.width=ohp+'%';document.getElementById('rf-round').textContent=round;if(st==='ready'){var btn=document.getElementById('rf-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('rf-ready').style.display='none';msg('FIGHT!',1500);}updateHUD();return;}
playTime+=dt;if(!player||!opponent)return;
if(player.userData.hp<=0){msg('Round '+round+' lost!',2000);if(round>=3){msg('Match lost! Score: '+score,4000);st='ready';setTimeout(function(){if(E)init(E);},3000);}else{round++;playerHP=100;opponentHP=100;player.userData.hp=100;opponent.userData.hp=100;setTimeout(function(){msg('Round '+round+'! FIGHT!',1500);},500);}return;}
if(opponent.userData.hp<=0){score+=500;if(round>=3){msg('CHAMPION! Score: '+score,4000);st='ready';setTimeout(function(){if(E)init(E);},3000);}else{round++;playerHP=100;opponentHP=100;player.userData.hp=100;opponent.userData.hp=100;setTimeout(function(){msg('Round '+round+'! FIGHT!',1500);},500);}return;}
// Player movement
var dx=0,dz=0;if(input.left)dx-=1;if(input.right)dx+=1;if(input.up)dz-=1;if(input.down)dz+=1;if(dx!==0&&dz!==0){dx*=0.707;dz*=0.707;}
player.position.x+=dx*4*dt;player.position.z+=dz*4*dt;player.position.x=Math.max(-6,Math.min(6,player.position.x));player.position.z=Math.max(-4,Math.min(6,player.position.z));
if(dx!==0||dz!==0){player.rotation.y=Math.atan2(dx,dz);}
// Stamina regen
if(player.userData.stamina<100)player.userData.stamina+=8*dt;
if(opponent.userData.stamina<100)opponent.userData.stamina+=8*dt;
// Player attacks
var blocking=input.keysPressed['ShiftLeft']||input.keysPressed['ShiftRight'];
if(input.action&&player.userData.stamina>10&&!blocking){player.userData.stamina-=10;var dist=player.position.distanceTo(opponent.position);if(dist<2.5){dealDamage(opponent,PUNCH_DMG);msg('Punch!',500);}player.userData.punchAnim=0.3;E.playBeep(400,0.06,'square',0.08);}
if(input.keysPressed['KeyF']&&player.userData.stamina>20&&!blocking){player.userData.stamina-=20;var dist=player.position.distanceTo(opponent.position);if(dist<3){dealDamage(opponent,KICK_DMG);msg('Kick! '+combo+'x combo!',500);}player.userData.punchAnim=0.4;}
if(input.keysPressed['KeyG']&&player.userData.stamina>30&&!blocking){player.userData.stamina-=30;var dist=player.position.distanceTo(opponent.position);if(dist<3.5){dealDamage(opponent,SPECIAL_DMG);msg('SPECIAL! '+combo+'x combo!',800);player.userData.punchAnim=0.5;}}
// Blocking reduces damage
if(blocking){if(player.userData.stamina<100)player.userData.stamina+=5*dt;}
// Animation
if(player.userData.punchAnim>0){player.userData.armR.rotation.x=-Math.PI*player.userData.punchAnim;player.userData.punchAnim-=dt;}else{player.userData.armR.rotation.x=0;}
// Opponent AI
var facePlayer=Math.atan2(player.position.x-opponent.position.x,player.position.z-opponent.position.z);opponent.rotation.y=facePlayer;
opponent.userData.attackTimer-=dt;var oDist=opponent.position.distanceTo(player.position);
if(oDist>2){var odx=player.position.x-opponent.position.x;var odz=player.position.z-opponent.position.z;opponent.position.x+=odx/oDist*2*dt;opponent.position.z+=odz/oDist*2*dt;opponent.position.x=Math.max(-6,Math.min(6,opponent.position.x));opponent.position.z=Math.max(-6,Math.min(4,opponent.position.z));}
if(opponent.userData.attackTimer<=0&&oDist<3&&opponent.userData.stamina>10){opponent.userData.stamina-=10;if(blocking){dealDamage(player,Math.floor(PUNCH_DMG*0.3));}else{dealDamage(player,PUNCH_DMG);}msg(blocking?'Blocked!':'Hit!',500);opponent.userData.attackTimer=0.8+Math.random()*0.5;}
if(oDist<2.5&&opponent.userData.stamina>20&&Math.random()<0.01){opponent.userData.stamina-=20;if(blocking){dealDamage(player,Math.floor(KICK_DMG*0.3));}else{dealDamage(player,KICK_DMG);}msg(blocking?'Blocked kick!':'Kick!',500);}
var oDir=new THREE.Vector3(player.position.x-opponent.position.x,0,player.position.z-opponent.position.z);var oDist2=oDir.length();if(oDist2>2){opponent.position.x+=oDir.x/oDist2*2.5*dt;opponent.position.z+=oDir.z/oDist2*2.5*dt;}
E.camera.position.set(0,4,8);E.camera.lookAt(0,0,0);
updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(arena)E.scene.remove(arena);if(player)E.scene.remove(player);if(opponent)E.scene.remove(opponent);player=null;opponent=null;E=null;THREE=null;}
window.RingOfFury={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Ring of Fury',description:'3D Fighting — Arena combat with combos and special moves',genre:'fighting'};
console.log('[RingOfFury] Loaded. Fight!');
})();