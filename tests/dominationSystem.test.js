import { describe, expect, it } from 'vitest';
import { DOMINATION_MAPS, GAME_MODES, mapsForMode } from '../src/data/maps.js';
import { CAPTURE_SECONDS, DominationSystem } from '../src/game/DominationSystem.js';

const unit = (team, x = 0, z = 0) => ({ type: 'unit', team, dead: false, group: { position: { x, z } } });
const tower = () => ({ id: 'sun', label: 'SUN', position: { x: 0, z: 0 }, radius: 5, ownerTeam: null, captureTeam: null, captureProgress: 0, contested: false });

describe('Tower Domination', () => {
  it('ships a separate three-map epic domination roster', () => {
    expect(Object.keys(DOMINATION_MAPS)).toEqual(['sunken', 'serpent', 'eclipse']);
    expect(GAME_MODES.deathmatch.mapIds).toHaveLength(4);
    expect(mapsForMode('domination')).toHaveLength(3);
    expect(mapsForMode('domination').every(map => map.towerCount >= 5)).toBe(true);
  });

  it('captures after five uncontested seconds and scores while held', () => {
    const point = tower(), system = new DominationSystem([point], [{ id: 'blue' }, { id: 'red' }], 50);
    expect(system.update(CAPTURE_SECONDS - .1, [unit('blue')]).some(e => e.type === 'captured')).toBe(false);
    expect(system.update(.1, [unit('blue')])).toContainEqual(expect.objectContaining({ type: 'captured', teamId: 'blue' }));
    system.update(3, []);
    expect(system.scores.blue).toBeCloseTo(3.1);
  });

  it('freezes capture progress while a pedestal is contested', () => {
    const point = tower(), system = new DominationSystem([point], [{ id: 'blue' }, { id: 'red' }], 50);
    system.update(2, [unit('blue')]);
    system.update(2, [unit('blue'), unit('red')]);
    expect(point.contested).toBe(true);
    expect(point.captureProgress).toBe(2);
  });

  it('treats allied teams as one side and preserves first-capturer credit',()=>{
    const teams=[{id:'blue',group:0},{id:'cyan',group:0},{id:'red',group:1}],hostile=(a,b)=>teams.find(t=>t.id===a).group!==teams.find(t=>t.id===b).group;
    const point=tower(),system=new DominationSystem([point],teams,50,hostile);
    system.update(2,[unit('blue'),unit('blue'),unit('cyan')]);expect(point.contested).toBe(false);expect(point.captureTeam).toBe('blue');
    system.update(3,[unit('cyan')]);expect(point.ownerTeam).toBe('blue');
  });

  it('freezes against any hostile alliance and decays only when empty',()=>{
    const teams=[{id:'blue',group:0},{id:'cyan',group:0},{id:'red',group:1}],hostile=(a,b)=>teams.find(t=>t.id===a).group!==teams.find(t=>t.id===b).group;
    const point=tower(),system=new DominationSystem([point],teams,50,hostile);system.update(2,[unit('blue')]);system.update(2,[unit('cyan'),unit('red')]);expect(point.captureProgress).toBe(2);expect(point.contested).toBe(true);system.update(1,[]);expect(point.captureProgress).toBeCloseTo(1.35);
  });

  it('declares the first team to the configured score limit', () => {
    const point = tower();point.ownerTeam = 'red';const system = new DominationSystem([point], [{ id: 'blue' }, { id: 'red' }], 25);
    expect(system.update(25, [])).toContainEqual({ type: 'victory', teamId: 'red' });
    expect(system.winner.id).toBe('red');
  });
});
