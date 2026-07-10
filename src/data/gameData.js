export const TEAM = Object.freeze({ BLUE: 0x2fb4ff, RED: 0xff5062, YELLOW: 0xffd23f, GREEN: 0x59e065 });

export const CLASSES = Object.freeze({
  scout: { name: 'Scout', hp: 100, mp: 50, speed: 8.5, weapon: 'pistol', ability: 'Tactical Sprint', cost: 15, cooldown: 8 },
  medic: { name: 'Medic', hp: 120, mp: 100, speed: 6.4, weapon: 'needle', ability: 'Nanite Mist', cost: 40, cooldown: 12 },
  sniper: { name: 'Sniper', hp: 90, mp: 80, speed: 6.2, weapon: 'sniper', ability: 'Cloaking Grid', cost: 35, cooldown: 15 },
  gunner: { name: 'Gunner', hp: 150, mp: 60, speed: 5.6, weapon: 'machinegun', ability: 'Overdrive Fire', cost: 30, cooldown: 10 },
  explosives: { name: 'Explosives Master', hp: 130, mp: 70, speed: 5.8, weapon: 'grenade', ability: 'Cluster Toss', cost: 45, cooldown: 14 },
  commando: { name: 'Commando', hp: 160, mp: 50, speed: 6, weapon: 'shotgun', ability: 'Shockwave Jump', cost: 25, cooldown: 6 },
  officer: { name: 'Officer', hp: 140, mp: 100, speed: 6.1, weapon: 'carbine', ability: 'Rallying Cry', cost: 50, cooldown: 18 },
  saboteur: { name: 'Saboteur', hp: 110, mp: 90, speed: 6.8, weapon: 'mine', ability: 'EMP Plant', cost: 35, cooldown: 11 },
  heavy: { name: 'Heavy Shield', hp: 220, mp: 40, speed: 4.7, weapon: 'pistol', ability: 'Phalanx Barrier', cost: 20, cooldown: 9 },
  engineer: { name: 'Tactical Engineer', hp: 130, mp: 80, speed: 6, weapon: 'smg', ability: 'Sentry Deploy', cost: 60, cooldown: 20 },
});

// recoil = how hard the shooter is physically shoved backwards per shot (m/s impulse)
export const WEAPONS = Object.freeze({
  pistol: { name: 'Combat Pistol', damage: 8, rate: .34, speed: 42, range: 38, spread: .018, knockback: 2.5, recoil: .7, color: 0xffdc55 },
  needle: { name: 'Needle Dart Gun', damage: 7, rate: .28, speed: 38, range: 32, spread: .025, knockback: 1.5, recoil: .4, color: 0x78ffbf },
  sniper: { name: 'High-Caliber Rifle', damage: 48, rate: 1.3, speed: 75, range: 70, spread: .002, knockback: 8, recoil: 3.4, color: 0xa7eeff },
  machinegun: { name: 'Heavy Machinegun', damage: 12, rate: .11, speed: 50, range: 45, spread: .055, knockback: 3, recoil: .9, color: 0xffc44a },
  grenade: { name: 'Mortar Grenades', damage: 70, rate: 1.2, speed: 18, range: 30, spread: .01, knockback: 14, recoil: 2.6, explosive: true, gravity: 16, color: 0xff7956 },
  shotgun: { name: 'Dual Shotguns', damage: 12, pellets: 7, rate: .75, speed: 45, range: 24, spread: .13, knockback: 8, recoil: 5.5, color: 0xffb45b },
  carbine: { name: 'Officer Carbine', damage: 15, rate: .24, speed: 52, range: 42, spread: .028, knockback: 3.5, recoil: 1.1, color: 0xffe06b },
  mine: { name: 'Proximity Mines', damage: 75, rate: 1.8, speed: 0, range: 2, spread: 0, knockback: 15, recoil: 0, explosive: true, mine: true, color: 0xff4e66 },
  smg: { name: 'SMG', damage: 9, rate: .095, speed: 46, range: 30, spread: .075, knockback: 2, recoil: .5, color: 0xffef8b },
  rocket: { name: 'Rocket Launcher', damage: 95, rate: 1.5, speed: 26, range: 44, spread: .008, knockback: 18, recoil: 7.5, explosive: true, color: 0xff5a3c },
});

