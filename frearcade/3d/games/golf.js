/**
 * Fairway King — 3D Golf Game
 * Drive, approach, putt. Wind, terrain, club selection.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,par=3,hole=1,strokes=0,playTime=0;var player,ball,holeObj,terrain,hazards=[],trees=[],hud=null;
var ballPos=null,aimAngle=0,power=0,ballVel=null,ballActive=false,club='Driver';
var course=[[0,0,-20,3],[5,0,15,4],[-3,2,35,3],[2,1,55,5],[-4,-1,75,4]];
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildHole();buildHUD();st='ready';E.emit('gameReady',{name:'Fairway King'});}
function reset(){score=0;hole=1;strokes=0;playTime=0;ballPos=null;aimAngle=0;power=0;ballVel=null;ballActive=false;hazards=[];trees=[];club='Driver';if(ball){E.scene.remove(ball);ball=null;}if(holeObj){E.scene.remove(holeObj);holeObj=null;}if(terrain){E.scene.remove(terrain);terrain=null;}}
function buildHole(){if(terrain)E.scene.remove(terrain);terrain=new THREE.Group();
var h=course[Math.min(hole-1,course.length-1)];par=h[3];var hx=h[0],hz=h[2];
var groundMat=new THREE.MeshStandardMaterial({color:0x44aa44,roughness:0.8});var ground=new THREE.Mesh(new THREE.PlaneGeometry(40,80),groundMat);ground.rotation.x=-Math.PI/2;ground.position.set(0,-0.05,0);ground.receiveShadow=true;terrain.add(ground);
// Tee
var teeMat=new THREE.MeshStandardMaterial({color:0xffffff});var tee=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.4,0.05,8),teeMat);tee.position.set(0,0.02,-25);terrain.add(tee);
// Hole
holeObj=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.1,8),new THREE.MeshBasicMaterial({color:0x000000}));holeObj.position.set(hx,0,hz);terrain.add(holeObj);
var flagMat=new THREE.MeshStandardMaterial({color:0xff4444});var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,1,4),new THREE.MeshStandardMaterial({color:0xcccccc}));pole.position.set(hx,0.5,hz);terrain.add(pole);var flag=new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.2),flagMat);flag.position.set(hx+0.15,0.8,hz);terrain.add(flag);
// Trees
for(var i=0;i<12;i++){var ta=Math.random()*Math.PI*2;var td=8+Math.random()*10;var trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.1,1,4),new THREE.MeshStandardMaterial({color:0x4a3520}));trunk.position.set(Math.cos(ta)*td,0.5,Math.sin(ta)*td);terrain.add(trunk);var leaf=new THREE.Mesh(new THREE.SphereGeometry(0.5,4,4),new THREE.MeshStandardMaterial({color:0x2a7a2a}));leaf.position.set(Math.cos(ta)*td,1.3,Math.sin(ta)*td);terrain.add(leaf);trees.push({trunk:trunk,leaf:leaf,pos:new THREE.Vector3(Math.cos(ta)*td,0,Math.sin(ta)*td)});}
// Hazards (water)
for(var w=0;w<2;w++){var wx=6-Math.random()*12,wz=10+Math.random()*20;var water=new THREE.Mesh(new THREE.CircleGeometry(1+Math.random()*2,8),new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:0.6}));water.rotation.x=-Math.PI/2;water.position.set(wx,0.01,wz);terrain.add(water);hazards.push({pos:new THREE.Vector3(wx,0,wz),radius:1+Math.random()*2});}
E.scene.add(terrain);
// Ball
var ballMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.3});ball=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,8),ballMat);ball.position.set(0,0.1,-25);ball.castShadow=true;E.scene.add(ball);ballPos=ball.position.clone();ballVel=new THREE.Vector3(0,0,0);ballActive=false;
E.camera.position.set(0,3,-28);E.camera.lookAt(0,0,-20);}
function buildHUD(){hud=E.createHUD('<div id="fk-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#44cc44;">FAIRWAY KING</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:13px;">HOLE: <span id="fk-hole">1</span> | PAR: <span id="fk-par">3</span></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;text-align:right;">STROKES: <span id="fk-strokes">0</span> | SCORE: <span id="fk-score">0</span></div>'+
'<div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);text-align:center;">'+
'<div style="font-size:11px;color:#888;">Hold click to charge power · Release to swing</div>'+
'<div style="width:200px;height:6px;background:#333;border-radius:3px;margin-top:4px;"><div id="fk-power" style="width:0%;height:100%;background:linear-gradient(90deg,#44ff44,#ffaa00,#ff4444);border-radius:3px;"></div></div></div>'+
'<div id="fk-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#44cc44;text-shadow:0 0 20px rgba(68,204,68,0.5);">FAIRWAY KING</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">Aim with mouse · Hold click for power · Release to swing</div>'+
'<div id="fk-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#44cc44;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO TEE OFF</div></div>'+
'<div id="fk-msg" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:16px;color:#ffdd00;opacity:0;"></div></div>');}
function msg(t,d){var el=document.getElementById('fk-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function updateHUD(){document.getElementById('fk-hole').textContent=hole;document.getElementById('fk-par').textContent=par;document.getElementById('fk-strokes').textContent=strokes;document.getElementById('fk-score').textContent=score;document.getElementById('fk-power').style.width=Math.round(power*100)+'%';if(st==='ready'){var btn=document.getElementById('fk-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('fk-ready').style.display='none';}updateHUD();return;}
playTime+=dt;if(!ball||!holeObj)return;
if(!ballActive){aimAngle+=input.mouseDeltaX*0.01;
if(input.shoot){power=Math.min(1,power+dt*1.5);}else if(power>0){ballActive=true;var dir=new THREE.Vector3(0,0,-1);var euler=new THREE.Euler(0,aimAngle,0);dir.applyEuler(euler);dir.y=0.2*power;ballVel=new THREE.Vector3(dir.x*power*20,dir.y*power*15,dir.z*power*20);strokes++;E.playBeep(400+power*200,0.1,'sine',0.12);power=0;}}else{ball.position.x+=ballVel.x*dt;ball.position.y+=ballVel.y*dt;ball.position.z+=ballVel.z*dt;
ballVel.x*=0.98;ballVel.z*=0.98;ballVel.y-=9.8*dt;
if(ball.position.y<=0.1){ball.position.y=0.1;ballVel.x*=0.85;ballVel.z*=0.85;if(ballVel.y<-0.5)ballVel.y=-ballVel.y*0.3;else ballVel.y=0;}
if(Math.abs(ballVel.x)<0.01&&Math.abs(ballVel.z)<0.01&&Math.abs(ballVel.y)<0.01){ballActive=false;ballPos=ball.position.clone();
var hDist=ball.position.distanceTo(holeObj.position);if(hDist<0.3){E.burstParticles(holeObj.position,0xffff44,15,2);E.shakeScreen(0.08);msg('Hole in '+(strokes===1?'ONE!':'par!'),2000);score+=strokes===1?300:100-par*10;hole++;strokes=0;if(hole>course.length){msg('Tournament complete! Score: '+score,5000);st='ready';setTimeout(function(){if(E)init(E);},3000);}else{setTimeout(function(){if(E)init(E);},1000);}}
for(var hi=0;hi<hazards.length;hi++){var haz=hazards[hi];if(ball.position.distanceTo(haz.pos)<haz.radius){E.shakeScreen(0.12);msg('Water hazard! +1 stroke',1500);strokes++;ball.position.set(0,0.1,-25);ballVel.set(0,0,0);ballActive=false;break;}}}}
// Camera
var camTarget=ballActive?ball.position:ballPos;E.camera.position.lerp(new THREE.Vector3(camTarget.x+Math.sin(aimAngle)*5,3,camTarget.z+Math.cos(aimAngle)*5),3*dt);E.camera.lookAt(camTarget);
updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(terrain)E.scene.remove(terrain);if(ball)E.scene.remove(ball);if(holeObj)E.scene.remove(holeObj);ball=null;holeObj=null;E=null;THREE=null;}
window.FairwayKing={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Fairway King',description:'3D Golf — Drive, approach, putt across scenic holes',genre:'golf'};
console.log('[FairwayKing] Loaded. Tee off!');
})();