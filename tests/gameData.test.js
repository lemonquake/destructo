import { describe, expect, it } from 'vitest';
import { ACTIVE_SKILLS, CAMPAIGN_DIMENSIONS, CAMPAIGN_MISSIONS, CLASSES, COSMETICS, CRATE_TYPES, CRATE_WEAPON_CHANCE, DROPS, MISSIONS, PASSIVE_SKILLS, RECIPES, WEAPONS, buildWeaponVariant, crateCombinationProfile, destructoSpeedBonus, tankHpBonus, rollCrateType, rollCrateWeapon, rollDrop, scheduledCrateType, shiftTeamAlliance, normalizeAllianceGroups, allianceSummary, MAX_ALLIANCES } from '../src/data/gameData.js';
import { PROJECTILE_SPREAD_SCALE } from '../src/game/CombatSystem.js';

describe('game data integrity', () => {
  it('defines all ten First Dimension classes with valid weapons and abilities', () => {
    expect(Object.keys(CLASSES)).toHaveLength(10);
    for (const unit of Object.values(CLASSES)) {
      expect(unit.hp).toBeGreaterThan(0); expect(unit.mp).toBeGreaterThan(0); expect(unit.speed).toBeGreaterThan(0);
      expect(WEAPONS[unit.weapon]).toBeTruthy(); expect(unit.ability.length).toBeGreaterThan(3); expect(unit.cooldown).toBeGreaterThan(0);
    }
  });
  it('gives the Commando a three-second Grappling Hook', () => {
    expect(CLASSES.commando.ability).toBe('Grappling Hook');
    expect(CLASSES.commando.cooldown).toBe(3);
  });
  it('applies the movement, projectile, accuracy, and shotgun balance pass', () => {
    expect(CLASSES.scout.speed).toBeCloseTo(8.5 * 1.55);
    expect(CLASSES.medic.speed).toBeCloseTo(6.4 * 1.3);
    expect(CLASSES.heavy.speed).toBeCloseTo(4.7 * 1.3);
    expect(WEAPONS.pistol.bulletSpeed).toBe(63);
    expect(WEAPONS.rocket.bulletSpeed).toBe(26);
    expect(WEAPONS.pistol.spread).toBeCloseTo(.018 * .8);
    expect(WEAPONS.shotgun.pellets).toBe(12);
    expect(WEAPONS.machinegun.spread).toBeLessThan(.03);
    expect(WEAPONS.smg.spread).toBeLessThan(.04);
    expect(PROJECTILE_SPREAD_SCALE).toBe(.7);
    expect(DROPS.some(drop => drop.id === 'grenades')).toBe(true);
  });
  it('gives every weapon a recoil value for shooter pushback', () => {
    for (const w of Object.values(WEAPONS)) expect(w.recoil).toBeGreaterThanOrEqual(0);
    expect(WEAPONS.shotgun.recoil).toBeGreaterThan(WEAPONS.pistol.recoil);
    expect(WEAPONS.rocket.recoil).toBeGreaterThan(WEAPONS.shotgun.recoil);
  });
  it('defines the Team Buddies crate combo ladder', () => {
    expect(new Set(RECIPES.map(r => r.count))).toEqual(new Set([1, 2, 3, 4, 6, 8, 12]));
    expect(RECIPES.some(r => r.output === 'unit' && r.grade === 'normal')).toBe(true);
    expect(RECIPES.some(r => r.grade === 'elite')).toBe(true);
    expect(RECIPES.some(r => r.grade === 'special')).toBe(true);
    expect(RECIPES.some(r => r.output === 'vehicle')).toBe(true);
    for (const r of RECIPES.filter(x => x.output === 'weapon')) expect(WEAPONS[r.weaponId || r.weapons[0]]).toBeTruthy();
  });
  it('defines four crate rarities from brown to red', () => {
    expect(Object.keys(CRATE_TYPES)).toEqual(['brown', 'yellow', 'blue', 'red']);
    expect(CRATE_TYPES.brown.weight).toBeGreaterThan(CRATE_TYPES.red.weight);
    expect(CRATE_TYPES.red.tier).toBe(3);
    expect(rollCrateType(() => 0).id).toBe('brown');
    expect(rollCrateType(() => .999).id).toBe('red');
  });
  it('alternates scheduled yellow and blue supply waves every 30 seconds', () => {
    expect([1,2,3,4].map(w => scheduledCrateType(w).id)).toEqual(['yellow','blue','yellow','blue']);
  });
  it('orders combination strength from mixed uncommon through double legendary', () => {
    const profile=(...ids)=>crateCombinationProfile(ids.map(id=>({crateType:CRATE_TYPES[id]})));
    const yellow=profile('yellow'),mixed=profile('yellow','blue'),doubleBlue=profile('blue','blue'),red=profile('red'),doubleRed=profile('red','red');
    expect(mixed.strength).toBeGreaterThan(yellow.strength);expect(doubleBlue.strength).toBeGreaterThan(mixed.strength);expect(doubleRed.strength).toBeGreaterThan(red.strength);
    expect(doubleRed.crimson).toBe(true);expect(doubleRed.dominant).toBe('red');
  });
  it('scales projectile speed and size with weapon combination strength', () => {
    const plain=buildWeaponVariant('rifle',[{crateType:CRATE_TYPES.brown}]);
    const crimson=buildWeaponVariant('rifle',[{crateType:CRATE_TYPES.red},{crateType:CRATE_TYPES.red}]);
    expect(crimson.damage).toBeGreaterThan(plain.damage);expect(crimson.bulletSpeed).toBeGreaterThan(plain.bulletSpeed);expect(crimson.shotPower).toBeGreaterThan(plain.shotPower);expect(crimson.projectileScale).toBeGreaterThan(plain.projectileScale);expect(crimson.crimson).toBe(true);
  });
  it('applies exact colored-crate unit speed and tank HP bonuses', () => {
    const profile=id=>crateCombinationProfile([{crateType:CRATE_TYPES[id]}]);
    expect(['yellow','blue','red'].map(id=>destructoSpeedBonus(profile(id)))).toEqual([.15,.2,.3]);
    expect(['yellow','blue','red'].map(id=>tankHpBonus(profile(id)))).toEqual([.1,.15,.25]);
  });
  it('reserves the complete twelve-crate cube for the battle tank', () => {
    expect(RECIPES.find(r=>r.id==='tank')).toMatchObject({count:12,pattern:'full',vehicleId:'tank'});
    expect(RECIPES.find(r=>r.id==='apc')).toMatchObject({count:8,vehicleId:'apc'});
  });
  it('ships 20 passive and 20 active skills with unique ids', () => {
    expect(PASSIVE_SKILLS).toHaveLength(20);
    expect(ACTIVE_SKILLS).toHaveLength(20);
    expect(new Set(PASSIVE_SKILLS.map(s => s.id)).size).toBe(20);
    expect(new Set(ACTIVE_SKILLS.map(s => s.id)).size).toBe(20);
    for (const s of ACTIVE_SKILLS) { expect(s.cost).toBeGreaterThan(0); expect(s.cooldown).toBeGreaterThan(0); }
  });
  it('gives blue and red crates a very high chance to eject a weapon', () => {
    expect(CRATE_WEAPON_CHANCE.blue).toBeGreaterThanOrEqual(.7);
    expect(CRATE_WEAPON_CHANCE.red).toBeGreaterThan(CRATE_WEAPON_CHANCE.blue);
    expect(CRATE_WEAPON_CHANCE.brown).toBe(0);
    expect(rollCrateWeapon('brown', () => 0)).toBeNull();
    const blueWeapon = rollCrateWeapon('blue', () => 0);
    expect(WEAPONS[blueWeapon]).toBeTruthy();
    expect(rollCrateWeapon('red', () => .999)).toBeNull();
  });
  it('rolls field drops covering ammo, restoration and powerups', () => {
    expect(DROPS.map(d => d.id)).toEqual(expect.arrayContaining(['ammo', 'health', 'mana', 'speed', 'shield']));
    expect(rollDrop(() => 0).id).toBe('ammo');
  });
  it('stocks the D-Build studio with hats and skins', () => {
    expect(COSMETICS.filter(c => c.kind === 'hat').length).toBeGreaterThanOrEqual(6);
    expect(COSMETICS.filter(c => c.kind === 'skin').length).toBeGreaterThanOrEqual(8);
    for (const c of COSMETICS) expect(c.price).toBeGreaterThan(0);
  });
  it('has expanded cosmetic categories including boots, attachments, projectiles, deathEffects, killEffects, and teamBase', () => {
    expect(COSMETICS.filter(c => c.kind === 'boots').length).toBeGreaterThanOrEqual(8);
    expect(COSMETICS.filter(c => c.kind === 'attachment').length).toBeGreaterThanOrEqual(8);
    expect(COSMETICS.filter(c => c.kind === 'projectile').length).toBeGreaterThanOrEqual(5);
    expect(COSMETICS.filter(c => c.kind === 'deathEffect').length).toBeGreaterThanOrEqual(5);
    expect(COSMETICS.filter(c => c.kind === 'killEffect').length).toBeGreaterThanOrEqual(5);
    expect(COSMETICS.filter(c => c.kind === 'teamBase').length).toBeGreaterThanOrEqual(4);
    
    const rocketJetpack = COSMETICS.find(c => c.id === 'rocket-jetpack');
    expect(rocketJetpack).toBeDefined();
    expect(rocketJetpack.currency).toBe('tickets');
    expect(rocketJetpack.price).toBe(100);
  });
  it('ships Custom Match plus the six ordered Gaia campaign missions', () => {
    expect(Object.keys(MISSIONS)).toEqual(['skirmish','four-of-a-kind','gold-rush','golden-shield','stormbreak','heart-of-the-forge','atlas-homecoming']);
    expect(Object.values(CAMPAIGN_MISSIONS).map(m=>m.mapId)).toEqual(['bootcamp','goldrush','gaia-bastion','storm-dam','sunforge','gaia-blacksite']);
    expect(CAMPAIGN_DIMENSIONS[0]).toMatchObject({id:'gaia',missionIds:['four-of-a-kind','gold-rush','golden-shield','stormbreak','heart-of-the-forge','atlas-homecoming']});
    expect(CAMPAIGN_MISSIONS['gold-rush'].requires).toBe('four-of-a-kind');
    expect(CAMPAIGN_MISSIONS['gold-rush'].maxPlayerDestructos).toBe(5);
    expect(CAMPAIGN_MISSIONS['golden-shield'].rules).toMatchObject({defenseSeconds:240,reinforcementSeconds:5,enemiesPerWave:3,deathsPerWave:3,supplyBurst:3});
    expect(CAMPAIGN_MISSIONS['atlas-homecoming']).toMatchObject({order:6,requires:'heart-of-the-forge',startingWeapon:'machinegun',startingAmmo:500,startingGrenades:2});
    expect(CAMPAIGN_MISSIONS['atlas-homecoming'].startingSquad).toHaveLength(5);
    expect(CAMPAIGN_MISSIONS['atlas-homecoming'].rules).toMatchObject({reinforcementSeconds:5,enemyDrops:true,scientistHp:520,escortSpeed:3.15});
    expect(CAMPAIGN_MISSIONS['four-of-a-kind'].supplyDrops).toMatchObject({initial:6,additional:16,waveSize:2});
    for(const mission of Object.values(CAMPAIGN_MISSIONS)){expect(mission.steps.length).toBeGreaterThan(0);expect(mission.reward).toBeGreaterThan(0)}
  });
});

