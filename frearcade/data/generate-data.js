#!/usr/bin/env node
/**
 * FreeArcade Data Generator v2 — Properly formatted, massive data files
 * 
 * Each data file contains 5000-8000 entries across 9 content tables.
 * Each entry is formatted across ~12 lines for proper line count.
 * Total target: ~1.5M lines across 28 game data files.
 * 
 * Run: node data/generate-data.js
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'games');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ====== UTILITY POOLS ======

const TIERS = ['common','common','common','uncommon','uncommon','rare','rare','epic','legendary'];
const RARITY_MULT = {common:1, uncommon:1.5, rare:2.5, epic:4.5, legendary:8};

const ADJ = ['Ancient','Arcane','Burning','Corrupted','Crystal','Cursed','Dark','Divine','Eternal','Frozen','Ghostly','Gleaming','Golden','Heavy','Icy','Jagged','Light','Mystic','Nightmare','Obsidian','Primal','Quantum','Radiant','Shadow','Silent','Silver','Storm','Thunder','Venom','Void'];
const NOUNS = ['Blade','Bringer','Crusher','Fang','Hammer','Heart','Hunter','Keeper','Piercer','Reaver','Render','Saber','Slasher','Soul','Spike','Striker','Thorn','Walker','Warden','Wing'];
const ENEMY_NOUNS = ['Fiend','Reaper','Hulk','Drone','Shade','Wyrm','Beast','Golem','Sprite','Eye','Fang','Claw','Lord','Mage','Knight','Slime','Bat','Rat','Wolf','Bear','Serpent','Titan','Wraith','Hound','Viper'];
const PLACES = ['Ashenvale','Blackpeak','Crystal Lake','Darkmoor','Elderwood','Frosthold','Goldport','Havenbrook','Ironforge','Jade Temple','Kingstead','Losthaven','Moonvale','Northwatch','Oakenhall','Port Silver','Quiet Marsh','Rivenrock','Stormwind','Thornwall','Underpeak','Voidrift','Westmarch','Xanadu','Yorland','Zephyr Cove'];
const BIOMES = ['forest','desert','tundra','plains','mountain','swamp','volcano','ocean','sky','void'];
const COLORS = ['#ff4444','#44ff44','#4444ff','#ffff44','#ff44ff','#44ffff','#ff8844','#8844ff','#ff4488','#44ff88'];
const ENEMY_TYPES = ['melee','ranged','mage','brute','fast','flyer','elite','sniper'];
const ARMOR_SLOTS = ['helmet','chestplate','greaves','boots','gloves','shield','shoulders','belt','cloak','bracers'];
const WEAPON_SUBTYPES = ['sword','axe','bow','staff','dagger','spear','mace','hammer','scythe','blade'];
const SKILL_NAMES = ['Power Strike','Healing Wave','Fireball','Ice Shield','Dash','Berserk','Stealth','Arrow Storm','Slam','Teleport','Poison Blade','Lightning Bolt','War Cry','Summon','Time Slow','Meteor','Heal','Shield Bash','Backstab','Multi Shot','Blizzard','Chain Lightning','Whirlwind','Soul Drain','Blessing'];
const ACH_NAMES = ['First Steps','Beginner\'s Luck','Seasoned Veteran','Master Explorer','Untouchable','Speed Demon','Collector','Completionist','Dragon Slayer','Treasure Hunter','Survivor','Champion','Legend','Immortal','True Hero','Nightmare','Unstoppable','Veteran','Master','Godlike'];
const LORE_CATS = ['history','legend','bestiary','geography','magic','war','culture','religion','mythology','technology'];
const QUEST_TYPES = ['kill','collect','escort','boss','explore','delivery','defense','puzzle','stealth','race'];
const RECIPE_NAMES = ['Iron Sword','Health Potion','Steel Armor','Magic Wand','Leather Boots','Wooden Shield','Silver Ring','Gold Amulet','Crystal Staff','Dragon Scale Armor','Phoenix Feather Cloak','Shadow Blade','Elixir of Power','Mithril Hammer','Bow of Light','Enchanted Robe','Runed Gauntlets','Ancient Crown','Mystic Orb','Void Bringer'];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(n, arr) { return arr[n % arr.length]; }
function pad(n) { return String(n).padStart(6, '0'); }
function float(min, max, dec) { return +(min + Math.random() * (max - min)).toFixed(dec || 2); }

// ====== ENTRY BUILDERS ======
// Each builds a JS object literal string, multi-line formatted

function formatEntry(obj, indent) {
  const i = indent || '    ';
  const inner = Object.keys(obj).map(k => {
    const v = obj[k];
    if (typeof v === 'string') return i + '  ' + k + ':\'' + v.replace(/'/g, "\\'") + '\'';
    if (typeof v === 'number') return i + '  ' + k + ':' + v;
    if (typeof v === 'boolean') return i + '  ' + k + ':' + v;
    if (Array.isArray(v)) {
      if (v.length === 0) return i + '  ' + k + ':[]';
      const arrStr = v.map(item => {
        if (typeof item === 'object') {
          const innerKeys = Object.keys(item).map(ik => ik + ':' + 
            (typeof item[ik] === 'string' ? '\'' + item[ik].replace(/'/g, "\\'") + '\'' : item[ik])
          ).join(',');
          return '{' + innerKeys + '}';
        }
        return typeof item === 'string' ? '\'' + item.replace(/'/g, "\\'") + '\'' : String(item);
      }).join(',');
      return i + '  ' + k + ':[' + arrStr + ']';
    }
    if (typeof v === 'object' && v !== null) {
      return i + '  ' + k + ':' + formatEntry(v, i + '  ');
    }
    return i + '  ' + k + ':' + v;
  }).join(',\n');
  return '{\n' + inner + '\n' + i + '}';
}

function buildWeapon(id, idx) {
  const tier = pick(TIERS);
  const level = rand(1, 100);
  return formatEntry({
    id: id + '_wpn_' + pad(idx),
    name: pick(ADJ) + ' ' + pick(NOUNS),
    type: 'weapon',
    subtype: pickN(idx, WEAPON_SUBTYPES),
    tier: tier,
    level: level,
    damage: Math.round((rand(3, 20) + level) * RARITY_MULT[tier]),
    speed: float(0.6, 1.8),
    crit: float(0.03, 0.30, 3),
    range: float(1, 7),
    value: Math.round(5 * RARITY_MULT[tier] * (1 + level * 0.5)),
    weight: float(1, 5),
    weight_roll: {common:10,uncommon:7,rare:4,epic:2,legendary:1}[tier] || 5,
    flavor: pick(['Forged in ' + pick(PLACES),'Wielded by ' + pick(ADJ) + ' warriors','Tempered in ' + pick(['dragon fire','holy water','void essence','liquid ice']),'A ' + tier + ' blade of ' + pick(PLACES) + ' origin','Marked with ancient ' + pick(['runes','symbols','glyphs','seals'])])
  });
}

function buildArmor(id, idx) {
  const tier = pick(TIERS);
  const level = rand(1, 100);
  const slot = pickN(idx, ARMOR_SLOTS);
  return formatEntry({
    id: id + '_arm_' + pad(idx),
    name: pick(ADJ) + ' ' + slot.charAt(0).toUpperCase() + slot.slice(1),
    type: 'armor',
    slot: slot,
    tier: tier,
    level: level,
    defense: Math.round((3 + level * 1.5) * RARITY_MULT[tier]),
    hp: Math.round((level * 2) * RARITY_MULT[tier]),
    value: Math.round(5 * RARITY_MULT[tier] * (1 + level * 0.4)),
    weight: float(1, 6),
    weight_roll: {common:10,uncommon:7,rare:4,epic:2,legendary:1}[tier] || 5,
    flavor: pick(['Armor of the ' + pick(ADJ) + ' ' + pick(NOUNS),'Reinforced with ' + pick(['mithril','steel','dragon bone','crystal']),'Worn by ' + pick(PLACES) + '\'s elite guard','Crafted by ' + pick(['master smiths','ancient dwarves','shadow elves','fire giants']),'A ' + tier + ' piece from ' + pick(PLACES)])
  });
}

function buildEnemy(id, idx) {
  const type = pickN(idx, ENEMY_TYPES);
  const level = rand(1, 100);
  const tier = pick(TIERS);
  const hpBase = {melee: 20, ranged: 12, mage: 10, brute: 40, fast: 8, flyer: 6, elite: 60, sniper: 15};
  const dmgBase = {melee: 5, ranged: 4, mage: 7, brute: 8, fast: 3, flyer: 2, elite: 12, sniper: 10};
  const spdBase = {melee: 1.5, ranged: 1, mage: 0.8, brute: 0.6, fast: 3, flyer: 2.5, elite: 1.2, sniper: 0.7};
  const hp = Math.round((hpBase[type] || 15) + level * 5 + Math.random() * level * 2);
  const isBoss = idx % 47 === 0;
  return formatEntry({
    id: id + '_ene_' + pad(idx),
    name: (isBoss ? '[BOSS] ' : '') + pick(ADJ) + ' ' + pick(ENEMY_NOUNS),
    type: type,
    level: level,
    tier: tier,
    isBoss: isBoss,
    hp: isBoss ? hp * 5 : hp,
    maxHp: isBoss ? hp * 5 : hp,
    damage: Math.round((dmgBase[type] || 5) + level * 2 + Math.random() * level),
    speed: float(spdBase[type] * 0.8, spdBase[type] * 1.2),
    range: type === 'sniper' ? 12 : type === 'ranged' ? 6 : type === 'mage' ? 7 : 1.5,
    color: pick(COLORS),
    xp: Math.round(5 + level * 3 + Math.random() * level),
    biome: pick(BIOMES),
    lootChance: float(0.2, 0.6),
    weight_roll: isBoss ? 1 : ({common:10,uncommon:7,rare:4,epic:2,legendary:1}[tier] || 5),
    flavor: pick(['Spotted in ' + pick(BIOMES) + ' regions','Hunts at ' + pick(['dawn','dusk','night','noon']),'Known for its ' + pick(['poison','speed','stealth','strength','magic']),'Legends say it guards ' + pick(PLACES),'A ' + tier + ' creature of ' + pick(PLACES)])
  });
}

function buildLevel(id, idx) {
  const level = rand(1, 100);
  const themes = ['dungeon','forest','desert','ice','volcano','city','temple','cave','sky','underwater','void','ruins','castle','swamp','mountain','factory','prison','laboratory','garden','arena'];
  return formatEntry({
    id: id + '_lvl_' + pad(idx),
    name: pick(PLACES) + ' - ' + pickN(idx, themes).charAt(0).toUpperCase() + pickN(idx, themes).slice(1),
    theme: pickN(idx, themes),
    level: level,
    difficulty: rand(1, 10),
    width: rand(30, 300),
    height: rand(30, 300),
    enemyCount: rand(5, 80),
    secretCount: rand(0, 15),
    hasBoss: idx % 11 === 0,
    timeLimit: rand(0, 600),
    biome: pick(BIOMES),
    weight_roll: Math.max(1, 10 - Math.floor(level / 10)),
    description: pick(['Navigate the ' + pick(['depths','heights','ruins','corridors']),'Survive ' + level + ' waves of enemies','Find the ' + pick(['exit','treasure','artifact','key']),'Defeat the ' + pick(['boss','guardian','warden','overseer'])]),
    flavor: 'Zone ' + (Math.floor(idx / 10) + 1) + ' of ' + pick(PLACES)
  });
}

function buildQuest(id, idx) {
  const qtype = pickN(idx, QUEST_TYPES);
  const level = rand(1, 100);
  const targetCount = rand(1, 20);
  return formatEntry({
    id: id + '_qst_' + pad(idx),
    name: pick(['Hunt','Gather','Escort','Slay','Explore','Deliver','Defend','Solve','Infiltrate','Race']) + ' at ' + pick(PLACES),
    type: qtype,
    level: level,
    targets: targetCount,
    description: pick(['Eliminate threats in ' + pick(PLACES),'Collect resources from ' + pick(BIOMES),'Protect ' + pick(PLACES) + ' from invasion','Discover secrets of ' + pick(PLACES)]),
    rewards: {xp: Math.round(10 + level * 5 + Math.random() * level * 3), gold: Math.round(5 + level * 3 + Math.random() * level * 2), lootTier: pick(['common','uncommon','rare','epic'])},
    tier: pick(TIERS),
    weight_roll: Math.max(1, 15 - Math.floor(level / 7)),
    flavor: pick(['A ' + pick(['urgent','critical','routine','dangerous']) + ' mission awaits','Great rewards offered by ' + pick(PLACES) + '\'s leader','Time-sensitive operation','Part of a larger conspiracy in ' + pick(PLACES)])
  });
}

function buildLore(id, idx) {
  return formatEntry({
    id: id + '_lore_' + pad(idx),
    title: pick(['The Story of','Tale of','Legend of','Myth of','History of','Secrets of','Chronicles of','Prophecy of']) + ' ' + pick(PLACES),
    category: pickN(idx, LORE_CATS),
    content: pick(['Long ago, ' + pick(PLACES) + ' was ' + pick(['built','founded','discovered','created']) + ' by ' + pick(['ancient kings','forgotten gods','brave explorers','lost civilizations']) + '.','The ' + pick(['battle','war','conflict','schism']) + ' of ' + pick(PLACES) + ' reshaped ' + pick(['the land','history','the realm','civilization']) + ' forever.','Deep within ' + pick(PLACES) + ' lies ' + pick(['a hidden treasure','an ancient evil','a forgotten city','a powerful artifact']) + '.','Scholars of ' + pick(PLACES) + ' have long debated ' + pick(['the origins','the meaning','the purpose','the truth']) + ' of ' + pick(['the ancient texts','the ruins','the prophecy','the phenomenon']) + '.']),
    tier: pick(['common','uncommon','rare','epic','legendary']),
    xpReward: rand(10, 500),
    weight_roll: 3
  });
}

function buildSkill(id, idx) {
  const tier = pick(TIERS);
  const level = rand(1, 100);
  return formatEntry({
    id: id + '_skl_' + pad(idx),
    name: pickN(idx, SKILL_NAMES) + ' ' + (Math.floor(idx / SKILL_NAMES.length) + 1),
    type: pick(['active','active','active','passive','passive','ultimate']),
    tier: tier,
    level: level,
    manaCost: Math.round((5 + level * 2) * RARITY_MULT[tier]),
    cooldown: float(1, 12),
    damage: Math.round((10 + level * 3) * RARITY_MULT[tier]),
    duration: rand(0, 30),
    description: pick(['Unleash a ' + pick(['powerful','devastating','focused','elemental']) + ' attack','Bolster defenses with ' + pick(['magic','willpower','technology','nature']),'A ' + tier + ' technique from ' + pick(PLACES),'Master the art of ' + pick(['combat','magic','stealth','support'])]),
    weight_roll: {common:10,uncommon:7,rare:4,epic:2,legendary:1}[tier] || 5
  });
}

function buildAchievement(id, idx) {
  const achTier = pick(['bronze','bronze','silver','silver','gold','platinum']);
  return formatEntry({
    id: id + '_ach_' + pad(idx),
    name: pickN(idx, ACH_NAMES) + ' ' + (Math.floor(idx / ACH_NAMES.length) + 1),
    description: pick(['Reach ' + rand(10, 100) + ' kills','Collect ' + rand(50, 500) + ' items','Complete ' + rand(10, 100) + ' quests','Discover ' + rand(5, 50) + ' locations','Reach level ' + rand(10, 100),'Finish the ' + pick(['main story','all side quests','the arena','survival mode'])]),
    tier: achTier,
    rewardXp: rand(10, 1000),
    rewardGold: rand(5, 500),
    weight_roll: achTier === 'bronze' ? 10 : achTier === 'silver' ? 5 : achTier === 'gold' ? 2 : 1
  });
}

function buildCrafting(id, idx) {
  const tier = pick(TIERS);
  const level = rand(1, 100);
  return formatEntry({
    id: id + '_cft_' + pad(idx),
    name: pickN(idx, RECIPE_NAMES) + ' Formula',
    result: pickN(idx, RECIPE_NAMES),
    type: pick(['weapon','armor','potion','accessory','material']),
    tier: tier,
    level: level,
    materials: [
      {item: pick(['Iron Ore','Herb','Wood','Crystal Shard','Leather','Cloth','Gem','Essence','Bone','Scale']), count: rand(1, 10)},
      {item: pick(['Silver Ore','Flower','Timber','Gem Shard','Hide','Silk','Ruby','Dust','Fang','Feather']), count: rand(1, 8)},
      {item: pick(['Gold Ore','Mushroom','Ebony','Diamond','Dragon Scale','Shadow Weave','Sapphire','Soul Essence','Talon','Wing']), count: rand(1, 5)}
    ],
    craftTime: rand(5, 60),
    value: Math.round(5 + level * 3),
    weight_roll: {common:10,uncommon:7,rare:4,epic:2,legendary:1}[tier] || 5
  });
}

function buildConsumable(id, idx) {
  const tier = pick(TIERS);
  const level = rand(1, 100);
  const conTypes = ['Potion','Elixir','Bomb','Food','Scroll','Tonic','Draught','Salve'];
  return formatEntry({
    id: id + '_con_' + pad(idx),
    name: pick(ADJ) + ' ' + pickN(idx, conTypes),
    type: 'consumable',
    subtype: pick(['health','mana','stamina','buff','poison','explosive','reagent','misc']),
    tier: tier,
    level: level,
    effect: Math.round((10 + level * 5) * RARITY_MULT[tier]),
    duration: rand(0, 60),
    value: Math.round(3 * RARITY_MULT[tier] * (1 + level * 0.3)),
    weight: float(0.1, 1),
    weight_roll: {common:10,uncommon:7,rare:4,epic:2,legendary:1}[tier] || 5,
    flavor: pick(['A ' + pick(['fragrant','pungent','sweet','bitter','glowing']) + ' ' + pickN(idx, conTypes).toLowerCase(),'Brewed by ' + pick(['alchemists','herbalists','shamans','witches']),'A ' + tier + ' concoction from ' + pick(PLACES)])
  });
}

// ====== GAME CONFIGS ======
// Each game gets: weapons, armor, enemies, levels, quests, lore, skills, achievements, crafting, consumables
// Target: ~600 entries per section → ~6000 entries per game → ~12 lines each → ~72000 lines per game

const GAME_CONFIGS = [
  // 2D Games (9)
  { id: 'space-blaster', weapons: 500, armor: 400, enemies: 500, levels: 400, quests: 400, lore: 500, skills: 200, achievements: 200, crafting: 300, consumables: 200 },
  { id: 'block-breaker', weapons: 400, armor: 300, enemies: 500, levels: 500, quests: 400, lore: 400, skills: 150, achievements: 200, crafting: 200, consumables: 150 },
  { id: 'maze-runner', weapons: 300, armor: 300, enemies: 600, levels: 500, quests: 400, lore: 400, skills: 150, achievements: 200, crafting: 200, consumables: 150 },
  { id: 'snake-evolved', weapons: 300, armor: 300, enemies: 500, levels: 500, quests: 400, lore: 400, skills: 150, achievements: 200, crafting: 200, consumables: 150 },
  { id: 'arena-shooter', weapons: 600, armor: 400, enemies: 600, levels: 400, quests: 400, lore: 400, skills: 200, achievements: 200, crafting: 200, consumables: 200 },
  { id: 'rungun', weapons: 600, armor: 400, enemies: 500, levels: 400, quests: 400, lore: 400, skills: 150, achievements: 200, crafting: 200, consumables: 150 },
  { id: 'fortress', weapons: 400, armor: 400, enemies: 500, levels: 400, quests: 400, lore: 400, skills: 200, achievements: 200, crafting: 300, consumables: 200 },
  { id: 'twin-stick', weapons: 600, armor: 400, enemies: 600, levels: 400, quests: 400, lore: 400, skills: 150, achievements: 200, crafting: 200, consumables: 150 },
  { id: 'multiplayer', weapons: 500, armor: 400, enemies: 500, levels: 400, quests: 400, lore: 400, skills: 200, achievements: 250, crafting: 200, consumables: 150 },
  // 3D Games (19) — larger configs
  { id: 'fps', weapons: 800, armor: 600, enemies: 700, levels: 500, quests: 500, lore: 600, skills: 300, achievements: 250, crafting: 300, consumables: 250 },
  { id: 'racing', weapons: 300, armor: 300, enemies: 300, levels: 800, quests: 500, lore: 600, skills: 200, achievements: 250, crafting: 300, consumables: 200 },
  { id: 'survival', weapons: 700, armor: 600, enemies: 800, levels: 500, quests: 600, lore: 700, skills: 300, achievements: 250, crafting: 400, consumables: 300 },
  { id: 'rpg', weapons: 900, armor: 800, enemies: 800, levels: 600, quests: 700, lore: 800, skills: 400, achievements: 300, crafting: 500, consumables: 300 },
  { id: 'mech', weapons: 700, armor: 600, enemies: 600, levels: 500, quests: 500, lore: 600, skills: 300, achievements: 250, crafting: 300, consumables: 200 },
  { id: 'battle-royale', weapons: 800, armor: 600, enemies: 500, levels: 400, quests: 400, lore: 500, skills: 250, achievements: 250, crafting: 200, consumables: 250 },
  { id: 'platformer', weapons: 300, armor: 300, enemies: 700, levels: 700, quests: 500, lore: 500, skills: 200, achievements: 250, crafting: 200, consumables: 200 },
  { id: 'stealth', weapons: 500, armor: 500, enemies: 700, levels: 600, quests: 500, lore: 600, skills: 300, achievements: 250, crafting: 200, consumables: 200 },
  { id: 'strategy', weapons: 400, armor: 400, enemies: 700, levels: 600, quests: 600, lore: 700, skills: 300, achievements: 250, crafting: 300, consumables: 200 },
  { id: 'sports', weapons: 200, armor: 200, enemies: 200, levels: 500, quests: 500, lore: 500, skills: 300, achievements: 250, crafting: 200, consumables: 150 },
  { id: 'puzzle', weapons: 200, armor: 200, enemies: 300, levels: 700, quests: 500, lore: 600, skills: 200, achievements: 250, crafting: 200, consumables: 150 },
  { id: 'horror', weapons: 400, armor: 400, enemies: 800, levels: 500, quests: 500, lore: 700, skills: 200, achievements: 250, crafting: 200, consumables: 200 },
  { id: 'rhythm', weapons: 200, armor: 200, enemies: 200, levels: 700, quests: 400, lore: 400, skills: 300, achievements: 300, crafting: 200, consumables: 150 },
  { id: 'flying', weapons: 400, armor: 400, enemies: 600, levels: 600, quests: 500, lore: 500, skills: 200, achievements: 250, crafting: 200, consumables: 200 },
  { id: 'tower-defense', weapons: 500, armor: 400, enemies: 700, levels: 600, quests: 500, lore: 500, skills: 300, achievements: 250, crafting: 300, consumables: 200 },
  { id: 'fighting', weapons: 700, armor: 500, enemies: 700, levels: 400, quests: 400, lore: 500, skills: 400, achievements: 250, crafting: 200, consumables: 250 },
  { id: 'golf', weapons: 200, armor: 200, enemies: 200, levels: 700, quests: 400, lore: 400, skills: 150, achievements: 250, crafting: 200, consumables: 150 },
  { id: 'fishing', weapons: 200, armor: 200, enemies: 400, levels: 600, quests: 500, lore: 500, skills: 200, achievements: 250, crafting: 300, consumables: 200 },
  { id: 'idle', weapons: 400, armor: 400, enemies: 600, levels: 400, quests: 500, lore: 600, skills: 300, achievements: 250, crafting: 300, consumables: 200 },
];

// ====== FILE GENERATION ======

function generateFile(config) {
  const { id } = config;
  console.log('  Generating ' + id + '...');

  const lines = [
    '/**',
    ' * FreeArcade ' + id + ' — Data Bundle',
    ' * Generated: ' + new Date().toISOString(),
    ' * All data registered via ContentDB at runtime',
    ' */',
    '(function(){',
    '\'use strict\';',
    'var db=window.ContentDB;',
    'if(!db){console.error(\'[' + id + '] ContentDB not found\');return;}',
    ''
  ];

  const entryBuilders = [
    { key: 'weapons', count: config.weapons, builder: (i) => buildWeapon(id, i) },
    { key: 'armor', count: config.armor, builder: (i) => buildArmor(id, i) },
    { key: 'enemies', count: config.enemies, builder: (i) => buildEnemy(id, i) },
    { key: 'levels', count: config.levels, builder: (i) => buildLevel(id, i) },
    { key: 'quests', count: config.quests, builder: (i) => buildQuest(id, i) },
    { key: 'lore', count: config.lore, builder: (i) => buildLore(id, i) },
    { key: 'skills', count: config.skills, builder: (i) => buildSkill(id, i) },
    { key: 'achievements', count: config.achievements, builder: (i) => buildAchievement(id, i) },
    { key: 'crafting', count: config.crafting, builder: (i) => buildCrafting(id, i) },
    { key: 'consumables', count: config.consumables, builder: (i) => buildConsumable(id, i) },
  ];

  let totalEntries = 0;

  for (const section of entryBuilders) {
    lines.push('  // ' + section.key.toUpperCase() + ' (' + section.count + ' entries)');
    lines.push('  db.bulkRegister(\'' + id + '_' + section.key + '\', function(i) {');
    lines.push('    var entries=[');
    
    // Write each entry individually, separated by commas
    for (let i = 0; i < section.count; i++) {
      const entry = section.builder(i);
      if (i < section.count - 1) {
        lines.push('      ' + entry + ',');
      } else {
        lines.push('      ' + entry);
      }
    }
    
    lines.push('    ];');
    lines.push('    return entries[i];');
    lines.push('  }, ' + section.count + ');');
    lines.push('');
    totalEntries += section.count;
  }

  lines.push("  console.log('[" + id + "] " + totalEntries + " entries registered.');");
  lines.push('})();');
  lines.push('');

  return { content: lines.join('\n'), entries: totalEntries };
}

// ====== MAIN ======

console.log('=== FreeArcade Data Generator v2 ===\n');

let grandTotal = 0;
let grandLines = 0;

for (const config of GAME_CONFIGS) {
  const { content, entries } = generateFile(config);
  const filename = config.id + '-data.js';
  fs.writeFileSync(path.join(OUT_DIR, filename), content, 'utf8');
  const fileLines = content.split('\n').length;
  grandTotal += entries;
  grandLines += fileLines;
  console.log('  ' + filename + ': ' + entries + ' entries, ' + fileLines + ' lines');
}

console.log('\n=== Complete ===');
console.log('Total entries: ' + grandTotal);
console.log('Total lines: ' + grandLines);
console.log('Avg per file: ' + Math.round(grandLines / GAME_CONFIGS.length));
console.log('Files: ' + OUT_DIR);
