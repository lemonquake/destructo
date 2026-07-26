// ── DESTRUCT-AUTO ROSTER ────────────────────────────────────────────────────
// Ten battle vehicles for the Destruct-Auto arena mode. Every entry is unique:
// no two share a chassis silhouette, a stat spread, or an Ultimate weapon.
//
// Stat units:
//   topSpeed   world units / second on flat ground
//   accel      units / second^2 while the throttle is pinned
//   grip       lateral friction coefficient (higher = less drift)
//   turn       peak yaw rate in radians / second
//   weight     ramming mass multiplier — heavier wins collisions, brakes worse
//   maxHp      hit points before the wreck respawns
//   armor      incoming damage multiplier (lower = tougher)
//   boost      multiplier applied to topSpeed while the nitro key is held

export const ULTIMATE_KINDS = Object.freeze({
  SHOCKWAVE: 'shockwave',   // radial burst centred on the caster
  DASH: 'dash',             // charge forward, damage on contact
  MISSILES: 'missiles',     // homing volley
  MINES: 'mines',           // deployables dropped behind the vehicle
  CHAIN: 'chain',           // instant chaining beam between nearby foes
  FLAK: 'flak',             // 360 degree shrapnel spray
  FIELD: 'field',           // lingering debuff zone
  TRAIL: 'trail',           // burning path laid down over time
  AIRSTRIKE: 'airstrike',   // delayed strike on a marked ground point
  MORTAR: 'mortar',         // high-arc lobbed shells
});

const auto = definition => Object.freeze({
  ...definition,
  stats: Object.freeze(definition.stats),
  smg: Object.freeze(definition.smg),
  ultimate: Object.freeze(definition.ultimate),
  paint: Object.freeze(definition.paint),
});

