export const TEAM = Object.freeze({ BLUE: 0x2fb4ff, RED: 0xff5062, YELLOW: 0xffd23f, GREEN: 0x59e065 });

// ── Multi-team support (up to 10 player slots) ───────────────────────────────
export const TEAM_COLORS = Object.freeze([
  { id: 'blue',   name: 'Blue',   color: 0x2fb4ff, dark: 0x11638f },
  { id: 'red',    name: 'Red',    color: 0xff5062, dark: 0x8e2634 },
  { id: 'green',  name: 'Green',  color: 0x59e065, dark: 0x1f7a2e },
  { id: 'yellow', name: 'Yellow', color: 0xffd23f, dark: 0x9c7a10 },
  { id: 'purple', name: 'Purple', color: 0xa06bff, dark: 0x4f2f92 },
  { id: 'orange', name: 'Orange', color: 0xff8a2c, dark: 0x9c4c0e },
  { id: 'cyan',   name: 'Cyan',   color: 0x35e0d0, dark: 0x117a72 },
  { id: 'pink',   name: 'Pink',   color: 0xff6bc5, dark: 0x99306f },
  { id: 'white',  name: 'White',  color: 0xe8ecf2, dark: 0x7c8494 },
  { id: 'slate',  name: 'Slate',  color: 0x8093c9, dark: 0x39415c },
]);
export const MAX_PLAYERS = 10;
export const DEFAULT_TEAM_NAMES = Object.freeze(['Buddies', 'Raiders', 'Wreckers', 'Bandits', 'Molars', 'Sparks', 'Chompers', 'Vipers', 'Ghosts', 'Loonies']);
export function defaultTeamSetup(count = 2) {
  count = Math.max(2, Math.min(MAX_PLAYERS, count));
  return Array.from({ length: count }, (_, i) => ({ name: DEFAULT_TEAM_NAMES[i], colorIndex: i, group: i, uniformIndex: i % 10, isHuman: i === 0 }));
}

// ── Alliance grouping (team-oriented Deathmatch setup) ───────────────────────
// Teams sharing a group index are allied. Groups are kept compact (0..k) so the
// setup UI can render them as columns A, B, C… with no gaps.
export const MAX_ALLIANCES = 5;
export function normalizeAllianceGroups(setup) {
  const groups = [...new Set(setup.map(t => t.group))].sort((a, b) => a - b);
  const remap = new Map(groups.map((g, i) => [g, i]));
  for (const t of setup) t.group = remap.get(t.group);
  return setup;
}
// Move one team a column left (-1) or right (+1). Moving right past the last
// column spins the team off into a brand-new alliance (bounded by
// MAX_ALLIANCES); a team already alone at the end has nowhere to go.
export function shiftTeamAlliance(setup, index, dir) {
  const team = setup[index];
  if (!team || !dir) return setup;
  const groups = [...new Set(setup.map(t => t.group))].sort((a, b) => a - b);
  const pos = groups.indexOf(team.group);
  const targetPos = pos + Math.sign(dir);
  if (targetPos < 0) return normalizeAllianceGroups(setup);
  if (targetPos >= groups.length) {
    const alone = setup.filter(t => t.group === team.group).length === 1;
    if (!alone && groups.length < Math.min(setup.length, MAX_ALLIANCES)) team.group = Math.max(...groups) + 1;
  } else {
    team.group = groups[targetPos];
  }
  return normalizeAllianceGroups(setup);
}
// "2v2", "3v1", "1v1v1v1" — the at-a-glance shape of the battle.
export function allianceSummary(setup) {
  const counts = {};
  for (const t of setup) counts[t.group] = (counts[t.group] || 0) + 1;
  return Object.keys(counts).sort((a, b) => a - b).map(g => counts[g]).join('v');
}

