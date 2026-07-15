import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('nipplejs',()=>({default:{create:vi.fn(()=>({on:vi.fn(),destroy:vi.fn()}))}}));
import { CAMPAIGN_MISSIONS } from '../src/data/gameData.js';
import { Game } from '../src/game/Game.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { SaveSystem } from '../src/game/SaveSystem.js';

describe('campaign quest state',()=>{
  it('advances ordered quest steps and completes once',()=>{
    const changed=vi.fn(),completed=vi.fn(),quest=new QuestSystem(CAMPAIGN_MISSIONS['four-of-a-kind'],{onStepChanged:changed,onComplete:completed});
    expect(quest.currentStep().id).toBe('build-squad');
    quest.notify('unit-built',{count:4});expect(quest.event('unit-built')).toEqual({count:4});
    quest.advance();expect(quest.currentStep().id).toBe('arm-squad');
    quest.advance();quest.advance();quest.advance({won:true});
    expect(quest.complete).toBe(true);expect(completed).toHaveBeenCalledOnce();expect(quest.advance()).toBe(false);
  });

  it('fails once and cannot advance afterward',()=>{
    const failed=vi.fn(),quest=new QuestSystem(CAMPAIGN_MISSIONS['gold-rush'],{onFail:failed});
    expect(quest.fail('SQUAD WIPED')).toBe(true);expect(quest.failed).toBe(true);expect(quest.advance()).toBe(false);expect(failed).toHaveBeenCalledWith('SQUAD WIPED');
  });

  it('orders all five Gaia operations and models the ten-minute defense rules',()=>{
    expect(Object.values(CAMPAIGN_MISSIONS).map(m=>m.order)).toEqual([1,2,3,4,5]);
    expect(CAMPAIGN_MISSIONS['gold-rush'].steps.map(s=>s.id)).toEqual(['eliminate-guards']);
    expect(CAMPAIGN_MISSIONS['gold-rush'].optionalObjectives).toEqual([expect.objectContaining({id:'build-five',goal:5})]);
    expect(CAMPAIGN_MISSIONS['golden-shield'].enemySquad).toHaveLength(10);
    expect(CAMPAIGN_MISSIONS['golden-shield'].startingSquad).toEqual(['heavy','heavy','heavy','heavy','heavy']);
    expect(CAMPAIGN_MISSIONS['golden-shield']).toMatchObject({startingWeapon:'machinegun',startingAmmo:300,turretRiderClass:'heavy'});
    expect(CAMPAIGN_MISSIONS['golden-shield'].startingSquad.length+1).toBe(6);
  });

  it('deploys five mobile gunners, a sixth turret rider, and an opening triple supply drop',()=>{
    const depot={id:'aegis-supply-depot'},mobile=Array.from({length:5},(_,i)=>({id:`ally-${i}`,team:'t0'})),enemies=Array.from({length:10},(_,i)=>({id:`enemy-${i}`,team:'t1'})),context={
      playerTeam:'t0',mission:CAMPAIGN_MISSIONS['golden-shield'],campaignEnemies:enemies,combatants:[],entities:[],
      world:{basePositions:{t0:new THREE.Vector3(0,0,100)},baseTurrets:{},crateDropZones:[depot],destroJet:{dropPosition:new THREE.Vector3(0,0,-90)},groundAt:()=>0,airdropCrate:vi.fn()},
      factory:{createBaseTurret:vi.fn((_team,pos)=>({id:'turret',group:{position:pos},ammo:50,magazineSize:50}))},ai:{setTeamDoctrine:vi.fn()},
      createGoldenQuestCrate:vi.fn(function(){this.goldenCrate={};}),addUnit:vi.fn(function(){const rider={id:'rider',team:'t0'};mobile.push(rider);return rider}),livingUnits:vi.fn(()=>mobile),equipPrimaryWeapon:vi.fn(),mountTurret:vi.fn(),hud:{toast:vi.fn()},
    };
    Game.prototype.setupGoldenShield.call(context);
    expect(mobile).toHaveLength(6);expect(context.mountTurret).toHaveBeenCalledWith(mobile[5],context.world.baseTurrets.aegis);expect(context.equipPrimaryWeapon).toHaveBeenCalledTimes(6);expect(context.world.airdropCrate).toHaveBeenCalledTimes(3);expect(enemies.filter(e=>e.missionThief)).toHaveLength(4);expect(enemies.every(e=>e.ignoreBases)).toBe(true);
  });

  it('lets Mission 2 complete by elimination without requiring the optional five-unit build',()=>{
    const allies=[{id:'player'}],guards=Array.from({length:5},(_,i)=>({id:`guard-${i}`,dead:true})),context={playerTeam:'t0',campaignEnemies:guards,livingUnits:vi.fn(()=>allies),beginGoldRushCharge:vi.fn(),quest:{progress:vi.fn(),advance:vi.fn(),fail:vi.fn()}};
    Game.prototype.updateGoldRushMission.call(context,.016,{id:'eliminate-guards'});
    expect(context.quest.progress).toHaveBeenCalledWith(5,5);expect(context.quest.advance).toHaveBeenCalledOnce();expect(context.beginGoldRushCharge).not.toHaveBeenCalled();
    allies.push({},{},{},{});guards.forEach(guard=>guard.dead=false);context.quest.advance.mockClear();Game.prototype.updateGoldRushMission.call(context,.016,{id:'eliminate-guards'});expect(context.beginGoldRushCharge).toHaveBeenCalledOnce();expect(context.quest.advance).not.toHaveBeenCalled();
  });
});

describe('campaign persistence',()=>{
  beforeEach(()=>{const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),clear:()=>memory.clear()}});
  it('starts with Mission 1 available and records unique completions',()=>{
    const save=new SaveSystem();expect(save.campaignCompleted('four-of-a-kind')).toBe(false);save.completeCampaignMission('four-of-a-kind');save.completeCampaignMission('four-of-a-kind');expect(save.data.campaign.completedMissionIds).toEqual(['four-of-a-kind']);expect(CAMPAIGN_MISSIONS['gold-rush'].requires).toBe('four-of-a-kind');
  });
  it('migrates legacy saves without changing their currencies or records',()=>{
    localStorage.setItem('destructo-save-v1',JSON.stringify({chips:4321,missionsWon:9,mmr:1200,rankedWins:3,rankedLosses:2}));const save=new SaveSystem();expect(save.data.chips).toBe(4321);expect(save.data.missionsWon).toBe(9);expect(save.data.campaign.completedMissionIds).toEqual([]);expect(save.modeRecord('deathmatch')).toMatchObject({mmr:1200,wins:3,losses:2});
  });
});
