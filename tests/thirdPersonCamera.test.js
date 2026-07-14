import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SETTINGS_DEFAULTS } from '../src/data/gameData.js';

global.window = { addEventListener: () => {}, removeEventListener: () => {}, navigator: { userAgent: '' }, matchMedia: () => ({ matches: false }), innerWidth: 1024, innerHeight: 768 };
global.document = { pointerLockElement: null, body: { classList: { add: () => {}, remove: () => {} } }, addEventListener: () => {}, removeEventListener: () => {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], createElementNS: () => ({ style: {}, addEventListener: () => {}, removeEventListener: () => {} }) };

let Game;
beforeAll(async () => { const mod = await import('../src/game/Game.js'); Game = mod.Game; });

const soldier = () => ({
  team: 'blue', weaponId: 'rifle', weapon: { effectiveRange: 45 },
  group: { position: new THREE.Vector3(), rotation: { y: 0 } },
  velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), fireCooldown: 0,
});

const aimGame = (player, mouse = {}, overrides = {}) => ({
  fpsMode: false, fpsYaw: 0, fpsPitch: 0, player, lockTarget: null, hoverPoint: null, hoverEntity: null,
  input: { mouse: { dx: 0, dy: 0, right: false, rightPressed: false, ...mouse }, mobile: false },
  hud: { toast: vi.fn(), lockPulse: vi.fn() }, audio: { play: vi.fn() }, combat: {},
  isLockable: () => false,
  ...overrides,
});

describe('third-person shoulder aim', () => {
  it('turns the view with the mouse and aims along it when nothing is under the crosshair', () => {
    const player = soldier();
    const game = aimGame(player, { dx: 12 });
    Game.prototype.updateAim.call(game, .016);
    expect(game.fpsYaw).toBeLessThan(0);
    expect(player.aim.x).toBeLessThan(0);
    expect(player.group.rotation.y).toBeCloseTo(Math.atan2(player.aim.x, player.aim.z));
  });

  it('scales camera turn speed with the mouse sensitivity setting', () => {
    const slow = aimGame(soldier(), { dx: 10 }, { save: { data: { settings: { mouseSensitivity: .5 } } } });
    const fast = aimGame(soldier(), { dx: 10 }, { save: { data: { settings: { mouseSensitivity: 2 } } } });
    Game.prototype.updateAim.call(slow, .016);
    Game.prototype.updateAim.call(fast, .016);
    expect(fast.fpsYaw).toBeCloseTo(slow.fpsYaw * 4);
  });

  it('keeps the vertical look clamped in third person', () => {
    const game = aimGame(soldier(), { dy: -100000 });
    Game.prototype.updateAim.call(game, .016);
    expect(game.fpsPitch).toBeCloseTo(1.25);
  });

  it('aims at the point under the centered crosshair when one exists', () => {
    const player = soldier();
    const game = aimGame(player, {}, { hoverPoint: new THREE.Vector3(-20, 1.35, 0) });
    for (let i = 0; i < 20; i++) Game.prototype.updateAim.call(game, .016);
    expect(player.aim.x).toBeLessThan(-.9);
  });

  it('locks onto the hovered enemy with right-click and snaps the aim to it', () => {
    const player = soldier();
    const enemy = { type: 'unit', dead: false, team: 'red', group: { position: new THREE.Vector3(15, 0, 0) } };
    const game = aimGame(player, { rightPressed: true, right: true }, { hoverEntity: enemy, isLockable: () => true });
    Game.prototype.updateAim.call(game, .016);
    expect(game.lockTarget).toBe(enemy);
    expect(game.hud.lockPulse).toHaveBeenCalled();
    expect(player.aim.x).toBeGreaterThan(0);
  });

  it('releases the lock on a second right-click', () => {
    const player = soldier();
    const enemy = { type: 'unit', dead: false, team: 'red', group: { position: new THREE.Vector3(5, 0, 0) } };
    const game = aimGame(player, { rightPressed: true, right: true }, { lockTarget: enemy });
    Game.prototype.updateAim.call(game, .016);
    expect(game.lockTarget).toBeNull();
    expect(game.hud.toast).toHaveBeenCalledWith('LOCK RELEASED');
  });

  it('drops the lock when the target moves out of weapon range', () => {
    const player = soldier();
    const enemy = { type: 'unit', dead: false, team: 'red', group: { position: new THREE.Vector3(500, 0, 0) } };
    const game = aimGame(player, {}, { lockTarget: enemy });
    Game.prototype.updateAim.call(game, .016);
    expect(game.lockTarget).toBeNull();
    expect(game.hud.toast).toHaveBeenCalledWith('LOCK LOST', true);
  });
});