describe('alliance grouping for the team-oriented setup', () => {
  const team = (group, name = 'T') => ({ name, colorIndex: 0, group, uniformIndex: 0, isHuman: false });
  it('keeps alliance indices compact after normalization', () => {
    const setup = [team(3), team(3), team(7)];
    normalizeAllianceGroups(setup);
    expect(setup.map(t => t.group)).toEqual([0, 0, 1]);
  });
  it('moves a team between neighbouring alliances', () => {
    const setup = [team(0), team(0), team(1)];
    shiftTeamAlliance(setup, 2, -1);
    expect(setup.map(t => t.group)).toEqual([0, 0, 0]);
    shiftTeamAlliance(setup, 1, 1); // past the end: founds a new alliance
    expect(setup.map(t => t.group)).toEqual([0, 1, 0]);
  });
  it('cannot push a lone trailing team into an empty alliance or below zero', () => {
    const setup = [team(0), team(1)];
    shiftTeamAlliance(setup, 1, 1);
    expect(setup.map(t => t.group)).toEqual([0, 1]);
    shiftTeamAlliance(setup, 0, -1);
    expect(setup.map(t => t.group)).toEqual([0, 1]);
  });
  it('caps the battlefield at MAX_ALLIANCES', () => {
    const setup = Array.from({ length: 6 }, (_, i) => team(Math.min(i, MAX_ALLIANCES - 1)));
    shiftTeamAlliance(setup, 5, 1); // groups 0..4 exist — a sixth alliance is refused
    expect(new Set(setup.map(t => t.group)).size).toBeLessThanOrEqual(MAX_ALLIANCES);
  });
  it('summarizes the battle shape as XvYvZ', () => {
    expect(allianceSummary([team(0), team(0), team(1), team(1)])).toBe('2v2');
    expect(allianceSummary([team(0), team(1), team(2)])).toBe('1v1v1');
    expect(allianceSummary([team(0), team(0), team(0), team(1)])).toBe('3v1');
  });
});
