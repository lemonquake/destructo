import { describe, expect, it, vi } from 'vitest';
vi.mock('nipplejs',()=>({default:{create:vi.fn(()=>({on:vi.fn(),destroy:vi.fn()}))}}));
import { CAMPAIGN_MISSIONS, WEAPONS } from '../src/data/gameData.js';
import { DEBUG_AMMO, Game } from '../src/game/Game.js';

describe('debug code',()=>{
  it('accepts bugde, persists debug mode, and grants ammo only to the player team',()=>{
    const friendly={type:'unit',team:'t0',ammo:12},enemy={type:'unit',team:'t1',ammo:34},commit=vi.fn();
    const game={debugMode:false,playerTeam:'t0',combatants:[friendly,enemy],save:{data:{debugMode:false},commit}};
    expect(Game.prototype.activateDebugCode.call(game,'wrong')).toBe(false);
    expect(Game.prototype.activateDebugCode.call(game,' BUGDE ')).toBe(true);
    expect(game.debugMode).toBe(true);expect(game.save.data.debugMode).toBe(true);expect(commit).toHaveBeenCalledOnce();
    expect(friendly.ammo).toBe(DEBUG_AMMO);expect(enemy.ammo).toBe(34);
  });

  it('bypasses campaign prerequisites without marking missions complete',()=>{
    const save={campaignCompleted:vi.fn(()=>false)},game={debugMode:false,save};
    expect(Game.prototype.campaignMissionUnlocked.call(game,CAMPAIGN_MISSIONS['gold-rush'])).toBe(false);
    game.debugMode=true;
    expect(Game.prototype.campaignMissionUnlocked.call(game,CAMPAIGN_MISSIONS['gold-rush'])).toBe(true);
    expect(save.campaignCompleted).toHaveBeenCalledOnce();
  });

  it('loads every newly equipped player primary with 5000 ammo',()=>{
    const setWeaponModel=vi.fn(),game={debugMode:true,playerTeam:'t0',factory:{setWeaponModel},debugAmmoFor:Game.prototype.debugAmmoFor};
    const friendly={team:'t0'},enemy={team:'t1'};
    expect(Game.prototype.equipPrimaryWeapon.call(game,friendly,'rifle',WEAPONS.rifle,20,1)).toBe(true);
    expect(Game.prototype.equipPrimaryWeapon.call(game,enemy,'rifle',WEAPONS.rifle,20,1)).toBe(true);
    expect(friendly.ammo).toBe(DEBUG_AMMO);expect(enemy.ammo).toBe(20);
  });
});