describe('third-person shoulder camera', () => {
  const cameraGame = player => ({
    state: 'mission', fpsMode: false, fpsYaw: 0, fpsPitch: 0, player, cameraScout: null, camShake: 0,
    camera: { fov: 48, position: new THREE.Vector3(), updateProjectionMatrix: vi.fn(), lookAt: vi.fn() },
    world: { groundAt: () => 0 },
    lookDirection: Game.prototype.lookDirection, applyCameraShake: Game.prototype.applyCameraShake,
  });

  it('hangs behind and above the player, offset over the RIGHT shoulder (player left of crosshair)', () => {
    const player = soldier();
    const game = cameraGame(player);
    Game.prototype.updateCamera.call(game, .016);
    expect(game.camera.fov).toBe(62);
    expect(game.camera.position.z).toBeLessThan(0);
    expect(game.camera.position.y).toBeGreaterThan(1.5);
    // looking along +Z, screen-right is world -X: the boom shifts right, the player sits left of center
    expect(game.camera.position.x).toBeCloseTo(-.85);
    expect(game.camera.lookAt).toHaveBeenCalled();
  });

  it('strafes D toward screen-right and A toward screen-left relative to the camera', () => {
    const player = { ...soldier(), dead: false, stun: 0, classDef: { speed: 6 }, buffs: {}, groundY: 0, verticalVelocity: 0, grenades: 0 };
    const game = {
      fpsMode: false, fpsYaw: 0, fpsPitch: 0, player, healAim: false, grappleAim: false, camShake: 0,
      input: { consume: () => false, axis: () => ({ x: 1, z: 0 }), keys: new Set(), mouse: { down: false, right: false, rightPressed: false, alt: false, dx: 0, dy: 0 } },
      world: { isWater: () => false, groundAt: () => 0, resolveCollisions: () => 0, crateTopAt: () => null, clamp: () => {} },
      hud: { toast: vi.fn() }, audio: { play: vi.fn() }, save: { data: { settings: {}, gear: [] } },
      updateViewModeInput: () => {}, updateAim: () => {}, handleInteraction: () => {}, handleMaterialize: () => {},
    };
    Object.setPrototypeOf(game, Game.prototype);
    game.updatePlayer(.05); // D pressed while looking along +Z: screen-right is world -X
    expect(player.velocity.x).toBeLessThan(0);
    player.velocity.set(0, 0, 0);
    game.input.axis = () => ({ x: -1, z: 0 }); // A pressed: screen-left is world +X
    game.updatePlayer(.05);
    expect(player.velocity.x).toBeGreaterThan(0);
  });

  it('orbits when the look yaw changes instead of staying on a fixed angle', () => {
    const player = soldier();
    const game = cameraGame(player);
    game.fpsYaw = Math.PI / 2;
    Game.prototype.updateCamera.call(game, .016);
    expect(game.camera.position.x).toBeLessThan(0);
  });

  it('never sinks below the terrain', () => {
    const player = soldier();
    const game = cameraGame(player);
    game.world.groundAt = () => 30;
    game.fpsPitch = 1.2; // looking almost straight up pushes the boom down
    Game.prototype.updateCamera.call(game, .016);
    expect(game.camera.position.y).toBeGreaterThanOrEqual(30.45);
  });
});

describe('mounted platform crosshair gunnery', () => {
  const turretGame = (mouse = {}) => ({
    input: { mouse: { dx: 0, dy: 0, rightPressed: false, ...mouse }, mobile: false },
    hoverPoint: null, turretLockTarget: null, combat: {}, player: {}, hud: { lockPulse: vi.fn() },
  });

  it('steers the turret with mouse look when nothing is under the crosshair', () => {
    const turret = { type: 'turret', group: { position: new THREE.Vector3(), rotation: { y: 0 } }, aim: new THREE.Vector3(0, 0, 1), head: { rotation: { y: 0 } }, barrels: [{ rotation: { x: Math.PI / 2 } }] };
    const game = turretGame({ dx: 10, dy: -10 });
    Game.prototype.updateTurretAim.call(game, turret, 60, .016);
    expect(game.fpsYaw).toBeLessThan(0);
    expect(turret.controlYaw).toBeLessThan(0);
    expect(turret.controlPitch).toBeGreaterThan(0);
    expect(turret.head.rotation.y).toBeLessThan(0);
    expect(turret.barrels[0].rotation.x).toBeLessThan(Math.PI / 2);
  });

  it('prioritizes the locked target over the crosshair point', () => {
    const turret = { type: 'turret', group: { position: new THREE.Vector3(), rotation: { y: 0 } }, aim: new THREE.Vector3(0, 0, 1), barrels: [] };
    const lock = { dead: false, group: { position: new THREE.Vector3(-30, 0, 0) } };
    const game = turretGame();
    game.turretLockTarget = lock;
    game.hoverPoint = new THREE.Vector3(40, 0, 40);
    Game.prototype.updateTurretAim.call(game, turret, 60, .016);
    expect(turret.aim.x).toBeLessThan(0);
  });
});

describe('observer POV shoulder spectate', () => {
  it('rides behind the observed Destructo along its aim like a live player camera', () => {
    const target = { dead: false, team: 'blue', aim: new THREE.Vector3(0, 0, 1), group: { position: new THREE.Vector3(10, 0, 10), rotation: { y: 0 } } };
    const game = {
      observerMode: 'pov', observerTarget: target, transparentCrate: null, obsZoom: 1,
      camera: { fov: 72, position: new THREE.Vector3(), updateProjectionMatrix: vi.fn(), lookAt: vi.fn() },
      input: { mouse: { down: false, dx: 0, dy: 0, wheelDelta: 0 }, axis: () => ({ x: 0, z: 0 }), keys: new Set() },
      world: { bounds: 78, groundAt: () => 0 },
    };
    Game.prototype.updateObserverCamera.call(game, 5);
    expect(game.camera.position.z).toBeLessThan(10); // behind the unit, not at its eyes
    expect(game.camera.position.z).toBeCloseTo(10 - 4.8, 1);
    expect(game.camera.position.y).toBeGreaterThan(1.5);
    expect(game.camera.lookAt).toHaveBeenCalled();
  });
});

describe('settings', () => {
  it('ships a mouse sensitivity default', () => {
    expect(SETTINGS_DEFAULTS.mouseSensitivity).toBe(1);
  });
});