// ── Crates ────────────────────────────────────────────────────────────────────
// weight = spawn chance weighting. tier scales the quality of anything materialized.
export const CRATE_TYPES = Object.freeze({
  brown:  { id: 'brown',  name: 'Crate',          tier: 0, weight: 60, color: 0xb07840, band: 0x7a4e26, drops: 1 },
  yellow: { id: 'yellow', name: 'Uncommon Crate', tier: 1, weight: 25, color: 0xffd23f, band: 0xc79415, drops: 2 },
  blue:   { id: 'blue',   name: 'Rare Crate',     tier: 2, weight: 12, color: 0x58c8ff, band: 0x1f7fc0, drops: 3, shiny: true },
  red:    { id: 'red',    name: 'Legendary Crate',tier: 3, weight: 3,  color: 0xff4d5e, band: 0xa8202f, drops: 4, shiny: true },
});
export function rollCrateType(random = Math.random) {
  const total = Object.values(CRATE_TYPES).reduce((s, c) => s + c.weight, 0);
  let roll = random() * total;
  for (const c of Object.values(CRATE_TYPES)) { roll -= c.weight; if (roll <= 0) return c; }
  return CRATE_TYPES.brown;
}

// ── Loose-crate drops (crate materialized OUTSIDE a builder pad) ─────────────
export const DROPS = Object.freeze([
  { id: 'ammo',   name: 'Ammo Pack',   weight: 24, color: 0xffc44a },
  { id: 'health', name: 'Health Pack', weight: 20, color: 0x59e065 },
  { id: 'mana',   name: 'Mana Cell',   weight: 18, color: 0x2fb4ff },
  { id: 'speed',  name: 'Temp Speed',  weight: 10, color: 0xfff06b, duration: 10 },
  { id: 'shield', name: 'Temp Shield', weight: 10, color: 0x9fe8ff, shield: 100 },
  { id: 'damage', name: 'Damage Boost',weight: 8,  color: 0xff7956, duration: 10 },
  { id: 'rapid',  name: 'Rapid Fire',  weight: 6,  color: 0xffe06b, duration: 8 },
  { id: 'chips',  name: 'Chip Stash',  weight: 4,  color: 0xffd23f },
]);
export function rollDrop(random = Math.random) {
  const total = DROPS.reduce((s, d) => s + d.weight, 0);
  let roll = random() * total;
  for (const d of DROPS) { roll -= d.weight; if (roll <= 0) return d; }
  return DROPS[0];
}

// ── 20 Passive Skills ────────────────────────────────────────────────────────
export const PASSIVE_SKILLS = Object.freeze([
  { id: 'regen',        name: 'Regeneration',   desc: '+2.5 HP per second' },
  { id: 'thickskin',    name: 'Thick Skin',     desc: 'Takes 12% less damage' },
  { id: 'swift',        name: 'Swift Servos',   desc: '+15% move speed' },
  { id: 'vampiric',     name: 'Vampiric Core',  desc: 'Heals 12% of damage dealt' },
  { id: 'sharpshooter', name: 'Sharpshooter',   desc: '+18% weapon damage' },
  { id: 'lucky',        name: 'Lucky Plating',  desc: '12% chance to ignore a hit' },
  { id: 'manabattery',  name: 'Mana Battery',   desc: '+50 max MP, faster regen' },
  { id: 'juggernaut',   name: 'Juggernaut',     desc: '+45 max HP' },
  { id: 'scavenger',    name: 'Scavenger',      desc: 'Double pickup radius' },
  { id: 'longshot',     name: 'Longshot',       desc: '+25% weapon range' },
  { id: 'rapidhands',   name: 'Rapid Hands',    desc: '+15% fire rate' },
  { id: 'shieldborn',   name: 'Shieldborn',     desc: 'Spawns with a 60 HP shield' },
  { id: 'stonefeet',    name: 'Stone Feet',     desc: 'Immune to knockback' },
  { id: 'blastproof',   name: 'Blastproof',     desc: '40% less explosive damage' },
  { id: 'healeraura',   name: 'Healer Aura',    desc: 'Heals nearby allies 1.5 HP/s' },
  { id: 'laststand',    name: 'Last Stand',     desc: 'Survives one lethal hit per life' },
  { id: 'adrenaline',   name: 'Adrenaline',     desc: '+35% speed for 3s when hit' },
  { id: 'thorns',       name: 'Thorn Plating',  desc: 'Reflects 15% of melee damage' },
  { id: 'packrat',      name: 'Pack Rat',       desc: 'Crates opened drop +1 item' },
  { id: 'highjumper',   name: 'High Jumper',    desc: '+40% jump height' },
]);

