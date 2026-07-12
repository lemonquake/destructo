import { describe, expect, it, vi, beforeAll } from 'vitest';
import * as THREE from 'three';

// Stub TextureLoader load function to avoid calling createElementNS
THREE.TextureLoader.prototype.load = () => {
  const tex = new THREE.Texture();
  tex.image = { width: 1, height: 1 };
  return tex;
};

// Define mocks before importing Game dynamically
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  navigator: { userAgent: '' },
  matchMedia: () => ({ matches: false }),
  innerWidth: 1024,
  innerHeight: 768
};
global.document = {
  body: {
    classList: {
      add: () => {},
      remove: () => {}
    }
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  getElementById: () => null,
  querySelectorAll: () => [],
  createElementNS: () => ({
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {}
  })
};

let Game;

beforeAll(async () => {
  const mod = await import('../src/game/Game.js');
  Game = mod.Game;
});

// Mock minimal environment needed for Game prototype functions
const createMockGame = (overrides = {}) => {
  const camera = {
    fov: 48,
    position: new THREE.Vector3(),
    updateProjectionMatrix: vi.fn(),
    lookAt: vi.fn(),
    getWorldDirection: vi.fn((v) => v.set(0, 0, 1))
  };
  
  const input = {
    mouse: { down: false, dx: 0, dy: 0, wheelDelta: 0 },
    axis: () => ({ x: 0, z: 0 }),
    keys: new Set(),
    consume: vi.fn()
  };

  const target = {
    dead: false,
    group: {
      position: new THREE.Vector3(0, 0, 0),
      rotation: { y: 0 }
    },
    team: 'blue',
    classDef: { name: 'Commando' }
  };

  const game = {
    camera,
    input,
    observerTarget: target,
    directorTarget: target,
    combatants: [target],
    observerMode: 'follow',
    obsZoom: 1.0,
    obsRotation: 0,
    obsPitch: 0,
    freeLookPosition: new THREE.Vector3(),
    freeLookYaw: 0,
    freeLookPitch: 0,
    directorCutDelay: 0,
    pendingCutTarget: null,
    pendingCutAngle: null,
    pendingCutFeature: null,
    wasInBattle: false,
    directorTimer: 3.0,
    directorAngle: 0,
    hostile: (t1, t2) => t1 !== t2,
    world: {
      bounds: 78,
      groundAt: () => 0
    },
    teamMap: {
      blue: { name: 'Blue Team' },
      red: { name: 'Red Team' }
    },
    showObserverFeature: vi.fn(),
    ...overrides
  };

  Object.setPrototypeOf(game, Game.prototype);
  return game;
};

describe('Observer camera controls', () => {
  it('correctly rotates Freelook camera horizontally (non-inverted)', () => {
    const game = createMockGame({ observerMode: 'free', freeLookYaw: 0 });
    game.input.mouse.down = true;
    game.input.mouse.dx = 10; // Dragging right

    Game.prototype.updateObserverCamera.call(game, 0.016);
    
    // With inverted controls fixed: dragging right (positive dx) decreases freeLookYaw (clockwise yaw)
    expect(game.freeLookYaw).toBeLessThan(0);
    expect(game.freeLookYaw).toBeCloseTo(-10 * 0.004);
  });

  it('moves Freelook camera to the right when D key is pressed and left when A key is pressed', () => {
    // Looking forward (yaw = Math.PI, facing -Z)
    const game = createMockGame({ observerMode: 'free', freeLookYaw: Math.PI, freeLookPosition: new THREE.Vector3(0, 0, 0) });
    
    // Pressing D (axis.x = 1) should move camera right (+X)
    game.input.axis = () => ({ x: 1, z: 0 });
    Game.prototype.updateObserverCamera.call(game, 0.1);
    expect(game.freeLookPosition.x).toBeGreaterThan(0);

    // Pressing A (axis.x = -1) should move camera left (-X)
    game.freeLookPosition.set(0, 0, 0);
    game.input.axis = () => ({ x: -1, z: 0 });
    Game.prototype.updateObserverCamera.call(game, 0.1);
    expect(game.freeLookPosition.x).toBeLessThan(0);
  });

  it('zooms in and out using Mouse Scrollwheel in POV mode via FOV adjustment', () => {
    const game = createMockGame({ observerMode: 'pov', obsZoom: 1.0 });
    game.input.mouse.wheelDelta = 100; // Scroll down (zoom out)

    Game.prototype.updateObserverCamera.call(game, 0.016);

    expect(game.obsZoom).toBeGreaterThan(1.0);
    expect(game.camera.fov).toBeGreaterThan(72);
    expect(game.camera.updateProjectionMatrix).toHaveBeenCalled();
  });

  it('zooms in and out using Mouse Scrollwheel in Freelook mode via FOV adjustment', () => {
    const game = createMockGame({ observerMode: 'free', obsZoom: 1.0 });
    game.input.mouse.wheelDelta = -100; // Scroll up (zoom in)

    Game.prototype.updateObserverCamera.call(game, 0.016);

    expect(game.obsZoom).toBeLessThan(1.0);
    expect(game.camera.fov).toBeLessThan(48);
    expect(game.camera.updateProjectionMatrix).toHaveBeenCalled();
  });

  it('restores standard FOV (48) in Follow mode', () => {
    const game = createMockGame({ observerMode: 'follow', obsZoom: 1.0 });
    game.camera.fov = 72; // Leftover from POV mode

    Game.prototype.updateObserverCamera.call(game, 0.016);

    expect(game.camera.fov).toBe(48);
    expect(game.camera.updateProjectionMatrix).toHaveBeenCalled();
  });

  it('defaults to Freelook mode when entering observer mode', () => {
    const originalGetElementById = global.document.getElementById;
    const originalQuerySelectorAll = global.document.querySelectorAll;
    const originalCreateElement = global.document.createElement;

    const dummyElement = {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn()
      },
      appendChild: vi.fn(),
      style: {}
    };

    global.document.getElementById = vi.fn().mockReturnValue(dummyElement);
    global.document.querySelectorAll = vi.fn().mockReturnValue([]);
    global.document.createElement = vi.fn().mockReturnValue(dummyElement);

    const game = createMockGame({
      hud: { show: vi.fn() },
      endRuntime: vi.fn(),
      initObserverUI: vi.fn(),
      updateObserverUI: vi.fn(),
      setObserverMode: vi.fn()
    });

    Game.prototype.enterObserverMode.call(game);

    expect(game.observerMode).toBe('free');
    expect(game.setObserverMode).toHaveBeenCalledWith('free');

    // Restore originals
    global.document.getElementById = originalGetElementById;
    global.document.querySelectorAll = originalQuerySelectorAll;
    global.document.createElement = originalCreateElement;
  });
});