export const CLASSES = Object.freeze({
  scout: { name: 'Scout', hp: 100, mp: 50, speed: 13.175, weapon: 'pistol', ability: 'Tactical Sprint', cost: 15, cooldown: 8 },
  medic: { name: 'Medic', hp: 120, mp: 100, speed: 8.32, weapon: 'uzi', ability: 'Heal', cost: 10, cooldown: 6 },
  sniper: { name: 'Sniper', hp: 90, mp: 80, speed: 9.61, weapon: 'sniper', ability: 'Cloaking Grid', cost: 35, cooldown: 15 },
  gunner: { name: 'Gunner', hp: 150, mp: 60, speed: 8.68, weapon: 'machinegun', ability: 'Overdrive Fire', cost: 30, cooldown: 10 },
  explosives: { name: 'Explosives Master', hp: 130, mp: 70, speed: 8.99, weapon: 'grenade', ability: 'Cluster Toss', cost: 45, cooldown: 14 },
  commando: { name: 'Commando', hp: 160, mp: 50, speed: 9.3, weapon: 'shotgun', ability: 'Grappling Hook', cost: 25, cooldown: 3 },
  officer: { name: 'Officer', hp: 140, mp: 100, speed: 9.455, weapon: 'carbine', ability: 'Rallying Cry', cost: 50, cooldown: 18 },
  saboteur: { name: 'Saboteur', hp: 110, mp: 90, speed: 10.54, weapon: 'mine', ability: 'EMP Plant', cost: 35, cooldown: 11 },
  heavy: { name: 'Heavy Shield', hp: 220, mp: 40, speed: 6.11, weapon: 'pistol', ability: 'Phalanx Barrier', cost: 20, cooldown: 9 },
  engineer: { name: 'Tactical Engineer', hp: 130, mp: 80, speed: 9.3, weapon: 'smg', ability: 'Sentry Deploy', cost: 60, cooldown: 20 },
});

