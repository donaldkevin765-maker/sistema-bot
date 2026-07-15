/**
 * FreeArcade Content Database — Shared data-driven content framework
 * 
 * Central registry for all game content: items, enemies, levels, quests, skills, recipes, lore.
 * Each game registers its content tables here and queries them at runtime.
 * Supports procedural generation via ProcGen integration.
 * 
 * Architecture:
 *   ContentDB.tables    → { items, enemies, levels, quests, skills, recipes, lore, ... }
 *   ContentDB.register() → Add a table or merge into existing table
 *   ContentDB.query()    → Filter/query any table by predicate
 *   ContentDB.roll()     → Random selection from weighted table
 * 
 * Target: ~3,000 lines of data infrastructure
 */

(function(){'use strict';
var root=this;
var ContentDB={
  version:'1.0.0',
  tables:{},
  indexes:{},
  hooks:{},
  
  /**
   * Register a content table or merge data into an existing table.
   * @param {string} tableName - e.g. 'items', 'enemies', 'levels'
   * @param {Array|Object} data - Array of entries or object map
   * @param {Object} opts - { merge:true, index:['id','type'], weightKey:'weight' }
   */
  register:function(tableName,data,opts){
    opts=opts||{};
    if(!this.tables[tableName]){this.tables[tableName]=[];this.indexes[tableName]={};}
    var table=this.tables[tableName];
    var entries=Array.isArray(data)?data:Object.keys(data).map(function(k){var e=data[k];if(typeof e==='object'&&!e.id)e.id=k;return e;});
    var startIdx=table.length;
    for(var i=0;i<entries.length;i++){
      var entry=entries[i];
      if(opts.merge){var existing=this._findById(tableName,entry.id);if(existing){for(var k in entry)existing[k]=entry[k];continue;}}
      table.push(entry);
    }
    if(opts.index)this._buildIndex(tableName,opts.index);
    if(this.hooks[tableName])for(var hi=0;hi<this.hooks[tableName].length;hi++)this.hooks[tableName][hi](entries,startIdx);
    return this;
  },
  
  /**
   * Register a callback that fires when a table is updated.
   */
  onUpdate:function(tableName,callback){
    if(!this.hooks[tableName])this.hooks[tableName]=[];
    this.hooks[tableName].push(callback);
    return this;
  },
  
  /**
   * Query a table with a predicate function.
   * @param {string} tableName
   * @param {Function|Object} predicate - Function(entry,idx) or filter object {key:value,...}
   * @param {Object} opts - { limit:10, sort:'name', order:'asc' }
   * @returns {Array}
   */
  query:function(tableName,predicate,opts){
    opts=opts||{};
    var table=this.tables[tableName]||[];
    var results;
    if(typeof predicate==='function'){results=[];for(var i=0;i<table.length;i++){if(predicate(table[i],i))results.push(table[i]);}}
    else if(predicate&&typeof predicate==='object'){results=[];for(var i2=0;i2<table.length;i2++){var match=true;for(var k in predicate){if(table[i2][k]!==predicate[k]){match=false;break;}}if(match)results.push(table[i2]);}}
    else results=table.slice();
    if(opts.sort){results.sort(function(a,b){var av=a[opts.sort],bv=b[opts.sort];if(av<bv)return opts.order==='desc'?1:-1;if(av>bv)return opts.order==='desc'?-1:1;return 0;});}
    if(opts.limit)results=results.slice(0,opts.limit);
    return results;
  },
  
  /**
   * Get a single entry by ID.
   */
  get:function(tableName,id){
    return this._findById(tableName,id);
  },
  
  /**
   * Get a random entry, optionally weighted.
   */
  roll:function(tableName,filter){
    var pool=filter?this.query(tableName,filter):this.tables[tableName];
    if(!pool||pool.length===0)return null;
    var hasWeight=false;
    for(var i=0;i<pool.length;i++){if(typeof pool[i].weight==='number'){hasWeight=true;break;}}
    if(!hasWeight)return pool[Math.floor(Math.random()*pool.length)];
    var total=0;for(var wi=0;wi<pool.length;wi++)total+=pool[wi].weight||1;
    var r=Math.random()*total,cum=0;
    for(var ri=0;ri<pool.length;ri++){cum+=pool[ri].weight||1;if(r<=cum)return pool[ri];}
    return pool[pool.length-1];
  },
  
  /**
   * Generate procedural content using registered generator functions.
   */
  generate:function(generatorName,params,count){
    var generator=this._generators[generatorName];
    if(!generator)return [];
    count=count||1;var results=[];
    for(var i=0;i<count;i++)results.push(generator(params,i));
    return results;
  },
  
  _generators:{},
  
  registerGenerator:function(name,fn){
    this._generators[name]=fn;
    return this;
  },
  
  /**
   * Bulk insert thousands of entries efficiently.
   */
  bulkRegister:function(tableName,entryFactory,count){
    var entries=[];
    for(var i=0;i<count;i++)entries.push(entryFactory(i));
    this.register(tableName,entries,{merge:true});
    return this;
  },
  
  /**
   * Generate a human-readable name from templates.
   */
  makeName:function(prefixes,suffixes,separator){
    separator=separator||' ';
    return prefixes[Math.floor(Math.random()*prefixes.length)]+separator+suffixes[Math.floor(Math.random()*suffixes.length)];
  },
  
  /**
   * Create a stat block with randomized values within ranges.
   */
  makeStats:function(template,seed){
    var stats={};
    for(var key in template){var t=template[key];if(typeof t==='number')stats[key]=t;else if(Array.isArray(t))stats[key]=t[0]+Math.random()*(t[1]-t[0]);else if(typeof t==='object'&&t.min!==undefined)stats[key]=t.min+Math.random()*(t.max-t.min);else stats[key]=t;}
    return stats;
  },
  
  /**
   * Create leveled variants of an entry.
   */
  makeLeveledVariants:function(baseEntry,levels,scaling){
    var variants=[];
    for(var i=0;i<levels;i++){
      var level=i+1;var v=JSON.parse(JSON.stringify(baseEntry));
      v.id=baseEntry.id+'_L'+level;v.level=level;
      for(var s in scaling){if(typeof v[s]==='number'){var sc=scaling[s];v[s]=Math.round(baseEntry[s]*Math.pow(sc,level-1)*100)/100;}}
      variants.push(v);
    }
    return variants;
  },
  
  /**
   * Calculate total LOC in all registered tables.
   */
  getStats:function(){
    var totalEntries=0,tableCount=0;
    for(var t in this.tables){tableCount++;totalEntries+=this.tables[t].length;}
    return {tables:tableCount,entries:totalEntries};
  },
  
  _findById:function(tableName,id){
    var table=this.tables[tableName];
    if(!table)return null;
    if(this.indexes[tableName]&&this.indexes[tableName].id){var idx=this.indexes[tableName].id[id];if(idx!==undefined)return table[idx];}
    for(var i=0;i<table.length;i++){if(table[i].id===id)return table[i];}
    return null;
  },
  
  _buildIndex:function(tableName,keys){
    var table=this.tables[tableName];
    var idx=this.indexes[tableName];
    for(var ki=0;ki<keys.length;ki++){
      var key=keys[ki];if(!idx[key])idx[key]={};
      for(var i=0;i<table.length;i++){var val=table[i][key];if(val!==undefined){if(!idx[key][val])idx[key][val]=[];idx[key][val].push(i);}}
    }
  }
};

root.ContentDB=ContentDB;
console.log('[ContentDB] v'+ContentDB.version+' loaded. Ready for content registration.');
})();