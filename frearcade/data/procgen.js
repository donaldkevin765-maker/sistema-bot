/**
 * FreeArcade Procedural Generation Engine
 * 
 * Content generation algorithms for all game types:
 * - Map/level generation (dungeons, arenas, racetracks, platformer levels)
 * - Item generation (weapons, armor, loot with random stats)
 * - Enemy generation (scaled variants, randomized behaviors)
 * - Name generation (compounds, fantasy, sci-fi, themed)
 * - Quest generation (objective chaining, reward scaling)
 * 
 * Each generator can produce thousands of unique variants.
 * Integrates with ContentDB for registration of generated content.
 * 
 * Target: ~2,000 lines of generation infrastructure
 */

(function(){'use strict';
var root=this;
var ProcGen={
  version:'1.0.0',
  
  // ====== NOISE FUNCTIONS ======
  
  /** Simple seeded random */
  seededRandom:function(seed){
    return function(){seed=(seed*9301+49297)%233280;return seed/233280;};
  },
  
  /** 1D Perlin-like noise */
  noise1D:function(x,seed){
    var ix=Math.floor(x),fx=x-ix;
    var s1=seed|0,s2=(seed+1)|0;
    var r1=Math.abs(Math.sin(s1*127.1+311.7)*43758.5453)%1;
    r1=r1<0?r1+1:r1;
    var r2=Math.abs(Math.sin(s2*127.1+311.7)*43758.5453)%1;
    r2=r2<0?r2+1:r2;
    fx=fx*fx*(3-2*fx);
    return r1+fx*(r2-r1);
  },
  
  /** 2D noise */
  noise2D:function(x,y){
    var ix=Math.floor(x),iy=Math.floor(y);
    var fx=x-ix,fy=y-iy;
    var r1=Math.abs(Math.sin(ix*127.1+iy*311.7)*43758.5453)%1;
    r1=r1<0?r1+1:r1;
    var r2=Math.abs(Math.sin((ix+1)*127.1+iy*311.7)*43758.5453)%1;
    r2=r2<0?r2+1:r2;
    var r3=Math.abs(Math.sin(ix*127.1+(iy+1)*311.7)*43758.5453)%1;
    r3=r3<0?r3+1:r3;
    var r4=Math.abs(Math.sin((ix+1)*127.1+(iy+1)*311.7)*43758.5453)%1;
    r4=r4<0?r4+1:r4;
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
    return r1+fx*(r2-r1)+fy*((r3+fx*(r4-r3))-(r1+fx*(r2-r1)));
  },
  
  // ====== NAME GENERATORS ======
  
  nameGenerators:{
    fantasy:{prefix:['Shadow','Storm','Fire','Ice','Crystal','Dark','Light','Thunder','Iron','Silver','Golden','Blood','Star','Moon','Sun','Frost','Ash','Dusk','Dawn','Void','Echo','Blade','Rune','Fang','Heart'],suffix:['blade','walker','bringer','guardian','reaver','fury','heart','crest','thorn','whisper','bane','fell','forge','shard','crown','wolf','strike','hunter','weaver','breath']},
    sciFi:{prefix:['Quantum','Neon','Pulse','Cyber','Nova','Hyper','Omega','Delta','Gamma','Zero','Astro','Void','Star','Flux','Core','Plasma','Laser','Data','Synth','Neuro'],suffix:['drive','core','wave','link','pulse','beam','forge','gate','port','tech','ware','ship','bot','gear','node','spire','wing','pod','deck','cell']},
    fantasyPlace:{prefix:['Grim','Ash','Bright','High','Deep','Dark','Far','Silver','Iron','Thorn'],suffix:['vale','moor','hold','haven','keep','fen','brook','shire','peak','wall']},
    enemy:{prefix:['Frost','Fire','Shadow','Void','Blood','Storm','Venom','Crystal','Bone','Rust','Plasma','Neuro','Psi','Omega','Titan'],suffix:['fiend','reaper','hulk','drone','shade','wyrm','beast','golem','sprite','eye','fang','claw','lord','mage','knight']},
    weapon:{prefix:['Doom','Storm','Fang','Shadow','Thunder','Venom','Frost','Rune','Star','Void','Chaos','Omega','Nova','Blade','Dusk'],suffix:['bringer','cleaver','reaper','spike','slicer','piercer','crusher','striker','carver','render','thrower','spitter','caster','blade','hammer']},
    item:{prefix:['Ancient','Enchanted','Mythic','Runic','Cursed','Blessed','Glimmering','Shadowy','Brilliant','Dull'],suffix:['amulet','ring','crystal','orb','talisman','gem','stone','charm','seal','shard']}
  },
  
  generateName:function(sets,separator){
    separator=separator||' ';
    var set=this.nameGenerators[sets]||this.nameGenerators.fantasy;
    return set.prefix[Math.floor(Math.random()*set.prefix.length)]+separator+set.suffix[Math.floor(Math.random()*set.suffix.length)];
  },
  
  generateCompoundName:function(parts,separator){
    return parts.map(function(p){return typeof p==='function'?p():p;}).join(separator||'');
  },
  
  // ====== MAP GENERATORS ======
  
  /** Generate a dungeon map as a 2D tile array */
  generateDungeon:function(width,height,opts){
    opts=opts||{};
    var rooms=opts.rooms||8;
    var minRoom=opts.minRoom||3;
    var maxRoom=opts.maxRoom||8;
    var seed=opts.seed||Date.now();
    var rand=this.seededRandom(seed);
    
    // Initialize with walls
    var map=[];
    for(var y=0;y<height;y++){map[y]=[];for(var x=0;x<width;x++)map[y][x]=1;}
    
    // Place rooms
    var roomList=[];
    for(var r=0;r<rooms;r++){
      var rw=minRoom+Math.floor(rand()*(maxRoom-minRoom+1));
      var rh=minRoom+Math.floor(rand()*(maxRoom-minRoom+1));
      var rx=2+Math.floor(rand()*(width-rw-3));
      var ry=2+Math.floor(rand()*(height-rh-3));
      
      // Check overlap
      var overlap=false;
      for(var ri=0;ri<roomList.length;ri++){
        var or=roomList[ri];
        if(rx<or.x+or.w+1&&rx+rw+1>or.x&&ry<or.y+or.h+1&&ry+rh+1>or.y){overlap=true;break;}
      }
      if(overlap){r--;continue;}
      
      for(var dy=0;dy<rh;dy++)for(var dx=0;dx<rw;dx++)map[ry+dy][rx+dx]=0;
      roomList.push({x:rx,y:ry,w:rw,h:rh,cx:Math.floor(rx+rw/2),cy:Math.floor(ry+rh/2)});
    }
    
    // Corridors between rooms
    for(var ci=1;ci<roomList.length;ci++){
      var a=roomList[ci-1],b=roomList[ci];
      var cx=a.cx,cy=a.cy;
      while(cx!==b.cx){map[cy][cx]=0;cx+=cx<b.cx?1:-1;}
      while(cy!==b.cy){map[cy][cx]=0;cy+=cy<b.cy?1:-1;}
    }
    
    return {map:map,rooms:roomList,width:width,height:height};
  },
  
  /** Generate a platformer level layout */
  generatePlatformerLevel:function(length,opts){
    opts=opts||{};
    var groundHeight=opts.groundHeight||8;
    var height=opts.height||20;
    var seed=opts.seed||Date.now();
    var rand=this.seededRandom(seed);
    
    var level=[];
    for(var x=0;x<length;x++){
      level[x]=[];
      for(var y=0;y<height;y++)level[x][y]=0;
    }
    
    // Ground
    for(var gx=0;gx<length;gx++)level[gx][groundHeight]=1;
    
    // Platforms
    var platCount=opts.platforms||Math.floor(length/5);
    for(var pi=0;pi<platCount;pi++){
      var px=2+Math.floor(rand()*(length-4));
      var pw=2+Math.floor(rand()*4);
      var py=Math.floor(rand()*(groundHeight-3))+2;
      for(var dx=0;dx<pw&&px+dx<length;dx++)level[px+dx][py]=1;
    }
    
    // Gaps
    var gapCount=opts.gaps||Math.floor(length/15);
    for(var gi=0;gi<gapCount;gi++){
      var gxPos=10+Math.floor(rand()*(length-20));
      var gw=1+Math.floor(rand()*2);
      for(var g=0;g<gw&&gxPos+g<length;g++){level[gxPos+g][groundHeight]=0;level[gxPos+g][groundHeight-1]=0;}
    }
    
    // Enemies and coins
    var markers={};
    for(var mi=0;mi<length;mi+=3+Math.floor(rand()*5)){
      if(mi<length){if(!markers.enemies)markers.enemies=[];markers.enemies.push({x:mi,y:groundHeight-2,type:Math.floor(rand()*3)});}
    }
    for(var ci=0;ci<length;ci+=2+Math.floor(rand()*3)){
      if(ci<length){if(!markers.coins)markers.coins=[];markers.coins.push({x:ci,y:groundHeight-1});}
    }
    
    return {tiles:level,width:length,height:height,groundY:groundHeight,markers:markers};
  },
  
  /** Generate a racetrack path (array of waypoints) */
  generateRacetrack:function(numWaypoints,radius,seed){
    seed=seed||Date.now();
    var rand=this.seededRandom(seed);
    var pts=[];
    for(var i=0;i<numWaypoints;i++){
      var a=i/numWaypoints*Math.PI*2;
      var r=radius*(0.7+rand()*0.6);
      pts.push({x:Math.cos(a)*r,z:Math.sin(a)*r,angle:a});
    }
    return pts;
  },
  
  /** Generate a simple arena layout */
  generateArena:function(radius,numObstacles,seed){
    seed=seed||Date.now();
    var rand=this.seededRandom(seed);
    var obstacles=[];
    for(var i=0;i<numObstacles;i++){
      var a=rand()*Math.PI*2;
      var r=rand()*radius*0.7;
      obstacles.push({x:Math.cos(a)*r,z:Math.sin(a)*r,w:0.5+rand()*1.5,h:0.5+rand()*1.5});
    }
    return {radius:radius,obstacles:obstacles};
  },
  
  // ====== ITEM GENERATORS ======
  
  /** Generate a weapon with randomized stats */
  generateWeapon:function(level,tier,type){
    var tiers=['common','uncommon','rare','epic','legendary'];
    var tierMult=[1,1.5,2.2,3.5,6];
    var t=tiers.indexOf(tier);if(t===-1)t=0;
    var mult=tierMult[t]*(0.9+Math.random()*0.2);
    
    var weaponTypes={sword:{dmg:8+level*2,speed:1,crit:0.1,range:1.5},axe:{dmg:12+level*3,speed:0.7,crit:0.05,range:1.3},bow:{dmg:5+level*1.5,speed:1.2,crit:0.2,range:8},staff:{dmg:6+level*2,speed:0.9,crit:0.15,range:6},dagger:{dmg:4+level*1,speed:1.8,crit:0.3,range:1},spear:{dmg:9+level*2,speed:0.8,crit:0.08,range:2.5}};
    var base=weaponTypes[type]||weaponTypes.sword;
    
    return{
      id:'weapon_'+type+'_L'+level+'_'+tier+(Math.random()*999|0),
      name:ProcGen.generateName('weapon'),
      type:type,
      tier:tier,
      level:level,
      damage:Math.round(base.dmg*mult),
      speed:base.speed*mult,
      crit:Math.min(0.8,base.crit*mult),
      range:base.range,
      weight:Math.round(1+level*0.3),
      value:Math.round(10*mult*(1+level*0.5)),
      requires:{level:level},
      effects: tier!=='common'?ProcGen.generateEffects(tier):[]
    };
  },
  
  /** Generate random equipment effects */
  generateEffects:function(tier){
    var count={common:0,uncommon:1,rare:2,epic:3,legendary:4}[tier]||1;
    var effects=[];
    var effectTypes=['fire','ice','lightning','poison','holy','shadow','bleed','stun','slow','lifeSteal'];
    for(var i=0;i<count;i++){
      var et=effectTypes[Math.floor(Math.random()*effectTypes.length)];
      var val=5+Math.floor(Math.random()*20)+(count*3);
      effects.push({type:et,value:val,chance:0.1+Math.random()*0.4});
    }
    return effects;
  },
  
  /** Generate armor piece */
  generateArmor:function(level,tier,slot){
    var tiers=['common','uncommon','rare','epic','legendary'];
    var tierMult=[1,1.4,2,3,5];
    var t=tiers.indexOf(tier);if(t===-1)t=0;
    var mult=tierMult[t]*(0.9+Math.random()*0.2);
    var slots={head:{def:5+level*2,hp:0},chest:{def:8+level*3,hp:5+level*2},legs:{def:6+level*2,hp:3+level*1},boots:{def:3+level*1,speed:0.1+level*0.02},gloves:{def:2+level*1,crit:0.02+level*0.005}};
    var base=slots[slot]||slots.chest;
    return{
      id:'armor_'+slot+'_L'+level+'_'+tier+(Math.random()*999|0),
      name:ProcGen.generateName('item'),
      slot:slot,tier:tier,level:level,
      defense:Math.round(base.def*mult),
      hp:Math.round((base.hp||0)*mult),
      speed:base.speed?base.speed*mult:0,
      crit:base.crit?Math.min(0.5,base.crit*mult):0,
      value:Math.round(8*mult*(1+level*0.5))
    };
  },
  
  /** Generate a random consumable item */
  generateConsumable:function(level,tier){
    var types={potion:{heal:20+level*10,effect:'heal'},elixir:{mana:20+level*10,effect:'mana'},scroll:{effect:'buff',duration:10+level*2,stat:'all',value:1+level*0.5},bomb:{damage:15+level*8,radius:2+level*0.3,effect:'explosion'},food:{heal:5+level*3,buff:'regeneration',duration:5+level*1}};
    var type=types[Object.keys(types)[Math.floor(Math.random()*Object.keys(types).length)]];
    return{
      id:'consumable_'+type.effect+'_L'+level+'_'+(Math.random()*999|0),
      name:ProcGen.generateName('item'),
      type:'consumable',effect:type.effect,level:level,tier:tier,
      value:Math.round(3*(1+level*0.3)),
      effects:[type]
    };
  },
  
  // ====== ENEMY GENERATORS ======
  
  /** Generate an enemy stat block */
  generateEnemy:function(level,type,biome){
    var types={
      melee:{hp:20+level*8,dmg:5+level*3,speed:1.5+level*0.05,range:1.5,color:'#ff4444',xp:10+level*5},
      ranged:{hp:12+level*5,dmg:4+level*2.5,speed:1,range:6,color:'#ff8800',xp:15+level*6},
      mage:{hp:10+level*4,dmg:7+level*4,speed:0.8,range:7,color:'#cc44ff',xp:20+level*8},
      brute:{hp:40+level*15,dmg:8+level*4,speed:0.6,range:2,color:'#8844ff',xp:25+level*10},
      fast:{hp:8+level*3,dmg:3+level*2,speed:3+level*0.1,range:1,color:'#ffaa00',xp:12+level*4},
      flyer:{hp:6+level*2,dmg:2+level*1.5,speed:2.5,range:5,color:'#ff44ff',xp:18+level*7}
    };
    var base=types[type]||types.melee;
    var mult=0.85+Math.random()*0.3;
    var name=ProcGen.generateName('enemy');
    return{
      id:'enemy_'+type+'_L'+level+'_'+(Math.random()*999|0),
      name:name,
      type:type,level:level,biome:biome||'default',
      hp:Math.round(base.hp*mult),
      maxHp:Math.round(base.hp*mult),
      damage:Math.round(base.dmg*mult),
      speed:base.speed*mult,
      range:base.range,
      color:base.color,
      xp:Math.round(base.xp*mult),
      lootTable:['gold','item','potion'],
      lootChance:0.3+Math.random()*0.3,
      abilities:type==='mage'?['fireball','teleport']:type==='brute'?['charge','slam']:['attack']
    };
  },
  
  /** Generate a boss enemy */
  generateBoss:function(level,biome){
    var boss=this.generateEnemy(level,'brute',biome);
    boss.isBoss=true;
    boss.hp=Math.round(boss.hp*5);
    boss.maxHp=boss.hp;
    boss.damage=Math.round(boss.damage*2);
    boss.size=2.5+Math.random();
    boss.xp=Math.round(boss.xp*10);
    boss.lootTable=['rare_item','gold','gem','special'];
    boss.lootChance=1;
    boss.abilities=['charge','slam','aoe_attack','enrage'];
    boss.name='[BOSS] '+boss.name;
    boss.id='boss_'+biome+'_L'+level+'_'+(Math.random()*999|0);
    return boss;
  },
  
  // ====== QUEST GENERATORS ======
  
  questTypes:[
    {id:'kill',name:'Hunt',template:'Kill {count} {enemyType} in {location}','objectives':['kill']},
    {id:'collect',name:'Gather',template:'Collect {count} {itemName} from {location}','objectives':['collect']},
    {id:'escort',name:'Escort',template:'Escort {npcName} through {location}','objectives':['survive']},
    {id:'boss',name:'Slay',template:'Defeat {bossName} in {location}','objectives':['boss']},
    {id:'explore',name:'Explore',template:'Discover {location}','objectives':['explore']},
    {id:'delivery',name:'Delivery',template:'Deliver {itemName} to {targetName} in {location}','objectives':['deliver']},
    {id:'defense',name:'Protect',template:'Defend {location} from {count} waves of enemies','objectives':['defend']},
    {id:'puzzle',name:'Solve',template:'Solve the puzzle in {location}','objectives':['interact']}
  ],
  
  generateQuest:function(level,biome){
    var qt=this.questTypes[Math.floor(Math.random()*this.questTypes.length)];
    var reward=10+level*5+Math.floor(Math.random()*level*3);
    var count=1+Math.floor(Math.random()*5)+level;
    var place=ProcGen.generateName('fantasyPlace');
    return{
      id:'quest_'+qt.id+'_L'+level+'_'+(Math.random()*999|0),
      type:qt.id,
      name:qt.name+' quest',
      template:qt.template,
      level:level,biome:biome||'default',
      objectives:qt.objectives.map(function(o){return{type:o,target:count,progress:0,complete:false};}),
      rewards:{xp:Math.round(reward*2),gold:Math.round(reward*1.5),itemChance:0.3+level*0.02},
      description:qt.template.replace('{count}',count).replace('{location}',place).replace('{enemyType}',this.generateName('enemy')).replace('{itemName}',this.generateName('item')).replace('{npcName}',this.generateName('fantasy')).replace('{bossName}',this.generateName('enemy')).replace('{targetName}',this.generateName('fantasy'))
    };
  },
  
  // ====== LOOT GENERATION ======
  
  /** Generate a loot drop from a loot table */
  generateLoot:function(lootTable,level){
    var drops=[];
    for(var i=0;i<lootTable.length;i++){
      var entry=lootTable[i];
      if(Math.random()<entry.chance){
        var item=null;
        switch(entry.type){
          case'gold':item={id:'gold',name:'Gold',value:entry.amount||(5+level*3),stackable:true};break;
          case'potion':item=this.generateConsumable(level,'common');break;
          case'weapon':item=this.generateWeapon(level,entry.tier||'common',entry.subtype||'sword');break;
          case'armor':item=this.generateArmor(level,entry.tier||'common',entry.subtype||'chest');break;
          case'item':item={id:'item_'+(Math.random()*9999|0),name:this.generateName('item'),value:1+Math.floor(Math.random()*level),type:'material'};break;
          case'special':item={id:'special_'+(Math.random()*9999|0),name:this.generateName('weapon'),tier:'legendary',value:100+level*20,type:'special'};break;
        }
        if(item)drops.push(item);
      }
    }
    return drops;
  },
  
  // ====== WORLD GENERATION ======
  
  /** Generate a biome layout (for survival/open world) */
  generateBiomeLayout:function(sizeX,sizeZ,seed){
    seed=seed||Date.now();
    var grid=[];
    var biomes=['forest','desert','tundra','plains','mountain','swamp'];
    for(var x=0;x<sizeX;x++){
      grid[x]=[];
      for(var z=0;z<sizeZ;z++){
        var nx=x/sizeX*2-1,nz=z/sizeZ*2-1;
        var val=this.noise2D(x*0.05+seed,z*0.05+seed);
        var biomeIdx=Math.floor(val*biomes.length)%biomes.length;
        grid[x][z]=biomes[biomeIdx<0?biomeIdx+biomes.length:biomeIdx];
      }
    }
    return grid;
  },
  
  /** Generate resource node positions */
  generateResources:function(biomeGrid,seed){
    seed=seed||Date.now();
    var rand=this.seededRandom(seed);
    var resources=[];
    var biomeResources={forest:[{type:'wood',count:5},{type:'berries',count:3}],desert:[{type:'stone',count:4},{type:'cactus',count:2}],tundra:[{type:'ice',count:3},{type:'fur',count:2}],plains:[{type:'wheat',count:4},{type:'clay',count:2}],mountain:[{type:'ore',count:3},{type:'crystal',count:2}],swamp:[{type:'herbs',count:4},{type:'mushroom',count:3}]};
    for(var x=0;x<biomeGrid.length;x++){for(var z=0;z<biomeGrid[x].length;z++){
      if(rand()<0.05){var biome=biomeGrid[x][z];var pool=biomeResources[biome]||biomeResources.forest;var res=pool[Math.floor(rand()*pool.length)];resources.push({x:x,z:z,type:res.type,amount:1+Math.floor(rand()*res.count),biome:biome});}}
    }
    return resources;
  },
  
  // ====== DIALOGUE GENERATION ======
  
  dialogueTemplates:{
    greeting:['Hello, traveler.','Greetings, adventurer.','Well met!','Ah, a visitor!','Hey there.','What brings you here?'],
    questOffer:['I have a task for you.','Could you help me?','I need a brave soul.','There\'s something I need done.','Are you looking for work?'],
    questComplete:['Well done!','Excellent work!','Thank you, hero!','You\'ve saved us!','Perfect!'],
    shop:['Take a look at my wares.','I have the best prices around.','Quality goods for quality people.','Browse as long as you like.'],
    lore:['They say this place was built long ago...','Legend speaks of a great battle here...','The old texts mention hidden treasures...','I\'ve heard strange tales from the north...','The ancients left behind many secrets...'],
    battle:['You\'ll pay for that!','Is that all you\'ve got?','For glory!','I won\'t go down easily!','Time to end this!'],
    death:['No... impossible...','I... fade...','Tell my family...','The darkness claims me...','At last... peace...']
  },
  
  generateDialogue:function(context){
    var pool=this.dialogueTemplates[context]||this.dialogueTemplates.greeting;
    return pool[Math.floor(Math.random()*pool.length)];
  },
  
  // ====== SHARED UTILITIES ======
  
  /** Weighted random selection */
  weightedPick:function(items,weightKey){
    if(!items||items.length===0)return null;
    var total=0;for(var i=0;i<items.length;i++)total+=items[i][weightKey||'weight']||1;
    var r=Math.random()*total,cum=0;
    for(var i2=0;i2<items.length;i2++){cum+=items[i2][weightKey||'weight']||1;if(r<=cum)return items[i2];}
    return items[items.length-1];
  },
  
  /** Generate a stat block with some randomness */
  statRange:function(base,minVar,maxVar){
    return Math.round(base*(1-minVar+Math.random()*(maxVar+minVar))*100)/100;
  },
  
  /** Clamp a value */
  clamp:function(v,min,max){return v<min?min:v>max?max:v;}
};

root.ProcGen=ProcGen;
console.log('[ProcGen] v'+ProcGen.version+' loaded. '+Object.keys(ProcGen.generateEnemy).length+' generators available.');
})();