// recoil = how hard the shooter is physically shoved backwards per shot (m/s impulse)
export const WEAPONS = Object.freeze({
  pistol: { name: 'Combat Pistol', damage: 8, rate: .34, bulletSpeed: 63, shotPower: 50, effectiveRange: 38, ballistic: true, spread: .0144, knockback: 2.5, recoil: .7, color: 0xffdc55, projectileStyle: 'slug' },
  needle: { name: 'Needle Dart Gun', damage: 7, rate: .28, bulletSpeed: 57, shotPower: 46, effectiveRange: 32, ballistic: true, spread: .02, knockback: 1.5, recoil: .4, color: 0x78ffbf, projectileStyle: 'dart' },
  uzi: { name: 'Uzi', damage: 4, rate: .08, bulletSpeed: 70, shotPower: 48, effectiveRange: 28, ballistic: true, spread: .04, knockback: 1.2, recoil: .5, color: 0xffea77, projectileStyle: 'tracer' },
  flamethrower: { name: 'Flamethrower', damage: 6, rate: .07, bulletSpeed: 45, shotPower: 22, effectiveRange: 20, ballistic: true, spread: .08, knockback: 1, recoil: .2, color: 0xff5500, projectileStyle: 'plasma' },
  railgun: { name: 'Hyper Railgun', damage: 85, rate: 1.8, bulletSpeed: 150, shotPower: 90, effectiveRange: 65, ballistic: true, spread: .001, knockback: 12, recoil: 4.8, color: 0x33ff33, projectileStyle: 'lance' },
  freezeray: { name: 'Cryo Freeze Ray', damage: 8, rate: .15, bulletSpeed: 60, shotPower: 42, effectiveRange: 35, ballistic: true, spread: .03, knockback: 2, recoil: .5, color: 0x33ffff, projectileStyle: 'arc' },
  sniper: { name: 'High-Caliber Rifle', damage: 48, rate: 1.3, bulletSpeed: 112.5, shotPower: 80, effectiveRange: 70, ballistic: true, spread: .0016, knockback: 8, recoil: 3.4, color: 0xa7eeff, projectileStyle: 'lance' },
  machinegun: { name: 'Heavy Machinegun', damage: 13, rate: .13, bulletSpeed: 75, shotPower: 52, effectiveRange: 45, ballistic: true, spread: .026, knockback: 3, recoil: 1.05, color: 0xffc44a, projectileStyle: 'tracer' },
  grenade: { name: 'Mortar Grenades', damage: 70, rate: 1.2, bulletSpeed: 27, shotPower: 38, effectiveRange: 30, ballistic: true, spread: .008, knockback: 14, recoil: 2.6, explosive: true, color: 0xff7956, projectileStyle: 'grenade' },
  shotgun: { name: 'Dual Shotguns', damage: 13, pellets: 12, rate: .78, bulletSpeed: 67.5, shotPower: 44, effectiveRange: 24, ballistic: true, spread: .092, knockback: 8, recoil: 5.5, color: 0xffb45b, projectileStyle: 'pellet' },
  carbine: { name: 'Officer Carbine', damage: 15, rate: .25, bulletSpeed: 78, shotPower: 55, effectiveRange: 42, ballistic: true, spread: .018, knockback: 3.5, recoil: 1.1, color: 0xffe06b, projectileStyle: 'bolt' },
  mine: { name: 'Proximity Mines', damage: 75, rate: 1.8, bulletSpeed: 0, shotPower: 0, effectiveRange: 2, ballistic: false, spread: 0, knockback: 15, recoil: 0, explosive: true, mine: true, color: 0xff4e66, projectileStyle: 'mine' },
  smg: { name: 'SMG', damage: 10, rate: .12, bulletSpeed: 69, shotPower: 48, effectiveRange: 30, ballistic: true, spread: .034, knockback: 2, recoil: .62, color: 0xffef8b, projectileStyle: 'tracer' },
  rocket: { name: 'Rocket Launcher', damage: 95, rate: 1.5, bulletSpeed: 26, shotPower: 60, effectiveRange: 44, ballistic: true, spread: .0064, knockback: 18, recoil: 7.5, explosive: true, color: 0xff5a3c, projectileStyle: 'rocket' },
  grenadelauncher: { name: 'Grenade Launcher', damage: 60, rate: 1.0, bulletSpeed: 30, shotPower: 42, effectiveRange: 35, ballistic: true, spread: .016, knockback: 12, recoil: 2.8, explosive: true, color: 0xffaa44, projectileStyle: 'grenade' },
  rifle: { name: 'Assault Rifle', damage: 18, rate: .18, bulletSpeed: 82.5, shotPower: 58, effectiveRange: 50, ballistic: true, spread: .012, knockback: 4, recoil: 1.2, color: 0xffea77, projectileStyle: 'bolt' },
  tesla: { name: 'Tesla Cannon', damage: 14, rate: .15, bulletSpeed: 67.5, shotPower: 44, effectiveRange: 32, ballistic: true, spread: .048, knockback: 3, recoil: .8, color: 0x88ffff, projectileStyle: 'arc' },
  plasma: { name: 'Plasma Rifle', damage: 25, rate: .4, bulletSpeed: 57, shotPower: 50, effectiveRange: 40, ballistic: true, spread: .02, knockback: 6, recoil: 1.8, color: 0xff33ff, projectileStyle: 'plasma' },
});

// ── Crates ────────────────────────────────────────────────────────────────────
// weight = spawn chance weighting. tier scales the quality of anything materialized.
export const CRATE_TYPES = Object.freeze({
  brown:  { id: 'brown',  name: 'Crate',          tier: 0, weight: 78, color: 0xb07840, band: 0x7a4e26, drops: 1, mass: 1 },
  yellow: { id: 'yellow', name: 'Uncommon Crate', tier: 1, weight: 25, color: 0xffd23f, band: 0xc79415, drops: 2, mass: 1.65 },
  blue:   { id: 'blue',   name: 'Rare Crate',     tier: 2, weight: 12, color: 0x58c8ff, band: 0x1f7fc0, drops: 3, mass: 2.5, shiny: true },
  red:    { id: 'red',    name: 'Legendary Crate',tier: 3, weight: 3,  color: 0xff4d5e, band: 0xa8202f, drops: 4, mass: 4, shiny: true },
});