// ── 20 Active Skills (Special Destructos) ────────────────────────────────────
export const ACTIVE_SKILLS = Object.freeze([
  { id: 'fireball',      name: 'Fireball',        cost: 35, cooldown: 8,  desc: 'Hurls an explosive fire orb' },
  { id: 'blink',         name: 'Blink',           cost: 30, cooldown: 7,  desc: 'Teleports forward 8m' },
  { id: 'healburst',     name: 'Heal Burst',      cost: 40, cooldown: 12, desc: 'Heals nearby allies 40 HP' },
  { id: 'shockwave',     name: 'Shockwave',       cost: 30, cooldown: 9,  desc: 'Radial blast knocks enemies back' },
  { id: 'decoy',         name: 'Holo Decoy',      cost: 25, cooldown: 11, desc: 'Deploys a decoy that draws fire' },
  { id: 'frenzy',        name: 'Frenzy',          cost: 45, cooldown: 14, desc: 'Double fire rate for 5s' },
  { id: 'icenova',       name: 'Ice Nova',        cost: 40, cooldown: 12, desc: 'Freezes nearby enemies 2.5s' },
  { id: 'magnetpull',    name: 'Magnet Pull',     cost: 25, cooldown: 9,  desc: 'Yanks nearby crates to you' },
  { id: 'smokescreen',   name: 'Smoke Screen',    cost: 25, cooldown: 10, desc: 'Cloud blinds enemy aim' },
  { id: 'sentry',        name: 'Sentry Drop',     cost: 55, cooldown: 18, desc: 'Deploys an auto-turret' },
  { id: 'minefield',     name: 'Minefield',       cost: 45, cooldown: 15, desc: 'Scatters 4 proximity mines' },
  { id: 'dashstrike',    name: 'Dash Strike',     cost: 30, cooldown: 8,  desc: 'Dash forward damaging enemies' },
  { id: 'groundpound',   name: 'Ground Pound',    cost: 35, cooldown: 10, desc: 'Leap and slam the ground' },
  { id: 'barrierdome',   name: 'Barrier Dome',    cost: 40, cooldown: 14, desc: '65% damage reduction for 6s' },
  { id: 'chainlightning',name: 'Chain Lightning', cost: 45, cooldown: 12, desc: 'Zaps up to 4 chained enemies' },
  { id: 'rocketbarrage', name: 'Rocket Barrage',  cost: 55, cooldown: 16, desc: 'Fires a fan of 5 rockets' },
  { id: 'snaretrap',     name: 'Snare Trap',      cost: 25, cooldown: 9,  desc: 'Roots the nearest enemy 3s' },
  { id: 'warcry',        name: 'War Cry',         cost: 40, cooldown: 15, desc: 'Allies gain speed + damage 8s' },
  { id: 'quake',         name: 'Quake',           cost: 50, cooldown: 14, desc: 'Fissure stuns enemies in a line' },
  { id: 'overcharge',    name: 'Overcharge',      cost: 45, cooldown: 13, desc: 'Next 3 shots deal triple damage' },
]);

