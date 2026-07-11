import { describe, expect, it, vi } from 'vitest';
import { CRATE_DROP_RULES, CrateDropScheduler } from '../src/game/CrateDropSystem.js';
import { World } from '../src/game/World.js';

describe('crate drop scheduling', () => {
  it('uses the requested timing windows and per-spot caps', () => {
    expect(CRATE_DROP_RULES).toEqual({
      brown: { minSeconds: 3, maxSeconds: 7.5, cap: 30 },
      yellow: { minSeconds: 30, maxSeconds: 50, cap: 10 },
      blue: { minSeconds: 40, maxSeconds: 70, cap: 7 },
      red: { minSeconds: 50, maxSeconds: 60, cap: 3 },
    });
  });

  it('gives team depots common drops and contested relays all three rares', () => {
    const zones = [{ id: 'home', kind: 'team' }, { id: 'relay', kind: 'rare' }];
    const scheduler = new CrateDropScheduler(zones, () => 0);
    const spawn = vi.fn(() => ({}));
    scheduler.update(3, () => 0, spawn);
    expect(spawn).toHaveBeenCalledWith(zones[0], 'brown');
    expect(spawn).not.toHaveBeenCalledWith(zones[1], 'brown');
    scheduler.update(27, () => 0, spawn);
    expect(spawn).toHaveBeenCalledWith(zones[1], 'yellow');
    scheduler.update(10, () => 0, spawn);
    expect(spawn).toHaveBeenCalledWith(zones[1], 'blue');
    scheduler.update(10, () => 0, spawn);
    expect(spawn).toHaveBeenCalledWith(zones[1], 'red');
  });

  it('never exceeds a rarity cap at one spot and resumes after capacity clears', () => {
    const zone = { id: 'home', kind: 'team' }, counts = { brown: 30 };
    const scheduler = new CrateDropScheduler([zone], () => 0);
    const spawn = vi.fn((_zone, type) => { counts[type]++; return {}; });
    scheduler.update(3, (_zone, type) => counts[type], spawn);
    expect(spawn).not.toHaveBeenCalled();
    counts.brown--;
    scheduler.update(.5, (_zone, type) => counts[type], spawn);
    expect(spawn).toHaveBeenCalledOnce();
    expect(counts.brown).toBe(30);
  });

  it('keeps every zone on an independent randomized clock', () => {
    const values = [.0, .5], zones = [{ id: 'a', kind: 'team' }, { id: 'b', kind: 'team' }];
    const scheduler = new CrateDropScheduler(zones, () => values.shift() ?? 0);
    expect(scheduler.next()).toMatchObject({ zone: zones[0], type: 'brown', seconds: 3 });
    scheduler.update(3, () => 0, () => ({}));
    expect(scheduler.next()).toMatchObject({ zone: zones[1], type: 'brown', seconds: 2.25 });
  });

  it('drops seven common crates at every dropspot before scheduled drops', () => {
    const zones = [{ id: 'home' }, { id: 'relay' }, { id: 'far-relay' }];
    const world = { crateDropZones: zones, airdropCrate: vi.fn(() => ({})) };
    World.prototype.dropOpeningCrates.call(world, 7);
    expect(world.airdropCrate).toHaveBeenCalledTimes(21);
    for (const zone of zones) {
      expect(world.airdropCrate.mock.calls.filter(([type, , calledZone]) => type === 'brown' && calledZone === zone)).toHaveLength(7);
    }
  });
});