export const DESTRUCT_AUTOS = Object.freeze([
  auto({
    id: 'crate-crusher', name: 'CRATE CRUSHER', callsign: 'THE LANDLORD', chassis: 'monster',
    role: 'BRAWLER', icon: '🛻',
    blurb: 'A monster truck welded out of shipping crates. It does not go around things.',
    paint: { body: 0xf2542d, trim: 0x2b1b12, glass: 0x9fe8ff, accent: 0xffd23f },
    stats: { topSpeed: 24, accel: 22, grip: 0.72, turn: 1.85, weight: 1.85, maxHp: 210, armor: 0.82, boost: 1.35 },
    smg: { name: 'HOOD REPEATER', damage: 7, rpm: 460, spread: 0.045, range: 78, bulletSpeed: 165, color: 0xffc44a },
    ultimate: {
      id: 'quake-slam', name: 'QUAKE SLAM', kind: ULTIMATE_KINDS.SHOCKWAVE, cooldown: 15,
      description: 'Launch skyward then body-slam the arena for a crushing ring of force.',
      damage: 85, radius: 22, knockback: 46, launch: 17, hangTime: 0.65, color: 0xff8b3d,
    },
  }),
  auto({
    id: 'box-rocket', name: 'BOX ROCKET', callsign: 'ZERO-TO-DEAD', chassis: 'dragster',
    role: 'SPEEDSTER', icon: '🏎️',
    blurb: 'A crate strapped to a jet engine. Steering was considered optional.',
    paint: { body: 0x2fb4ff, trim: 0x0b2b46, glass: 0xd7f7ff, accent: 0xff4fd8 },
    stats: { topSpeed: 46, accel: 40, grip: 0.52, turn: 1.55, weight: 0.66, maxHp: 105, armor: 1.22, boost: 1.6 },
    smg: { name: 'SIDEPOD SPITTER', damage: 5, rpm: 720, spread: 0.06, range: 66, bulletSpeed: 190, color: 0x8be5ff },
    ultimate: {
      id: 'nitro-lance', name: 'NITRO LANCE', kind: ULTIMATE_KINDS.DASH, cooldown: 11,
      description: 'Deploy the spear-nose and rocket forward, skewering anything in the lane.',
      damage: 110, duration: 1.35, speed: 96, radius: 4.2, knockback: 40, color: 0x64f0ff,
    },
  }),
  auto({
    id: 'splinter', name: 'SPLINTER', callsign: 'PIN CUSHION', chassis: 'buggy',
    role: 'SKIRMISHER', icon: '🪲',
    blurb: 'A dune buggy with a missile rack where the passenger seat used to be.',
    paint: { body: 0x71f06f, trim: 0x14351b, glass: 0xdcffe4, accent: 0xffd23f },
    stats: { topSpeed: 36, accel: 30, grip: 0.88, turn: 2.7, weight: 0.82, maxHp: 130, armor: 1.08, boost: 1.45 },
    smg: { name: 'ROLLCAGE UZI', damage: 6, rpm: 640, spread: 0.05, range: 72, bulletSpeed: 178, color: 0xd8ff6a },
    ultimate: {
      id: 'shrapnel-swarm', name: 'SHRAPNEL SWARM', kind: ULTIMATE_KINDS.MISSILES, cooldown: 13,
      description: 'Salvo of six seeker rockets that fan out and curve into whoever is closest.',
      damage: 34, count: 6, radius: 6.5, speed: 62, turnRate: 2.6, life: 5.5, interval: 0.11, color: 0xb6ff4a,
    },
  }),
  auto({
    id: 'hauler', name: 'HAULER', callsign: 'FREIGHT ANXIETY', chassis: 'rig',
    role: 'JUGGERNAUT', icon: '🚛',
    blurb: 'Eighteen wheels, zero brakes, and a trailer full of things that detonate.',
    paint: { body: 0xffd23f, trim: 0x3a2a09, glass: 0xfff4c2, accent: 0xff4d3d },
    stats: { topSpeed: 22, accel: 17, grip: 0.78, turn: 1.35, weight: 2.35, maxHp: 265, armor: 0.7, boost: 1.4 },
    smg: { name: 'CAB-MOUNT CHATTERBOX', damage: 8, rpm: 400, spread: 0.04, range: 84, bulletSpeed: 158, color: 0xffe066 },
    ultimate: {
      id: 'cargo-dump', name: 'CARGO DUMP', kind: ULTIMATE_KINDS.MINES, cooldown: 16,
      description: 'Kick the tailgate and litter the road behind you with proximity crates.',
      damage: 72, count: 5, radius: 9, fuse: 22, armTime: 0.7, interval: 0.28, color: 0xffb02e,
    },
  }),
  auto({
    id: 'voltwagen', name: 'VOLTWAGEN', callsign: 'STATIC HAZARD', chassis: 'hatch',
    role: 'CONTROLLER', icon: '⚡',
    blurb: 'An electric commuter car that solved its range anxiety by stealing yours.',
    paint: { body: 0xa96bff, trim: 0x2a1550, glass: 0xe6d5ff, accent: 0x64f0ff },
    stats: { topSpeed: 33, accel: 31, grip: 0.9, turn: 2.35, weight: 1.0, maxHp: 150, armor: 1.0, boost: 1.42 },
    smg: { name: 'COIL BURST SMG', damage: 6, rpm: 600, spread: 0.038, range: 76, bulletSpeed: 186, color: 0xc59bff },
    ultimate: {
      id: 'tesla-arc', name: 'TESLA ARC', kind: ULTIMATE_KINDS.CHAIN, cooldown: 12,
      description: 'Fire an arc that jumps between up to four hostiles and stuns their drivetrain.',
      damage: 48, jumps: 4, range: 30, chainRange: 22, stun: 1.1, falloff: 0.82, color: 0x9be9ff,
    },
  }),
  auto({
    id: 'scrapyard-dog', name: 'SCRAPYARD DOG', callsign: 'BAD BOY', chassis: 'muscle',
    role: 'BRAWLER', icon: '🐕',
    blurb: 'Muscle car, snowplow blade, and a trunk that fires the entire junkyard at once.',
    paint: { body: 0x8b1e2f, trim: 0x241016, glass: 0xffd9d9, accent: 0xc7cdd6 },
    stats: { topSpeed: 31, accel: 27, grip: 0.8, turn: 2.05, weight: 1.5, maxHp: 185, armor: 0.9, boost: 1.4 },
    smg: { name: 'GRILLE GRINDER', damage: 7, rpm: 520, spread: 0.05, range: 70, bulletSpeed: 170, color: 0xff8a6a },
    ultimate: {
      id: 'junk-storm', name: 'JUNK STORM', kind: ULTIMATE_KINDS.FLAK, cooldown: 12,
      description: 'Detonate the trunk into a full circle of razor scrap at short range.',
      damage: 15, pellets: 26, range: 30, spreadAngle: Math.PI * 2, bulletSpeed: 74, color: 0xd9d2c4,
    },
  }),
  auto({
    id: 'frostbite', name: 'FROSTBITE', callsign: 'COLD OPEN', chassis: 'halftrack',
    role: 'CONTROLLER', icon: '❄️',
    blurb: 'A tracked crawler that hauls a coolant reactor it is definitely not licensed to run.',
    paint: { body: 0x8fe3ff, trim: 0x123448, glass: 0xffffff, accent: 0x2fb4ff },
    stats: { topSpeed: 26, accel: 21, grip: 0.98, turn: 1.7, weight: 1.7, maxHp: 200, armor: 0.86, boost: 1.3 },
    smg: { name: 'FROST CHATTER', damage: 6, rpm: 540, spread: 0.042, range: 80, bulletSpeed: 172, color: 0xbdf0ff },
    ultimate: {
      id: 'cryo-field', name: 'CRYO FIELD', kind: ULTIMATE_KINDS.FIELD, cooldown: 14,
      description: 'Vent the reactor into a freezing dome that slows engines and cracks armour.',
      damage: 12, tick: 0.5, radius: 26, duration: 6, slow: 0.42, vulnerability: 1.35, color: 0x8fe3ff,
    },
  }),
  auto({
    id: 'magma-mite', name: 'MAGMA MITE', callsign: 'HOT LAP', chassis: 'kart',
    role: 'SKIRMISHER', icon: '🔥',
    blurb: 'A tiny volcanic kart that solves problems by refusing to let the floor cool down.',
    paint: { body: 0xff6a2b, trim: 0x2b0d05, glass: 0xffd8a8, accent: 0xffe066 },
    stats: { topSpeed: 39, accel: 34, grip: 0.84, turn: 2.55, weight: 0.74, maxHp: 120, armor: 1.15, boost: 1.5 },
    smg: { name: 'EMBER STINGER', damage: 5, rpm: 700, spread: 0.055, range: 64, bulletSpeed: 182, color: 0xffa23d },
    ultimate: {
      id: 'lava-trail', name: 'LAVA TRAIL', kind: ULTIMATE_KINDS.TRAIL, cooldown: 13,
      description: 'Crack the floor pan and lay a burning ribbon of magma wherever you drive.',
      damage: 26, tick: 0.45, duration: 7, segmentLife: 6.5, radius: 4.6, interval: 0.12, color: 0xff5a1f,
    },
  }),
  auto({
    id: 'sky-hook', name: 'SKY HOOK', callsign: 'LOW ORBIT', chassis: 'hover',
    role: 'SUPPORT', icon: '🛸',
    blurb: 'A hover platform that never touches the ramps and calls in favours from above.',
    paint: { body: 0xe8eef7, trim: 0x1d2a44, glass: 0x64f0ff, accent: 0xff4fd8 },
    stats: { topSpeed: 34, accel: 26, grip: 0.62, turn: 2.2, weight: 0.9, maxHp: 135, armor: 1.1, boost: 1.45, hover: 2.6 },
    smg: { name: 'DRONE PICKET', damage: 6, rpm: 580, spread: 0.036, range: 88, bulletSpeed: 196, color: 0xff9bec },
    ultimate: {
      id: 'orbital-ping', name: 'ORBITAL PING', kind: ULTIMATE_KINDS.AIRSTRIKE, cooldown: 17,
      description: 'Paint the ground ahead and let something unpleasant fall out of the sky.',
      damage: 130, radius: 15, delay: 1.9, markRange: 70, color: 0xff4fd8,
    },
  }),
  auto({
    id: 'iron-maiden', name: 'IRON MAIDEN', callsign: 'SOFT SERVE', chassis: 'van',
    role: 'JUGGERNAUT', icon: '🍦',
    blurb: 'An armoured ice-cream van. The jingle still plays. The mortar drowns it out.',
    paint: { body: 0xfff2e0, trim: 0x3d2c4b, glass: 0xffd7f0, accent: 0xff4d6d },
    stats: { topSpeed: 27, accel: 23, grip: 0.86, turn: 1.9, weight: 1.6, maxHp: 195, armor: 0.88, boost: 1.36 },
    smg: { name: 'SPRINKLE CANNON', damage: 7, rpm: 500, spread: 0.044, range: 82, bulletSpeed: 168, color: 0xffb3d1 },
    ultimate: {
      id: 'siege-mortar', name: 'SIEGE MORTAR', kind: ULTIMATE_KINDS.MORTAR, cooldown: 14,
      description: 'Lob three arcing shells over cover onto whatever your reticle is pointed at.',
      damage: 66, count: 3, radius: 11, arc: 24, travel: 1.5, interval: 0.35, range: 92, color: 0xff4d6d,
    },
  }),
]);

