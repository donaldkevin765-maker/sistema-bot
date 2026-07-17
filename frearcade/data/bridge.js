/**
 * FreeArcade Data Bridge — connects games to ContentDB data
 * 
 * Each game calls DataBridge.get(engine, 'weapons') to access
 * its generated content tables. Falls back to empty arrays.
 * 
 * Usage in game init:
 *   var wpn = DataBridge.get(E, 'weapons');  // array or empty
 *   var enemies = DataBridge.get(E, 'enemies');
 *   var levels = DataBridge.get(E, 'levels');
 *   var achievements = DataBridge.get(E, 'achievements');
 *   var crafting = DataBridge.get(E, 'crafting');
 *   var lore = DataBridge.get(E, 'lore');
 *   var quests = DataBridge.get(E, 'quests');
 *   var skills = DataBridge.get(E, 'skills');
 *   var consumables = DataBridge.get(E, 'consumables');
 *   var armor = DataBridge.get(E, 'armor');
 * 
 * DataBridge.random(E, 'weapons')  → one random weapon
 * DataBridge.sample(E, 'enemies', 3)  → 3 random enemies
 * DataBridge.filter(E, 'weapons', {tier:'rare'})  → filtered
 */
(function(){'use strict';
var root=window;

var DataBridge={
  version:'1.0.0',

  /** Get a data table for the current game */
  get:function(engine,tableName){
    if(!engine||!tableName)return [];
    var data=engine.gameData||root.__gameData||{};
    return data[tableName]||[];
  },

  /** Get one random entry from a table */
  random:function(engine,tableName){
    var table=this.get(engine,tableName);
    if(!table||table.length===0)return null;
    return table[Math.floor(Math.random()*table.length)];
  },

  /** Get N random (unique) entries from a table */
  sample:function(engine,tableName,n){
    var table=this.get(engine,tableName);
    if(!table||table.length===0)return [];
    n=Math.min(n||1,table.length);
    var copy=table.slice();
    var result=[];
    for(var i=0;i<n;i++){
      var idx=Math.floor(Math.random()*copy.length);
      result.push(copy[idx]);
      copy.splice(idx,1);
    }
    return result;
  },

  /** Filter a table by predicate object or function */
  filter:function(engine,tableName,predicate){
    var table=this.get(engine,tableName);
    if(!table||table.length===0)return [];
    if(typeof predicate==='function')return table.filter(predicate);
    if(typeof predicate==='object'){
      var keys=Object.keys(predicate);
      return table.filter(function(entry){
        for(var i=0;i<keys.length;i++){
          if(entry[keys[i]]!==predicate[keys[i]])return false;
        }
        return true;
      });
    }
    return table;
  },

  /** Get a random enemy with stats scaled to current level */
  getEnemy:function(engine,level){
    var enemies=this.get(engine,'enemies');
    if(!enemies||enemies.length===0)return null;
    var pool=enemies;
    // Filter by approximate level range
    level=level||1;
    var minLvl=Math.max(1,level-5);
    var maxLvl=level+10;
    var matched=pool.filter(function(e){return e.level>=minLvl&&e.level<=maxLvl;});
    if(matched.length===0)matched=pool;
    var enemy=matched[Math.floor(Math.random()*matched.length)];
    return enemy;
  },

  /** Get weapons filtered by tier, or random if no filter */
  getWeapon:function(engine,tier){
    var weapons=this.get(engine,'weapons');
    if(!weapons||weapons.length===0)return null;
    if(tier){
      var matched=weapons.filter(function(w){return w.tier===tier;});
      if(matched.length===0)matched=weapons;
      return matched[Math.floor(Math.random()*matched.length)];
    }
    return weapons[Math.floor(Math.random()*weapons.length)];
  }
};

root.DataBridge=DataBridge;
// Also expose on engines
if(root.FreeArcade)root.FreeArcade.DataBridge=DataBridge;
if(root.FreeArcade3D)root.FreeArcade3D.DataBridge=DataBridge;
console.log('[DataBridge] Initialized. Games can call DataBridge.get(E, table).');
})();
