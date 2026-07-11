export const MAPS = Object.freeze({
  crossroads: Object.freeze({
    id: 'crossroads', title: 'BUMPER-TO-BUMPER BEDLAM', tag: 'URBAN VEHICLE WARFARE',
    description: 'Raid a neon downtown packed with blocks, alleys and crossroads. Hot-wire four-seat cars, form a convoy, or let a motorcycle thread the traffic.',
    accent: '#ff4fd8', icon: '🏙️', texture: 'asphalt', weather: 'NEON DUSK',
  }),
  crown: Object.freeze({
    id: 'crown', title: 'CRATE EXPECTATIONS', tag: 'KING OF THE HILL',
    description: 'One drop zone. One absurdly tall hill. Three crates hammer the summit every 1–5 seconds, so climbing is easy and staying is wonderfully impossible.',
    accent: '#ffd23f', icon: '⛰️', texture: 'summit_stone', weather: 'HIGH WIND',
  }),
  wilds: Object.freeze({
    id: 'wilds', title: 'THE VERY HUNGRY WILDERNESS', tag: 'NEUTRAL MAYHEM',
    description: 'A living jungle thick with trees, ruins, wolves, sheep and crate-gobbling slimes. The battlefield has teeth—and it does not pick teams.',
    accent: '#71f06f', icon: '🌴', texture: 'jungle_floor', weather: 'MONSOON GLOW',
  }),
  rift: Object.freeze({
    id: 'rift', title: 'FLOOR IS LAVA, PROBABLY', tag: 'VOLCANIC SCRAPYARD',
    description: 'Fight across black-rock causeways and a shattered foundry. Risk the glowing rift for rare supplies, or use the high rim to rain trouble below.',
    accent: '#ff6a2b', icon: '🌋', texture: 'volcanic_rock', weather: 'ASHFALL',
  }),
});

export const DEFAULT_MAP_ID = 'crossroads';
export const mapById = id => MAPS[id] || MAPS[DEFAULT_MAP_ID];
