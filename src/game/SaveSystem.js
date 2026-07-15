import { SETTINGS_DEFAULTS } from '../data/gameData.js';

const KEY = 'destructo-save-v1';
const defaultModeRecord = () => ({ mmr: 1000, wins: 0, losses: 0 });
const DEFAULT_SAVE = { chips: 750, tickets: 0, processedPayPalOrders: [], favoriteCosmetics: [], missionsWon: 0, totalKills: 0, mmr: 1000, rankedWins: 0, rankedLosses: 0, debugMode: false, modeRecords: { deathmatch: defaultModeRecord(), domination: defaultModeRecord() }, campaign: { completedMissionIds: [] }, aiProfiles: [], betHistory: [], blueprints: ['pistol', 'scout'], gear: [], upgrades: {}, cosmetics: [], customCrate: null, equipped: { hat: null, skin: null, boots: null, attachment: null, projectile: null, deathEffect: null, killEffect: null, customCrate: null, teamBase: null }, settings: SETTINGS_DEFAULTS };

export class SaveSystem {
  constructor() { this.data = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const saved = JSON.parse(raw);
      const legacy={mmr:saved.mmr||1000,wins:saved.rankedWins||0,losses:saved.rankedLosses||0},modeRecords={deathmatch:{...legacy,...saved.modeRecords?.deathmatch},domination:{...defaultModeRecord(),...saved.modeRecords?.domination}};
      const loaded = { ...structuredClone(DEFAULT_SAVE), ...saved, modeRecords, campaign: { ...DEFAULT_SAVE.campaign, ...(saved.campaign || {}), completedMissionIds: [...new Set(saved.campaign?.completedMissionIds || [])] }, equipped: { ...DEFAULT_SAVE.equipped, ...(saved.equipped || {}) }, settings: { ...SETTINGS_DEFAULTS, ...(saved.settings || {}) } };
      loaded.tickets = loaded.tickets ?? 0;
      loaded.processedPayPalOrders = [...new Set(loaded.processedPayPalOrders||[])].slice(-100);
      loaded.favoriteCosmetics = [...new Set(loaded.favoriteCosmetics||[])];
      loaded.customCrate = loaded.customCrate ?? null;
      return loaded;
    } catch { return structuredClone(DEFAULT_SAVE); }
  }
  commit() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ } }
  earn(amount) { this.data.chips += Math.max(0, Math.round(amount)); this.commit(); }
  spend(amount) { if (amount <= 0) return false; if (this.data.chips < amount) return false; this.data.chips -= amount; this.commit(); return true; }
  unlock(id, price) { if (this.data.blueprints.includes(id)) return false; if (!this.spend(price)) return false; this.data.blueprints.push(id); this.commit(); return true; }
  buyGear(id, price) { if (this.data.gear.includes(id)) return false; if (!this.spend(price)) return false; this.data.gear.push(id); this.commit(); return true; }
  earnTickets(amount) { this.data.tickets = (this.data.tickets || 0) + Math.max(0, Math.round(amount)); this.commit(); }
  grantTicketPurchase(receipt) { const orderId=String(receipt?.orderId||''),tickets=Math.round(Number(receipt?.tickets));if(receipt?.status!=='COMPLETED'||!orderId||!Number.isFinite(tickets)||tickets<=0)return false;this.data.processedPayPalOrders||=[];if(this.data.processedPayPalOrders.includes(orderId))return false;this.data.tickets=(this.data.tickets||0)+tickets;this.data.processedPayPalOrders=[...this.data.processedPayPalOrders,orderId].slice(-100);this.commit();return true; }
  spendTickets(amount) { if (amount <= 0) return false; if ((this.data.tickets || 0) < amount) return false; this.data.tickets -= amount; this.commit(); return true; }
  buyGearWithTickets(id, price) { if (this.data.gear.includes(id)) return false; if (!this.spendTickets(price)) return false; this.data.gear.push(id); this.commit(); return true; }
  buyCosmetic(id, price, currency = 'chips') {
    if (this.data.cosmetics.includes(id)) return false;
    if (currency === 'tickets') {
      if (!this.spendTickets(price)) return false;
    } else {
      if (!this.spend(price)) return false;
    }
    this.data.cosmetics.push(id);
    this.commit();
    return true;
  }
  grantCasinoPrize(id) {
    const prizeId = String(id || '').trim();
    if (!prizeId || this.data.cosmetics.includes(prizeId)) return false;
    this.data.cosmetics.push(prizeId);
    this.commit();
    return true;
  }
  equipCosmetic(kind, id) {
    this.data.equipped[kind] = this.data.equipped[kind] === id ? null : id;
    this.commit();
    return true;
  }
  setSetting(name, value) { this.data.settings[name] = value; this.commit(); }
  recordMission(won, kills, reward) { if (won) this.data.missionsWon += 1; this.data.totalKills += kills; this.data.chips += reward; this.commit(); }
  completeCampaignMission(id) { this.data.campaign ||= { completedMissionIds: [] };if(!this.data.campaign.completedMissionIds.includes(id))this.data.campaign.completedMissionIds.push(id);this.commit(); }
  campaignCompleted(id) { return Boolean(this.data.campaign?.completedMissionIds?.includes(id)); }
  modeRecord(mode = 'deathmatch') { return this.data.modeRecords?.[mode] || defaultModeRecord(); }
  setLeague(aiProfiles, mmrDelta = 0, won = null, mode = 'deathmatch') { this.data.aiProfiles = aiProfiles;this.data.modeRecords ||= {};const record=this.data.modeRecords[mode] ||= defaultModeRecord();record.mmr=Math.max(100,Math.round((record.mmr||1000)+mmrDelta));if(won===true)record.wins++;else if(won===false)record.losses++;if(mode==='deathmatch'){this.data.mmr=record.mmr;this.data.rankedWins=record.wins;this.data.rankedLosses=record.losses;}this.commit(); }
  recordBet(entry) { this.data.betHistory = [entry, ...(this.data.betHistory || [])].slice(0, 20); this.commit(); }
  reset() { this.data = structuredClone(DEFAULT_SAVE); this.commit(); }
}
