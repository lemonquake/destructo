import { SETTINGS_DEFAULTS } from '../data/gameData.js';

const KEY = 'destructo-save-v1';
const DEFAULT_SAVE = { chips: 750, missionsWon: 0, totalKills: 0, blueprints: ['pistol', 'scout'], gear: [], upgrades: {}, cosmetics: [], equipped: { hat: null, skin: null }, settings: SETTINGS_DEFAULTS };

export class SaveSystem {
  constructor() { this.data = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const saved = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_SAVE), ...saved, equipped: { ...DEFAULT_SAVE.equipped, ...(saved.equipped || {}) }, settings: { ...SETTINGS_DEFAULTS, ...(saved.settings || {}) } };
    } catch { return structuredClone(DEFAULT_SAVE); }
  }
  commit() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ } }
  earn(amount) { this.data.chips += Math.max(0, Math.round(amount)); this.commit(); }
  spend(amount) { if (this.data.chips < amount) return false; this.data.chips -= amount; this.commit(); return true; }
  unlock(id, price) { if (this.data.blueprints.includes(id)) return false; if (!this.spend(price)) return false; this.data.blueprints.push(id); this.commit(); return true; }
  buyGear(id, price) { if (this.data.gear.includes(id)) return false; if (!this.spend(price)) return false; this.data.gear.push(id); this.commit(); return true; }
  buyCosmetic(id, price) { if (this.data.cosmetics.includes(id)) return false; if (!this.spend(price)) return false; this.data.cosmetics.push(id); this.commit(); return true; }
  equipCosmetic(kind, id) { this.data.equipped[kind] = this.data.equipped[kind] === id ? null : id; this.commit(); }
  setSetting(name, value) { this.data.settings[name] = value; this.commit(); }
  recordMission(won, kills, reward) { if (won) this.data.missionsWon += 1; this.data.totalKills += kills; this.data.chips += reward; this.commit(); }
  reset() { this.data = structuredClone(DEFAULT_SAVE); this.commit(); }
}