export const WEAPON_VARIANT_NAMES = Object.freeze(['STANDARD', 'GILDED', 'CHARGED', 'OVERCHARGED', 'CRIMSON', 'CRIMSON CATACLYSM']);

// Every crate contributes independently, then notable color pairings receive a synergy.
// This keeps Yellow+Blue above a lone Blue, Blue+Blue above that, and two Reds at the apex.
export function crateCombinationProfile(crates = []) {
  const counts = { brown: 0, yellow: 0, blue: 0, red: 0 };
  for (const crate of crates) counts[crate?.crateType?.id || crate?.id || 'brown']++;
  let strength = counts.yellow + counts.blue * 2.25 + counts.red * 4;
  if (counts.yellow && counts.blue) strength += .75;
  if (counts.blue >= 2) strength += 1 + (counts.blue - 2) * .35;
  if (counts.red >= 2) strength += 2 + (counts.red - 2) * .5;
  strength = Math.min(12, strength);
  const dominant = counts.red ? 'red' : counts.blue ? 'blue' : counts.yellow ? 'yellow' : 'brown';
  const rank = counts.red >= 2 ? 5 : counts.red ? 4 : counts.blue >= 2 ? 3 : counts.blue ? 2 : counts.yellow ? 1 : 0;
  return { counts, strength, dominant, rank, crimson: counts.red >= 2, label: WEAPON_VARIANT_NAMES[rank] };
}

export function buildWeaponVariant(weaponId, crates = []) {
  const base = WEAPONS[weaponId];
  const profile = crateCombinationProfile(crates);
  const power = profile.strength;
  const dominantType = CRATE_TYPES[profile.dominant];
  return {
    ...base,
    name: `${profile.label} ${base.name}`,
    baseName: base.name,
    damage: Math.round(base.damage * (1 + power * .12)),
    bulletSpeed: base.bulletSpeed * (1 + power * .065),
    shotPower: Math.min(100, base.shotPower + power * 2),
    effectiveRange: base.effectiveRange * (1 + power * .025),
    knockback: base.knockback * (1 + power * .07),
    projectileScale: 1 + power * .11,
    rarityColor: dominantType.color,
    color: profile.crimson ? 0xff102c : dominantType.id === 'brown' ? base.color : dominantType.color,
    variant: profile,
    crimson: profile.crimson,
  };
}

export const DESTRUCTO_CRATE_SPEED = Object.freeze({ brown: 0, yellow: .15, blue: .20, red: .30 });
export const TANK_CRATE_HP = Object.freeze({ brown: 0, yellow: .10, blue: .15, red: .25 });
export const destructoSpeedBonus = profile => DESTRUCTO_CRATE_SPEED[profile?.dominant || 'brown'] || 0;
export const tankHpBonus = profile => TANK_CRATE_HP[profile?.dominant || 'brown'] || 0;
export function rollCrateType(random = Math.random) {
  const total = Object.values(CRATE_TYPES).reduce((s, c) => s + c.weight, 0);
  let roll = random() * total;
  for (const c of Object.values(CRATE_TYPES)) { roll -= c.weight; if (roll <= 0) return c; }
  return CRATE_TYPES.brown;
}

// Supply waves alternate at 30-second marks: Yellow at :30, Blue at :60.
export function scheduledCrateType(waveNumber) {
  return waveNumber % 2 ? CRATE_TYPES.yellow : CRATE_TYPES.blue;
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
  { id: 'grenades', name: 'Grenade Pair', weight: 6, color: 0xff7956, amount: 2 },
]);
export function rollDrop(random = Math.random) {
  const total = DROPS.reduce((s, d) => s + d.weight, 0);
  let roll = random() * total;
  for (const d of DROPS) { roll -= d.weight; if (roll <= 0) return d; }
  return DROPS[0];
}

