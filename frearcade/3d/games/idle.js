/**
 * Quantum Forge — 3D Idle/Clicker Game
 * Click to generate energy, buy upgrades, watch your empire grow.
 */
(function(){'use strict';var E,THREE;var st='ready',energy=10,score=0,clickPower=1,autoRate=0,playTime=0;var stage,generators=[],particles=[],hud=null;
var upgrades=[{name:'Click Amplifier',cost:50,bonus:1,owned:0,maxOwned:10},{name:'Auto Generator',cost:100,bonus:0.5,owned:0,maxOwned:15},{name:'Quantum Core',cost:500,bonus:5,owned:0,maxOwned:8},{name:'Plasma Forge',cost:2000,bonus:20,owned:0,maxOwned:5}];
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildStage();buildHUD();st='ready';E.emit('gameReady',{name:'Quantum Forge'});}
function reset(){energy=10;score=0;clickPower=1;autoRate=0;playTime=0;generators=[];particles=[];}
function buildStage(){if(stage)E.scene.remove(stage);stage=new THREE.Group();
var floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0x0a0a1a,roughness:0.5,metalness:0.5}));floor.rotation.x=-Math.PI/2;floor.position.y=-0.05;stage.add(floor);
var grid=new THREE.GridHelper(20,10,0x4466ff,0x2244aa);grid.position.y=0.01;stage.add(grid);
var coreMat=new THREE.MeshStandardMaterial({color:0x4488ff,emissive:0x4488ff,emissiveIntensity:0.5,metalness:0.8});var core=new THREE.Mesh(new THREE.OctahedronGeometry(0.8,0),coreMat);core.position.set(0,1,0);core.castShadow=true;core.userData={isCore:true};stage.add(core);
var ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,0.03,8,24),new THREE.MeshStandardMaterial({color:0x88ccff,emissive:0x88ccff,emissiveIntensity:0.3}));ring.position.y=1;stage.add(ring);
E.scene.add(stage);
var dirLight=new THREE.DirectionalLight(0xffffff,0.8);dirLight.position.set(5,10,5);E.scene.add(dirLight);
var ambLight=new THREE.AmbientLight(0x2233aa,0.3);E.scene.add(ambLight);}
function buildHUD(){hud=E.createHUD('<div id="qf-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#88ccff;">⚡ QUANTUM FORGE</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:24px;color:#ffdd44;">⚡ <span id="qf-energy">10</span></div>'+
'<div style="position:absolute;top:80px;left:20px;font-size:11px;color:#888;">SCORE: <span id="qf-score">0</span></div>'+
'<div style="position:absolute;bottom:80px;right:20px;text-align:right;font-size:10px;">'+
'<div>Click Amplifier: <span id="qf-ca-cost">50</span> ⚡ (x<span id="qf-ca-count">0</span>)</div>'+
'<div>Auto Generator: <span id="qf-ag-cost">100</span> ⚡ (x<span id="qf-ag-count">0</span>)</div>'+
'<div>Quantum Core: <span id="qf-qc-cost">500</span> ⚡ (x<span id="qf-qc-count">0</span>)</div>'+
'<div>Plasma Forge: <span id="qf-pf-cost">2000</span> ⚡ (x<span id="qf-pf-count">0</span>)</div></div>'+
'<div id="qf-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#88ccff;text-shadow:0 0 20px rgba(136,204,255,0.5);">QUANTUM FORGE</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">Click to generate energy · Buy upgrades to grow faster!</div>'+
'<div id="qf-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#4488ff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO FORGE</div></div>'+
'<div id="qf-msg" style="position:absolute;top:25%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ffdd00;opacity:0;"></div></div>');
setTimeout(function(){for(var i=0;i<4;i++){var btn=document.getElementById('qf-upgrade-'+i);}},100);}
function msg(t,d){var el=document.getElementById('qf-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function buyUpgrade(idx){var u=upgrades[idx];var cost=Math.floor(u.cost*Math.pow(1.5,u.owned));if(energy>=cost&&u.owned<u.maxOwned){energy-=cost;u.owned++;if(idx===0)clickPower+=u.bonus;if(idx>=1)autoRate+=u.bonus;E.playBeep(600+idx*100,0.1,'sine',0.12);msg(u.name+' upgraded to level '+u.owned+'!',1000);}}
function updateHUD(){document.getElementById('qf-energy').textContent=Math.floor(energy);document.getElementById('qf-score').textContent=score;
var costs=[Math.floor(upgrades[0].cost*Math.pow(1.5,upgrades[0].owned)),Math.floor(upgrades[1].cost*Math.pow(1.5,upgrades[1].owned)),Math.floor(upgrades[2].cost*Math.pow(1.5,upgrades[2].owned)),Math.floor(upgrades[3].cost*Math.pow(1.5,upgrades[3].owned))];
document.getElementById('qf-ca-cost').textContent=costs[0];document.getElementById('qf-ca-count').textContent=upgrades[0].owned;
document.getElementById('qf-ag-cost').textContent=costs[1];document.getElementById('qf-ag-count').textContent=upgrades[1].owned;
document.getElementById('qf-qc-cost').textContent=costs[2];document.getElementById('qf-qc-count').textContent=upgrades[2].owned;
document.getElementById('qf-pf-cost').textContent=costs[3];document.getElementById('qf-pf-count').textContent=upgrades[3].owned;
if(st==='ready'){var btn=document.getElementById('qf-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function buy(idx){buyUpgrade(idx);}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('qf-ready').style.display='none';}updateHUD();return;}
playTime+=dt;
if(input.action){energy+=clickPower;score+=clickPower;E.playBeep(800+Math.random()*200,0.05,'sine',0.08);
var spark=new THREE.Mesh(new THREE.SphereGeometry(0.05,4,4),new THREE.MeshBasicMaterial({color:0x44aaff}));spark.position.set((Math.random()-0.5)*2,1+Math.random()*2,(Math.random()-0.5)*2);spark.userData={life:0.5,vel:new THREE.Vector3((Math.random()-0.5)*3,Math.random()*3,(Math.random()-0.5)*3)};E.scene.add(spark);particles.push(spark);}
// Auto generation
energy+=autoRate*dt;score+=autoRate*dt;
// Keyboard shortcuts
if(input.keysPressed['Digit1'])buyUpgrade(0);
if(input.keysPressed['Digit2'])buyUpgrade(1);
if(input.keysPressed['Digit3'])buyUpgrade(2);
if(input.keysPressed['Digit4'])buyUpgrade(3);
// Particles
for(var pi=particles.length-1;pi>=0;pi--){var p=particles[pi];p.position.x+=p.userData.vel.x*dt;p.position.y+=p.userData.vel.y*dt;p.position.z+=p.userData.vel.z*dt;p.userData.vel.y-=2*dt;p.userData.life-=dt;if(p.userData.life<=0){E.scene.remove(p);particles.splice(pi,1);}}
// Ring rotation
stage.children.forEach(function(c){if(c.geometry&&c.geometry.type==='TorusGeometry'){c.rotation.y+=dt*2;c.rotation.x+=dt*0.5;}});
E.camera.position.set(0,5,8);E.camera.lookAt(0,0.5,0);
updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(stage)E.scene.remove(stage);for(var i=0;i<particles.length;i++)E.scene.remove(particles[i]);particles=[];E=null;THREE=null;}
window.QuantumForge={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Quantum Forge',description:'3D Idle/Clicker — Click to generate energy, buy upgrades, grow forever',genre:'idle'};
console.log('[QuantumForge] Loaded. Forge your quantum empire!');
})();