describe('AI Director battle tracking and cuts', () => {
  it('locks onto target and prevents camera cuts while battle is active', () => {
    const target = { dead: false, group: { position: new THREE.Vector3(0, 0, 0) }, team: 'blue' };
    const foe = { dead: false, group: { position: new THREE.Vector3(5, 0, 5) }, team: 'red' }; // Close by (distance ~7)
    
    const game = createMockGame({
      directorTarget: target,
      combatants: [target, foe],
      directorTimer: 0.5,
      wasInBattle: false
    });

    Game.prototype.updateDirector.call(game, 0.1);

    // Battle is active, so wasInBattle should become true
    expect(game.wasInBattle).toBe(true);
    // Timer should be refreshed, preventing target change
    expect(game.directorTimer).toBeGreaterThan(3.0);
    expect(game.directorCutDelay).toBe(0);
  });

  it('delays camera cut by 2 seconds once battle is finished', () => {
    const target = { dead: false, group: { position: new THREE.Vector3(0, 0, 0) }, team: 'blue' };
    const foe = { dead: false, group: { position: new THREE.Vector3(50, 0, 50) }, team: 'red' }; // Far away
    
    const game = createMockGame({
      directorTarget: target,
      combatants: [target, foe],
      directorTimer: 1.5,
      wasInBattle: true // Target was in a battle last frame
    });

    Game.prototype.updateDirector.call(game, 0.1);

    // Battle just ended, so wasInBattle becomes false
    expect(game.wasInBattle).toBe(false);
    // Camera cut delay should be scheduled for 2 seconds
    expect(game.directorCutDelay).toBe(2.0);
    expect(game.pendingCutTarget).toBeNull();
  });

  it('delays camera cut by 2 seconds and sets killer as pending when a unit is killed', () => {
    const target = { dead: false, group: { position: new THREE.Vector3(0, 0, 0) }, team: 'blue' };
    const killer = { dead: false, group: { position: new THREE.Vector3(10, 0, 10) }, team: 'red' };
    
    const game = createMockGame({
      observerMode: 'cinematic',
      directorTarget: target,
      combatants: [target, killer],
      directorCutDelay: 0
    });

    game.teamMap[killer.team] = { name: 'Red Team' };

    Game.prototype.featureObserverKill.call(game, killer, target);

    // Cuts should be delayed
    expect(game.directorCutDelay).toBe(2.0);
    expect(game.pendingCutTarget).toBe(killer);
    expect(game.pendingCutAngle).not.toBeNull();
    expect(game.pendingCutFeature).not.toBeNull();
  });

  it('processes cut delay and switches to pending target after delay expires', () => {
    const target = { dead: false, group: { position: new THREE.Vector3(0, 0, 0) }, team: 'blue' };
    const pendingTarget = { dead: false, group: { position: new THREE.Vector3(10, 0, 10) }, team: 'red', classDef: { name: 'Medic' } };
    
    const game = createMockGame({
      directorTarget: target,
      directorCutDelay: 0.1, // 0.1s left
      pendingCutTarget: pendingTarget,
      pendingCutAngle: 1.5,
      pendingCutFeature: { kicker: 'K', title: 'T', subtitle: 'S', duration: 4 }
    });

    // Run update with dt = 0.15s, which consumes the delay
    Game.prototype.updateDirector.call(game, 0.15);

    expect(game.directorCutDelay).toBe(0);
    expect(game.directorTarget).toBe(pendingTarget);
    expect(game.observerTarget).toBe(pendingTarget);
    expect(game.directorAngle).toBeCloseTo(1.5 + 0.15 * 0.3);
    expect(game.showObserverFeature).toHaveBeenCalledWith('K', 'T', 'S', 4);
    expect(game.pendingCutTarget).toBeNull();
  });

  it('makes the carried crate transparent in POV mode, and restores it when leaving POV mode', () => {
    const crate = {
      box: { material: { transparent: false, opacity: 1.0, needsUpdate: false } },
      bands: [
        { material: { transparent: false, opacity: 1.0, needsUpdate: false } }
      ]
    };
    const target = {
      dead: false,
      group: { position: new THREE.Vector3(), rotation: { y: 0 } },
      carriedCrate: crate
    };
    const game = createMockGame({
      observerMode: 'pov',
      observerTarget: target,
      transparentCrate: null
    });

    // 1. In POV mode, target has crate -> crate becomes transparent
    Game.prototype.updateObserverCamera.call(game, 0.016);
    expect(game.transparentCrate).toBe(crate);
    expect(crate.box.material.transparent).toBe(true);
    expect(crate.box.material.opacity).toBe(0.15);
    expect(crate.bands[0].material.transparent).toBe(true);
    expect(crate.bands[0].material.opacity).toBe(0.15);

    // 2. Switch mode to follow -> crate opacity is restored
    game.observerMode = 'follow';
    Game.prototype.updateObserverCamera.call(game, 0.016);
    expect(game.transparentCrate).toBeNull();
    expect(crate.box.material.transparent).toBe(false);
    expect(crate.box.material.opacity).toBe(1.0);
    expect(crate.bands[0].material.transparent).toBe(false);
    expect(crate.bands[0].material.opacity).toBe(1.0);
  });
});