// ── 20 Passive Skills ────────────────────────────────────────────────────────
// Every passive either strengthens the squad directly or carves out a tactical
// role (anchor, spearhead, supplier) so mixed squads always synergize.
export const PASSIVE_SKILLS = Object.freeze([
  { id: 'regen',        name: 'Field Mender',    desc: '+2.5 HP/s; frontline sustain anchor' },
  { id: 'thickskin',    name: 'Bulwark Plating', desc: '12% less damage; allies within 5m take 8% less' },
  { id: 'swift',        name: 'Vanguard Servos', desc: '+15% speed; allies within 6m march 8% faster' },
  { id: 'vampiric',     name: 'Vampiric Core',   desc: 'Heals 12% of damage dealt' },
  { id: 'sharpshooter', name: 'Sharpshooter',    desc: '+18% weapon damage' },
  { id: 'lucky',        name: 'Lucky Plating',   desc: '12% chance to ignore a hit' },
  { id: 'manabattery',  name: 'Mana Battery',    desc: '+50 max MP, faster regen' },
  { id: 'juggernaut',   name: 'Juggernaut',      desc: '+45 max HP' },
  { id: 'scavenger',    name: 'Scavenger',       desc: 'Double pickup radius; feeds the squad supplies' },
  { id: 'longshot',     name: 'Longshot',        desc: '+25% weapon range' },
  { id: 'rapidhands',   name: 'Rapid Hands',     desc: '+15% fire rate' },
  { id: 'shieldborn',   name: 'Shieldborn',      desc: 'Spawns with a 60 HP shield' },
  { id: 'stonefeet',    name: 'Stone Feet',      desc: 'Immune to knockback; holds the line' },
  { id: 'blastproof',   name: 'Blastproof',      desc: '40% less explosive damage' },
  { id: 'healeraura',   name: 'Medic Aura',      desc: 'Heals nearby allies 1.5 HP/s' },
  { id: 'laststand',    name: 'Last Stand',      desc: 'Survives one lethal hit per life' },
  { id: 'adrenaline',   name: 'Adrenaline',      desc: '+35% speed for 3s when hit' },
  { id: 'thorns',       name: 'Thorn Plating',   desc: 'Reflects 10% of all damage to the attacker' },
  { id: 'packrat',      name: 'Pack Rat',        desc: 'Crates opened drop +1 item for the team' },
  { id: 'highjumper',   name: 'High Jumper',     desc: '+40% jump height; crate-hopping flanker' },
]);

