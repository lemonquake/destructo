import { describe, expect, it, vi } from 'vitest';
import { MAPS, DEFAULT_MAP_ID, mapById } from '../src/data/maps.js';
import { CrateDropScheduler } from '../src/game/CrateDropSystem.js';
import { World } from '../src/game/World.js';

describe('themed map roster', () => {
  it('ships four distinct selectable maps with player-facing copy', () => {
    expect(Object.keys(MAPS)).toEqual(['crossroads', 'crown', 'wilds', 'rift']);
    for (const map of Object.values(MAPS)) {
      expect(map.title.length).toBeGreaterThan(8);
      expect(map.description.length).toBeGreaterThan(60);
      expect(map.texture).toBeTruthy();
    }
    expect(mapById('missing').id).toBe(DEFAULT_MAP_ID);
  });

  it('supports the summit triple-drop cadence at the configured 1–5 second interval', () => {
    const zone = { id: 'summit-crown', types: ['brown'], burst: 3, interval: { minSeconds: 1, maxSeconds: 5 } };
    const scheduler = new CrateDropScheduler([zone], () => 0);
    const spawn = vi.fn(() => ({}));
    expect(scheduler.next()).toMatchObject({ zone, type: 'brown', seconds: 1 });
    scheduler.update(1, () => 0, spawn);
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(scheduler.next()).toMatchObject({ seconds: 1 });
  });

  it('does not inherit invisible legacy-river collision on themed maps', () => {
    const themedWorld = { hasWater: false };
    expect(World.prototype.isWater.call(themedWorld, { x: 0, z: 3 })).toBe(false);
    expect(World.prototype.isWater.call(themedWorld, { x: 60, z: 3 })).toBe(false);
  });
});
