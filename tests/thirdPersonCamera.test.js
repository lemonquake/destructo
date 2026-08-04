import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SETTINGS_DEFAULTS } from '../src/data/gameData.js';

global.window = { addEventListener: () => {}, removeEventListener: () => {}, navigator: { userAgent: '' }, matchMedia: () => ({ matches: false }), innerWidth: 1024, innerHeight: 768 };
global.document = { pointerLockElement: null, body: { classList: { add: () => {}, remove: () => {} } }, addEventListener: () => {}, removeEventListener: () => {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], createElementNS: () => ({ style: {}, addEventListener: () => {}, removeEventListener: () => {} }) };

let Game, CAMERA_ZOOM;
beforeAll(async () => { const mod = await import('../src/game/Game.js'); Game = mod.Game; CAMERA_ZOOM = mod.CAMERA_ZOOM; });
// the rig the wheel interpolates: everything the camera tests assert is derived
// from the same constants the game uses, so retuning the boom cannot silently
// invalidate the expectations
const rigAt = zoom => {
  const lerp = (a, b, t) => a + (b - a) * t, { near, far } = CAMERA_ZOOM;
  return { dist: lerp(near.dist, far.dist, zoom), height: lerp(near.height, far.height, zoom), side: lerp(near.side, far.side, zoom), fov: lerp(near.fov, far.fov, zoom) };
};

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
  // aim rebuilds the crosshair ray from the same boom the camera uses
  world: { groundAt: () => 0 },
  lookDirection: Game.prototype.lookDirection, shoulderRig: Game.prototype.shoulderRig, shoulderView: Game.prototype.shoulderView,
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

  it('bounds near-field shoulder parallax so a close hit cannot whip the aim sideways', () => {
    const player = soldier();
    // This is on the camera ray, but only one metre beyond the muzzle. Direct
    // convergence would turn the weapon roughly 40 degrees to the left.
    const game = aimGame(player, {}, { hoverPoint: new THREE.Vector3(-.85, 2.05, 1) });
    Game.prototype.updateAim.call(game, .016);
    expect(player.aim.z).toBeGreaterThan(.97);
    expect(player.aim.x).toBeGreaterThan(-.2);
  });

  it('does not reuse a throttled hover sample after the camera angle changes', () => {
    const player = soldier();
    const game = aimGame(player, {}, {
      hoverPoint: new THREE.Vector3(-20, 1.35, 0),
      _hoverViewYaw: .08,
      _hoverViewPitch: 0,
    });
    Game.prototype.updateAim.call(game, .016);
    expect(player.aim.z).toBeGreaterThan(.99);
    expect(Math.abs(player.aim.x)).toBeLessThan(.03);
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
    camZoom: CAMERA_ZOOM.default, camZoomTarget: CAMERA_ZOOM.default,
    camera: { fov: 48, position: new THREE.Vector3(), updateProjectionMatrix: vi.fn(), lookAt: vi.fn() },
    world: { groundAt: () => 0 },
    lookDirection: Game.prototype.lookDirection, applyCameraShake: Game.prototype.applyCameraShake,
    shoulderRig: Game.prototype.shoulderRig, shoulderView: Game.prototype.shoulderView,
  });

  it('hangs behind and above the player, offset over the RIGHT shoulder (player left of crosshair)', () => {
    const player = soldier();
    const game = cameraGame(player);
    const rig = rigAt(CAMERA_ZOOM.default);
    Game.prototype.updateCamera.call(game, .016);
    expect(game.camera.fov).toBeCloseTo(rig.fov);
    expect(game.camera.position.z).toBeCloseTo(-rig.dist);
    expect(game.camera.position.y).toBeCloseTo(rig.height);
    // looking along +Z, screen-right is world -X: the boom shifts right, the player sits left of center
    expect(game.camera.position.x).toBeCloseTo(-rig.side);
    expect(game.camera.lookAt).toHaveBeenCalled();
  });

  it('opens on a wider frame than the old fixed 5.2m / 62° rig', () => {
    const rig = rigAt(CAMERA_ZOOM.default);
    expect(rig.dist).toBeGreaterThan(5.2);   // boom pulled back
    expect(rig.fov).toBeLessThan(62);        // lens narrowed, so less wide-angle warp
    // net visible extent at the player's plane still grows
    const extent = (dist, fov) => 2 * dist * Math.tan(fov / 2 * Math.PI / 180);
    expect(extent(rig.dist, rig.fov)).toBeGreaterThan(extent(5.2, 62));
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

describe('wheel zoom', () => {
  const zoomGame = (player, overrides = {}) => {
    const game = {
      state: 'mission', fpsMode: false, fpsYaw: 0, fpsPitch: 0, player,
      camZoom: CAMERA_ZOOM.default, camZoomTarget: CAMERA_ZOOM.default,
      input: { mouse: { wheelDelta: 0 } }, world: { groundAt: () => 0 },
      ...overrides,
    };
    Object.setPrototypeOf(game, Game.prototype);
    return game;
  };
  const model = () => {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    return { group, material, mesh: group.children[0] };
  };
  const unit = () => { const m = model(); return { player: { ...soldier(), dead: false, group: m.group, weaponId: 'rifle' }, ...m }; };

  it('scrolls down to pull the boom back and up to push it in, clamped at both ends', () => {
    const game = zoomGame(unit().player);
    game.input.mouse.wheelDelta = 100; // one notch down
    Game.prototype.updateCameraZoom.call(game, .016);
    expect(game.camZoomTarget).toBeCloseTo(CAMERA_ZOOM.default + CAMERA_ZOOM.step);
    expect(game.input.mouse.wheelDelta).toBe(0); // consumed, so the observer cam never sees it
    game.input.mouse.wheelDelta = -100;
    Game.prototype.updateCameraZoom.call(game, .016);
    expect(game.camZoomTarget).toBeCloseTo(CAMERA_ZOOM.default);
    for (let i = 0; i < 40; i++) { game.input.mouse.wheelDelta = -400; Game.prototype.updateCameraZoom.call(game, .016); }
    expect(game.camZoomTarget).toBe(0);
    for (let i = 0; i < 40; i++) { game.input.mouse.wheelDelta = 400; Game.prototype.updateCameraZoom.call(game, .016); }
    expect(game.camZoomTarget).toBe(1);
  });

  it('eases the boom toward the new target instead of snapping to it', () => {
    const game = zoomGame(unit().player);
    game.input.mouse.wheelDelta = 100;
    Game.prototype.updateCameraZoom.call(game, .016);
    expect(game.camZoom).toBeGreaterThan(CAMERA_ZOOM.default);
    expect(game.camZoom).toBeLessThan(game.camZoomTarget);
    for (let i = 0; i < 120; i++) Game.prototype.updateCameraZoom.call(game, .016);
    expect(game.camZoom).toBeCloseTo(game.camZoomTarget, 3);
  });

  it('keeps the shot on the centred crosshair at every boom length, clamped or not', () => {
    for (const zoom of [0, .25, CAMERA_ZOOM.default, .8, 1]) {
      // pitch -.2 hangs the boom clear of the ground; +.9 drives it underground so
      // the terrain clamp lifts it off the ideal boom axis
      for (const pitch of [-.2, .9]) {
        const player = soldier();
        const game = aimGame(player, {}, { camZoom: zoom, fpsYaw: .6, fpsPitch: pitch, input: { mouse: { dx: 0, dy: 0, right: false, rightPressed: false }, mobile: false } });
        Game.prototype.updateAim.call(game, .016);
        const view = Game.prototype.shoulderView.call(game, player);
        const camera = new THREE.PerspectiveCamera(view.rig.fov, 16 / 9, .1, 700);
        camera.position.copy(view.position); camera.lookAt(view.focus); camera.updateMatrixWorld(true);
        // the round is solved from the muzzle onto a point on the crosshair ray;
        // projecting that convergence point must land dead centre on screen
        const muzzle = new THREE.Vector3(player.group.position.x, player.group.position.y + 1.35, player.group.position.z);
        const converge = view.position.clone().addScaledVector(view.ray, view.rig.dist + 60);
        const shot = muzzle.clone().addScaledVector(player.aim, converge.distanceTo(muzzle)).project(camera);
        expect(Math.hypot(shot.x, shot.y)).toBeLessThan(.005);
      }
    }
  });

  it('fades the player model out as the camera closes in and hands the originals back', () => {
    const { player, mesh, material } = unit();
    const game = zoomGame(player);
    game.camZoom = game.camZoomTarget = CAMERA_ZOOM.default;
    Game.prototype.updateCameraZoom.call(game, .016);
    expect(mesh.material).toBe(material); // wide boom: nothing between camera and crosshair

    game.camZoom = game.camZoomTarget = 0;
    Game.prototype.updateCameraZoom.call(game, .016);
    expect(mesh.material).not.toBe(material);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.opacity).toBeCloseTo(CAMERA_ZOOM.minOpacity);
    expect(material.opacity).toBe(1); // the shared original is never mutated

    game.camZoom = game.camZoomTarget = 1;
    Game.prototype.updateCameraZoom.call(game, .016);
    expect(mesh.material).toBe(material);
  });

  it('ramps the fade smoothly and monotonically across the zoom-in', () => {
    const { player, mesh } = unit();
    const game = zoomGame(player);
    let previous = -1;
    for (let zoom = 0; zoom <= CAMERA_ZOOM.fadeFrom + .05; zoom += .01) {
      game.camZoom = game.camZoomTarget = zoom;
      Game.prototype.updateCameraZoom.call(game, .016);
      const opacity = mesh.material.opacity ?? 1;
      expect(opacity).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = opacity;
    }
    expect(previous).toBeCloseTo(1);
  });

  it('leaves the model alone in first person and while riding a platform', () => {
    const { player, mesh, material } = unit();
    for (const state of [{ fpsMode: true }, { fpsMode: false, extra: 'mountedMotorcycle' }]) {
      const game = zoomGame(player, { fpsMode: state.fpsMode });
      if (state.extra) player[state.extra] = { group: new THREE.Group(), vehicleKind: 'bike' };
      game.camZoom = game.camZoomTarget = 0;
      Game.prototype.updateCameraZoom.call(game, .016);
      expect(mesh.material).toBe(material);
      if (state.extra) player[state.extra] = null;
    }
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

  it('does not let the previous hover point override fresh mouse movement', () => {
    const turret = { type: 'turret', group: { position: new THREE.Vector3(), rotation: { y: 0 } }, aim: new THREE.Vector3(0, 0, 1), head: { rotation: { y: 0 } }, barrels: [] };
    const game = turretGame({ dx: 10 });
    game.hoverPoint = new THREE.Vector3(40, 0, 40);
    Game.prototype.updateTurretAim.call(game, turret, 60, .016);
    expect(turret.aim.x).toBeLessThan(0);
    expect(turret.head.rotation.y).toBeLessThan(0);
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

  it('bounds close crosshair convergence for mounted guns too', () => {
    const turret = { type: 'turret', group: { position: new THREE.Vector3(), rotation: { y: 0 } }, aim: new THREE.Vector3(0, 0, 1), head: { rotation: { y: 0 } }, barrels: [] };
    const game = turretGame();
    game.hoverPoint = new THREE.Vector3(-1.05, 3.55, 1);
    Game.prototype.updateTurretAim.call(game, turret, 60, .016);
    expect(turret.aim.z).toBeGreaterThan(.97);
    expect(turret.aim.x).toBeGreaterThan(-.2);
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
