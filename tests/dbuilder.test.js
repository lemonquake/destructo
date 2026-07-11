import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DBuilder, identifyCombo, PAD_CELLS } from '../src/game/DBuilder.js';

const cells = (...indices) => Array.from({ length: PAD_CELLS }, (_, i) => indices.includes(i) ? {} : null);
const makeCrate = (tier = 0) => ({ crateType: { tier }, group: { position: new THREE.Vector3(), rotation: { set() {} }, visible: true }, carried: true, placed: false, solid: false });
const makeWorld = (crates = []) => ({ scene: { remove: vi.fn() }, crates, builderPositions: { blue: new THREE.Vector3() } });

describe('Team Buddies combo matrix (2x2 footprint, 3 high)', () => {
  it.each([
    [[0], 'pistol'],
    [[0, 1], 'grenadelauncher'],
    [[0, 3], 'needle'],
    [[0, 4], 'buddy'],
    [[0, 4, 8], 'elite'],
    [[0, 1, 4], 'smg'],
    [[0, 4, 1, 2], 'tesla'],
    [[0, 1, 4, 5], 'rocket'],
    [[0, 4, 3, 7], 'plasma'],
    [[0, 1, 2, 3], 'machinegun'],
    [[0, 4, 8, 1, 5, 9], 'shotgun'],
    [[0, 4, 1, 5, 2, 6], 'special'],
    [[0, 1, 2, 3, 4, 5, 6, 7], 'apc'],
    [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'tank'],
  ])('recognizes occupancy %j as %s', (indices, id) => expect(identifyCombo(cells(...indices))?.id).toBe(id));

  it.each([
    [[4], 'floating crate'],
    [[0, 4, 1, 5, 8], 'uneven tall towers'],
  ])('rejects %j (%s)', indices => expect(identifyCombo(cells(...indices))).toBeNull());
});

describe('DBuilder stacking pad', () => {
  it('stacks crates by gravity and solidifies them on placement', () => {
    const world = makeWorld(), builder = new DBuilder(world, {}, () => true, 'blue');
    const a = makeCrate(), b = makeCrate();
    expect(builder.place(a, new THREE.Vector3())).toBe(true);
    expect(a.placed && a.solid).toBe(true);
    expect(a.carried).toBe(false);
    builder.place(b, a.group.position);
    expect(builder.count()).toBe(2);
    expect(builder.heights().some(h => h >= 1)).toBe(true);
  });
  it('refuses crates when all 12 cells are full', () => {
    const world = makeWorld(), builder = new DBuilder(world, {}, () => true, 'blue');
    for (let i = 0; i < PAD_CELLS; i++) expect(builder.place(makeCrate())).toBe(true);
    expect(builder.place(makeCrate())).toBe(false);
  });
  it('averages crate rarity into the build tier', () => {
    const world = makeWorld(), builder = new DBuilder(world, {}, () => true, 'blue');
    builder.place(makeCrate(3)); builder.place(makeCrate(1));
    expect(builder.tier()).toBe(2);
  });
  it('preserves a fused stack when the build is rejected', () => {
    const crate = makeCrate(), world = makeWorld([crate]), builder = new DBuilder(world, {}, () => false, 'blue');
    builder.place(crate);
    expect(builder.manufacture()?.id).toBe('pistol');
    expect(builder.count()).toBe(1);
    expect(world.scene.remove).not.toHaveBeenCalled();
  });
  it('gives back the top crate of the nearest column until it is combined', () => {
    const world = makeWorld(), builder = new DBuilder(world, {}, () => true, 'blue');
    const a = makeCrate(), b = makeCrate();
    builder.place(a, new THREE.Vector3()); builder.place(b, a.group.position);
    const taken = builder.takeBack(a.group.position);
    expect([a, b]).toContain(taken);
    expect(taken.placed).toBe(false);
    expect(taken.solid).toBe(false);
    expect(builder.count()).toBe(1);
    // nothing left after combining: manufacture clears the pad
    builder.manufacture();
    expect(builder.takeBack(new THREE.Vector3())).toBeNull();
  });
  it('consumes an accepted stack exactly once', () => {
    const crate = makeCrate(), world = makeWorld([crate]), builder = new DBuilder(world, {}, () => true, 'blue');
    builder.place(crate);
    builder.manufacture();
    expect(builder.count()).toBe(0);
    expect(world.crates).toHaveLength(0);
    expect(world.scene.remove).toHaveBeenCalledOnce();
  });
});
