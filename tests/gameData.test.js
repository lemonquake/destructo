import { describe, expect, it } from 'vitest';
import { ACTIVE_SKILLS, CLASSES, COSMETICS, CRATE_TYPES, CRATE_WEAPON_CHANCE, DROPS, MISSIONS, PASSIVE_SKILLS, RECIPES, WEAPONS, buildWeaponVariant, crateCombinationProfile, destructoSpeedBonus, tankHpBonus, rollCrateType, rollCrateWeapon, rollDrop, scheduledCrateType } from '../src/data/gameData.js';

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
    expect(WEAPONS.pistol.speed).toBe(63);
    expect(WEAPONS.rocket.speed).toBe(26);
    expect(WEAPONS.pistol.spread).toBeCloseTo(.018 * .8);
    expect(WEAPONS.shotgun.pellets).toBe(12);
    expect(WEAPONS.machinegun.spread).toBeLessThan(.03);
    expect(WEAPONS.smg.spread).toBeLessThan(.04);
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
    expect(crimson.damage).toBeGreaterThan(plain.damage);expect(crimson.speed).toBeGreaterThan(plain.speed);expect(crimson.projectileScale).toBeGreaterThan(plain.projectileScale);expect(crimson.crimson).toBe(true);
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
  it('ships four distinct mission objectives including multiplayer skirmish', () => {
    expect(Object.keys(MISSIONS)).toHaveLength(4); expect(new Set(Object.values(MISSIONS).map(m => m.type))).toEqual(new Set(['skirmish', 'assault', 'capture', 'build']));
  });
});