// ── 20 Active Skills (Special Destructos) ────────────────────────────────────
// Revamped for teamplay: buffs spread to nearby allies, debuffs open windows
// for the squad, and control skills set up coordinated pushes.
export const ACTIVE_SKILLS = Object.freeze([
  { id: 'fireball',      name: 'Fireball',        cost: 35, cooldown: 8,  desc: 'Explosive fire orb — breaks fortified positions' },
  { id: 'blink',         name: 'Blink',           cost: 30, cooldown: 7,  desc: 'Teleports 8m — flank while the squad holds fire' },
  { id: 'healburst',     name: 'Heal Burst',      cost: 40, cooldown: 12, desc: 'Heals nearby allies 40 HP and cleanses freeze/stun' },
  { id: 'shockwave',     name: 'Shockwave',       cost: 30, cooldown: 9,  desc: 'Radial blast shoves enemies off your allies' },
  { id: 'decoy',         name: 'Holo Decoy',      cost: 25, cooldown: 11, desc: 'Decoy draws fire away from the squad' },
  { id: 'frenzy',        name: 'Frenzy',          cost: 45, cooldown: 14, desc: 'Double fire rate 5s; rapid-fire surge to nearby allies' },
  { id: 'icenova',       name: 'Ice Nova',        cost: 40, cooldown: 12, desc: 'Freezes nearby enemies 2.5s — squad focus window' },
  { id: 'magnetpull',    name: 'Magnet Pull',     cost: 25, cooldown: 9,  desc: 'Yanks crates in — instant builder supplies' },
  { id: 'smokescreen',   name: 'Smoke Screen',    cost: 25, cooldown: 10, desc: 'Blinds enemy aim to cover a squad advance' },
  { id: 'sentry',        name: 'Sentry Drop',     cost: 55, cooldown: 18, desc: 'Auto-turret that anchors the squad position' },
  { id: 'minefield',     name: 'Minefield',       cost: 45, cooldown: 15, desc: 'Scatters 4 mines to deny flanking routes' },
  { id: 'dashstrike',    name: 'Dash Strike',     cost: 30, cooldown: 8,  desc: 'Dash through the line, damaging enemies' },
  { id: 'groundpound',   name: 'Ground Pound',    cost: 35, cooldown: 10, desc: 'Leap-slam that scatters an enemy push' },
  { id: 'barrierdome',   name: 'Barrier Dome',    cost: 40, cooldown: 14, desc: '65% damage reduction for you + nearby allies 6s' },
  { id: 'chainlightning',name: 'Chain Lightning', cost: 45, cooldown: 12, desc: 'Zaps up to 4 chained enemies' },
  { id: 'rocketbarrage', name: 'Rocket Barrage',  cost: 55, cooldown: 16, desc: 'Fan of 5 rockets to open an assault' },
  { id: 'snaretrap',     name: 'Snare Trap',      cost: 25, cooldown: 9,  desc: 'Roots the nearest enemy 3s for the squad to punish' },
  { id: 'warcry',        name: 'War Cry',         cost: 40, cooldown: 15, desc: 'Allies gain speed + damage for 8s' },
  { id: 'quake',         name: 'Quake',           cost: 50, cooldown: 14, desc: 'Fissure stuns enemies in a line' },
  { id: 'overcharge',    name: 'Overcharge',      cost: 45, cooldown: 13, desc: '3 triple-damage shots; nearby allies get 1 each' },
]);

// ── Weapon drops from rare crates (materialized OUTSIDE a builder pad) ───────
// Blue and Red crates very likely eject a real weapon along with their drops.
export const CRATE_WEAPON_CHANCE = Object.freeze({ brown: 0, yellow: .2, blue: .8, red: .95 });
export const CRATE_WEAPON_POOLS = Object.freeze({
  yellow: ['smg', 'carbine', 'needle'],
  blue: ['rifle', 'shotgun', 'machinegun', 'grenadelauncher', 'tesla'],
  red: ['rocket', 'plasma', 'machinegun', 'shotgun', 'tesla'],
});
export function rollCrateWeapon(crateTypeId, random = Math.random) {
  if (random() >= (CRATE_WEAPON_CHANCE[crateTypeId] || 0)) return null;
  const pool = CRATE_WEAPON_POOLS[crateTypeId] || CRATE_WEAPON_POOLS.blue;
  return pool[Math.floor(random() * pool.length)];
}

