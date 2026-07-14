import { describe, expect, it } from 'vitest';
import { LeagueSystem, rankFor } from '../src/game/LeagueSystem.js';

describe('LeagueSystem', () => {
  it('creates persistent generated competitors with records', () => {
    const league = new LeagueSystem([]);
    expect(league.profiles).toHaveLength(18);
    expect(new Set(league.profiles.map(p => p.name)).size).toBe(18);
    expect(league.profiles.every(p => p.wins + p.losses > 0)).toBe(true);
  });

  it('quotes bounded decimal odds based on live team strength', () => {
    const league = new LeagueSystem([]);
    const teams = [{ id: 'a', profile: { mmr: 1500 } }, { id: 'b', profile: { mmr: 800 } }];
    const odds = league.oddsFor(teams, { a: { units: 4, hp: 100 }, b: { units: 1, hp: 20 } });
    expect(odds.a).toBeGreaterThanOrEqual(1.15);
    expect(odds.b).toBeLessThanOrEqual(9.5);
    expect(odds.a).toBeLessThan(odds.b);
  });

  it('updates a CPU rival after a result and exposes ranks', () => {
    const league = new LeagueSystem([]), rival = league.profiles[0], before = rival.mmr;
    const delta = league.settle('cpu', 'you', [
      { id: 'you', profile: { id: 'you', mmr: 1000 } },
      { id: 'cpu', profile: rival, stats: { kills: 3 } }
    ]);
    expect(delta).toBeLessThan(0);
    expect(rival.mmr).toBeGreaterThan(before);
    expect(rankFor(1600)).toBe('DIAMOND');
  });

  it('records CPU-only results without applying player MMR', () => {
    const league = new LeagueSystem([]), a = league.profiles[0], b = league.profiles[1], before = a.wins;
    const delta = league.settle('a', null, [{ id: 'a', profile: a }, { id: 'b', profile: b }]);
    expect(delta).toBe(0);
    expect(a.wins).toBe(before + 1);
  });

  it('keeps MMR and records isolated by game mode',()=>{
    const league=new LeagueSystem([]),rival=league.profiles[0],deathmatchBefore=rival.mmr;
    league.settle('cpu',null,[{id:'cpu',profile:rival}], 'domination');
    expect(rival.mmr).toBe(deathmatchBefore);
    expect(rival.modeRecords.domination.mmr).toBeGreaterThan(deathmatchBefore);
    expect(league.leaderboard({modeRecords:{deathmatch:{mmr:900,wins:2,losses:3},domination:{mmr:1400,wins:7,losses:1}}},'domination').find(p=>p.player)).toMatchObject({mmr:1400,wins:7,losses:1});
  });
});