// ── D-Builder recipes (Team Buddies style: 2x2 footprint, stacks up to 3 high)
// Cell index = y*4 + z*2 + x  (x,z in 0..1, y in 0..2 → 12 cells)
// tier of the built thing = average crate rarity of the combo.
export const RECIPES = Object.freeze([
  { id: 'light',   label: 'LIGHT WEAPON',      count: 1,  pattern: 'single',   output: 'weapon',  weapons: ['pistol', 'smg', 'carbine', 'sniper'] },
  { id: 'medium',  label: 'MEDIUM WEAPON',     count: 2,  pattern: 'duo-h',    output: 'weapon',  weapons: ['smg', 'carbine', 'shotgun', 'machinegun'] },
  { id: 'buddy',   label: 'NORMAL DESTRUCTO',  count: 2,  pattern: 'duo-v',    output: 'unit',    grade: 'normal' },
  { id: 'elite',   label: 'ELITE DESTRUCTO',   count: 3,  pattern: 'trio-v',   output: 'unit',    grade: 'elite' },
  { id: 'heavyw',  label: 'HEAVY WEAPON',      count: 4,  pattern: 'quad-flat',output: 'weapon',  weapons: ['shotgun', 'machinegun', 'grenade', 'rocket'] },
  { id: 'special', label: 'SPECIAL DESTRUCTO', count: 4,  pattern: 'quad-towers', output: 'unit', grade: 'special' },
  { id: 'superw',  label: 'SUPER WEAPON',      count: 6,  pattern: 'towers-3', output: 'weapon',  weapons: ['grenade', 'rocket', 'rocket', 'rocket'] },
  { id: 'tank',    label: 'STANDARD TANK',     count: 8,  pattern: 'octo',     output: 'vehicle' },
  { id: 'megatank',label: 'MEGA TANK',         count: 12, pattern: 'full',     output: 'vehicle', mega: true },
]);

// ── Cosmetics for the D-Build studio ─────────────────────────────────────────
export const COSMETICS = Object.freeze([
  { id: 'cap',     kind: 'hat',  name: 'Combat Cap',     price: 300 },
  { id: 'helmet',  kind: 'hat',  name: 'Battle Helmet',  price: 500 },
  { id: 'mohawk',  kind: 'hat',  name: 'Neon Mohawk',    price: 750 },
  { id: 'horns',   kind: 'hat',  name: 'Demon Horns',    price: 900 },
  { id: 'halo',    kind: 'hat',  name: 'Golden Halo',    price: 1200 },
  { id: 'crown',   kind: 'hat',  name: 'Royal Crown',    price: 2000 },
  { id: 'antenna', kind: 'hat',  name: 'Radio Antenna',  price: 400 },
  { id: 'tophat',  kind: 'hat',  name: 'Fancy Top Hat',  price: 1500 },
  { id: 'camo',    kind: 'skin', name: 'Jungle Camo',    price: 600 },
  { id: 'tiger',   kind: 'skin', name: 'Tiger Stripes',  price: 800 },
  { id: 'digital', kind: 'skin', name: 'Digital Camo',   price: 700 },
  { id: 'hex',     kind: 'skin', name: 'Hex Mesh',       price: 900 },
  { id: 'circuit', kind: 'skin', name: 'Circuit Board',  price: 1100 },
  { id: 'scales',  kind: 'skin', name: 'Dragon Scales',  price: 1300 },
  { id: 'dots',    kind: 'skin', name: 'Pop Dots',       price: 500 },
  { id: 'urban',   kind: 'skin', name: 'Urban Camo',     price: 650 },
  { id: 'leopard', kind: 'skin', name: 'Leopard Print',  price: 1000 },
  { id: 'stripes', kind: 'skin', name: 'Racing Stripes', price: 550 },
]);

export const SETTINGS_DEFAULTS = Object.freeze({ shadows: true, volume: .55, cameraShake: true });

export const MISSIONS = Object.freeze({
  assault: { id: 'assault', name: 'Operation Green Hammer', type: 'assault', briefing: 'Cross the river, build your squad, and destroy the Red command factory.', objective: 'Destroy the enemy factory', reward: 500 },
  crystal: { id: 'crystal', name: 'Crystal Lock', type: 'capture', briefing: 'Secure the glowing mineral cave while both armies contest the ridge.', objective: 'Hold the mineral cave for 45 seconds', duration: 45, reward: 700 },
  builder: { id: 'builder', name: 'Crate Expectations', type: 'build', briefing: 'Prove the D-Builder doctrine by manufacturing a four-crate unit under fire.', objective: 'Manufacture a 4-crate Destructo', reward: 650 },
});
