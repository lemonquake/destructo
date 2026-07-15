import { SETTINGS_DEFAULTS } from '../data/gameData.js';

const KEY = 'destructo-save-v1';
const defaultModeRecord = () => ({ mmr: 1000, wins: 0, losses: 0 });
const DEFAULT_SAVE = { chips: 750, missionsWon: 0, totalKills: 0, mmr: 1000, rankedWins: 0, rankedLosses: 0, modeRecords: { deathmatch: defaultModeRecord(), domination: defaultModeRecord() }, campaign: { completedMissionIds: [] }, aiProfiles: [], betHistory: [], blueprints: ['pistol', 'scout'], gear: [], upgrades: {}, cosmetics: [], equipped: { hat: null, skin: null }, settings: SETTINGS_DEFAULTS };

export class SaveSystem {
  constructor() { this.data = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const saved = JSON.parse(raw);
      const legacy={mmr:saved.mmr||1000,wins:saved.rankedWins||0,losses:saved.rankedLosses||0},modeRecords={deathmatch:{...legacy,...saved.modeRecords?.deathmatch},domination:{...defaultModeRecord(),...saved.modeRecords?.domination}};
      return { ...structuredClone(DEFAULT_SAVE), ...saved, modeRecords, campaign: { ...DEFAULT_SAVE.campaign, ...(saved.campaign || {}), completedMissionIds: [...new Set(saved.campaign?.completedMissionIds || [])] }, equipped: { ...DEFAULT_SAVE.equipped, ...(saved.equipped || {}) }, settings: { ...SETTINGS_DEFAULTS, ...(saved.settings || {}) } };
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
  completeCampaignMission(id) { this.data.campaign ||= { completedMissionIds: [] };if(!this.data.campaign.completedMissionIds.includes(id))this.data.campaign.completedMissionIds.push(id);this.commit(); }
  campaignCompleted(id) { return Boolean(this.data.campaign?.completedMissionIds?.includes(id)); }
  modeRecord(mode = 'deathmatch') { return this.data.modeRecords?.[mode] || defaultModeRecord(); }
  setLeague(aiProfiles, mmrDelta = 0, won = null, mode = 'deathmatch') { this.data.aiProfiles = aiProfiles;this.data.modeRecords ||= {};const record=this.data.modeRecords[mode] ||= defaultModeRecord();record.mmr=Math.max(100,Math.round((record.mmr||1000)+mmrDelta));if(won===true)record.wins++;else if(won===false)record.losses++;if(mode==='deathmatch'){this.data.mmr=record.mmr;this.data.rankedWins=record.wins;this.data.rankedLosses=record.losses;}this.commit(); }
  recordBet(entry) { this.data.betHistory = [entry, ...(this.data.betHistory || [])].slice(0, 20); this.commit(); }
  reset() { this.data = structuredClone(DEFAULT_SAVE); this.commit(); }
}
