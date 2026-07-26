// ── CRATE BLITZ POWER-UPS ───────────────────────────────────────────────────
// Six upgrades hidden inside the destructible obstacles. Each one carries its
// own hand-drawn SVG badge (used by the setup screen, the HUD kit strip and the
// pickup banner) and a `solid` recipe the world builder turns into a physical
// 3D pickup, so the icon you learned in the menu is the shape you see bouncing
// on the floor.
//
// Every gradient/filter id is namespaced with the power-up id: these markup
// strings are injected several times into the same document and duplicate ids
// would make every badge render with the first one's colours.

const svg = (id, body) => `<svg class="pu-svg" viewBox="0 0 64 64" role="img" aria-hidden="true">${body.replace(/%ID%/g, id)}</svg>`;

// Shared defs: a vertical two-stop body gradient plus the glossy highlight that
// gives every badge the same "wet plastic toy" read.
const shell = (id, from, to) => `
  <defs>
    <linearGradient id="%ID%-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="%ID%-shine" cx=".32" cy=".24" r=".62">
      <stop offset="0" stop-color="#fff" stop-opacity=".85"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>`.replace(/%ID%/g, id);

const gloss = '<ellipse cx="24" cy="18" rx="15" ry="10" fill="url(#%ID%-shine)"/>';

