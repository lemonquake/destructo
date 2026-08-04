import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WEAPONS } from '../src/data/gameData.js';
import { BURN, CombatSystem } from '../src/game/CombatSystem.js';

const at = (x = 0, y = 0, z = 0) => { const group = new THREE.Group(); group.position.set(x, y, z); return group };
const particles = () => ({ impact: vi.fn(), burst: vi.fn(), muzzleFlash: vi.fn(), flame: vi.fn(), bulletTrail: vi.fn(), activeEffectCount: () => 0 });
const world = (overrides = {}) => ({ bounds: 200, colliders: [], groundAt: () => -100, surfaceAt: () => 'dirt', isWater: () => false, ...overrides });
const victim = (x = 0, hp = 500) => ({ type: 'unit', team: 'red', dead: false, hp, maxHp: hp, shield: 0, group: at(x, 0, 0), radius: .72, velocity: new THREE.Vector3(), buffs: {} });
const gunner = (weapon = WEAPONS.rocket) => ({ type: 'unit', team: 'blue', dead: false, freeze: 0, fireCooldown: 0, weaponId: 'rocket', weapon, group: at(-40, 0, 0), aim: new THREE.Vector3(1, 0, 0), velocity: new THREE.Vector3(), buffs: {} });

const system = (targets, overrides = {}) => new CombatSystem(
  new THREE.Scene(), overrides.particles || particles(), () => targets, overrides.onDeath || vi.fn(),
  overrides.onDamage || null, (a, b) => a !== b, () => -100, null, () => [], world(),
);

// wall-clock the burn forward in frames so tick accumulation is exercised the way
// the game loop drives it, not in one artificial jump
const burnFor = (combat, seconds, step = 1 / 60) => { for (let t = 0; t < seconds; t += step) combat.updateBurning(step) };