export const AUTO_IDS = Object.freeze(DESTRUCT_AUTOS.map(a => a.id));
export const autoById = id => DESTRUCT_AUTOS.find(a => a.id === id) || DESTRUCT_AUTOS[0];

// Every vehicle needs a distinct silhouette in the selection screen; the model
// builder switches on `chassis`, so a duplicate would break that promise.
export const CHASSIS_KINDS = Object.freeze([...new Set(DESTRUCT_AUTOS.map(a => a.chassis))]);

// Firepower reads off the SMG's sustained damage per second rather than raw stats.
export const smgDps = autoDef => (autoDef.smg.damage * autoDef.smg.rpm) / 60;

// Rounded 1-10 bars for the selection screen readouts.
export const statBars = autoDef => {
  const s = autoDef.stats;
  const bar = (value, min, max) => Math.max(1, Math.min(10, Math.round(((value - min) / (max - min)) * 10)));
  return {
    speed: bar(s.topSpeed, 20, 48),
    accel: bar(s.accel, 15, 42),
    handling: bar(s.turn * s.grip, 0.75, 2.5),
    weight: bar(s.weight, 0.6, 2.4),
    armor: bar(s.maxHp / s.armor, 90, 380),
    firepower: bar(smgDps(autoDef), 45, 70),
  };
};