export const BLITZ_POWERUPS = Object.freeze({
  // ── blast reach: a four-lane detonation bloom ──────────────────────────────
  power: Object.freeze({
    id: 'power', name: 'BLAST BLOOM', short: 'BLAST',
    description: 'Your charge reaches one tile further down every lane.',
    color: 0xff5a1f, css: '#ff5a1f', weight: 26, max: 8,
    solid: 'star',
    svg: svg('pu-power', `${shell('pu-power', '#ffd23f', '#ff3d1f')}
      <g transform="translate(32 32)">
        <g fill="url(#%ID%-body)" stroke="#5a1400" stroke-width="2.4" stroke-linejoin="round">
          <path d="M0-27 7-9 26-6 12 6 16 25 0 15-16 25-12 6-26-6-7-9Z"/>
        </g>
        <circle r="7.5" fill="#fff5c8" stroke="#5a1400" stroke-width="2.2"/>
        <circle r="3.4" fill="#ff3d1f"/>
      </g>
      <ellipse cx="24" cy="17" rx="12" ry="7" fill="url(#%ID%-shine)"/>`),
  }),

  // ── an extra live charge: a stack of fused crates ──────────────────────────
  charge: Object.freeze({
    id: 'charge', name: 'CRATE STACK', short: 'CHARGES',
    description: 'Carry one more Charge Crate live on the board at once.',
    color: 0xffb02e, css: '#ffb02e', weight: 24, max: 8,
    solid: 'cube',
    svg: svg('pu-charge', `${shell('pu-charge', '#ffd98a', '#e07a12')}
      <rect x="12" y="30" width="40" height="24" rx="4" fill="url(#%ID%-body)" stroke="#4a2603" stroke-width="2.6"/>
      <path d="M12 38h40M28 30v24M40 30v24" stroke="#4a2603" stroke-width="2" opacity=".55"/>
      <rect x="20" y="14" width="24" height="18" rx="3.5" fill="url(#%ID%-body)" stroke="#4a2603" stroke-width="2.6"/>
      <path d="M32 14c0-6 8-5 8-10" stroke="#4a2603" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="41" cy="3.5" r="3.6" fill="#ff5a1f"/>
      <circle cx="41" cy="3.5" r="1.6" fill="#fff2b0"/>
      ${gloss.replace(/%ID%/g, 'pu-charge')}`),
  }),

  // ── movement speed: a boot trailing thrust ────────────────────────────────
  speed: Object.freeze({
    id: 'speed', name: 'BLITZ BOOTS', short: 'SPEED',
    description: 'Permanently quicker between tiles. Stacks.',
    color: 0xd8ff6a, css: '#d8ff6a', weight: 18, max: 6,
    solid: 'wedge',
    svg: svg('pu-speed', `${shell('pu-speed', '#eaffab', '#8fd613')}
      <path d="M6 20h6l4 8 6-4 5 9 7-5 4 10 6-4 5 12H16Z" fill="#ff9f1c" opacity=".9"/>
      <path d="M24 12h11c4 0 6 3 6 7v9l10 6c3 2 5 4 5 8v6H22c-5 0-8-3-8-8V26c0-8 4-14 10-14Z"
            fill="url(#%ID%-body)" stroke="#25400a" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M14 40h28" stroke="#25400a" stroke-width="2.4" opacity=".5"/>
      <circle cx="34" cy="24" r="3.2" fill="#25400a"/>
      <ellipse cx="30" cy="19" rx="10" ry="5" fill="url(#%ID%-shine)"/>`),
  }),

  // ── one absorbed blast: a hex bubble plate ────────────────────────────────
  shield: Object.freeze({
    id: 'shield', name: 'BUBBLE PLATE', short: 'PLATE',
    description: 'Soaks one full blast, then pops. Stacks up to three.',
    color: 0x64f0ff, css: '#64f0ff', weight: 14, max: 3,
    solid: 'shell',
    svg: svg('pu-shield', `${shell('pu-shield', '#c9fbff', '#1a9ec4')}
      <path d="M32 4 55 13v18c0 15-10 25-23 29C19 56 9 46 9 31V13Z"
            fill="url(#%ID%-body)" stroke="#06384a" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M32 14 45 20v10c0 8-6 13-13 16-7-3-13-8-13-16V20Z" fill="#fff" opacity=".28"/>
      <path d="M22 32l7 8 14-16" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="24" cy="17" rx="10" ry="6" fill="url(#%ID%-shine)"/>`),
  }),

  // ── punt a live charge down a lane ────────────────────────────────────────
  kick: Object.freeze({
    id: 'kick', name: 'PUNT GLOVE', short: 'PUNT',
    description: 'Walk into a live charge to boot it down the lane.',
    color: 0xa96bff, css: '#a96bff', weight: 10, max: 1,
    solid: 'fist',
    svg: svg('pu-kick', `${shell('pu-kick', '#e0c4ff', '#7b2bd8')}
      <path d="M8 26c0-4 3-7 7-7h4v-6c0-3 2-5 5-5s5 2 5 5v6h3v-8c0-3 2-5 5-5s5 2 5 5v8h3v-5c0-3 2-5 5-5s5 2 5 5v20c0 11-9 20-20 20h-6C18 54 8 45 8 34Z"
            fill="url(#%ID%-body)" stroke="#2c0d55" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M18 36h22" stroke="#2c0d55" stroke-width="2.4" opacity=".45"/>
      <path d="M50 20l9-5M52 28h10M50 36l9 5" stroke="#ffd23f" stroke-width="3.4" stroke-linecap="round"/>
      <ellipse cx="24" cy="26" rx="10" ry="6" fill="url(#%ID%-shine)"/>`),
  }),

  // ── back to full health: a patch kit ──────────────────────────────────────
  heal: Object.freeze({
    id: 'heal', name: 'PATCH KIT', short: 'PATCH',
    description: 'Slaps you back to full health on the spot.',
    color: 0x5ce065, css: '#5ce065', weight: 8, max: 1,
    solid: 'cross',
    svg: svg('pu-heal', `${shell('pu-heal', '#b7ffbc', '#1f9e35')}
      <rect x="7" y="16" width="50" height="36" rx="7" fill="url(#%ID%-body)" stroke="#0b3d16" stroke-width="2.8"/>
      <path d="M24 16v-4c0-2 2-4 4-4h8c2 0 4 2 4 4v4" fill="none" stroke="#0b3d16" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M28 24h8v7h7v8h-7v7h-8v-7h-7v-8h7Z" fill="#fff" stroke="#0b3d16" stroke-width="2.2" stroke-linejoin="round"/>
      <ellipse cx="22" cy="24" rx="11" ry="6" fill="url(#%ID%-shine)"/>`),
  }),
});

export const POWERUP_IDS = Object.freeze(Object.keys(BLITZ_POWERUPS));
export const powerupById = id => BLITZ_POWERUPS[id] || null;

// Roughly a third of cracked obstacles cough up something useful.
export const DROP_CHANCE = 0.34;

// The weighted pick on its own — the caller decides whether a drop happens at
// all, because the odds are biased by what material was just broken.
export function pickPowerup(random = Math.random) {
  const pool = Object.values(BLITZ_POWERUPS);
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}

// Gate plus pick, at the base rate.
export function rollPowerup(random = Math.random) {
  if (random() > DROP_CHANCE) return null;
  return pickPowerup(random);
}

// Caps, so a lucky crossfire cannot produce an unplayable god.
export const MAX_CHARGES = BLITZ_POWERUPS.charge.max;
export const MAX_POWER = BLITZ_POWERUPS.power.max;
export const MAX_SPEED_STACKS = BLITZ_POWERUPS.speed.max;
export const MAX_PLATES = BLITZ_POWERUPS.shield.max;
export const SPEED_PER_STACK = 1.4;
