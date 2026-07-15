/**
 * Beat Cascade — 3D Rhythm Game
 * Notes fly toward you. Hit them in time with the beat.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,combo=0,maxCombo=0,playTime=0,health=100;var player,stage,notes=[],lanes=[],hud=null;
var beatInterval=0.5,nextBeat=2,noteSpeed=6;var LANE_COLORS=[0xff4444,0x44ff44,0x4488ff,0xffaa00];
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildStage();buildHUD();st='ready';E.emit('gameReady',{name:'Beat Cascade'});}
function reset(){score=0;combo=0;maxCombo=0;playTime=0;health=100;notes=[];beatInterval=0.5;nextBeat=2;noteSpeed=6;}
function buildStage(){if(stage)E.scene.remove(stage);stage=new THREE.Group();
var floor=new THREE.Mesh(new THREE.PlaneGeometry(20,40),new THREE.MeshStandardMaterial({color:0x0a0a1a,roughness:0.5,metalness:0.5}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-0.5,10);floor.receiveShadow=true;stage.add(floor);
for(var i=0;i<4;i++){var laneMat=new THREE.MeshStandardMaterial({color:LANE_COLORS[i],transparent:true,opacity:0.2,emissive:LANE_COLORS[i],emissiveIntensity:0.1});var lane=new THREE.Mesh(new THREE.PlaneGeometry(3,40),laneMat);lane.rotation.x=-Math.PI/2;lane.position.set(i*3.5-5.25,-0.45,10);stage.add(lane);
var wallMat=new THREE.MeshStandardMaterial({color:LANE_COLORS[i],emissive:LANE_COLORS[i],emissiveIntensity:0.3});var wall=new THREE.Mesh(new THREE.BoxGeometry(0.1,1,0.5),wallMat);wall.position.set(i*3.5-5.25,-0.2,0);stage.add(wall);}
E.scene.add(stage);}
function buildHUD(){hud=E.createHUD('<div id="bc-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#ff66aa;">BEAT CASCADE</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:13px;">SCORE: <span id="bc-score">0</span></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;text-align:right;">COMBO: <span id="bc-combo">0</span>x<br>MAX: <span id="bc-maxcombo">0</span></div>'+
'<div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:10px;">'+
'<div style="width:12px;height:12px;background:#ff4444;border-radius:50%;" class="lane-btn"></div>'+
'<div style="width:12px;height:12px;background:#44ff44;border-radius:50%;" class="lane-btn"></div>'+
'<div style="width:12px;height:12px;background:#4488ff;border-radius:50%;" class="lane-btn"></div>'+
'<div style="width:12px;height:12px;background:#ffaa00;border-radius:50%;" class="lane-btn"></div></div>'+
'<div id="bc-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#ff66aa;text-shadow:0 0 20px rgba(255,102,170,0.5);">BEAT CASCADE</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">Press 1-4 when notes reach the line · Follow the beat!</div>'+
'<div id="bc-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ff66aa;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO START</div></div>'+
'<div id="bc-msg" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#ffdd00;opacity:0;"></div></div>');}
function msg(t,d){var el=document.getElementById('bc-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function spawnNote(){var lane=Math.floor(Math.random()*4);var dir=Math.random()>0.5?1:-1;var noteMat=new THREE.MeshStandardMaterial({color:LANE_COLORS[lane],emissive:LANE_COLORS[lane],emissiveIntensity:0.5});var note=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.3,0.3),noteMat);note.position.set(lane*3.5-5.25,0,15);note.userData={lane:lane,speed:noteSpeed,targetZ:0,hit:false};E.scene.add(note);notes.push(note);}
function hitNote(lane){var best=null,bestDist=100;for(var i=0;i<notes.length;i++){var n=notes[i];if(n.userData.hit)continue;if(n.userData.lane!==lane)continue;var dist=Math.abs(n.position.z-n.userData.targetZ);if(dist<bestDist){bestDist=dist;best=n;}}
if(best&&bestDist<2){best.userData.hit=true;if(bestDist<0.3){score+=300;combo++;E.playBeep(800+combo*10,0.1,'sine',0.15);msg('PERFECT!',500);}else if(bestDist<0.8){score+=200;combo++;E.playBeep(600,0.1,'sine',0.1);msg('GOOD',400);}else if(bestDist<1.5){score+=100;combo=0;E.playBeep(400,0.1,'square',0.08);msg('OK',300);}else{combo=0;}
if(combo>maxCombo)maxCombo=combo;
best.scale.set(1.5,1.5,1.5);var nn=best;setTimeout(function(){E.scene.remove(nn);},200);
var idx=notes.indexOf(best);if(idx>-1)notes.splice(idx,1);}else{combo=0;E.playBeep(100,0.1,'sawtooth',0.1);}}
function updateHUD(){document.getElementById('bc-score').textContent=score;document.getElementById('bc-combo').textContent=combo;document.getElementById('bc-maxcombo').textContent=maxCombo;if(st==='ready'){var btn=document.getElementById('bc-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('bc-ready').style.display='none';}updateHUD();return;}
playTime+=dt;
if(nextBeat<=0){spawnNote();nextBeat=beatInterval*2;}
nextBeat-=dt;
var keys=['Digit1','Digit2','Digit3','Digit4'];for(var ki=0;ki<keys.length;ki++){if(input.keysPressed[keys[ki]]){hitNote(ki);}}
for(var ni=notes.length-1;ni>=0;ni--){var n=notes[ni];n.position.z-=n.userData.speed*dt;
if(n.position.z<-5){if(!n.userData.hit){combo=0;}E.scene.remove(n);notes.splice(ni,1);}
var p=1-Math.abs(n.position.z-n.userData.targetZ)/15;n.material.emissiveIntensity=0.3+p*0.5;}
// Camera bob
var bob=Math.sin(playTime*8)*0.02;E.camera.position.set(0,2+bob,6);E.camera.lookAt(0,0,2);
updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(stage)E.scene.remove(stage);for(var i=0;i<notes.length;i++)E.scene.remove(notes[i]);notes=[];E=null;THREE=null;}
window.BeatCascade={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Beat Cascade',description:'3D Rhythm — Hit notes in time with the beat',genre:'rhythm'};
console.log('[BeatCascade] Loaded. Feel the beat!');
})();