describe('explosion fire debuff', () => {
  it('sets a burn whose duration and DPS both climb with blast strength and proximity', () => {
    const combat = system([]);
    const close = victim(), far = victim(), weak = victim();
    combat.applyBurn(close, 110, 1);
    combat.applyBurn(far, 110, .15);
    combat.applyBurn(weak, 25, 1);
    expect(close.burnTimer).toBeGreaterThan(far.burnTimer);
    expect(close.burnDps).toBeGreaterThan(far.burnDps);
    expect(close.burnTimer).toBeGreaterThan(weak.burnTimer);
    expect(close.burnDps).toBeGreaterThan(weak.burnDps);
  });

  it('never burns longer than three seconds or shorter than one', () => {
    const combat = system([]);
    for (const damage of [12, 60, 110, 145, 600]) {
      for (const falloff of [0.02, .25, .5, .8, 1]) {
        const target = victim();
        combat.applyBurn(target, damage, falloff);
        expect(target.burnTimer).toBeGreaterThanOrEqual(BURN.minSeconds - 1e-9);
        expect(target.burnTimer).toBeLessThanOrEqual(BURN.maxSeconds + 1e-9);
      }
    }
    // the strongest possible hit — point blank from a blast at or over the
    // reference damage — is the only thing that reaches the three second cap
    const worst = victim();
    combat.applyBurn(worst, BURN.referenceDamage, 1);
    expect(worst.burnTimer).toBeCloseTo(BURN.maxSeconds);
  });

  it('bills the full dps × duration over the life of the burn and then stops', () => {
    const target = victim(0, 5000), combat = system([target]);
    combat.applyBurn(target, 110, 1);
    const { burnDps, burnTimer } = target;
    burnFor(combat, burnTimer + .5);
    expect(5000 - target.hp).toBeCloseTo(burnDps * burnTimer, 4);
    expect(target.burnTimer).toBe(0);
    expect(combat.burning.size).toBe(0);
    const settled = target.hp;
    burnFor(combat, 2);
    expect(target.hp).toBe(settled); // the fire is out, not merely paused
  });

  it('refreshes rather than stacks when a second blast catches the same target', () => {
    const target = victim(0, 5000), combat = system([target]);
    combat.applyBurn(target, 30, .4);
    const weakDps = target.burnDps;
    combat.applyBurn(target, 140, 1);
    expect(combat.burning.size).toBe(1);
    expect(target.burnDps).toBeGreaterThan(weakDps);
    const strongDps = target.burnDps, strongTimer = target.burnTimer;
    combat.applyBurn(target, 30, .4); // a graze must not water down the inferno
    expect(target.burnDps).toBe(strongDps);
    expect(target.burnTimer).toBe(strongTimer);
  });

  it('reports burn ticks as explosive damage of kind "burn" and credits the source', () => {
    const onDamage = vi.fn(), onDeath = vi.fn();
    const target = victim(0, 12), shooter = gunner(), combat = system([target], { onDamage, onDeath });
    combat.applyBurn(target, 110, 1, shooter);
    burnFor(combat, 3);
    expect(onDamage).toHaveBeenCalled();
    for (const call of onDamage.mock.calls) {
      expect(call[2]).toBe(shooter); // kill credit rides with the fire
      expect(call[4]).toBe(true);    // explosive, so Blastproof applies
      expect(call[5]).toBe('burn');
    }
    expect(target.dead).toBe(true);
    expect(onDeath).toHaveBeenCalledWith(target, shooter, expect.objectContaining({ explosive: true }));
    expect(combat.burning.size).toBe(0);
  });

  it('honours armour, shields and Blastproof exactly as the blast itself does', () => {
    const plain = victim(0, 500), proofed = { ...victim(0, 500), passive: { id: 'blastproof' } };
    const combat = system([plain, proofed]);
    combat.applyBurn(plain, 110, 1);
    combat.applyBurn(proofed, 110, 1);
    burnFor(combat, 3.5);
    expect(500 - proofed.hp).toBeCloseTo((500 - plain.hp) * .6, 4);
  });

  it('lights up everything an explosive round catches, scaled by distance', () => {
    const near = victim(0), mid = victim(3), outside = victim(40);
    const shooter = gunner(), combat = system([near, mid, outside, shooter]);
    combat.explode({ position: new THREE.Vector3(), style: 'rocket', shooter, weapon: WEAPONS.rocket, active: true, index: 0, mine: false, detail: null },
      { point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), surface: 'dirt' });
    expect(near.burnTimer).toBeGreaterThan(0);
    expect(mid.burnTimer).toBeGreaterThan(0);
    expect(near.burnTimer).toBeGreaterThan(mid.burnTimer);
    expect(outside.burnTimer ?? 0).toBe(0); // beyond the blast radius
    expect(shooter.burnTimer ?? 0).toBe(0); // and the firer never lights itself
  });

  it('sets fire from every radial blast unless the caller opts out', () => {
    const burned = victim(), spared = victim();
    const combat = system([burned]);
    combat.radial(new THREE.Vector3(), 8, 110, null, 12);
    expect(burned.burnTimer).toBeGreaterThan(0);
    const kinetic = system([spared]);
    kinetic.radial(new THREE.Vector3(), 8, 110, null, 12, { burn: false });
    expect(spared.burnTimer ?? 0).toBe(0);
  });

  it('does not set fire to corpses or invulnerable targets', () => {
    const combat = system([]);
    const corpse = { ...victim(), dead: true }, ghost = { ...victim(), invulnerable: true };
    combat.applyBurn(corpse, 110, 1);
    combat.applyBurn(ghost, 110, 1);
    expect(combat.burning.size).toBe(0);
    // a target that dies mid-burn drops out of the set rather than smouldering on
    const dying = victim(0, 500);
    combat.applyBurn(dying, 110, 1);
    dying.dead = true;
    combat.updateBurning(1 / 60);
    expect(combat.burning.size).toBe(0);
  });

  it('drives the flame effect while burning and stops when the fire goes out', () => {
    const fx = particles(), target = victim(0, 5000), combat = system([target], { particles: fx });
    combat.applyBurn(target, 110, 1);
    burnFor(combat, target.burnTimer);
    expect(fx.flame).toHaveBeenCalled();
    const emitted = fx.flame.mock.calls.length;
    burnFor(combat, 1);
    expect(fx.flame.mock.calls.length).toBe(emitted);
  });
});
