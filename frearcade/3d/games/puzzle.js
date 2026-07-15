/**
 * Crystal Mind — 3D Puzzle Game
 * Match colored crystals in a 3D grid. Chain reactions.
 */
(function(){'use strict';var E,THREE;var st='ready',score=0,level=1,moves=30,playTime=0,combo=0;var board,crystals=[],selected=null;var gridSize=5,hud=null,camPivot=null;var COLORS=[0xff4444,0x44ff44,0x4488ff,0xffaa00,0xff44ff];
function init(eng){E=eng;THREE=eng.THREE;if(!THREE)return;reset();buildBoard();buildHUD();st='ready';E.emit('gameReady',{name:'Crystal Mind'});}
function reset(){score=0;level=1;moves=30;playTime=0;combo=0;crystals=[];selected=null;}
function buildBoard(){if(board)E.scene.remove(board);board=new THREE.Group();
var mat=new THREE.MeshStandardMaterial({color:0x1a1a2e,roughness:0.7});var floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),mat);floor.rotation.x=-Math.PI/2;floor.position.y=-0.5;floor.receiveShadow=true;board.add(floor);
for(var x=0;x<gridSize;x++){for(var z=0;z<gridSize;z++){for(var y=0;y<3;y++){var color=COLORS[Math.floor(Math.random()*COLORS.length)];var crystal=new THREE.Mesh(new THREE.OctahedronGeometry(0.3,0),new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.2,metalness:0.3,roughness:0.4}));crystal.position.set(x*0.9-2.25,y*0.7+0.5,z*0.9-2.25);crystal.castShadow=true;crystal.userData={gridX:x,gridY:y,gridZ:z,color:color,type:COLORS.indexOf(color)};board.add(crystal);crystals.push(crystal);}}}
E.scene.add(board);camPivot=new THREE.Object3D();E.scene.add(camPivot);}
function buildHUD(){hud=E.createHUD('<div id="cm-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">'+
'<div style="position:absolute;top:15px;left:20px;font-size:20px;font-weight:bold;color:#aa88ff;">CRYSTAL MIND</div>'+
'<div style="position:absolute;top:50px;left:20px;font-size:13px;">SCORE: <span id="cm-score">0</span></div>'+
'<div style="position:absolute;top:15px;right:20px;font-size:12px;text-align:right;">LEVEL: <span id="cm-level">1</span><br>MOVES: <span id="cm-moves">30</span></div>'+
'<div style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ffdd00;opacity:0;" id="cm-msg"></div>'+
'<div id="cm-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">'+
'<div style="font-size:36px;font-weight:bold;color:#aa88ff;text-shadow:0 0 20px rgba(170,136,255,0.5);">CRYSTAL MIND</div>'+
'<div style="font-size:14px;color:#aaa;margin-top:10px;">Click to select · Click adjacent to swap · Match 3+ colors</div>'+
'<div id="cm-start" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#aa44ff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO PLAY</div></div></div>');}
function msg(t,d){var el=document.getElementById('cm-msg');if(!el)return;el.textContent=t;el.style.opacity=1;setTimeout(function(){el.style.opacity=0;},d||2000);}
function updateHUD(){document.getElementById('cm-score').textContent=score;document.getElementById('cm-level').textContent=level;document.getElementById('cm-moves').textContent=Math.max(0,moves);if(st==='ready'){var btn=document.getElementById('cm-start');if(btn){var p=0.5+Math.sin(Date.now()*0.003)*0.5;btn.style.transform='scale('+(1+p*0.05)+')';}}}
function getCrystalAt(gx,gy,gz){for(var i=0;i<crystals.length;i++){var c=crystals[i];if(c.userData.gridX===gx&&c.userData.gridY===gy&&c.userData.gridZ===gz)return c;}return null;}
function findMatches(){var matched=[];var checked={};for(var i=0;i<crystals.length;i++){var c=crystals[i];var key=c.userData.gridX+','+c.userData.gridY+','+c.userData.gridZ;if(checked[key])continue;var type=c.userData.type;var cx=c.userData.gridX,cy=c.userData.gridY,cz=c.userData.gridZ;
var dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
for(var di=0;di<dirs.length;di++){var d=dirs[di];var chain=[c];for(var s=1;s<3;s++){var nx=cx+d[0]*s,ny=cy+d[1]*s,nz=cz+d[2]*s;var nc=getCrystalAt(nx,ny,nz);if(nc&&nc.userData.type===type){chain.push(nc);var nk=nx+','+ny+','+nz;checked[nk]=true;}else break;}if(chain.length>=3){for(var ci=0;ci<chain.length;ci++){var ck=chain[ci].userData.gridX+','+chain[ci].userData.gridY+','+chain[ci].userData.gridZ;if(!checked[ck]){matched.push(chain[ci]);checked[ck]=true;}}}}}
return matched;}
function removeMatches(matched){for(var i=0;i<matched.length;i++){var c=matched[i];E.burstParticles(c.position,c.userData.color,6,2);E.scene.remove(c);var idx=crystals.indexOf(c);if(idx>-1)crystals.splice(idx,1);}
var pts=matched.length*10*(1+combo*0.5);score+=Math.round(pts);combo++;E.shakeScreen(0.05*Math.min(combo,5));}
function gravity(){for(var x=0;x<gridSize;x++){for(var z=0;z<gridSize;z++){for(var y=1;y>=0;y--){var c=getCrystalAt(x,y,z);if(c){var ny=y;while(ny>0&&!getCrystalAt(x,ny-1,z)){ny--;}if(ny!==y){c.userData.gridY=ny;c.position.y=ny*0.7+0.5;}}}}}
for(var x1=0;x1<gridSize;x1++){for(var z1=0;z1<gridSize;z1++){for(var y1=0;y1<3;y1++){if(!getCrystalAt(x1,y1,z1)){var color=COLORS[Math.floor(Math.random()*COLORS.length)];var crystal=new THREE.Mesh(new THREE.OctahedronGeometry(0.3,0),new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.2,metalness:0.3,roughness:0.4}));crystal.position.set(x1*0.9-2.25,y1*0.7+0.5,z1*0.9-2.25);crystal.castShadow=true;crystal.userData={gridX:x1,gridY:y1,gridZ:z1,color:color,type:COLORS.indexOf(color)};board.add(crystal);crystals.push(crystal);}}}}}
function update(dt,input){if(st==='ready'){if(input.action){st='playing';document.getElementById('cm-ready').style.display='none';}updateHUD();return;}
playTime+=dt;if(!player||moves<=0){if(moves<=0&&st!=='ready'){msg('Game Over! Score: '+score,5000);st='ready';setTimeout(function(){if(E)init(E);},3000);}updateHUD();return;}
if(input.shoot&&selected){var raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(0,0),E.camera);var intersects=raycaster.intersectObjects(crystals);if(intersects.length>0){var hit=intersects[0].object;var dx=Math.abs(hit.userData.gridX-selected.userData.gridX);var dy=Math.abs(hit.userData.gridY-selected.userData.gridY);var dz=Math.abs(hit.userData.gridZ-selected.userData.gridZ);
if(dx+dy+dz===1){var sx=selected.userData.gridX,sy=selected.userData.gridY,sz=selected.userData.gridZ;selected.userData.gridX=hit.userData.gridX;selected.userData.gridY=hit.userData.gridY;selected.userData.gridZ=hit.userData.gridZ;hit.userData.gridX=sx;hit.userData.gridY=sy;hit.userData.gridZ=sz;
var sp=selected.position.clone();selected.position.copy(hit.position);hit.position.copy(sp);
moves--;combo=0;var matched=findMatches();if(matched.length>0){removeMatches(matched);gravity();
while(true){var more=findMatches();if(more.length>0){removeMatches(more);gravity();}else break;}
if(crystals.length<=3){level++;msg('Level '+level+'!',2000);setTimeout(function(){if(E)init(E);},500);}}else{selected.userData.gridX=sx;selected.userData.gridY=sy;selected.userData.gridZ=sz;hit.userData.gridX=hit.userData.gridY=hit.userData.gridZ=0;var sp2=selected.position.clone();selected.position.copy(hit.position);hit.position.copy(sp2);moves++;}
selected.material.emissiveIntensity=0.2;selected=null;}else{selected.material.emissiveIntensity=0.2;selected=hit;hit.material.emissiveIntensity=0.8;}}}
if(!input.shoot&&selected){selected.material.emissiveIntensity=0.2;selected=null;}
var rot=playTime*0.1;if(camPivot)camPivot.rotation.y=rot*0.1;E.camera.position.set(Math.sin(rot*0.05)*5,4,Math.cos(rot*0.05)*5);E.camera.lookAt(0,0.5,0);
updateHUD();}
function render3D(){if(E.renderer&&E.scene&&E.camera)E.renderer.render(E.scene,E.camera);}
function render2D(ctx){}
function destroy(){if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);if(board)E.scene.remove(board);if(camPivot)E.scene.remove(camPivot);crystals=[];selected=null;E=null;THREE=null;}
window.CrystalMind={init:init,update:update,render3D:render3D,render2D:render2D,destroy:destroy,name:'Crystal Mind',description:'3D Puzzle — Match crystals, chain reactions, clear the board',genre:'puzzle'};
console.log('[CrystalMind] Loaded. Match the crystals!');
})();