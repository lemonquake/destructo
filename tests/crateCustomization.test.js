import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_COSMETICS, MARKET_CATEGORIES } from '../src/data/marketplaceData.js';
import { CRATE_TYPES } from '../src/data/gameData.js';
import { EntityFactory } from '../src/game/EntityFactory.js';
import { SaveSystem } from '../src/game/SaveSystem.js';

describe('D-Builder crate designs', () => {
  let memory;
  beforeEach(() => {
    memory = new Map();
    globalThis.localStorage = {
      getItem: key => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value),
      clear: () => memory.clear(),
    };
  });

  it('sells texture and overall 3D model designs in a Crates category', () => {
    expect(MARKET_CATEGORIES).toContainEqual(expect.objectContaining({ id: 'crateDesign' }));
    expect(MARKETPLACE_COSMETICS.filter(item => item.kind === 'crateTexture').length).toBeGreaterThanOrEqual(4);
    expect(MARKETPLACE_COSMETICS.filter(item => item.kind === 'crateModel').length).toBeGreaterThanOrEqual(3);
  });

  it('equips one purchased texture independently per crate rarity', () => {
    const save = new SaveSystem();
    save.data.chips = 2000;
    expect(save.buyCosmetic('crate-hazard-grid', 720, 'chips')).toBe(true);
    expect(save.equipCrateTexture('brown', 'crate-hazard-grid')).toBe(true);
    expect(save.equipCrateTexture('red', 'crate-hazard-grid')).toBe(true);
    expect(save.data.equipped.crateTextures).toEqual({ brown: 'crate-hazard-grid', yellow: null, blue: null, red: 'crate-hazard-grid' });
    expect(save.equipCrateTexture('purple', 'crate-hazard-grid')).toBe(false);
  });

  it('discards legacy player-selected crate colors during save migration', () => {
    localStorage.setItem('destructo-save-v1', JSON.stringify({
      customCrate: { bodyColor: '#00ff00', bandColor: '#ff00ff' },
      equipped: { customCrate: { bodyColor: '#000000', gemColor: '#ffffff' } },
    }));
    const save = new SaveSystem();
    expect(save.data.customCrate).toBeNull();
    expect(save.data.equipped.customCrate).toBeNull();
  });

  it('uses owned texture/model designs while retaining fixed rarity band colors', () => {
    localStorage.setItem('destructo-save-v1', JSON.stringify({
      cosmetics: ['crate-hazard-grid', 'crate-reactor-model'],
      equipped: { crateTextures: { yellow: 'crate-hazard-grid' }, crateModel: 'crate-reactor-model' },
    }));
    const materials = {
      crate: vi.fn(() => new THREE.MeshStandardMaterial({ color: 0xffffff })),
      color: vi.fn((color, options = {}) => new THREE.MeshStandardMaterial({ color, ...options })),
    };
    const crate = new EntityFactory(new THREE.Scene(), materials).createCrate(new THREE.Vector3(), CRATE_TYPES.yellow);
    expect(materials.crate).toHaveBeenCalledWith('yellow', 'hazardGrid');
    expect(materials.color.mock.calls[0][0]).toBe(CRATE_TYPES.yellow.band);
    expect(crate.box.geometry.type).toBe('CylinderGeometry');
  });

  it('ignores unowned and legacy color customization at spawn time', () => {
    localStorage.setItem('destructo-save-v1', JSON.stringify({
      cosmetics: [],
      customCrate: { bodyColor: '#00ff00' },
      equipped: { customCrate: { bodyColor: '#ff00ff' }, crateTextures: { brown: 'crate-hazard-grid' }, crateModel: 'crate-reactor-model' },
    }));
    const materials = {
      crate: vi.fn(() => new THREE.MeshStandardMaterial({ color: 0xffffff })),
      color: vi.fn((color, options = {}) => new THREE.MeshStandardMaterial({ color, ...options })),
    };
    const crate = new EntityFactory(new THREE.Scene(), materials).createCrate(new THREE.Vector3(), CRATE_TYPES.brown);
    expect(materials.crate).toHaveBeenCalledWith('brown', 'standard');
    expect(materials.color.mock.calls[0][0]).toBe(CRATE_TYPES.brown.band);
    expect(crate.box.material.color.getHex()).toBe(0xffffff);
    expect(crate.box.geometry.type).toBe('BoxGeometry');
  });

  it('creates 4 distinct Tank models and weapon variants based on crate rarity (brown, yellow, blue, red)', () => {
    const materials = {
      teamTextured: vi.fn(() => new THREE.MeshStandardMaterial({ color: 0x555555 })),
      building: vi.fn(() => new THREE.MeshStandardMaterial({ color: 0x333333 })),
      metal: new THREE.MeshStandardMaterial({ color: 0x888888 }),
      color: vi.fn((col, opts = {}) => new THREE.MeshStandardMaterial({ color: col, ...opts })),
    };
    const factory = new EntityFactory(new THREE.Scene(), materials);

    const brownTank = factory.createTank('blue', new THREE.Vector3(), 'tank', 'brown');
    const yellowTank = factory.createTank('blue', new THREE.Vector3(), 'tank', 'yellow');
    const blueTank = factory.createTank('blue', new THREE.Vector3(), 'tank', 'blue');
    const redTank = factory.createTank('blue', new THREE.Vector3(), 'tank', 'red');

    expect(brownTank.weapon.projectileStyle).toBe('tank_shell_brown');
    expect(yellowTank.weapon.projectileStyle).toBe('tank_shell_yellow');
    expect(blueTank.weapon.projectileStyle).toBe('tank_shell_blue');
    expect(redTank.weapon.projectileStyle).toBe('tank_shell_red');

    expect(redTank.weapon.damage).toBeGreaterThan(blueTank.weapon.damage);
    expect(blueTank.weapon.damage).toBeGreaterThan(yellowTank.weapon.damage);
    expect(yellowTank.weapon.damage).toBeGreaterThan(brownTank.weapon.damage);

    expect(redTank.barrels.length).toBe(2);
    expect(blueTank.barrels.length).toBe(2);
    expect(brownTank.barrels.length).toBe(1);
    expect(yellowTank.barrels.length).toBe(1);
  });
});