// ── D-Builder recipes (Team Buddies style: 2x2 footprint, stacks up to 3 high)
// Cell index = y*4 + z*2 + x  (x,z in 0..1, y in 0..2 → 12 cells)
// tier of the built thing = average crate rarity of the combo.
export const RECIPES = Object.freeze([
  { id: 'pistol',          label: 'COMBAT PISTOL',        count: 1,  pattern: 'single',           output: 'weapon',  weaponId: 'pistol' },
  { id: 'grenadelauncher', label: 'GRENADE LAUNCHER',    count: 2,  pattern: 'duo-h',            output: 'weapon',  weaponId: 'grenadelauncher' },
  { id: 'needle',          label: 'NEEDLE DART GUN',      count: 2,  pattern: 'duo-diag',         output: 'weapon',  weaponId: 'needle' },
  { id: 'smg',             label: 'SMG',                  count: 3,  pattern: 'step-adj',         output: 'weapon',  weaponId: 'smg' },
  { id: 'carbine',         label: 'OFFICER CARBINE',      count: 3,  pattern: 'step-diag',        output: 'weapon',  weaponId: 'carbine' },
  { id: 'flamethrower',    label: 'FLAMETHROWER',         count: 4,  pattern: 'tall-step-diag',   output: 'weapon',  weaponId: 'flamethrower' },
  { id: 'railgun',         label: 'HYPER RAILGUN',        count: 6,  pattern: 'twin-towers-diag', output: 'weapon',  weaponId: 'railgun' },
  { id: 'freezeray',       label: 'CRYO FREEZE RAY',      count: 6,  pattern: 'trident',          output: 'weapon',  weaponId: 'freezeray' },
  { id: 'mine',            label: 'PROXIMITY MINES',      count: 4,  pattern: 'tall-step-adj',    output: 'weapon',  weaponId: 'mine' },
  { id: 'rifle',           label: 'ASSAULT RIFLE',        count: 3,  pattern: 'trio-flat',        output: 'weapon',  weaponId: 'rifle' },
  { id: 'tesla',           label: 'TESLA CANNON',         count: 4,  pattern: 'pyramid',          output: 'weapon',  weaponId: 'tesla' },
  { id: 'rocket',          label: 'ROCKET LAUNCHER',      count: 4,  pattern: 'double-step-adj',  output: 'weapon',  weaponId: 'rocket' },
  { id: 'plasma',          label: 'PLASMA RIFLE',         count: 4,  pattern: 'double-step-diag', output: 'weapon',  weaponId: 'plasma' },
  { id: 'machinegun',      label: 'HEAVY MACHINEGUN',     count: 4,  pattern: 'quad-flat',        output: 'weapon',  weaponId: 'machinegun' },
  { id: 'shotgun',         label: 'DUAL SHOTGUNS',        count: 6,  pattern: 'twin-towers',      output: 'weapon',  weaponId: 'shotgun' },
  
  { id: 'buddy',           label: 'NORMAL DESTRUCTO',     count: 2,  pattern: 'duo-v',            output: 'unit',    grade: 'normal' },
  { id: 'elite',           label: 'ELITE DESTRUCTO',      count: 3,  pattern: 'trio-v',           output: 'unit',    grade: 'elite' },
  { id: 'special',         label: 'SPECIAL DESTRUCTO',    count: 6,  pattern: 'special-destructo',output: 'unit',    grade: 'special' },
  
  { id: 'apc',             label: 'ARMORED CARRIER',      count: 8,  pattern: 'octo',             output: 'vehicle', vehicleId: 'apc' },
  { id: 'tank',            label: 'BATTLE TANK',          count: 12, pattern: 'full',             output: 'vehicle', vehicleId: 'tank' },
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

export const SETTINGS_DEFAULTS = Object.freeze({ shadows: true, volume: .55, cameraShake: true, musicMuted: false, soundsMuted: false, mouseSensitivity: 1 });

export const MISSIONS = Object.freeze({
  skirmish: { id: 'skirmish', name: 'Battle Royale Skirmish', type: 'skirmish', briefing: 'Up to 10 teams clash on the hills. Destroy every enemy base — when your base falls and your squad is wiped, you are out.', objective: 'Eliminate all enemy teams', reward: 600 },
  assault: { id: 'assault', name: 'Operation Green Hammer', type: 'assault', briefing: 'Cross the river, build your squad, and destroy the Red command factory.', objective: 'Destroy the enemy factory', reward: 500 },
  crystal: { id: 'crystal', name: 'Crystal Lock', type: 'capture', briefing: 'Secure the glowing mineral cave while both armies contest the ridge.', objective: 'Hold the mineral cave for 45 seconds', duration: 45, reward: 700 },
  builder: { id: 'builder', name: 'Crate Expectations', type: 'build', briefing: 'Prove the D-Builder doctrine by manufacturing a four-crate unit under fire.', objective: 'Manufacture a 4-crate Destructo', reward: 650 },
});
