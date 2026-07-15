/**
 * FreeArcade Data Loader — Bridges ContentDB data into game modules
 * 
 * Each game calls loadGameData(gameId) at init time to merge
 * ContentDB content tables with their hardcoded defaults.
 * 
 * Usage:
 *   var data = loadGameData('fps');
 *   // data.weapons, data.enemies, data.levels, ... available
 *   // Falls back to empty arrays if ContentDB not registered.
 * 
 * Integrated into both engines (2D and 3D).
 */

(function(){'use strict';
var root=this;

var DATA_CACHE={};

function loadGameData(gameId){
  if(DATA_CACHE[gameId])return DATA_CACHE[gameId];
  
  var result={
    weapons:[],
    armor:[],
    enemies:[],
    levels:[],
    quests:[],
    lore:[],
    skills:[],
    achievements:[],
    crafting:[],
    consumables:[],
    loaded:false,
    totalEntries:0
  };
  
  var db=root.ContentDB;
  if(!db||!db.tables){
    console.warn('['+gameId+'] ContentDB not available, using defaults only.');
    return result;
  }
  
  var tableKeys=['weapons','armor','enemies','levels','quests','lore','skills','achievements','crafting','consumables'];
  var total=0;
  
  for(var ti=0;ti<tableKeys.length;ti++){
    var key=tableKeys[ti];
    var tableName=gameId+'_'+key;
    var table=db.tables[tableName];
    if(table&&table.length>0){
      result[key]=table;
      total+=table.length;
    }
  }
  
  result.loaded=true;
  result.totalEntries=total;
  DATA_CACHE[gameId]=result;
  
  if(total>0){
    console.log('['+gameId+'] Data loader: '+total+' entries across '+tableKeys.length+' tables.');
  }
  
  return result;
}

// Expose globally
root.loadGameData=loadGameData;

// Also register as engine utility
if(root.FreeArcade) root.FreeArcade.loadGameData=loadGameData;
if(root.FreeArcade3D) root.FreeArcade3D.loadGameData=loadGameData;

console.log('[DataLoader] Initialized. Games can call loadGameData(id).');
})();
