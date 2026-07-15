/**
 * Deep Waters — 3D Fishing Game
 * Cast your line, wait for a bite, reel it in. Relaxing lake fishing.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,fishCaught=0,playTime=0,day=1;var lake,boat,player,bobber,fish=[],waterRipples=[],hud=null;
var castPower=0,lineActive=false,fishTimer=0,reeling=false,hasFish=false;
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildLake();buildPlayer();buildHUD();st='ready';E.emit('gameReady',{name:'Deep Waters'});}
function reset(){score=0;fishCaught=0;playTime=0;day=1;castPower=0;lineActive=false;fishTimer=0;reeling=false;hasFish=false;fish=[];}
function buildLake(){if(lake)E.scene.remove(lake);lake=new THREE.Group();
var waterMat=new THREE.MeshStandardMaterial({color:0x2266aa,roughness:0.2,metalness:0.3});var water=new THREE.Mesh(new THREE.CylinderGeometry(25,25,0.2,32),waterMat);water.position.y=-0.1;water.receiveShadow=true;lake.add(water);
var shoreMat=new THREE.MeshStandardMaterial({color:0x447744,roughness:0.9});for(var i=0;i<32;i++){var a=i/32*Math.PI*2;var sx=Math.cos(a)*25,sz=Math.sin(a)*25;var shore=new THREE.Mesh(new THREE.BoxGeometry(2,0.2,2),shoreMat);shore.position.set(sx,0,sz);lake.add(shore);}
for(var ti=0;ti<20;ti++){var ta=Math.random()*Math.PI*2;var td=26+Math.random()*5;var trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.12,1,4),new THREE.MeshStandardMaterial({color:0x4a3520}));trunk.position.set(Math.cos(ta)*td,0.5,Math.sin(ta)*td);lake.add(trunk);var leaf=new THREE.Mesh(new THREE.SphereGeometry(0.4,4,4),new THREE.MeshStandardMaterial({color:0x2a7a2a}));leaf.position.set(Math.cos(ta)*td,1.3,Math.sin(ta)*td);lake.add(leaf);}
var sun=new THREE.DirectionalLight(0xffeedd,0.8);sun.position.set(10,20,10);lake.add(sun);lake.add(new THREE.AmbientLight(0x446688,0.5));
E.scene.add(lake);}
function buildPlayer(){var group=new THREE.Group();var body=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.5,0.2),new THREE.MeshStandardMaterial({color:0x4488aa}));body.position.y=0.4;group.add(body);group.position.set(0,0.4,22);E.scene.add(group);player=group;
bobber=new THREE.Mesh(new THREE.SphereGeometry(0.06,6,6),new THREE.MeshBasicMaterial({color:0xff4400}));bobber.visible=false;E.scene.add(bobber);}
function buildHUD(){hud=E.createHUD('<div id="dw-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#44aaff;">DEEP WATERS</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:13px;">DAY <span id="dw-day">1</span> | FISH: <span id="dw-fish">0</span></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;text-align:right;">SCORE: <span id="dw-score">0</span></div>'+
'<div style="position:absolute;bottom:60px;left:50%;transform:translateX(-50%);text-align:center;font-size:11px;color:#88aacc;">Click to cast · Click again when fish bites · REEL IT!</div>'+
'<div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);width:200px;height:4px;background:#333;border-radius:2px;"><div id="dw-cast" style="width:0%;height:100%;background:linear-gradient(90deg,#44ff44,#ffaa00,#ff4444);border-radius:2px;"></div></div>'+
'<div id="dw-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#44aaff;text-shadow:0 0 20px rgba(68,170,255,0.5);">DEEP WATERS</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">Cast your line. Wait for a bite. Reel in the catch!</div>'+
'<div id="dw-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#44aaff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO FISH</div></div>'+
'<div id="dw-msg" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ffdd00;opacity:0;"></div></div>');}
function msg(t,d){var el=document.getElementById('dw-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function updateHUD(){document.getElementById('dw-day').textContent=day;document.getElementById('dw-fish').textContent=fishCaught;document.getElementById('dw-score').textContent=score;document.getElementById('dw-cast').style.width=castPower*100+'%';if(st==='ready'){var btn=document.getElementById('dw-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('dw-ready').style.display='none';msg('Cast your line!',2000);}updateHUD();return;}
playTime+=dt;if(!player||!bobber)return;
if(playTime>30){day++;playTime=0;msg('Day '+day+'!',2000);}
if(!lineActive){if(input.shoot){castPower=Math.min(1,castPower+dt*1.2);}else if(castPower>0){lineActive=true;var dir=new THREE.Vector3(0,0,-1);dir.applyEuler(new THREE.Euler(0,0.3,0));var castPos=player.position.clone().add(dir.multiplyScalar(3+castPower*15));castPos.y=0.2;bobber.position.copy(castPos);bobber.visible=true;castPower=0;E.playBeep(500,0.08,'sine',0.1);fishTimer=2+Math.random()*5;}}else{bobber.position.y=0.15+Math.sin(playTime*3+Date.now())*0.02;
fishTimer-=dt;if(fishTimer<=0&&!reeling){hasFish=true;reeling=true;E.shakeScreen(0.08);msg('Fish on the line! Click rapidly!',1500);E.playBeep(300,0.1,'sawtooth',0.08);}
if(reeling&&input.action){reeling=false;hasFish=false;fishCaught++;score+=50+Math.floor(Math.random()*50);lineActive=false;bobber.visible=false;E.burstParticles(bobber.position,0x44aaff,10,2);msg('Fish caught! +'+score,2000);E.playBeep(800,0.15,'sine',0.15);setTimeout(function(){if(!lineActive)msg('Cast again!',1000);},500);}
if(reeling&&!input.action){var progress=Math.sin(Date.now()*0.01)*0.5+0.5;if(progress>0.8){reeling=false;hasFish=false;msg('Fish got away!',1000);lineActive=false;bobber.visible=false;}}
if(input.keysPressed['KeyE']&&lineActive){lineActive=false;bobber.visible=false;msg('Line retrieved.',1000);}}
// Water ripples
if(Math.random()<0.02){var r=new THREE.Mesh(new THREE.RingGeometry(0.1,0.2,8),new THREE.MeshBasicMaterial({color:0x88ccff,transparent:true,opacity:0.3}));r.position.set((Math.random()-0.5)*40,0.01,(Math.random()-0.5)*40);r.rotation.x=-Math.PI/2;E.scene.add(r);waterRipples.push(r);}
for(var ri=waterRipples.length-1;ri>=0;ri--){var r=waterRipples[ri];r.scale.multiplyScalar(1.05);r.material.opacity*=0.95;if(r.material.opacity<0.01){E.scene.remove(r);waterRipples.splice(ri,1);}}
E.camera.position.set(0,4,27);E.camera.lookAt(0,0,0);
updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(lake)E.scene.remove(lake);if(player)E.scene.remove(player);if(bobber)E.scene.remove(bobber);for(var i=0;i<waterRipples.length;i++)E.scene.remove(waterRipples[i]);player=null;bobber=null;waterRipples=[];E=null;THREE=null;}
window.DeepWaters={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Deep Waters',description:'3D Fishing — Relaxing lakeside fishing with day cycle',genre:'fishing'};
console.log('[DeepWaters] Loaded. Cast your line!');
})();