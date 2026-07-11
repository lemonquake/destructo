export const CRATE_DROP_RULES = Object.freeze({
  brown: Object.freeze({ minSeconds: 3, maxSeconds: 7.5, cap: 30 }),
  yellow: Object.freeze({ minSeconds: 30, maxSeconds: 50, cap: 10 }),
  blue: Object.freeze({ minSeconds: 40, maxSeconds: 70, cap: 7 }),
  red: Object.freeze({ minSeconds: 50, maxSeconds: 60, cap: 3 }),
});

export const TEAM_DROP_TYPES = Object.freeze(['brown']);
export const RARE_DROP_TYPES = Object.freeze(['yellow', 'blue', 'red']);

const intervalFor = (type, random, zone = null) => {
  if (zone?.interval) return zone.interval.minSeconds + random() * (zone.interval.maxSeconds - zone.interval.minSeconds);
  const rule = CRATE_DROP_RULES[type];
  return rule.minSeconds + random() * (rule.maxSeconds - rule.minSeconds);
};

// Each zone owns one independent clock per crate type. A clock pauses at its cap
// and checks again shortly, so clearing a crowded pad gets supply moving again.
export class CrateDropScheduler {
  constructor(zones, random = Math.random) {
    this.zones = zones;
    this.random = random;
    this.clocks = new Map();
    for (const zone of zones) {
      const types = zone.types || (zone.kind === 'team' ? TEAM_DROP_TYPES : RARE_DROP_TYPES);
      this.clocks.set(zone.id, Object.fromEntries(types.map(type => [type, intervalFor(type, random, zone)])));
    }
  }

  update(dt, countCrates, spawnCrate) {
    const events = [];
    for (const zone of this.zones) {
      const clocks = this.clocks.get(zone.id);
      for (const type of Object.keys(clocks)) {
        clocks[type] -= dt;
        if (clocks[type] > 0) continue;
        const rule = CRATE_DROP_RULES[type];
        if (countCrates(zone, type) < rule.cap) {
          const burst = Math.max(1, zone.burst || 1);
          for (let i = 0; i < burst; i++) {
            const crate = spawnCrate(zone, type);
            if (crate) events.push({ zone, type, crate });
          }
          clocks[type] = intervalFor(type, this.random, zone);
        } else {
          clocks[type] = .5;
        }
      }
    }
    return events;
  }

  next(types = null) {
    let result = null;
    for (const zone of this.zones) {
      const clocks = this.clocks.get(zone.id);
      for (const [type, seconds] of Object.entries(clocks)) {
        if (types && !types.includes(type)) continue;
        if (!result || seconds < result.seconds) result = { zone, type, seconds: Math.max(0, seconds) };
      }
    }
    return result;
  }
}
