import { describe, expect, it } from 'vitest';
import { ACTIVE_SKILLS, CLASSES, COSMETICS, CRATE_TYPES, DROPS, MISSIONS, PASSIVE_SKILLS, RECIPES, WEAPONS, rollCrateType, rollDrop } from '../src/data/gameData.js';

describe('game data integrity', () => {
  it('defines all ten First Dimension classes with valid weapons and abilities', () => {
    expect(Object.keys(CLASSES)).toHaveLength(10);
    for (const unit of Object.values(CLASSES)) {
      expect(unit.hp).toBeGreaterThan(0); expect(unit.mp).toBeGreaterThan(0); expect(unit.speed).toBeGreaterThan(0);
      expect(WEAPONS[unit.weapon]).toBeTruthy(); expect(unit.ability.length).toBeGreaterThan(3); expect(unit.cooldown).toBeGreaterThan(0);
    }
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
    for (const r of RECIPES.filter(x => x.output === 'weapon')) expect(r.weapons.every(id => WEAPONS[id])).toBe(true);
  });
  it('defines four crate rarities from brown to red', () => {
    expect(Object.keys(CRATE_TYPES)).toEqual(['brown', 'yellow', 'blue', 'red']);
    expect(CRATE_TYPES.brown.weight).toBeGreaterThan(CRATE_TYPES.red.weight);
    expect(CRATE_TYPES.red.tier).toBe(3);
    expect(rollCrateType(() => 0).id).toBe('brown');
    expect(rollCrateType(() => .999).id).toBe('red');
  });
  it('ships 20 passive and 20 active skills with unique ids', () => {
    expect(PASSIVE_SKILLS).toHaveLength(20);
    expect(ACTIVE_SKILLS).toHaveLength(20);
    expect(new Set(PASSIVE_SKILLS.map(s => s.id)).size).toBe(20);
    expect(new Set(ACTIVE_SKILLS.map(s => s.id)).size).toBe(20);
    for (const s of ACTIVE_SKILLS) { expect(s.cost).toBeGreaterThan(0); expect(s.cooldown).toBeGreaterThan(0); }
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
  it('ships three distinct mission objectives', () => {
    expect(Object.keys(MISSIONS)).toHaveLength(3); expect(new Set(Object.values(MISSIONS).map(m => m.type))).toEqual(new Set(['assault', 'capture', 'build']));
  });
});
