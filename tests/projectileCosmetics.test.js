import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MARKETPLACE_COSMETICS } from '../src/data/marketplaceData.js';
import { WEAPONS } from '../src/data/gameData.js';
import { CombatSystem } from '../src/game/CombatSystem.js';

const COLORS = Object.freeze({
  Red: 0xff3d57,
  Yellow: 0xffd23f,
  Purple: 0xa35cff,
  Pink: 0xff4f91,
  Blue: 0x2fb4ff,
  Green: 0x59e065,
});

const shooter = projectileStyle => ({
  type: 'unit', team: 'blue', projectileStyle,
  group: new THREE.Group(), velocity: new THREE.Vector3(),
});

describe('colored projectile cosmetics', () => {
  it('offers all six plasma and pellet colors with distinct model metadata', () => {
    const projectiles = MARKETPLACE_COSMETICS.filter(item => item.kind === 'projectile');
    for (const [color, primary] of Object.entries(COLORS)) {
      expect(projectiles.find(item => item.name === `${color} Plasma`)).toMatchObject({ visual: { model: 'plasma', primary } });
      expect(projectiles.find(item => item.name === `${color} Pellet`)).toMatchObject({ visual: { model: 'pellet', primary } });
    }
  });

  it('uses the equipped plasma or pellet geometry and cosmetic color in combat', () => {
    const combat = new CombatSystem(new THREE.Scene(), {}, () => [], vi.fn());
    const plasma = combat.spawn(shooter('red-plasma'), new THREE.Vector3(0, 0, 1), WEAPONS.pistol);
    expect(plasma).toMatchObject({ style: 'plasma', weapon: { color: COLORS.Red } });
    combat.release(plasma);
    const pellet = combat.spawn(shooter('green-pellet'), new THREE.Vector3(0, 0, 1), WEAPONS.pistol);
    expect(pellet).toMatchObject({ style: 'pellet', weapon: { color: COLORS.Green } });
  });
});
