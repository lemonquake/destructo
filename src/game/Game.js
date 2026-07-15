import * as THREE from 'three';
import { gsap } from 'gsap';
import { TEAM, TEAM_COLORS, MAX_PLAYERS, defaultTeamSetup, DEFAULT_TEAM_NAMES, CLASSES, WEAPONS, MISSIONS, CAMPAIGN_MISSIONS, CAMPAIGN_DIMENSIONS, COSMETICS, PASSIVE_SKILLS, ACTIVE_SKILLS, CRATE_TYPES, rollDrop, buildWeaponVariant, rollCrateWeapon, destructoSpeedBonus, tankHpBonus, shiftTeamAlliance, normalizeAllianceGroups, allianceSummary, GEAR } from '../data/gameData.js';
import { MenuStage } from './MenuStage.js';
import { SaveSystem } from './SaveSystem.js';
import { Input } from './Input.js';
import { HUD } from './HUD.js';
import { MaterialLibrary, SKIN_TEXTURES, paintSkinPreview } from './Materials.js';
import { EntityFactory } from './EntityFactory.js';
import { World } from './World.js';
import { DBuilder } from './DBuilder.js';
import { ParticleSystem } from './ParticleSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { PerformanceGovernor } from './PerformanceGovernor.js';
import { AIController, AI_BEHAVIORS, defaultDoctrineForMode } from './AIController.js';
import { resolveRespawnPosition } from './SpawnPosition.js';
import { Minimap } from './Minimap.js';
import { AudioSystem } from './AudioSystem.js';
import { createGrenadeModel } from './ProjectileModels.js';
import { GAME_MODES, ALL_MAPS, DEFAULT_MAP_ID, mapsForMode } from '../data/maps.js';
import { LeagueSystem, rankFor } from './LeagueSystem.js';
import { DominationSystem, CAPTURE_SECONDS } from './DominationSystem.js';
import { QuestSystem } from './QuestSystem.js';
import { stepJumpState } from './JumpSystem.js';
import { Marketplace } from './Marketplace.js';
import { Casino } from './Casino.js';
import { openPayPalCheckout } from './PayPalCheckout.js';

const pick = list => list[Math.floor(Math.random() * list.length)];
const hex = c => `#${c.toString(16).padStart(6, '0')}`;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const SETUP_DEFAULTS = Object.freeze({ squadSize: 3, startingClasses: Object.freeze(['scout', 'scout', 'medic', 'gunner', 'commando']), startingAmmo: 90, aiDifficulty: 'regular', matchMinutes: 5, maxScore: 100, reinforcements: true, reinforcementSeconds: 15, dominationRespawnSeconds: 3 });
// Screens that play over the live 3D menu diorama instead of a battle scene.
const MENU_BACKDROP_STATES = new Set(['menu', 'setup', 'missions', 'leaderboard', 'results']);
const freshMatchSetup = overrides => ({ ...SETUP_DEFAULTS, startingClasses: [...SETUP_DEFAULTS.startingClasses], ...overrides });
const DOMINATION_RULES = Object.freeze({ squadSize: 4, reinforcementSeconds: 3, classId: 'commando', weaponId: 'rifle' });
// heal tether: max wire length before the green wires snap, heal + drain rates
const HEAL_RANGE = 11, HEAL_RATE = 14, HEAL_MP_DRAIN = 6, HEAL_WIRE_POINTS = 22;
const GRAPPLE_RANGE = 54, GRAPPLE_LAUNCH_TIME = .36, GRAPPLE_PULL_TIME = 11 / 6;
// A third-person camera and a muzzle cannot share the same origin. If the
// camera ray hits something immediately in front of the player, converging the
// muzzle on that exact point creates a large sideways angle from a tiny change
// in hit distance. Keep that parallax bounded while preserving exact aim once
// the target is comfortably in front of the weapon.
const AIM_CONVERGENCE = Object.freeze({ firstPerson: 2.5, shoulder: 6, mounted: 7 });
const HOVER_ANGLE_TOLERANCE = THREE.MathUtils.degToRad(.35);
const wrappedAngleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const stableCrosshairPoint=(game,origin,look,minForward)=>{
  if(!game.hoverPoint)return null;
  if(Number.isFinite(game._hoverViewYaw)&&Math.abs(wrappedAngleDelta(game.fpsYaw||0,game._hoverViewYaw))>HOVER_ANGLE_TOLERANCE)return null;
  if(Number.isFinite(game._hoverViewPitch)&&Math.abs((game.fpsPitch||0)-game._hoverViewPitch)>HOVER_ANGLE_TOLERANCE)return null;
  const point=game.hoverPoint.clone(),forward=point.clone().sub(origin).dot(look);
  if(forward<minForward)point.addScaledVector(look,minForward-forward);
  return point;
};
const DESTRUCTIBLE_SUPPLIES=Object.freeze({ammo:Object.freeze({id:'ammo',name:'Ammo Pack',color:0xffc44a}),health:Object.freeze({id:'health',name:'Health Pack',color:0x59e065})});
export const DEBUG_CODE='bugde',DEBUG_AMMO=5000;
export function rollDestructibleSupply(random=Math.random){const roll=random();return roll<.2?DESTRUCTIBLE_SUPPLIES.ammo:roll<.4?DESTRUCTIBLE_SUPPLIES.health:null;}

export class Game{
  constructor(mount){this.mount=mount;this.screen=document.querySelector('#screen');this.save=new SaveSystem();this.debugMode=Boolean(this.save.data.debugMode);this.league=new LeagueSystem(this.save.data.aiProfiles);this.input=new Input(mount);this.hud=new HUD();this.minimap=new Minimap(document.querySelector('#minimap'),p=>this.scoutFromMinimap(p));this.observerMinimap=new Minimap(document.querySelector('#observer-minimap'),p=>this.observerMapCommand(p));this.audio=new AudioSystem(this.save.data.settings.volume);this.audio.setMusicMuted(this.save.data.settings.musicMuted);this.audio.setSoundsMuted(this.save.data.settings.soundsMuted);this.lastFrame=performance.now()/1000;this.state='menu';this.running=false;this.entities=[];this.combatants=[];this.kills=0;this.elapsed=0;this.lockTarget=null;this.hoverEntity=null;this.setup=defaultTeamSetup(4);this.matchSetup=freshMatchSetup();this.selectedMode='deathmatch';this.selectedMap=DEFAULT_MAP_ID;this.selectedDimensionIndex=0;this.teamStats={};this.aiBehaviorIndex=0;this.paypalModalActive=false;this.bindUI()}
  boot(){this.setupRenderer();this.showMenu();this.loop()}
  setupRenderer(){this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=this.save.data.settings.shadows;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;this.performanceGovernor=new PerformanceGovernor(this.renderer);this.renderer.domElement.addEventListener('pointerdown',()=>{if(this.state==='mission'&&document.pointerLockElement!==this.renderer.domElement){this._mouseCaptureClick=true;this.requestMouseCapture()}});this.mount.appendChild(this.renderer.domElement);this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,700);this.camera.position.set(0,24,23);addEventListener('resize',()=>this.resize());}
  bindUI(){this.screen.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    if (action.startsWith('teamcolor:') || action.startsWith('teamuniform:') || action.startsWith('teamgroup:') || action.startsWith('setup:alliance:') || action.startsWith('setup:role:') || action === 'setup:add' || action === 'setup:remove' || action === 'setup:randomize' || action.startsWith('setup:preset:')) {
      this.audio.play('change_team');
    } else if (action.startsWith('cos:')) {
      this.audio.play('change_texture');
    } else {
      this.audio.play('button_click');
    }
    if(action==='custom-match')this.showGameSetup();else if(action==='deploy'){const limit=ALL_MAPS[this.selectedMap]?.maxTeams||MAX_PLAYERS;if(this.setup.length<=limit)this.startMission('skirmish')}else if(action==='missions')this.showMissions();else if(action==='dimension:prev')this.cycleDimension(-1);else if(action==='dimension:next')this.cycleDimension(1);else if(action.startsWith('mission:')){const id=action.slice(8),mission=CAMPAIGN_MISSIONS[id];if(mission&&this.campaignMissionUnlocked(mission))this.startMission(id)}else if(action==='menu')this.showMenu();else if(action==='settings')this.showSettings();else if(action==='shop')this.showShop();else if(action==='dbuild')this.showDBuild();else if(action==='casino')this.showCasino();else if(action==='reset'){this.save.reset();this.debugMode=false;this.league=new LeagueSystem([]);this.showMenu()}
    else if(action==='pause:resume')this.resumeGame()
    else if(action==='pause:options')this.showPauseMenu(true)
    else if(action==='pause:back')this.showPauseMenu(false)
    else if(action==='pause:music'){const muted=this.audio.setMusicMuted(!this.audio.musicMuted);this.save.setSetting('musicMuted',muted);this.showPauseMenu(this.pauseOptionsOpen)}
    else if(action==='pause:sounds'){const muted=this.audio.setSoundsMuted(!this.audio.soundsMuted);this.save.setSetting('soundsMuted',muted);this.showPauseMenu(this.pauseOptionsOpen)}
    else if(action==='pause:restart'){const missionId=this.mission?.id||'skirmish';this.pausePreviousState=null;this.startMission(missionId)}
    else if(action==='pause:menu'){this.pausePreviousState=null;this.showMenu()}
    else if(action==='setup:add'){const limit=Math.min(MAX_PLAYERS,ALL_MAPS[this.selectedMap]?.maxTeams||MAX_PLAYERS);if(this.setup.length<limit)this.setup.push({name:DEFAULT_TEAM_NAMES[this.setup.length],colorIndex:this.setup.length%TEAM_COLORS.length,group:this.setup.length,uniformIndex:this.setup.length%SKIN_TEXTURES.length,isHuman:false});this.showGameSetup()}
    else if(action==='setup:remove'){if(this.setup.length>2)this.setup.pop();this.showGameSetup()}
    else if(action.startsWith('setup:preset:'))this.applySetupPreset(action.slice(13))
    else if(action.startsWith('mode:')){this.selectedMode=action.slice(5);if(this.selectedMode==='domination')this.setup.forEach((team,index)=>team.group=index);this.selectedMap=GAME_MODES[this.selectedMode]?.mapIds[0]||DEFAULT_MAP_ID;this.showGameSetup()}
    else if(action.startsWith('map:')){const id=action.slice(4);if(GAME_MODES[this.selectedMode]?.mapIds.includes(id))this.selectedMap=id;this.showGameSetup()}
    else if(action==='setup:randomize')this.randomizeSetup()
    else if(action.startsWith('setup:role:')){const i=Number(action.slice(11)),becomeHuman=!this.setup[i].isHuman;this.setup.forEach(t=>t.isHuman=false);this.setup[i].isHuman=becomeHuman;this.showGameSetup()}
    else if(action.startsWith('teamcolor:')){const i=Number(action.slice(10)),used=this.setup.map(t=>t.colorIndex);let next=(this.setup[i].colorIndex+1)%TEAM_COLORS.length;for(let k=0;k<TEAM_COLORS.length&&used.includes(next);k++)next=(next+1)%TEAM_COLORS.length;this.setup[i].colorIndex=next;this.showGameSetup()}
    else if(action.startsWith('teamuniform:')){const i=Number(action.slice(12));this.setup[i].uniformIndex=((this.setup[i].uniformIndex||0)+1)%SKIN_TEXTURES.length;this.showGameSetup()}
    else if(action.startsWith('teamgroup:')){if(this.selectedMode==='domination')return;const i=Number(action.slice(10));this.setup[i].group=(this.setup[i].group+1)%Math.min(this.setup.length,5);this.showGameSetup()}
    else if(action.startsWith('setup:alliance:')){if(this.selectedMode==='domination')return;const [,,index,dir]=action.split(':');shiftTeamAlliance(this.setup,Number(index),Number(dir));this.showGameSetup()}
    else if(action==='rankings'){this.showRankings()}else if(action==='rankings:back'){this.showMenu()}else if(action.startsWith('rankings:')){this.rankingsMode=action.slice(9);this.showRankings()}else if(action==='buy-tickets'){this.showBuyTicketsModal()}else if(action.startsWith('gear:'))this.buyGear(action.slice(5));else if(action.startsWith('cos:'))this.handleCosmetic(action.slice(4))});
    this.screen.addEventListener('input',e=>{if(e.target.dataset.teamName!==undefined){const i=Number(e.target.dataset.teamName);this.setup[i].name=e.target.value.slice(0,14);return}
      if(e.target.dataset.startingClass!==undefined){this.matchSetup.startingClasses[Number(e.target.dataset.startingClass)]=e.target.value;return}
      if(e.target.dataset.setupRule){const key=e.target.dataset.setupRule;this.matchSetup[key]=e.target.type==='checkbox'?e.target.checked:(key==='aiDifficulty'?e.target.value:Number(e.target.value));if(key==='squadSize')this.showGameSetup();return}
      if(!e.target.dataset.setting)return;const key=e.target.dataset.setting,value=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);this.save.setSetting(key,value);if(key==='volume')this.audio.setVolume(value);if(key==='musicMuted')this.audio.setMusicMuted(value);if(key==='soundsMuted')this.audio.setSoundsMuted(value);if(key==='shadows'&&this.renderer)this.renderer.shadowMap.enabled=value});
    this.screen.addEventListener('submit',e=>{if(!e.target.matches('[data-code-form]'))return;e.preventDefault();this.submitDebugCode(e.target.querySelector('[data-debug-code]')?.value)});
    addEventListener('keydown',e=>{if(this.state!=='missions'||(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'))return;e.preventDefault();this.audio.play('button_click');this.cycleDimension(e.key==='ArrowRight'?1:-1)})}
  // ── Live menu backdrop: a silent 3D vignette that plays behind every menu ──
  presentMenuBackdrop(){
    // back in the menus: the battle scene is over, release it before swapping
    if(this.world&&this.scene&&this.scene!==this.menuScene)this.disposeScene();
    if(this.menuStage){this.scene=this.menuScene;document.body.classList.add('menu-live');return}
    this.ensureMenuStage();
  }
  async ensureMenuStage(){
    if(this.menuStage||this.menuStageLoading)return;
    this.menuStageLoading=true;
    try{
      const materials=await new MaterialLibrary(this.renderer,this.save.data.settings).load();
      // a mission may have started while textures streamed in — stand down
      if(!MENU_BACKDROP_STATES.has(this.state)){materials.dispose();return}
      this.menuMaterials=materials;
      this.menuScene=new THREE.Scene();
      this.menuStage=new MenuStage(this.menuScene,materials,new EntityFactory(this.menuScene,materials));
      this.scene=this.menuScene;
      document.body.classList.add('menu-live');
    }finally{this.menuStageLoading=false}
  }
  disposeMenuStage(){
    document.body.classList.remove('menu-live');
    if(!this.menuStage)return;
    this.menuStage.dispose();this.menuStage=null;
    this.menuMaterials?.dispose();this.menuMaterials=null;
    if(this.scene===this.menuScene)this.scene=new THREE.Scene();
    this.menuScene=null;
  }
  showMenu(){this.marketplace?.dispose();this.marketplace=null;this.casino?.dispose();this.casino=null;this.endRuntime();this.state='menu';this.presentMenuBackdrop();this.audio.playMusic('/music/main_theme.mp3');this.screen.innerHTML=`<main class="menu menu-home"><div class="home-panel"><h1 class="logo">Destructo</h1><p class="subtitle">Build the squad. Break the battlefield.</p><div class="home-actions"><button class="btn mission-btn" data-action="missions"><i></i><span>MISSION</span></button><button class="btn primary custom-match-btn" data-action="custom-match"><i></i><span>CUSTOM MATCH</span></button><button class="btn dbuilder-menu-btn" data-action="dbuild"><i></i><span>D-BUILDER</span><small>3D FITTING ROOM</small></button><button class="btn casino-menu-btn" data-action="casino"><i></i><span>CASINO</span><small>3 GAMES · RARE PRIZES</small></button><button class="btn" data-action="rankings">RANKINGS</button><button class="btn" data-action="settings">SETTINGS</button></div><div class="home-meta"><span class="meta-chip">🏆 ${this.save.data.missionsWon} VICTORIES</span><span class="meta-chip">◈ ${this.save.data.chips} CHIPS</span></div></div><div class="home-hint"><span>WASD MOVE · MOUSE AIM · LMB FIRE · RMB LOCK-ON · SPACE JUMP/JETPACK · 1 PRIMARY · 2 PISTOL · G GRENADE · T THROW WEAPON · E INTERACT · F MATERIALIZE · Q SKILL · TAB SQUAD</span></div></main>`}
  // Game setup: choose team count (2-10), each team's name, color and alliance group
  showGameSetupLegacy(){this.endRuntime();this.state='setup';this.audio.playMusic('/music/main_theme.mp3');
    const rows=this.setup.map((t,i)=>{const c=TEAM_COLORS[t.colorIndex%TEAM_COLORS.length];
      const uniform=SKIN_TEXTURES[t.uniformIndex||0];return `<div class="team-row"><span class="slot ${i===0?'you':''}">${i===0?'YOU':'CPU'}</span><input class="team-name" data-team-name="${i}" maxlength="14" value="${t.name}" aria-label="Team name"><button class="swatch" data-action="teamcolor:${i}" style="background:${hex(c.color)}" title="Change aura color">${c.name.toUpperCase()} AURA</button><button class="btn uniform-btn" data-action="teamuniform:${i}">${uniform.toUpperCase()}</button><button class="btn group-btn" data-action="teamgroup:${i}">TEAM ${String.fromCharCode(65+t.group)}</button></div>`}).join('');
    this.screen.innerHTML=`<main class="menu"><div class="screen-title"><div><span class="eyebrow">GAME SETUP</span><h2>SETUP TEAMS</h2></div><strong>${this.setup.length} / ${MAX_PLAYERS} PLAYERS</strong></div><p class="subtitle">Same team letter = allies · color controls the body aura · uniform applies to the whole team.</p><div class="setup-list">${rows}</div><div class="menu-actions" style="margin-top:20px"><button class="btn" data-action="setup:remove" ${this.setup.length<=2?'disabled':''}>− REMOVE PLAYER</button><button class="btn" data-action="setup:add" ${this.setup.length>=MAX_PLAYERS?'disabled':''}>+ ADD PLAYER</button><button class="btn primary" data-action="deploy">START BATTLE</button><button class="btn" data-action="menu">BACK</button></div></main>`}
  cycleDimension(direction){this.selectedDimensionIndex=(this.selectedDimensionIndex+direction+CAMPAIGN_DIMENSIONS.length)%CAMPAIGN_DIMENSIONS.length;this.showMissions(direction)}
  showMissions(direction=0){this.endRuntime();this.state='missions';this.presentMenuBackdrop();this.audio.playMusic('/music/main_theme.mp3');const dimension=CAMPAIGN_DIMENSIONS[this.selectedDimensionIndex]||CAMPAIGN_DIMENSIONS[0],missions=dimension.missionIds.map(id=>CAMPAIGN_MISSIONS[id]).filter(Boolean);const cards=missions.map((m,i)=>{const complete=this.save.campaignCompleted(m.id),locked=!this.campaignMissionUnlocked(m),requirement=CAMPAIGN_MISSIONS[m.requires]?.order;return`<article class="campaign-node ${locked?'locked':''} ${complete?'complete':''}" style="--delay:${i*.1}s"><span class="campaign-number">${String(m.order).padStart(2,'0')}</span><div><span class="eyebrow">${complete?'MISSION COMPLETE':locked?'CLASSIFIED':this.debugMode?'DEBUG ACCESS':m.order===1?'TRAINING OPERATION':'GAIA OPERATION'}</span><h3>${m.name.toUpperCase()}</h3><p>${m.briefing}</p><div class="campaign-reward">◈ ${m.reward} CHIPS ${complete?'· REPLAYABLE':''}</div></div><button class="btn ${locked?'':'primary'}" ${locked?'disabled':''} data-action="mission:${m.id}">${locked?`LOCKED · COMPLETE MISSION ${requirement}`:complete?'REPLAY MISSION':'DEPLOY'}</button></article>`}).join('');const empty=`<section class="dimension-locked"><span>${dimension.icon}</span><h3>PORTAL CALIBRATING</h3><p>${dimension.description}</p><strong>COMPLETE GAIA OPERATIONS TO STABILIZE THIS DIMENSION</strong></section>`;this.screen.innerHTML=`<main class="menu campaign-menu dimension-screen ${direction<0?'dimension-from-left':direction>0?'dimension-from-right':''}" style="--dimension-accent:${dimension.accent};--dimension-secondary:${dimension.secondary}"><header class="dimension-carousel"><button class="dimension-arrow" data-action="dimension:prev" aria-label="Previous dimension">‹</button><div class="dimension-planet" aria-hidden="true"><i></i><b>${dimension.icon}</b><span></span></div><div class="dimension-copy"><span class="eyebrow">DIMENSION ${String(dimension.order).padStart(2,'0')} · ${dimension.status}</span><h2>${dimension.name.toUpperCase()}</h2><strong>${dimension.subtitle}</strong><p>${dimension.description}</p></div><button class="dimension-arrow" data-action="dimension:next" aria-label="Next dimension">›</button></header><nav class="dimension-dots" aria-label="Dimensions">${CAMPAIGN_DIMENSIONS.map((d,i)=>`<i class="${i===this.selectedDimensionIndex?'active':''}" title="${d.name}"></i>`).join('')}</nav><div class="campaign-summary"><span>${dimension.name.toUpperCase()} CAMPAIGN</span><strong>${this.save.data.campaign.completedMissionIds.length} / ${Object.keys(CAMPAIGN_MISSIONS).length} COMPLETE</strong><small>${this.debugMode?'DEBUG MODE · ALL MISSIONS UNLOCKED':'PREV / NEXT OR ← →'}</small></div><div class="campaign-path">${missions.length?'<i></i>':''}${cards||empty}</div><button class="btn" style="margin-top:22px" data-action="menu">BACK</button></main>`}
  showRankings(){this.endRuntime();this.state='leaderboard';this.presentMenuBackdrop();this.audio.playMusic('/music/main_theme.mp3');const mode=this.rankingsMode||'deathmatch',record=this.save.modeRecord(mode);const rows=this.league.leaderboard(this.save.data,mode).map((p,i)=>`<tr class="${p.player?'is-player':''}"><td>#${i+1}</td><td><strong>${escapeHtml(p.name)}</strong><small>${p.player?'PLAYER':`CPU · ${p.kills||0} KILLS`}</small></td><td>${rankFor(p.mmr)}</td><td>${p.mmr}</td><td>${p.wins}-${p.losses}</td><td>${p.streak>0?`🔥 ${p.streak}`:'—'}</td></tr>`).join('');this.screen.innerHTML=`<main class="menu leaderboard-menu"><div class="screen-title"><div><span class="eyebrow">GLOBAL COMBAT CIRCUIT</span><h2>RANKINGS</h2></div><strong>${record.mmr} MMR</strong></div><div class="rankings-tabs"><button class="btn ${mode==='deathmatch'?'primary':''}" data-action="rankings:deathmatch">DEATHMATCH</button><button class="btn ${mode==='domination'?'primary':''}" data-action="rankings:domination">TOWER DOMINION</button></div><div class="leaderboard-scroll"><table class="leaderboard-table"><thead><tr><th>RANK</th><th>COMPETITOR</th><th>DIVISION</th><th>MMR</th><th>RECORD</th><th>STREAK</th></tr></thead><tbody>${rows}</tbody></table></div><button class="btn" style="margin-top:22px" data-action="rankings:back">BACK</button></main>`}
  showSettings(){const s=this.save.data.settings;this.audio.playMusic('/music/main_theme.mp3');this.screen.innerHTML=`<main class="menu"><div class="screen-title"><h2>SETTINGS</h2></div><div class="settings"><label>DYNAMIC SHADOWS <input type="checkbox" data-setting="shadows" ${s.shadows?'checked':''}></label><label>CAMERA SHAKE <input type="checkbox" data-setting="cameraShake" ${s.cameraShake?'checked':''}></label><label>MOUSE SENSITIVITY <input type="range" min=".2" max="3" step=".1" value="${s.mouseSensitivity??1}" data-setting="mouseSensitivity"></label><label>MUTE MUSIC <input type="checkbox" data-setting="musicMuted" ${s.musicMuted?'checked':''}></label><label>MUTE SOUNDS <input type="checkbox" data-setting="soundsMuted" ${s.soundsMuted?'checked':''}></label><label>VOLUME <input type="range" min="0" max="1" step=".05" value="${s.volume}" data-setting="volume"></label></div>${this.debugCodeEntry()}<button class="btn" style="margin-top:22px" data-action="menu">BACK</button></main>`}
  debugCodeEntry(){return`<form class="code-entry ${this.debugMode?'active':''}" data-code-form><label for="debug-code">CODE</label><div><input id="debug-code" name="code" data-debug-code type="text" autocomplete="off" spellcheck="false" ${this.debugMode?'disabled':''} placeholder="ENTER CODE"><button class="btn ${this.debugMode?'':'primary'}" type="submit" ${this.debugMode?'disabled':''}>${this.debugMode?'ACTIVE':'ENTER'}</button></div><small class="${this.codeMessage?.startsWith('INVALID')?'error':''}">${this.codeMessage||(this.debugMode?'DEBUG MODE · ALL MISSIONS UNLOCKED · 5000 PRIMARY AMMO':'ENTER A CODE TO UNLOCK SPECIAL MODES')}</small></form>`}
  campaignMissionUnlocked(mission){return Boolean(mission&&(this.debugMode||!mission.requires||this.save.campaignCompleted(mission.requires)))}
  debugAmmoFor(unit,ammo){return this.debugMode&&unit?.team===this.playerTeam?DEBUG_AMMO:ammo}
  activateDebugCode(value){if(String(value??'').trim().toLowerCase()!==DEBUG_CODE)return false;this.debugMode=true;this.save.data.debugMode=true;this.save.commit();for(const unit of this.combatants||[])if(unit?.type==='unit'&&unit.team===this.playerTeam)unit.ammo=DEBUG_AMMO;return true}
  submitDebugCode(value){const activated=this.activateDebugCode(value);this.codeMessage=activated?'DEBUG MODE ACTIVE':'INVALID CODE';if(this.state==='paused')this.showPauseMenu(true);else this.showSettings();return activated}
  showShop(){this.showDBuild()}
  // D-Build studio: buy + equip cosmetics for your team's Destructos
  showDBuild(category='featured'){
    this.casino?.dispose();this.casino=null;this.marketplace?.dispose();this.endRuntime();this.state='dbuild';this.audio.playMusic('/music/main_theme.mp3');this.marketplace=new Marketplace({root:this.screen,save:this.save,audio:this.audio,onBuyTickets:()=>this.showBuyTicketsModal(),onBack:()=>{this.marketplace=null;this.showMenu()}});this.marketplace.category=category;this.marketplace.open();return;
    this.state='dbuild';
    if (!this.dbuildTab) this.dbuildTab = 'hats';
    const owned=this.save.data.cosmetics,eq=this.save.data.equipped;
    this.audio.playMusic('/music/main_theme.mp3');
    const card=c=>{
      const isOwned=owned.includes(c.id),equipped=eq[c.kind]===c.id;
      const currencyLabel=c.currency==='tickets'?'TICKETS':'CHIPS';
      return `<button class="btn cosmetic ${equipped?'equipped':''}" data-action="cos:${c.id}" style="margin:5px; min-width:145px;">${c.name.toUpperCase()}<br><small>${c.kind.toUpperCase()} · ${equipped?'EQUIPPED':isOwned?'TAP TO EQUIP':c.price+' '+currencyLabel}</small></button>`;
    };
    this.screen.innerHTML=`<!-- BOOTS --><main class="menu">
      <div class="screen-title">
        <div>
          <span class="eyebrow">D-BUILD STUDIO</span>
          <h2>TEAM COSMETICS</h2>
        </div>
        <strong>${this.save.data.chips} CHIPS · <span id="tickets-val">${this.save.data.tickets || 0}</span> TICKETS</strong>
      </div>
      <div class="marketplace-tabs" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
        <button class="tab-btn ${this.dbuildTab==='hats'?'active':''}" data-tab="hats">Hats</button>
        <button class="tab-btn ${this.dbuildTab==='boots'?'active':''}" data-tab="boots">Boots</button>
        <button class="tab-btn ${this.dbuildTab==='attachments'?'active':''}" data-tab="attachments">Attachments</button>
        <button class="tab-btn ${this.dbuildTab==='projectiles'?'active':''}" data-tab="projectiles">Projectiles</button>
        <button class="tab-btn ${this.dbuildTab==='deathEffects'?'active':''}" data-tab="deathEffects">Death Effects</button>
        <button class="tab-btn ${this.dbuildTab==='killEffects'?'active':''}" data-tab="killEffects">Kill Effects</button>
        <button class="tab-btn ${this.dbuildTab==='customCrates'?'active':''}" data-tab="customCrates">Custom Crates</button>
        <button class="tab-btn ${this.dbuildTab==='teamBase'?'active':''}" data-tab="teamBase">Team Base</button>
      </div>
      <div class="tab-content" id="tab-content-area" style="margin-bottom:20px;"></div>
      <button class="btn primary" data-action="buy-tickets">BUY TICKETS</button>
      <button class="btn" style="margin-top:22px" data-action="menu">BACK</button>
    </main>`;

    const contentArea = this.screen.querySelector('#tab-content-area');
    if (this.dbuildTab === 'customCrates') {
      contentArea.innerHTML = `
        <div id="crate-customizer" style="display:flex; flex-direction:column; gap:12px; max-width:320px; margin: 0 auto; background:rgba(7,24,42,.72); padding:20px; border-radius:8px; border:2px solid #2fb4ff;">
          <h3 style="margin:0; text-align:center; color:#2fb4ff;">Crate Visual Designer</h3>
          <button id="procedural-crate-btn" class="btn" style="width:100%; margin-bottom:10px;">Procedurally Customize Crate</button>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            Body Color: <input type="color" id="body-color-input" value="${eq.customCrate?.bodyColor || '#ff0000'}" style="border:none; background:none; cursor:pointer;">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            Band Color: <input type="color" id="band-color-input" value="${eq.customCrate?.bandColor || '#00ff00'}" style="border:none; background:none; cursor:pointer;">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            Gem Color: <input type="color" id="gem-color-input" value="${eq.customCrate?.gemColor || '#0000ff'}" style="border:none; background:none; cursor:pointer;">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            Gem Material: 
            <input id="gem-material-input" value="${eq.customCrate?.gemMaterial || 'glass'}" style="width:120px; padding:4px; background:#111e38; border:1px solid #2fb4ff; color:#fff; border-radius:4px;">
          </label>
          <button id="save-crate-btn" class="btn primary" style="width:100%; margin-top:10px;">SAVE CRATE</button>
        </div>
      `;
      const saveBtn = this.screen.querySelector('#save-crate-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const bodyColor = this.screen.querySelector('#body-color-input').value;
          const bandColor = this.screen.querySelector('#band-color-input').value;
          const gemColor = this.screen.querySelector('#gem-color-input').value;
          const gemMaterial = this.screen.querySelector('#gem-material-input').value;
          const customCrate = { bodyColor, bandColor, gemColor, gemMaterial };
          this.save.data.customCrate = customCrate;
          this.save.data.equipped.customCrate = customCrate;
          this.save.commit();
          this.audio.play('change_texture');
          this.hud?.toast?.('CUSTOM CRATE SAVED!');
        });
      }
      const procBtn = this.screen.querySelector('#procedural-crate-btn');
      if (procBtn) {
        procBtn.addEventListener('click', () => {
          this.showCrateBuilder();
        });
      }
    } else {
      let filtered = [];
      if (this.dbuildTab === 'hats') filtered = COSMETICS.filter(c => c.kind === 'hat');
      else if (this.dbuildTab === 'boots') filtered = COSMETICS.filter(c => c.kind === 'boots');
      else if (this.dbuildTab === 'attachments') filtered = COSMETICS.filter(c => c.kind === 'attachment' || c.kind === 'jetpack');
      else if (this.dbuildTab === 'projectiles') filtered = COSMETICS.filter(c => c.kind === 'projectile');
      else if (this.dbuildTab === 'deathEffects') filtered = COSMETICS.filter(c => c.kind === 'deathEffect');
      else if (this.dbuildTab === 'killEffects') filtered = COSMETICS.filter(c => c.kind === 'killEffect');
      else if (this.dbuildTab === 'teamBase') filtered = COSMETICS.filter(c => c.kind === 'teamBase');
      
      contentArea.innerHTML = `<div class="menu-actions" style="display:flex; flex-wrap:wrap; justify-content:center;">${filtered.map(card).join('')}</div>`;
    }

    const tabBtns = this.screen.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dbuildTab = btn.getAttribute('data-tab');
        this.showDBuild();
      });
    });
  }
  showCrateBuilder() {
    this.showDBuild('crateDesign');
  }
  showCasino(){
    this.marketplace?.dispose();this.marketplace=null;this.casino?.dispose();this.endRuntime();this.state='casino';this.audio.playMusic('/music/main_theme.mp3');this.casino=new Casino({root:this.screen,save:this.save,audio:this.audio,onBack:()=>{this.casino=null;this.showMenu()},onDBuilder:()=>{this.casino=null;this.showDBuild()}});this.casino.open();
  }
  swapTeamBaseModel(team, newStyle) {
    this.save.data.equipped.teamBase = newStyle;
    this.save.commit();
    const factory = this.entities.find(e => e.type === 'factory' && e.team === team);
    if (factory) {
      const oldCustom = factory.group.getObjectByName('custom-base');
      if (oldCustom) factory.group.remove(oldCustom);
      
      const newCustomVisible = Boolean(newStyle);
      factory.group.children.forEach(c => {
        if (c.name !== 'custom-base') c.visible = !newCustomVisible;
      });
      
      if (newCustomVisible) {
        const customBase = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 8), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
        customBase.name = 'custom-base';
        factory.group.add(customBase);
      }
    }
  }
  handleCosmetic(id){
    const c=COSMETICS.find(x=>x.id===id);
    if(!c)return;
    if(this.save.data.cosmetics.includes(id)){
      this.save.equipCosmetic(c.kind,id);
      this.audio.play('change_texture');
      if (c.kind === 'teamBase') {
        this.swapTeamBaseModel(this.playerTeam, this.save.data.equipped.teamBase);
      }
    } else {
      const curr = c.currency || 'chips';
      if(this.save.buyCosmetic(id, c.price, curr)) {
        this.audio.play('change_texture');
      } else {
        const msg = curr === 'tickets' ? 'INSUFFICIENT TICKETS' : 'INSUFFICIENT CHIPS';
        const titleStrong = this.screen.querySelector('.screen-title strong') || this.screen.querySelector('.screen-title h2');
        if (titleStrong) titleStrong.textContent = msg;
        return;
      }
    }
    this.showDBuild();
  }
  buyGear(id){
    const item = GEAR.find(g => g.id === id);
    if (!item) return;
    if (item.currency === 'tickets') {
      if (this.save.buyGearWithTickets(id, item.price)) {
        this.audio.play('build');
        this.showShop();
      } else {
        const strong = this.screen.querySelector('.screen-title strong');
        if (strong) strong.textContent = 'INSUFFICIENT TICKETS';
      }
    } else {
      if (this.save.buyGear(id, item.price)) {
        this.audio.play('build');
        this.showShop();
      } else {
        const strong = this.screen.querySelector('.screen-title strong');
        if (strong) strong.textContent = 'INSUFFICIENT CHIPS';
      }
    }
  }
  showBuyTicketsModal(){
    if(this.paypalModalActive)return;this.paypalModalActive=true;openPayPalCheckout({save:this.save,onComplete:(receipt,granted)=>{if(granted)this.hud?.toast?.(`${receipt.tickets} TICKETS ADDED!`);this.marketplace?.render()},onClose:()=>{this.paypalModalActive=false}}).catch(()=>{this.paypalModalActive=false});
  }
  async startMission(id='skirmish'){this.mission=MISSIONS[id]||MISSIONS.skirmish;this.disposeMenuStage();this.screen.innerHTML=`<main class="menu mission-end"><h2>DEPLOYING</h2><p class="subtitle">${this.mission.name.toUpperCase()}…</p></main>`;await this.createMission();this.screen.innerHTML='';if(this.observerOnly)this.enterObserverMode();else{this.hud.show(true);this.input.enabled=true;this.state='mission';this.requestMouseCapture();if(this.campaignActive)this.hud.toast('QUEST LINK ONLINE · FOLLOW THE GOLDEN ARROW');else{const doctrine=AI_BEHAVIORS[this.aiBehaviorIndex];if(doctrine)this.hud.toast(`SQUAD ORDERS · ${doctrine.name} — ${doctrine.description} (C/V TO CHANGE)`)}}this.lastFrame=performance.now()/1000;
    const mapMusic = {
      crossroads: '/music/urban_vehicle_warfare.mp3',
      crown: '/music/king_of_the_hill.mp3',
      wilds: '/music/neutral_mayhem.mp3',
      rift: '/music/volcanic_scrapyard.mp3',
      sunken: '/music/neutral_mayhem.mp3',
      serpent: '/music/king_of_the_hill.mp3',
      eclipse: '/music/volcanic_scrapyard.mp3',
      'gaia-bastion': '/music/urban_vehicle_warfare.mp3',
      'storm-dam': '/music/king_of_the_hill.mp3',
      sunforge: '/music/volcanic_scrapyard.mp3',
      'gaia-blacksite': '/music/urban_vehicle_warfare.mp3'
    };
    const track = mapMusic[this.mission.mapId||this.selectedMap] || (this.mission.id==='four-of-a-kind'?'/music/neutral_mayhem.mp3':this.mission.id==='gold-rush'?'/music/king_of_the_hill.mp3':'/music/urban_vehicle_warfare.mp3');
    this.audio.playMusic(track);
  }
  teamCosmetics(){const eq=this.save.data.equipped;return{hat:eq.hat||undefined,skin:eq.skin||undefined,boots:eq.boots||undefined,attachment:eq.attachment||undefined,projectile:eq.projectile||undefined,deathEffect:eq.deathEffect||undefined,killEffect:eq.killEffect||undefined}}
  // ── alliance helpers ────────────────────────────────────────────────────────
  hostile(a,b){const A=this.teamMap?.[a],B=this.teamMap?.[b];if(!A||!B)return a!==b;return A.group!==B.group}
  livingUnits(teamId){return this.combatants.filter(e=>e.team===teamId&&e.type==='unit'&&!e.dead&&!e.decoy)}
  controllableUnits(teamId){return this.livingUnits(teamId).filter(e=>!e.missionVIP)}
  friendsOf(u){return this.combatants.filter(e=>!e.dead&&e.team&&!this.hostile(u.team,e.team))}
  foesOf(u){return this.combatants.filter(e=>!e.dead&&e.team&&this.hostile(u.team,e.team))}
  respawnPos(teamId,i=0){return resolveRespawnPosition(this.world,teamId,i)}
  async createMission(){this.disposeScene();this.scene=new THREE.Scene();this.materials=await new MaterialLibrary(this.renderer,this.save.data.settings).load();this.factory=new EntityFactory(this.scene,this.materials);
    // teams: skirmish uses the Game Setup config; classic missions run a default 2-team layout
    const isCampaign=this.mission.type==='campaign',intendedMode=isCampaign?'campaign':this.mission.type==='skirmish'?this.selectedMode:'deathmatch',setup=(this.mission.type==='skirmish'?this.setup:defaultTeamSetup(2)).map((team,index)=>({...team,group:intendedMode==='domination'?index:team.group}));this.matchRules=freshMatchSetup(this.mission.type==='skirmish'?this.matchSetup:undefined);this.gameMode=intendedMode;this.campaignActive=isCampaign;if(isCampaign)Object.assign(this.matchRules,{squadSize:this.mission.startingSquad.length,startingClasses:[...this.mission.startingSquad],startingAmmo:this.mission.startingAmmo??90,reinforcements:false,reinforcementSeconds:this.mission.rules?.reinforcementSeconds||15,matchMinutes:0});if(this.gameMode==='domination')Object.assign(this.matchRules,{squadSize:DOMINATION_RULES.squadSize,startingClasses:Array(DOMINATION_RULES.squadSize).fill(DOMINATION_RULES.classId),reinforcements:true,reinforcementSeconds:this.matchRules.dominationRespawnSeconds??DOMINATION_RULES.reinforcementSeconds});
    const humanIndex=setup.findIndex(t=>t.isHuman===true);this.observerOnly=humanIndex<0;const rivals=this.league.draw(setup.length-(this.observerOnly?0:1));let rivalIndex=0;
    this.teams=setup.map((t,i)=>{const c=TEAM_COLORS[t.colorIndex%TEAM_COLORS.length],human=i===humanIndex,savedProfile=human?{id:'you',name:t.name||'YOU',...this.save.modeRecord(this.gameMode)}:rivals[rivalIndex++],profile=human?savedProfile:{...savedProfile,...this.league.modeProfile(savedProfile,this.gameMode)};return{id:`t${i}`,name:human?(t.name||DEFAULT_TEAM_NAMES[i]):profile.name,profile,human,color:c.color,dark:c.dark,group:this.gameMode==='domination'?i:t.group,uniform:SKIN_TEXTURES[t.uniformIndex||i%SKIN_TEXTURES.length],respawnTimer:this.matchRules.reinforcementSeconds,reinforceTimer:this.matchRules.reinforcementSeconds+i*2,eliminated:false}});
    this.teamMap=Object.fromEntries(this.teams.map(t=>[t.id,t]));this.playerTeam=this.teams[humanIndex>=0?humanIndex:0].id;
    this.factory.setTeams(this.teamMap);this.hud.teamMeta=id=>this.teamMap[id];
    this.addLights();this.world=new World(this.scene,this.materials,this.factory,isCampaign?this.mission.mapId:this.selectedMap,this.gameMode).build(this.teams);this.discoveredSecrets=new Set();
    if(isCampaign&&this.mission.id==='gold-rush'){const enemyFactory=this.world.factories[this.teams.find(t=>t.id!==this.playerTeam).id];enemyFactory.invulnerable=true;enemyFactory.hp=enemyFactory.maxHp=99999;}
    if(isCampaign&&this.mission.rules?.playerBaseInvulnerable){const home=this.world.factories[this.playerTeam];home.invulnerable=true;home.hp=home.maxHp=99999;}
    if(this.gameMode==='domination')for(const factory of Object.values(this.world.factories)){factory.invulnerable=true;factory.group.traverse(o=>{if(o.isMesh)o.material?.emissive?.setHex?.(this.teamMap[factory.team]?.dark||0x111111)});}
    this.combatants=[...Object.values(this.world.baseTurrets||{})];this.entities=[...Object.values(this.world.factories),...this.combatants,...this.world.destructibles,...this.world.interactiveStructures,...this.world.motorcycles,...this.world.cars,...this.world.wildlife];this.abilityZones=[];this.objectiveProgress=0;this.lockTarget=null;this.turretLockTarget=null;this.hoverEntity=null;
    this.healLinks=[];this.overheadIcons=[];this.debris=[];this.thrownGrenades=[];this.healAim=false;this.grappleAim=false;this.grapples=[];this.aiHealTimer=0;this.hud.setHealMode(false);this.hud.setGrappleMode(false);this.hud.setTurretMode(false);this.hud.clearSquad();
    this.teamStats={};
    for(const t of this.teams){
      this.teamStats[t.id]={kills:0,deaths:0,bulletsFired:0,bulletsHit:0,destructiblesDestroyed:0,structuresDestroyed:0,cratesConsumed:0,neutralKills:0,healing:0,destructosCreated:{}};
    }
    const squadSize=this.matchRules.squadSize,aiClasses=this.gameMode==='domination'?Array(squadSize).fill(DOMINATION_RULES.classId):['scout','gunner','medic','commando','sniper','engineer'];
    const startingClasses=this.matchRules.startingClasses;
    if(!this.observerOnly){this.player=this.factory.createUnit(startingClasses[0]||'scout',this.playerTeam,this.respawnPos(this.playerTeam,0),true,{...this.teamCosmetics(),skin:this.teamMap[this.playerTeam].uniform,jetpack:this.save.data.gear.includes('jetpack')});this.configureModeUnit(this.player);this.player.rearPlate=this.save.data.gear.includes('rearPlate');this.player.magneticGloves=this.save.data.gear.includes('magnet');this.player.jetpack=this.save.data.gear.includes('jetpack');this.player.ammo=this.debugAmmoFor(this.player,this.matchRules.startingAmmo);this.combatants.push(this.player);this.entities.push(this.player);this.recordDestructoCreated(this.player);for(let i=1;i<squadSize;i++)this.addUnit(startingClasses[i]||'scout',this.playerTeam,this.respawnPos(this.playerTeam,i))}
    for(const t of this.teams.filter(t=>this.observerOnly||t.id!==this.playerTeam)){const classes=isCampaign?this.mission.enemySquad:aiClasses;for(let i=0;i<(isCampaign?classes.length:squadSize);i++)this.addUnit(classes[i%classes.length],t.id,this.respawnPos(t.id,i));}
    if(this.observerOnly)this.player=this.livingUnits(this.playerTeam)[0];
    this.particles=new ParticleSystem(this.scene,this.world.heightAt);
    this.performanceGovernor?.setEffects(this.particles);
    this.performanceGovernor?.beginSession();
    this.domination=this.gameMode==='domination'?new DominationSystem(this.world.dominationTowers,this.teams,this.matchRules.maxScore,this.hostile.bind(this)):null;this.dominationHudSecond=-1;this.dominationLead=null;
    this.combat=new CombatSystem(this.scene,this.particles,()=>this.entities,this.handleDeath.bind(this),this.handleDamage.bind(this),(a,b)=>this.hostile(a,b),(x,z)=>this.world.groundAt({x,z}),this.recordStat.bind(this),()=>this.world.crates,this.world);
    this.combat.audio=this.audio;
    this.builders=this.gameMode==='domination'?{}:Object.fromEntries(this.teams.map(t=>[t.id,new DBuilder(this.world,this.factory,this.handleBuild.bind(this),t.id,this.world.builderPositions[t.id])]));
    this.builder=this.builders[this.playerTeam]||null;
    const interact={mountTurret:(u,t)=>this.mountTurret(u,t),mountBunker:(u,b)=>this.mountBunker(u,b),mountMotorcycle:(u,m)=>this.mountMotorcycle(u,m),exit:(u,forced)=>this.exitInteractive(u,forced)};
    this.aiBehaviorIndex=Math.max(0,AI_BEHAVIORS.findIndex(b=>b.id===defaultDoctrineForMode(this.gameMode)));this.ai=new AIController(this.world,this.combat,this.builders,u=>this.executeActiveSkill(u),team=>this.gameMode==='campaign'?'guard':!this.observerOnly&&team===this.playerTeam?AI_BEHAVIORS[this.aiBehaviorIndex].id:'attack',team=>!this.observerOnly&&team===this.playerTeam?this.player:null,(unit,crate)=>this.openCrate(crate,unit),()=>this.matchRules.aiDifficulty,interact,team=>this.livingUnits(team),()=>this.teams,(a,b)=>this.hostile(a,b));
    for(const team of this.teams){const doctrine=isCampaign?'guard':team.human?AI_BEHAVIORS[this.aiBehaviorIndex].id:this.ai.assignRandomDoctrine(team.id);this.ai.setTeamDoctrine(team.id,doctrine);team.aiDoctrine=doctrine;}this.updateDoctrineDisplay();
    this.kills=0;this.elapsed=0;this.observerBet=null;this.leagueSettled=false;this.damageVoiceCooldown=0;
    this.suddenDeathTimer = this.matchRules.matchMinutes * 60;
    this.suddenDeathActive = false;
    const timerEl = document.getElementById('sudden-death-timer');
    if (timerEl) { timerEl.className = 'timer-card hidden'; const valEl = document.getElementById('timer-val'); if (valEl) valEl.textContent = `${String(this.matchRules.matchMinutes).padStart(2,'0')}:00`; }
    // face the battlefield center from the spawn, shoulder cam already in place
    const spawnLook=this.player.group.position.clone().multiplyScalar(-1).setY(0);
    this.fpsYaw=spawnLook.lengthSq()>1e-4?Math.atan2(spawnLook.x,spawnLook.z):0;this.fpsPitch=-.06;this.camShake=0;this.fpsMode=false;
    this.camera.position.copy(this.player.group.position).add(new THREE.Vector3(-Math.sin(this.fpsYaw)*5.2,3.6,-Math.cos(this.fpsYaw)*5.2));this.camera.lookAt(this.player.group.position.clone().add(new THREE.Vector3(0,1.6,0)));this.hud.el.objective.textContent=this.gameMode==='domination'?`Capture towers for ${this.matchRules.maxScore} points`:this.mission.objective;this.configureModeHud();if(isCampaign)this.setupCampaignMission();}
  setupCampaignMission(){
    this.campaignArmTasks=[];this.campaignArmStarted=false;this.campaignAttackOrdered=false;this.campaignRestockTimer=0;this.campaignEnemies=this.combatants.filter(e=>e.type==='unit'&&e.team!==this.playerTeam);this.campaignTimer=this.mission.rules?.defenseSeconds||this.mission.rules?.missionSeconds||0;this.campaignEnemyDeaths=0;this.campaignWavesSpawned=0;this.campaignRespawnTimer=this.mission.rules?.reinforcementSeconds||5;
    this.quest=new QuestSystem(this.mission,{onStepChanged:(step,previous)=>this.showQuestStep(step,previous),onProgress:(value,goal,pct)=>this.renderQuestProgress(value,goal,pct),onComplete:()=>this.endCampaignMission(true),onFail:reason=>this.endCampaignMission(false,reason)});
    this.goldenDelivered=false;this.goldenCrate=null;this.extractionPoint=null;this.extractionCircle=null;this.jetDropPoint=null;this.professorLeodones=null;this.leodonesRescued=false;this.campaignTargets=[];this.campaignCountedDeaths=new Set();document.body.classList.add('campaign-mode');document.getElementById('quest-hud')?.classList.remove('hidden');document.getElementById('sudden-death-timer')?.classList.toggle('hidden',!this.campaignTimer);document.getElementById('crate-forecast')?.classList.toggle('hidden',this.mission.id==='four-of-a-kind'||this.mission.id==='atlas-homecoming');
    this.createQuestGuide();
    if(this.mission.id==='four-of-a-kind'){
      for(const enemy of this.campaignEnemies){enemy.freeze=36000;enemy.missionDormant=true;enemy.guardPoint=enemy.group.position.clone()}
      const drops=this.mission.supplyDrops||{};this.spawnCampaignCrates(drops.initial||6,this.builder.pad,7.5);this.campaignSupplyDropsRemaining=drops.additional||0;this.campaignSupplyDropsDelivered=0;this.campaignSupplyDropTimer=drops.firstDelay||3;this.campaignSupplyDropZone={id:'mission-one-airlift',label:'TRAINING AIRLIFT',position:this.builder.pad.clone(),radius:drops.radius||9,color:0x54f07b};
    }else if(this.mission.id==='gold-rush')this.setupGoldRush();
    else if(this.mission.id==='golden-shield')this.setupGoldenShield();
    else if(this.mission.id==='atlas-homecoming')this.setupAtlasHomecoming();
    else this.setupCampaignAssault();
  }
  spawnCampaignCrates(count,center,radius=7,type=CRATE_TYPES.brown){
    const spawned=[];for(let i=0;i<count;i++){const a=(i/count)*Math.PI*2+.35,r=radius+(i%2)*1.2,pos=center.clone().add(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));pos.y=this.world.groundAt(pos);const crate=this.factory.createCrate(pos,type);crate.sourceDropZoneId='campaign-curated';this.world.crates.push(crate);spawned.push(crate)}return spawned;
  }
  setupGoldRush(){
    const enemy=this.teams.find(t=>t.id!==this.playerTeam),enemyBase=this.world.basePositions[enemy.id],inward=enemyBase.clone().multiplyScalar(-1).setY(0).normalize(),goldPos=enemyBase.clone().addScaledVector(inward,10);goldPos.y=this.world.groundAt(goldPos);
    const crate=this.factory.createCrate(goldPos,CRATE_TYPES.yellow);crate.questItem=true;crate.questHeavy=true;crate.noBuilder=true;crate.noAI=true;crate.nonMaterializable=true;crate.mass=8;crate.crateType={...CRATE_TYPES.yellow,id:'golden',name:'Sun Core',mass:8,color:0xffd23f};crate.originalType=crate.crateType;const gold=this.materials.color(0xffd23f,{emissive:0xffa900,emissiveIntensity:1.4,metalness:.85,roughness:.12});crate.box.material=gold;for(const band of crate.bands)band.material=this.materials.color(0xfff1a0,{emissive:0xffd23f,emissiveIntensity:1.7,metalness:.9});crate.sparkles=[];for(let i=0;i<8;i++){const s=new THREE.Mesh(new THREE.OctahedronGeometry(.055,0),new THREE.MeshBasicMaterial({color:i%2?0xffffff:0xffd23f,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));crate.group.add(s);crate.sparkles.push(s)}this.world.crates.push(crate);this.goldenCrate=crate;
    const playerBase=this.world.basePositions[this.playerTeam],toCenter=playerBase.clone().multiplyScalar(-1).setY(0).normalize(),center=playerBase.clone().addScaledVector(toCenter,18);center.y=this.world.groundAt(center)+.08;this.extractionPoint=center;this.extractionCircle=this.createExtractionCircle(center);
    this.spawnCampaignCrates(10,this.world.builderPositions[this.playerTeam],8.5);
    for(const guard of this.campaignEnemies){guard.guardPoint=guard.group.position.clone();guard.commandPoint=null;this.ai.setTeamDoctrine(guard.team,'guard')}
  }
  setupGoldenShield(){
    const home=this.world.basePositions[this.playerTeam],inward=home.clone().multiplyScalar(-1).setY(0).normalize(),goldPos=home.clone().addScaledVector(inward,16);goldPos.y=this.world.groundAt(goldPos);this.createGoldenQuestCrate(goldPos,'Golden Crate');this.goldenCrate.noAI=false;this.goldenCrate.questHeavy=false;this.goldenCrate.mass=4;this.extractionPoint=null;this.extractionCircle=null;this.jetDropPoint=this.world.destroJet?.dropPosition?.clone();
    this.campaignEnemies.forEach((enemy,i)=>{enemy.missionScripted=i<4;enemy.missionThief=i<4;enemy.ignoreBases=true;enemy.guardPoint=null;enemy.commandPoint=null});const enemyTeam=this.campaignEnemies[0]?.team;if(enemyTeam)this.ai.setTeamDoctrine(enemyTeam,'attack');
    const side=new THREE.Vector3(-inward.z,0,inward.x),turretPos=home.clone().addScaledVector(inward,11).addScaledVector(side,11);turretPos.y=this.world.groundAt(turretPos);const turret=this.factory.createBaseTurret(this.playerTeam,turretPos);turret.id=`${this.playerTeam}-aegis-manned-turret`;turret.ammo=turret.magazineSize=300;this.world.baseTurrets.aegis=turret;this.combatants.push(turret);this.entities.push(turret);const rider=this.addUnit(this.mission.turretRiderClass||'heavy',this.playerTeam,turretPos.clone());this.campaignTurretRider=rider;this.mountTurret(rider,turret);for(const ally of this.livingUnits(this.playerTeam))this.equipPrimaryWeapon(ally,this.mission.startingWeapon||'machinegun',WEAPONS[this.mission.startingWeapon||'machinegun'],this.mission.startingAmmo||300,0);
    const depot=this.world.crateDropZones.find(zone=>zone.id==='aegis-supply-depot');if(depot)for(let i=0;i<(this.mission.rules?.supplyBurst||3);i++)this.world.airdropCrate('brown',Math.random,depot);this.hud.toast('FORT AEGIS · 6 DESTRUCTOS · TRIPLE SUPPLY ONLINE');
  }
  setupAtlasHomecoming(){
    const rules=this.mission.rules||{},spawn=this.world.scientistSpawn?.clone()||new THREE.Vector3(58,this.world.groundAt({x:58,z:-112}),-112),professor=this.factory.createProfessorLeodones(this.playerTeam,spawn,{hp:rules.scientistHp,speed:rules.escortSpeed});this.professorLeodones=professor;this.combatants.push(professor);this.entities.push(professor);
    this.jetDropPoint=this.world.destroJet?.dropPosition?.clone()||this.world.basePositions[this.playerTeam].clone();this.extractionPoint=this.jetDropPoint.clone();if(this.world.destroJet?.drop)this.world.destroJet.drop.visible=false;this.extractionCircle=this.createExtractionCircle(this.extractionPoint);this.extractionCircle.name='leodones-destrojet-drop-circle';
    const cratePoints=this.world.missionCratePoints||[];cratePoints.forEach((point,i)=>{const type=i%13===0?CRATE_TYPES.blue:i%9===0?CRATE_TYPES.yellow:CRATE_TYPES.brown,pos=point.clone();pos.y=this.world.groundAt(pos);const crate=this.factory.createCrate(pos,type);crate.sourceDropZoneId='atlas-blacksite-stockpile';this.world.crates.push(crate)});
    for(const ally of this.controllableUnits(this.playerTeam)){this.equipPrimaryWeapon(ally,this.mission.startingWeapon||'machinegun',WEAPONS[this.mission.startingWeapon||'machinegun'],this.mission.startingAmmo||500,0);ally.grenades=this.mission.startingGrenades??2;ally.ignoreBases=true}
    this.campaignEnemies.forEach((enemy,i)=>{enemy.ignoreBases=true;enemy.escortHunter=i%3===0;enemy.commandPoint=spawn.clone();enemy.commandTimer=999;enemy.commandArrived=false});const enemyTeam=this.campaignEnemies[0]?.team;if(enemyTeam)this.ai.setTeamDoctrine(enemyTeam,'attack');this.ai.setTeamDoctrine(this.playerTeam,'bodyguard');
    this.atlasInitialDistance=spawn.distanceTo(this.extractionPoint);this.atlasWavesSpawned=0;this.hud.toast('ATLAS BLACKSITE · FIVE MACHINE GUNS · 500 AMMO · TWO GRENADES EACH');
  }
  setupCampaignAssault(){
    this.campaignTargets=this.world.missionTargets||[];const enemyFactory=this.world.factories[this.campaignEnemies[0]?.team];if(enemyFactory){enemyFactory.invulnerable=true;enemyFactory.hp=enemyFactory.maxHp=99999}for(const enemy of this.campaignEnemies){enemy.guardPoint=enemy.group.position.clone();enemy.commandPoint=null}this.spawnCampaignCrates(8,this.world.builderPositions[this.playerTeam],9);
  }
  createGoldenQuestCrate(position,name='Sun Core'){
    const crate=this.factory.createCrate(position,CRATE_TYPES.yellow);crate.questItem=true;crate.questHeavy=true;crate.noBuilder=true;crate.noAI=true;crate.nonMaterializable=true;crate.mass=8;crate.crateType={...CRATE_TYPES.yellow,id:'golden',name,mass:8,color:0xffd23f};crate.originalType=crate.crateType;const gold=this.materials.color(0xffd23f,{emissive:0xffa900,emissiveIntensity:1.4,metalness:.85,roughness:.12});crate.box.material=gold;for(const band of crate.bands)band.material=this.materials.color(0xfff1a0,{emissive:0xffd23f,emissiveIntensity:1.7,metalness:.9});crate.sparkles=[];for(let i=0;i<8;i++){const s=new THREE.Mesh(new THREE.OctahedronGeometry(.055,0),new THREE.MeshBasicMaterial({color:i%2?0xffffff:0xffd23f,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));crate.group.add(s);crate.sparkles.push(s)}this.world.crates.push(crate);this.goldenCrate=crate;return crate;
  }
  createExtractionCircle(center){
    const group=new THREE.Group();group.position.copy(center);group.name='sun-core-extraction';const ringMat=new THREE.MeshBasicMaterial({color:0x54f07b,transparent:true,opacity:.8,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});const ring=new THREE.Mesh(new THREE.RingGeometry(3.7,4.25,48),ringMat);ring.rotation.x=-Math.PI/2;group.add(ring);const inner=new THREE.Mesh(new THREE.RingGeometry(2.2,2.38,32),ringMat.clone());inner.rotation.x=-Math.PI/2;group.add(inner);for(let i=0;i<6;i++){const arrow=new THREE.Mesh(new THREE.ConeGeometry(.28,.8,4),ringMat.clone());const a=i/6*Math.PI*2;arrow.position.set(Math.cos(a)*3.1,.42,Math.sin(a)*3.1);arrow.rotation.z=Math.PI;arrow.rotation.y=-a;group.add(arrow)}const beam=new THREE.Mesh(new THREE.CylinderGeometry(2.8,4.1,8,32,1,true),new THREE.MeshBasicMaterial({color:0x54f07b,transparent:true,opacity:.075,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));beam.position.y=4;group.add(beam);this.scene.add(group);return group;
  }
  createQuestGuide(){
    const group=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending});const arrow=new THREE.Mesh(new THREE.ConeGeometry(.48,1.25,6),mat);arrow.rotation.z=Math.PI;arrow.position.y=4;group.add(arrow);const ring=new THREE.Mesh(new THREE.RingGeometry(1.05,1.3,32),mat.clone());ring.rotation.x=-Math.PI/2;ring.position.y=.08;group.add(ring);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.06,.14,3.2,8),mat.clone());beam.position.y=1.7;group.add(beam);this.scene.add(group);this.questGuide={group,arrow,ring,beam};const ghostMat=new THREE.MeshBasicMaterial({color:0x54f07b,transparent:true,opacity:.28,depthWrite:false,wireframe:true});this.builderGhost=new THREE.Mesh(new THREE.BoxGeometry(1.12,1.12,1.12),ghostMat);this.builderGhost.visible=false;this.scene.add(this.builderGhost);
  }
  questGuideTarget(){
    const step=this.quest?.currentStep();if(!step)return null;if(step.id==='build-squad'){if(this.player?.carriedCrate)return this.builder?.pad;return this.world.crates.find(c=>!c.carried&&!c.placed&&!c.falling&&!c.questItem)?.group.position||this.builder?.pad}if(step.id==='build-five'||step.id==='arm-squad')return this.builder?.pad;if(['attack-outpost','destroy-outpost','break-command','destroy-foundry'].includes(step.id))return this.world.factories[this.campaignEnemies[0]?.team]?.group.position;if(step.id==='charge-guards'||step.id==='eliminate-guards')return this.campaignEnemies.find(e=>!e.dead)?.group.position;if(step.id==='recover-core'){if(this.goldenCrate?.carried)return this.extractionPoint;return this.goldenCrate?.group.position}if(step.id==='defend-gold')return this.goldenCrate?.group.position;if(step.id==='locate-leodones')return this.professorLeodones?.group.position;if(step.id==='escort-leodones')return this.extractionPoint;if(step.id==='destroy-relays'||step.id==='break-coolant')return this.campaignTargets?.find(t=>!t.dead)?.group.position;return null;
  }
  updateQuestGuide(time){
    if(!this.questGuide)return;const target=this.questGuideTarget();this.questGuide.group.visible=Boolean(target);if(target){this.questGuide.group.position.set(target.x,target.y||this.world.groundAt(target),target.z);this.questGuide.arrow.position.y=4+Math.sin(time*6)*.4;this.questGuide.ring.rotation.z=time*1.5;this.questGuide.group.scale.setScalar(1+Math.sin(time*4)*.07)}const buildStep=this.quest?.currentStep()?.id==='build-squad'&&this.player?.carriedCrate;if(this.builderGhost){this.builderGhost.visible=Boolean(buildStep);if(buildStep){const heights=this.builder.heights(),column=Math.max(0,heights.findIndex(h=>h<2));this.builderGhost.position.copy(this.builder.cellPosition(column,Math.min(2,heights[column])));this.builderGhost.rotation.y=time}}
  }
  showQuestStep(step){
    const root=document.getElementById('quest-hud');if(!root||!step)return;root.classList.remove('step-pop');void root.offsetWidth;root.classList.add('step-pop');document.getElementById('quest-title').textContent=step.title;document.getElementById('quest-instruction').textContent=`${step.instruction} · ${step.key}`;document.getElementById('quest-step-count').textContent=`${this.quest?.index+1||1} / ${this.mission.steps.length}`;document.getElementById('quest-pips').innerHTML=this.mission.steps.map((_,i)=>`<i class="${i<(this.quest?.index||0)?'done':i===(this.quest?.index||0)?'active':''}"></i>`).join('');const radio={ 'build-squad':'One Destructo is a target. Four is a squad. Grab that crate!', 'arm-squad':'Beautiful! Now press V and make those rookies earn their bolts.', 'attack-outpost':'Armed and adorable. Press V again. Point them at something expensive.', 'destroy-outpost':'No subtlety now—flatten the defenders and their factory!', 'recover-core':'The Scrapjack Five are sitting on our Sun Core. Bring it home, even if it ruins your posture.', 'locate-leodones':'Atlas is enormous, dark, and full of bad ideas. Professor Leodones is in the northern research wing.', 'escort-leodones':'That backpack contains Gaia’s recovery archive. Get the Professor to the DestroJet alive.'}[step.id];document.getElementById('quest-radio-text').textContent=radio||'Keep moving, commander.';this.hud.el.objective.textContent=step.title;const doctrine=document.getElementById('ai-doctrine'),description=document.getElementById('ai-description');if(doctrine)doctrine.textContent='QUEST LINK';if(description)description.textContent=step.instruction;
  }
  renderQuestProgress(value,goal,pct){const fill=document.getElementById('quest-progress-fill');if(fill)fill.style.width=`${pct*100}%`;const title=document.getElementById('quest-step-count');if(title)title.dataset.progress=`${value} / ${goal}`;}
  campaignRadio(stepId){return({'build-five':'Five warriors. No more, no less. Keep that D-Builder hot!','charge-guards':'CHAAARGE! The Scrapfist Five are advancing with you!','eliminate-guards':'Destroy the Scrapjack Five now. Building five allies is a powerful optional play.','defend-gold':'Four minutes, commander. If that gold reaches the jet, Gaia is cooked.','destroy-relays':'Three storm relays feed the command shield. Make them stop glowing.','break-command':'Shield down. Turn Dam Command into expensive gravel.','break-coolant':'Four coolant locks hold the Prime Foundry together. Crack them all.','destroy-foundry':'The forge is exposed. Finish Gaia’s campaign with a bang!','locate-leodones':'Find the cyan research wing. Leodones will not move until he sees friendlies.','escort-leodones':'Protect the Professor. His suit regenerates slowly, but concentrated fire will overwhelm it.'})[stepId]||'Keep moving, commander.'}
  handleCampaignCommand(){
    const step=this.quest?.currentStep();if(!step)return;if(step.id==='arm-squad'&&!this.campaignArmStarted){this.startCampaignArmRun();return}if(step.id==='attack-outpost'){this.campaignAttackOrdered=true;for(const enemy of this.campaignEnemies){enemy.freeze=0;enemy.missionDormant=false}const target=this.world.factories[this.campaignEnemies[0].team].group.position;for(const ally of this.livingUnits(this.playerTeam).filter(u=>u!==this.player)){ally.missionScripted=false;ally.commandPoint=target.clone();ally.commandTimer=999;ally.commandArrived=false}this.ai.setTeamDoctrine(this.playerTeam,'attack');this.particles.burst(target.clone().add(new THREE.Vector3(0,2,0)),0xffd23f,42,12);this.hud.toast('ASSAULT ORDER CONFIRMED · GO GO GO!');this.quest.advance();return}this.hud.toast('FOLLOW THE ACTIVE QUEST FIRST',true);
  }
  startCampaignArmRun(){
    const allies=this.livingUnits(this.playerTeam).filter(u=>u!==this.player).slice(0,3),crates=this.spawnCampaignCrates(allies.length,this.builder.pad,9);this.campaignArmTasks=allies.map((unit,i)=>({unit,crate:crates[i],phase:'fetch',done:false}));this.campaignArmStarted=true;for(const ally of allies)ally.missionScripted=true;this.hud.toast('SUPPLY RUN! ALLIES MOVING TO THE D-BUILDER');
  }
  updateCampaignArmRun(dt){
    if(!this.campaignArmStarted)return;const task=this.campaignArmTasks.find(t=>!t.done);if(!task){this.quest.progress(3,3);this.quest.advance();return}const {unit,crate}=task;if(unit.dead){task.done=true;return}if(task.phase==='fetch'){const d=unit.group.position.distanceTo(crate.group.position);if(d<1.6){crate.carried=true;crate.physicsActive=false;unit.carriedCrate=crate;task.phase='deliver'}else this.ai.moveToward(unit,crate.group.position,dt,1.15)}else{const d=unit.group.position.distanceTo(this.builder.pad);if(d<3.3){this.builder.place(crate,unit.group.position,'flat');unit.carriedCrate=null;this.builder.campaignRecipient=unit;this.builder.manufacture();this.builder.campaignRecipient=null;unit.campaignArmed=true;unit.missionScripted=false;task.done=true;this.particles.burst(unit.group.position.clone().add(new THREE.Vector3(0,1,0)),0x54f07b,18,5);this.quest.progress(this.campaignArmTasks.filter(t=>t.done).length,3)}else this.ai.moveToward(unit,this.builder.pad,dt,1.1)}
  }
  updateMissionOneSupplyDrops(dt){
    if(!this.campaignSupplyDropsRemaining)return;this.campaignSupplyDropTimer-=dt;if(this.campaignSupplyDropTimer>0)return;const plan=this.mission.supplyDrops||{},count=Math.min(plan.waveSize||2,this.campaignSupplyDropsRemaining);for(let i=0;i<count;i++)this.world.airdropCrate('brown',Math.random,this.campaignSupplyDropZone);this.campaignSupplyDropsRemaining-=count;this.campaignSupplyDropsDelivered+=count;this.campaignSupplyDropTimer=plan.interval||5;this.hud.toast(`TRAINING AIRLIFT · ${this.campaignSupplyDropsDelivered}/${plan.additional||16} EXTRA CRATES DELIVERED`);
  }
  showCampaignSignal(text,subtitle='ALLIED ASSAULT ENGAGED'){const old=document.querySelector('.campaign-signal');old?.remove();const signal=document.createElement('div');signal.className='campaign-signal';signal.innerHTML=`<span>${escapeHtml(subtitle)}</span><strong>${escapeHtml(text)}</strong><i></i>`;this.screen.appendChild(signal);setTimeout(()=>signal.remove(),2600)}
  beginGoldRushCharge(){if(this.campaignAttackOrdered)return;this.campaignAttackOrdered=true;const target=this.campaignEnemies.find(e=>!e.dead)?.group.position||this.goldenCrate.group.position;for(const ally of this.livingUnits(this.playerTeam).filter(u=>u!==this.player)){ally.missionScripted=false;ally.commandPoint=target.clone();ally.commandTimer=999;ally.commandArrived=false}this.ai.setTeamDoctrine(this.playerTeam,'attack');this.particles.burst(this.player.group.position.clone().add(new THREE.Vector3(0,2,0)),0xffd23f,64,15);this.showCampaignSignal('CHAAARGE!');this.hud.toast('OPTIONAL SQUAD COMPLETE · CHAAARGE!')}
  updateGoldRushMission(dt,step){
    const count=this.livingUnits(this.playerTeam).length,guardsDead=this.campaignEnemies.filter(e=>e.dead).length;if(count>=5)this.beginGoldRushCharge();if(step.id==='eliminate-guards'){this.quest.progress(guardsDead,5);if(guardsDead>=5)this.quest.advance()}
    if(count===0)this.quest.fail('THE SCRAPFIST FIVE WERE WIPED OUT');
  }
  updateCampaignRespawn(dt){const team=this.teamMap[this.playerTeam],seconds=this.mission.rules?.reinforcementSeconds||5;if(this.controllableUnits(this.playerTeam).length)return this.campaignRespawnTimer=seconds;this.campaignRespawnTimer-=dt;const overlay=document.getElementById('respawn-overlay'),counter=document.getElementById('respawn-countdown');overlay?.classList.remove('hidden');if(counter)counter.textContent=Math.max(0,Math.ceil(this.campaignRespawnTimer));if(this.campaignRespawnTimer>0)return;this.campaignRespawnTimer=seconds;const unit=this.addUnit(this.mission.id==='golden-shield'?'heavy':this.mission.startingSquad?.[0]||'commando',team.id,this.respawnPos(team.id,0));if(this.mission.startingWeapon)this.equipPrimaryWeapon(unit,this.mission.startingWeapon,WEAPONS[this.mission.startingWeapon],this.mission.startingAmmo||300,0);unit.grenades=this.mission.startingGrenades||0;unit.ignoreBases=this.mission.id==='atlas-homecoming';this.possess(unit);overlay?.classList.add('hidden');this.particles.burst(unit.group.position.clone().add(new THREE.Vector3(0,1,0)),team.color,32,8);this.hud.toast(`${seconds}-SECOND REINFORCEMENT DEPLOYED`)}
  updateGoldenShield(dt){
    this.campaignTimer=Math.max(0,this.campaignTimer-dt);const goal=this.mission.rules?.defenseSeconds||240,timer=document.getElementById('sudden-death-timer'),value=document.getElementById('timer-val');timer?.classList.remove('hidden');if(value){value.textContent=`${String(Math.floor(this.campaignTimer/60)).padStart(2,'0')}:${String(Math.ceil(this.campaignTimer%60)).padStart(2,'0')}`;value.style.color=this.campaignTimer<60?'#ff5266':'#ffd23f'}this.quest.progress(goal-this.campaignTimer,goal);this.updateCampaignRespawn(dt);
    const defenders=this.livingUnits(this.playerTeam),defenderCarrier=defenders.find(unit=>unit.carriedCrate===this.goldenCrate),playerTarget=defenderCarrier||(!this.player?.dead?this.player:defenders[0]),thieves=this.campaignEnemies.filter(e=>!e.dead&&e.missionThief),carrier=thieves.find(e=>e.carriedCrate===this.goldenCrate);let activeThief=null;
    if(carrier){activeThief=carrier;this.ai.moveToward(carrier,this.jetDropPoint,dt,1.24);if(carrier.group.position.distanceTo(this.jetDropPoint)<4.4){this.goldenCrate.carried=false;carrier.carriedCrate=null;this.goldenCrate.group.position.copy(this.jetDropPoint);this.quest.fail('THE GOLDEN CRATE REACHED THE DESTROJET')}}else if(defenderCarrier){for(const thief of thieves)this.ai.engage(thief,dt,defenderCarrier,this.goldenCrate.group.position,34,false,1.22)}else if(this.goldenCrate&&!this.goldenCrate.carried){activeThief=[...thieves].sort((a,b)=>a.group.position.distanceToSquared(this.goldenCrate.group.position)-b.group.position.distanceToSquared(this.goldenCrate.group.position))[0];if(activeThief){const d=activeThief.group.position.distanceTo(this.goldenCrate.group.position);if(d<1.8){this.goldenCrate.carried=true;this.goldenCrate.physicsActive=false;activeThief.carriedCrate=this.goldenCrate;this.hud.toast('GOLDEN CRATE STOLEN · INTERCEPT THE THIEF!',true)}else this.ai.moveToward(activeThief,this.goldenCrate.group.position,dt,1.18)}}
    if(playerTarget&&!defenderCarrier)for(const thief of thieves)if(thief!==activeThief&&!thief.carriedCrate)this.ai.engage(thief,dt,playerTarget,this.goldenCrate.group.position,36,false,1.16);for(const raider of this.campaignEnemies)if(!raider.dead&&!raider.missionThief&&playerTarget)raider.aggroTarget=playerTarget;
    this.campaignCountedDeaths=this.campaignCountedDeaths||new Set();for(const enemy of this.campaignEnemies)if(enemy.dead&&!this.campaignCountedDeaths.has(enemy.id)){this.campaignCountedDeaths.add(enemy.id);this.campaignEnemyDeaths++}const rules=this.mission.rules,waves=Math.floor(this.campaignEnemyDeaths/rules.deathsPerWave);while(this.campaignWavesSpawned<waves){this.campaignWavesSpawned++;const enemyTeam=this.teams.find(t=>t.id!==this.playerTeam);for(let i=0;i<rules.enemiesPerWave;i++){const unit=this.addUnit(['scout','gunner','heavy'][i%3],enemyTeam.id,this.respawnPos(enemyTeam.id,i));unit.missionScripted=i<2;unit.missionThief=i<2;unit.ignoreBases=true;this.campaignEnemies.push(unit)}this.hud.toast(`ENEMY WAVE ${this.campaignWavesSpawned+1} · THREE RAIDERS INBOUND`,true)}if(this.campaignTimer<=0)this.quest.advance();
  }
  spawnAtlasEnemyDrop(enemy){
    if(!enemy||enemy.atlasDropSpawned)return;enemy.atlasDropSpawned=true;const drop=(this.campaignEnemyDeaths||0)%2?{id:'health',name:'Field Medkit',color:0xff405e}:{id:'ammo',name:'Machine Gun Ammo',color:0xffc44a},pos=enemy.group.position.clone();pos.y=this.world.groundAt(pos)+.12;const pickup=this.factory.createPickup(drop,pos);pickup.life=38;pickup.group.scale.setScalar(.01);gsap.to(pickup.group.scale,{x:1,y:1,z:1,duration:.3,delay:.08,ease:'back.out(3)'});this.world.pickups.push(pickup);
  }
  spawnAtlasWave(){
    const rules=this.mission.rules||{};if(this.atlasWavesSpawned>=(rules.maxWaves||8))return;const enemyTeam=this.teams.find(t=>t.id!==this.playerTeam);if(!enemyTeam)return;this.atlasWavesSpawned++;const waveSpawns=this.world.atlasWaveSpawns||[new THREE.Vector3(-65,0,-75),new THREE.Vector3(65,0,-75)],flank=waveSpawns[(this.atlasWavesSpawned-1)%waveSpawns.length];for(let i=0;i<(rules.waveSize||4);i++){const planned=flank.clone().add(new THREE.Vector3((i%2)*2.4,0,Math.floor(i/2)*2.5)),pos=this.world.walkablePosition?.(planned,.72)||planned;pos.y=this.world.groundAt(pos);const unit=this.addUnit(['gunner','commando','sniper','heavy'][i%4],enemyTeam.id,pos);unit.ignoreBases=true;unit.escortHunter=i%2===0;unit.commandPoint=this.professorLeodones?.group.position.clone();unit.commandTimer=999;this.campaignEnemies.push(unit)}this.hud.toast(`ATLAS RESPONSE WAVE ${this.atlasWavesSpawned} · ${rules.waveSize||4} HOSTILES`,true);
  }
  updateAtlasHomecoming(dt,step){
    const professor=this.professorLeodones,rules=this.mission.rules||{};if(!professor||professor.dead){this.quest.fail('PROFESSOR LEODONES WAS KILLED');return}const soldiers=this.controllableUnits(this.playerTeam),wiped=soldiers.length===0;this.updateCampaignRespawn(dt);professor.escortPanic=wiped;if(wiped){professor.velocity.multiplyScalar(Math.pow(.01,dt));professor.aggroTarget=null}else{const leader=!this.player?.dead&&!this.player?.missionVIP?this.player:soldiers[0],closest=soldiers.reduce((best,u)=>!best||u.group.position.distanceToSquared(professor.group.position)<best.group.position.distanceToSquared(professor.group.position)?u:best,null);if(step.id==='locate-leodones'){const reached=closest&&closest.group.position.distanceTo(professor.group.position)<8.5;this.quest.progress(reached?1:0,1);if(reached){this.leodonesRescued=true;this.hud.toast('PROFESSOR SECURED · BEGIN ESCORT TO THE DESTROJET');this.showCampaignSignal('BRING HIM HOME','PROFESSOR LEODONES SECURED');this.quest.advance();return}}else if(this.leodonesRescued&&leader){const follow=leader.group.position.clone().addScaledVector(leader.aim||new THREE.Vector3(0,0,1),-3.4),distance=professor.group.position.distanceTo(leader.group.position);if(distance>4.1)this.ai.moveToward(professor,follow,dt,1);else{professor.velocity.multiplyScalar(Math.pow(.05,dt));this.ai.settle(professor)}const remaining=professor.group.position.distanceTo(this.extractionPoint),progress=1-Math.min(1,remaining/Math.max(1,this.atlasInitialDistance));this.quest.progress(Number(progress.toFixed(2)),1);if(remaining<5){professor.state='victory';this.quest.progress(1,1);this.quest.advance();return}}for(const ally of soldiers){if(ally===leader||ally.aggroTarget&&!ally.aggroTarget.dead)continue;ally.commandPoint=(this.leodonesRescued?professor.group.position:leader.group.position).clone();ally.commandTimer=2;ally.commandArrived=false}}
    const sinceDamage=(this.elapsed||0)-(professor.lastDamagedAt??-Infinity);if(professor.hp<professor.maxHp&&sinceDamage>=(rules.scientistRegenDelay||4))professor.hp=Math.min(professor.maxHp,professor.hp+(rules.scientistRegenPerSecond||2.25)*dt);professor.hpBarTimer=Infinity;
    for(const enemy of this.campaignEnemies){if(enemy.dead){if(!this.campaignCountedDeaths.has(enemy.id)){this.campaignCountedDeaths.add(enemy.id);this.campaignEnemyDeaths++;this.spawnAtlasEnemyDrop(enemy)}continue}const target=enemy.escortHunter&&this.leodonesRescued?professor:(!this.player?.dead?this.player:soldiers[0]||professor);if(target){enemy.commandPoint=target.group.position.clone();enemy.commandTimer=2;enemy.commandArrived=false;if(enemy.group.position.distanceToSquared(target.group.position)<34*34)enemy.aggroTarget=target}}
    const desiredWaves=Math.floor(this.campaignEnemyDeaths/(rules.deathsPerWave||5));while(this.atlasWavesSpawned<desiredWaves)this.spawnAtlasWave();if(this.campaignEnemies.filter(e=>!e.dead).length<5&&this.atlasWavesSpawned<(rules.maxWaves||8))this.spawnAtlasWave();const hp=Math.ceil(professor.hp),distance=Math.ceil(professor.group.position.distanceTo(this.extractionPoint));this.hud.el.objective.textContent=`PROFESSOR ${hp}/${professor.maxHp} HP · EXTRACTION ${distance}m`;
  }
  updateCampaignAssault(dt,step){
    if(this.campaignTimer){this.campaignTimer=Math.max(0,this.campaignTimer-dt);const value=document.getElementById('timer-val');document.getElementById('sudden-death-timer')?.classList.remove('hidden');if(value)value.textContent=`${String(Math.floor(this.campaignTimer/60)).padStart(2,'0')}:${String(Math.ceil(this.campaignTimer%60)).padStart(2,'0')}`;if(this.campaignTimer<=0){this.quest.fail('MISSION TIMER EXPIRED');return}}
    const objectiveStep=step.id==='destroy-relays'||step.id==='break-coolant';if(objectiveStep){const dead=this.campaignTargets.filter(t=>t.dead).length;this.quest.progress(dead,this.campaignTargets.length);if(dead>=this.campaignTargets.length){const factory=this.world.factories[this.campaignEnemies[0]?.team];factory.invulnerable=false;factory.hp=factory.maxHp=1700;this.hud.toast('COMMAND SHIELD COLLAPSED · FINAL TARGET EXPOSED');this.quest.advance()}}else{const factory=this.world.factories[this.campaignEnemies[0]?.team];this.quest.progress(factory.dead?1:0,1);if(factory.dead)this.quest.advance()}if(this.livingUnits(this.playerTeam).length===0)this.quest.fail('THE GAIA STRIKE TEAM WAS WIPED OUT')
  }
  updateCampaignMission(dt,time){
    if(!this.campaignActive||!this.quest||this.quest.complete||this.quest.failed)return;const step=this.quest.currentStep(),radioText=this.campaignRadio(step.id),radioEl=document.getElementById('quest-radio-text');if(radioEl&&radioText!=='Keep moving, commander.')radioEl.textContent=radioText;this.updateQuestGuide(time);if(this.extractionCircle){this.extractionCircle.rotation.y+=dt*.8;this.extractionCircle.scale.setScalar(1+Math.sin(time*4)*.05)}if(this.goldenCrate){this.goldenCrate.visual.rotation.y+=dt*.65;this.goldenCrate.sparkles.forEach((s,i)=>{const a=time*(1.6+i*.08)+i/8*Math.PI*2;s.position.set(Math.cos(a)*(1+i%2*.35),.8+Math.sin(a*2+i)*.65,Math.sin(a)*(1+i%2*.35));s.scale.setScalar(.7+Math.sin(time*7+i)*.35)})}
    if(this.mission.id==='four-of-a-kind'){this.updateMissionOneSupplyDrops(dt);if(step.id==='build-squad'){const count=this.livingUnits(this.playerTeam).length;this.quest.progress(count,4);this.campaignRestockTimer-=dt;if(this.campaignRestockTimer<=0){this.campaignRestockTimer=2;const available=this.world.crates.filter(c=>!c.questItem).length+(this.player?.carriedCrate?1:0);const needed=Math.max(0,(4-count)*2);if(available<needed)this.spawnCampaignCrates(needed-available,this.builder.pad,8)}if(count>=4)this.quest.advance()}else if(step.id==='arm-squad')this.updateCampaignArmRun(dt);else if(step.id==='destroy-outpost'){const dead=this.campaignEnemies.filter(e=>e.dead).length,factory=this.world.factories[this.campaignEnemies[0].team],progress=dead+(factory.dead?1:0);this.quest.progress(progress,3);if(progress>=3)this.quest.advance()}if(this.livingUnits(this.playerTeam).length===0)this.quest.fail('YOUR SQUAD WAS WIPED OUT');else if(this.world.factories[this.playerTeam].dead)this.quest.fail('YOUR BASE WAS DESTROYED')}
    else if(this.mission.id==='gold-rush')this.updateGoldRushMission(dt,step);else if(this.mission.id==='golden-shield')this.updateGoldenShield(dt);else if(this.mission.id==='atlas-homecoming')this.updateAtlasHomecoming(dt,step);else this.updateCampaignAssault(dt,step)
  }
  endCampaignMission(won,reason='MISSION FAILED'){
    if(!this.campaignActive||['campaign_complete','campaign_failed'].includes(this.state))return;const reward=won?this.mission.reward+this.kills*35:Math.floor(this.kills*12);this.save.recordMission(won,this.kills,reward);if(won)this.save.completeCampaignMission(this.mission.id);if(won){this.campaignVictoryHero=this.player&&!this.player.dead?this.player:this.livingUnits(this.playerTeam)[0];if(this.campaignVictoryHero)this.campaignVictoryHero.state='victory';this.campaignVictoryAngle=0}this.endRuntime();document.exitPointerLock?.();this.state=won?'campaign_complete':'campaign_failed';if(won){this.audio.playMusic('/music/battle_win.mp3',false);this.screen.innerHTML=`<main class="campaign-result accomplished"><div class="victory-rays"></div><div class="confetti">${'<i></i>'.repeat(36)}</div><span class="eyebrow">${this.mission.name.toUpperCase()}</span><h2>MISSION<br>ACCOMPLISHED</h2><p>Major Rivet is pretending this was the plan all along.</p><div class="stat-row"><div><strong>${this.kills}</strong><span>ENEMIES WRECKED</span></div><div><strong>${reward}</strong><span>CHIPS</span></div></div><div class="menu-actions"><button class="btn mission-btn" data-action="missions">CONTINUE CAMPAIGN</button><button class="btn" data-action="menu">MAIN MENU</button></div></main>`}else{this.audio.playMusic('/music/battle_lost.mp3',false);this.screen.innerHTML=`<main class="campaign-result failed"><span class="eyebrow">OPERATION INTERRUPTED</span><h2>MISSION FAILED</h2><p>${escapeHtml(reason)}</p><div class="menu-actions"><button class="btn primary" data-action="mission:${this.mission.id}">RETRY MISSION</button><button class="btn" data-action="missions">MISSION SELECT</button></div></main>`}
  }
  updateCampaignCelebration(dt){const hero=this.campaignVictoryHero;if(!hero)return;this.campaignVictoryAngle=(this.campaignVictoryAngle||0)+dt*.5;this.factory?.animateUnit?.(hero,performance.now()/1000,dt);const focus=hero.group.position.clone().add(new THREE.Vector3(0,1.2,0)),desired=focus.clone().add(new THREE.Vector3(Math.sin(this.campaignVictoryAngle)*6,3.2,Math.cos(this.campaignVictoryAngle)*6));this.camera.position.lerp(desired,1-Math.pow(.002,dt));this.camera.lookAt(focus)}
  addLights(){const hemi=new THREE.HemisphereLight(0xd8f0ff,0x3f5a36,.95);this.scene.add(hemi);const sun=new THREE.DirectionalLight(0xfff6d8,1.7);sun.position.set(-45,78,-35);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.left=sun.shadow.camera.bottom=-78;sun.shadow.camera.right=sun.shadow.camera.top=78;sun.shadow.camera.near=.5;sun.shadow.camera.far=210;sun.shadow.bias=-.0008;this.sun=sun;this.scene.add(sun);this.scene.add(sun.target)}
  configureModeUnit(unit){if(this.gameMode!=='domination')return unit;this.equipPrimaryWeapon(unit,DOMINATION_RULES.weaponId,WEAPONS[DOMINATION_RULES.weaponId],this.matchRules?.startingAmmo??90,0);return unit}
  addUnit(classId,team,pos,opts={}){const cosmetics=!this.observerOnly&&team===this.playerTeam?this.teamCosmetics():{};const modeClass=this.gameMode==='domination'?DOMINATION_RULES.classId:classId;const unit=this.factory.createUnit(modeClass,team,pos,false,{...cosmetics,skin:this.teamMap[team]?.uniform,...opts});this.configureModeUnit(unit);unit.groundY=this.world.groundAt(unit.group.position);unit.ammo=this.debugAmmoFor(unit,this.matchRules?.startingAmmo??90);this.combatants.push(unit);this.entities.push(unit);this.recordDestructoCreated(unit);return unit}
  update(dt,time){
    if(this.state==='paused'){if(this.input.consume('Escape'))this.resumeGame();this.input.endFrame();return;}
    if(this.menuStage&&this.scene===this.menuScene&&MENU_BACKDROP_STATES.has(this.state)){this.menuStage.update(dt,time,this.camera);return;}
    if(this.state==='campaign_complete'){this.updateCampaignCelebration(Math.min(dt,.033));this.particles?.update?.(Math.min(dt,.033),this.camera);return;}
    if(this.state!=='mission' && this.state!=='observer' && this.state!=='victory_sequence')return;
    if((this.state==='mission'||this.state==='observer')&&this.input.consume('Escape')){this.pauseGame();this.input.endFrame();return;}
    dt=Math.min(dt,.033);
    this.elapsed += dt;
    this.world.elapsed = this.elapsed;
    this.allies=this.combatants.filter(e=>!this.hostile(this.playerTeam,e.team));
    this.enemies=this.combatants.filter(e=>this.hostile(this.playerTeam,e.team));
    if(this.state==='mission'){if(this.input.consume('KeyV'))this.campaignActive?this.handleCampaignCommand():this.cycleAIBehavior(1);if(this.input.consume('KeyC')&&!this.campaignActive)this.cycleAIBehavior(-1);this.updatePlayer(dt);this.updateGrapples(dt)}
    const foesByTeam={};for(const t of this.teams){const list=this.combatants.filter(e=>!e.dead&&this.hostile(t.id,e.team));if(this.gameMode!=='domination'&&!(this.campaignActive&&this.mission.id==='golden-shield'))for(const tid of Object.keys(this.world.factories)){const f=this.world.factories[tid];if(!f.dead&&this.hostile(t.id,tid))list.push(f)}foesByTeam[t.id]=list}
    for(const e of this.combatants)this.ai.update(e,dt,foesByTeam[e.team]||[]);
    this.updateWeaponFallbacks();
    this.updateFootsteps(dt);
    this.combat.update(dt);this.updateMotorcycles(dt);this.world.update(time,dt,this.particles);this.updateWildlife(dt);this.updateObjective(dt);this.updateDomination(dt);this.updateCampaignMission(dt,time);this.updateAbilityZones(dt);this.updatePickups(dt);this.updateThrownGrenades(dt);this.updateBaseTurrets(dt);this.updateHealLinks(dt);this.updateOverheadIcons(dt);this.updateOverheadBars(dt);this.updateDebris(dt);this.particles.update(dt,this.camera);
    for(const e of this.combatants){for(const key of ['abilityCooldown','statusTimer','overdriveTimer','rallyTimer','barrierTimer','frenzyTimer','paceAura'])e[key]=Math.max(0,(e[key]||0)-dt);if(e.buffs)for(const key of Object.keys(e.buffs))e.buffs[key]=Math.max(0,e.buffs[key]-dt);if(e.freeze>0&&e===this.player)e.freeze=Math.max(0,e.freeze-dt);if(e.cloakTimer>0){e.cloakTimer=Math.max(0,e.cloakTimer-dt);if(e.cloakTimer===0)this.setCloak(e,false)}if(!e.dead&&e.passive?.id==='regen')e.hp=Math.min(e.maxHp,e.hp+dt*2.5);if(!e.dead&&e.passive?.id==='healeraura'){for(const f of this.friendsOf(e))if(f!==e&&f.group.position.distanceTo(e.group.position)<6)f.hp=Math.min(f.maxHp,f.hp+dt*1.5)}if(!e.dead&&e.passive?.id==='swift'){for(const f of this.friendsOf(e))if(f!==e&&f.type==='unit'&&f.group.position.distanceTo(e.group.position)<6)f.paceAura=.3}if(Number.isFinite(e.maxMp))e.mp=Math.min(e.maxMp,e.mp+dt*3.5*(e.passive?.id==='manabattery'?1.6:1));if(e.type==='unit'){e.firstPerson=e===this.player&&this.fpsMode;this.positionCarriedCrate(e);this.factory.animateUnit(e,time,dt)}}
    this.updateAIHealers(dt);
    if(!this.campaignActive)this.updateTeams(dt);this.updateDanger(dt);
    if(this.state==='mission'){
      const drops=this.world.updateCrateDrops(dt);for(const drop of drops)if(drop.type!=='brown')this.hud.toast(`${drop.type.toUpperCase()} CRATE INBOUND · ${drop.zone.label}`,drop.type==='red');
      const forecast=document.querySelector('#crate-forecast strong'),next=this.world.nextCrateDrop(),rare=this.world.nextCrateDrop(true);if(forecast&&next){const commonName=next.type==='brown'?'COMMON':next.type.toUpperCase();forecast.textContent=`${commonName} ${Math.ceil(next.seconds)}s${rare?` · RARE ${Math.ceil(rare.seconds)}s`:''}`;forecast.style.color=hex(CRATE_TYPES[next.type].color);forecast.title=`${next.zone.label}${rare?` · Next rare: ${rare.type.toUpperCase()} at ${rare.zone.label}`:''}`}
    }
    this.updateCamera(dt);
    this.updateSunShadow(dt);this.updateSecretDiscoveries();
    if(this.state==='mission') this.updateHover();
    else if(this.state==='observer'){
      this.updateObserverInput();
      this._observerUiAccumulator=(this._observerUiAccumulator||0)+dt;
      this._observerMapAccumulator=(this._observerMapAccumulator||0)+dt;
      if(this._observerUiAccumulator>=.1){this._observerUiAccumulator%=.1;this.updateObserverUI()}
      if(this._observerMapAccumulator>=1/15){this._observerMapAccumulator%=1/15;this.observerMinimap.update(this.world,this.teams,this.combatants,this.observerTarget,{camera:this.camera,focus:this.camera.position},this.elapsed)}
    }
    if((this.state==='mission' || this.state==='observer')&&this.gameMode!=='domination'&&this.gameMode!=='campaign'){
      const activeTeams=this.teams.filter(t=>!t.eliminated);
      let hasHostilePair=false;
      for(let i=0;i<activeTeams.length;i++){
        for(let j=i+1;j<activeTeams.length;j++){
          if(this.hostile(activeTeams[i].id,activeTeams[j].id)){
            hasHostilePair=true;
            break;
          }
        }
        if(hasHostilePair)break;
      }
      if(activeTeams.length>0&&!hasHostilePair){
        const winningTeam=activeTeams.find(t=>t.id===this.playerTeam)||activeTeams[0];
        this.startVictorySequence(winningTeam);
      }
    }
    if((this.state==='mission' || this.state==='observer')&&this.gameMode!=='domination'&&this.gameMode!=='campaign'){
      if(!this.suddenDeathActive){
        this.suddenDeathTimer=Math.max(0,this.suddenDeathTimer-dt);
        if(this.suddenDeathTimer<=0){
          this.triggerSuddenDeath();
        }
      }
      const timerEl = document.getElementById('sudden-death-timer');
      const timerValEl = document.getElementById('timer-val');
      if (timerEl && timerValEl) {
        timerEl.classList.remove('hidden');
        if (this.suddenDeathActive) {
          timerEl.classList.add('active-sd');
          if (timerValEl.textContent !== 'SUDDEN DEATH') {
            timerValEl.textContent = 'SUDDEN DEATH';
            gsap.fromTo(timerValEl, { scale: 1.4 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' });
          }
        } else {
          const mins = Math.floor(this.suddenDeathTimer / 60);
          const secs = Math.floor(this.suddenDeathTimer % 60);
          const currentSecondStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          if (timerValEl.textContent !== currentSecondStr) {
            timerValEl.textContent = currentSecondStr;
            gsap.fromTo(timerValEl, { scale: 1.25 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' });
            if (this.suddenDeathTimer <= 10 && this.suddenDeathTimer > 0) {
              this.audio.play('pickup', 0.85);
            }
          }
          if (this.suddenDeathTimer < 30) timerEl.classList.add('danger');
          else timerEl.classList.remove('danger');
        }
      }
    }
    const bossFactory=this.gameMode==='domination'?null:this.nearestEnemyFactory();
    if(this.state==='mission'){
      this.hud.update(this.player.mountedTurret||this.player,bossFactory,this.livingUnits(this.playerTeam).length,this.save.data.chips,this.builder?.values?.()||[]);
      this.hud.updateSquad(this.campaignActive?this.controllableUnits(this.playerTeam):this.livingUnits(this.playerTeam),this.player,u=>this.factory.unitPortrait(u));
      this.minimap.update(this.world,this.teams,this.combatants,this.player,null,this.elapsed);
    }
    this.audio.updateListener(this.camera);
    this.input.endFrame()}
  triggerSuddenDeath(){
    this.suddenDeathActive=true;
    this.hud.toast('SUDDEN DEATH! ALL BASES DESTROYED!',true);
    this.audio.play('explosion',1.5);
    for(const tid of Object.keys(this.world.factories)){
      const f=this.world.factories[tid];
      if(!f.dead){
        f.hp=0;
        f.dead=true;
        this.handleDeath(f,null);
      }
    }
    // The player-controlled unit is ignored by AIController.update, so putting
    // every team brain into panic correctly mobilizes the player's AI squad too.
    this.ai?.enterSuddenDeath();
  }
  pauseGame(){if(this.state!=='mission'&&this.state!=='observer')return;this.pausePreviousState=this.state;this.pauseOptionsOpen=false;this.state='paused';this.input.mouse.down=false;document.exitPointerLock?.();this.showPauseMenu(false)}
  resumeGame(){if(this.state!=='paused'||!this.pausePreviousState)return;this.state=this.pausePreviousState;this.pausePreviousState=null;this.pauseOptionsOpen=false;this.screen.innerHTML='';this.lastFrame=performance.now()/1000;if(this.state==='mission')this.requestMouseCapture()}
  showPauseMenu(options=false){if(this.state!=='paused')return;this.pauseOptionsOpen=Boolean(options);const s=this.save.data.settings;if(options){this.screen.innerHTML=`<main class="menu pause-menu"><span class="eyebrow">GAME PAUSED</span><h2>OPTIONS</h2><div class="settings"><label>DYNAMIC SHADOWS <input type="checkbox" data-setting="shadows" ${s.shadows?'checked':''}></label><label>CAMERA SHAKE <input type="checkbox" data-setting="cameraShake" ${s.cameraShake?'checked':''}></label><label>MOUSE SENSITIVITY <input type="range" min=".2" max="3" step=".1" value="${s.mouseSensitivity??1}" data-setting="mouseSensitivity"></label><label>MASTER VOLUME <input type="range" min="0" max="1" step=".05" value="${s.volume}" data-setting="volume"></label></div>${this.debugCodeEntry()}<div class="menu-actions"><button class="btn ${this.audio.musicMuted?'danger':''}" data-action="pause:music">MUSIC ${this.audio.musicMuted?'MUTED':'ON'}</button><button class="btn ${this.audio.soundsMuted?'danger':''}" data-action="pause:sounds">SOUNDS ${this.audio.soundsMuted?'MUTED':'ON'}</button><button class="btn primary" data-action="pause:back">BACK</button></div></main>`;return}this.screen.innerHTML=`<main class="menu pause-menu"><span class="eyebrow">ESC · GAME PAUSED</span><h2>PAUSE MENU</h2><div class="menu-actions"><button class="btn primary" data-action="pause:resume">RESUME</button><button class="btn" data-action="pause:options">OPTIONS</button><button class="btn ${this.audio.musicMuted?'danger':''}" data-action="pause:music">${this.audio.musicMuted?'UNMUTE':'MUTE'} MUSIC</button><button class="btn ${this.audio.soundsMuted?'danger':''}" data-action="pause:sounds">${this.audio.soundsMuted?'UNMUTE':'MUTE'} SOUNDS</button><button class="btn" data-action="pause:restart">RESTART GAME</button><button class="btn danger" data-action="pause:menu">MAIN MENU</button></div></main>`}
  nearestEnemyFactory(){let best=null,d=Infinity;for(const tid of Object.keys(this.world.factories)){const f=this.world.factories[tid];if(f.dead||!this.hostile(this.playerTeam,tid))continue;const dist=f.group.position.distanceToSquared(this.player.group.position);if(dist<d){d=dist;best=f}}return best}
  cycleAIBehavior(delta){this.aiBehaviorIndex=(this.aiBehaviorIndex+delta+AI_BEHAVIORS.length)%AI_BEHAVIORS.length;const behavior=AI_BEHAVIORS[this.aiBehaviorIndex];this.ai?.setTeamDoctrine(this.playerTeam,behavior.id);const team=this.teamMap?.[this.playerTeam];if(team)team.aiDoctrine=behavior.id;for(const ally of this.livingUnits(this.playerTeam)){if(ally===this.player)continue;ally.patrolPoint=null;ally.commandPoint=null}this.updateDoctrineDisplay();this.hud.toast(`${behavior.name} · ${behavior.description}`)}
  // quick right-tap: attack-move order for the squad at the point the player
  // is aiming at (consumed by AIController.followCommand)
  issueSquadCommand(){
    const p=this.player;if(!p)return;
    const dir=p.aim.clone().setY(0);if(dir.lengthSq()<1e-4)dir.set(Math.sin(p.group.rotation.y),0,Math.cos(p.group.rotation.y));dir.normalize();
    const point=p.group.position.clone().addScaledVector(dir,14);this.world.clamp(point);point.y=this.world.groundAt(point);
    const allies=this.livingUnits(this.playerTeam).filter(u=>u!==p);
    if(!allies.length){this.hud.toast('NO SQUAD TO COMMAND',true);return}
    for(const ally of allies){ally.commandPoint=point.clone();ally.commandTimer=30;ally.commandArrived=false;ally.patrolPoint=null;ally.guardPoint=null;ally.interactiveGoal=null;}
    this.particles.burst(point.clone().add(new THREE.Vector3(0,.6,0)),this.teamMap[this.playerTeam]?.color??0xffd23f,22,6);
    this.audio.play('pickup',.7);
    this.hud.toast(`SQUAD ORDER · MOVE & ENGAGE (${allies.length})`);
  }
  updateDoctrineDisplay(){const behavior=AI_BEHAVIORS[this.aiBehaviorIndex]||AI_BEHAVIORS[0],name=document.querySelector('#ai-doctrine'),desc=document.querySelector('#ai-description');if(name)name.textContent=behavior.name;if(desc)desc.textContent=behavior.description}
  scoutFromMinimap(point){if(this.state!=='mission')return;this.cameraScout={point:new THREE.Vector3(point.x,this.world.heightAt(point.x,point.z),point.z),elapsed:0,returning:false};this.hud.toast('TACTICAL SCOUT · RETURNING IN 3s')}
  // ── respawn + elimination: wiped teams get one Destructo back after 15s while
  // their base stands; base destroyed + squad wiped = eliminated for good ─────
  updateTeams(dt){
    for(const t of this.teams){
      if(t.eliminated)continue;
      const factory=this.world.factories[t.id],units=this.livingUnits(t.id),canReinforce=this.gameMode==='domination'||(this.matchRules.reinforcements&&!factory.dead);
      if(units.length>0) {
        t.respawnTimer=this.matchRules.reinforcementSeconds;
        if(!this.observerOnly&&t.id===this.playerTeam) {
          document.getElementById('respawn-overlay').classList.add('hidden');
        }
      }
      else if(canReinforce){t.respawnTimer-=dt;
        if(!this.observerOnly&&t.id===this.playerTeam){
          const overlay=document.getElementById('respawn-overlay');
          const count=document.getElementById('respawn-countdown');
          overlay.classList.remove('hidden');
          count.textContent=Math.max(0,Math.ceil(t.respawnTimer));
          this.hud.el.objective.textContent=`Squad wiped — reinforcement in ${Math.ceil(t.respawnTimer)}s`;
        }
        if(t.respawnTimer<=0){t.respawnTimer=this.matchRules.reinforcementSeconds;const unit=this.addUnit(this.gameMode==='domination'?DOMINATION_RULES.classId:pick(['scout','gunner','medic']),t.id,this.respawnPos(t.id,Math.floor(Math.random()*3)));this.particles.burst(unit.group.position.clone().add(new THREE.Vector3(0,1,0)),this.teamMap[t.id].color,26,7);if(!this.observerOnly&&t.id===this.playerTeam){this.possess(unit);document.getElementById('respawn-overlay').classList.add('hidden');this.hud.toast('REINFORCEMENT DEPLOYED');this.hud.el.objective.textContent=this.gameMode==='domination'?`Capture towers · first to ${this.matchRules.maxScore}`:this.mission.objective}}}
      if(this.gameMode!=='domination'&&!canReinforce&&units.length===0){
        if(t.id===this.playerTeam && this.state==='mission'){
          t.eliminated=true;
          document.getElementById('respawn-overlay')?.classList.add('hidden');
          this.hud.toast('SQUAD ELIMINATED — ENTERING OBSERVER MODE',true);
          this.enterObserverMode();
        } else {
          t.eliminated=true;
          this.hud.toast(`${t.name.toUpperCase()} ELIMINATED`,t.id===this.playerTeam);
        }
        continue;
      }
      // AI teams trickle reinforcements while their base stands
      const shouldTrickle=this.gameMode==='domination'||this.observerOnly||t.id!==this.playerTeam;if(shouldTrickle&&canReinforce){t.reinforceTimer-=dt;if(t.reinforceTimer<=0){t.reinforceTimer=this.gameMode==='domination'?this.matchRules.reinforcementSeconds:this.matchRules.reinforcementSeconds+Math.random()*4;const cap=this.gameMode==='domination'?DOMINATION_RULES.squadSize:this.matchRules.squadSize+2;if(this.livingUnits(t.id).length<cap)this.addUnit(this.gameMode==='domination'?DOMINATION_RULES.classId:(Math.random()>.5?'scout':'gunner'),t.id,this.respawnPos(t.id,Math.floor(Math.random()*3)))}}
    }}
  // ── DANGER warning: sub-20% HP allies get a bouncing red arrow (15s cooldown)
  updateDanger(dt){for(const e of this.combatants){if(e.type!=='unit')continue;e.dangerCooldown=Math.max(0,(e.dangerCooldown||0)-dt);
    if(!this.observerOnly&&!e.dead&&e.team===this.playerTeam&&e.hp<e.maxHp*.2&&e.dangerCooldown<=0){e.dangerCooldown=15;e.dangerTimer=4;this.audio.play('pickup',.5)}
    if(e.dangerTimer>0&&!e.dead){e.dangerTimer-=dt;if(!e.danger)e.danger=this.factory.createDangerIndicator();e.danger.visible=true;e.danger.position.copy(e.group.position);e.danger.position.y+=3.3+Math.abs(Math.sin(this.elapsed*7))*.5;e.danger.rotation.y=this.elapsed*2.5}
    else if(e.danger)e.danger.visible=false}}
  updateFootsteps(dt){
    for(const unit of this.combatants){
      if(unit.type!=='unit'||unit.dead||unit.grappling||unit.mountedTurret||unit.mountedBunker||unit.mountedMotorcycle)continue;
      const horizontalSpeed=Math.hypot(unit.velocity?.x||0,unit.velocity?.z||0),ground=this.world.groundAt(unit.group.position);
      const grounded=unit.group.position.y<=ground+.08&&Math.abs(unit.verticalVelocity||0)<.5;
      if(!grounded||horizontalSpeed<1.25){unit.footstepTimer=Math.min(unit.footstepTimer||0,.08);continue}
      unit.footstepTimer=(unit.footstepTimer||0)-dt;
      if(unit.footstepTimer<=0){const surface=this.world.surfaceAt(unit.group.position);this.audio.play(`step_${surface}`,unit.group.position,.93+Math.random()*.14);unit.footstepTimer=THREE.MathUtils.clamp(.52-horizontalSpeed*.012,.28,.48)}
    }
  }
  // carried crates ride out front, held in both hands
  positionCarriedCrate(e){
    const c=e.carriedCrate;
    if(!c)return;
    c.group.visible=true;
    const forward=new THREE.Vector3(Math.sin(e.group.rotation.y),0,Math.cos(e.group.rotation.y));
    const defaultPos=e.group.position.clone().addScaledVector(forward,1.25);
    const builder = c.noBuilder||c.questItem?null:this.builders[e.teamId || e.team];
    const dist = builder ? builder.distanceTo(e.group.position) : Infinity;
    if (builder && dist < 4.2) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let col = 0; col < 4; col++) {
        const colPos = builder.cellPosition(col, 0);
        const d = new THREE.Vector2(defaultPos.x - colPos.x, defaultPos.z - colPos.z).lengthSq();
        if (d < bestDist) {
          bestDist = d;
          bestCol = col;
        }
      }
      const y = Math.min(2, builder.heights()[bestCol]);
      const snapWorldPos = builder.cellPosition(bestCol, y);
      c.group.position.copy(snapWorldPos);
      c.group.rotation.set(0, 0, 0);
      e.crateSnappedLocalPos = e.group.worldToLocal(snapWorldPos.clone());
    } else {
      c.group.position.copy(defaultPos);
      c.group.position.y=e.group.position.y+.82;
      c.group.rotation.set(0, e.group.rotation.y, 0);
      e.crateSnappedLocalPos = null;
    }
  }
  requestMouseCapture(){const canvas=this.renderer?.domElement;if(!canvas||document.pointerLockElement===canvas)return;try{const pending=canvas.requestPointerLock?.();pending?.catch?.(()=>{})}catch{}}
  lookDirection(out=new THREE.Vector3()){const yaw=this.fpsYaw||0,pitch=this.fpsPitch||0;return out.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch))}
  // align the shoulder camera with wherever the unit/platform is already aiming
  seedLookFromAim(aim){if(!aim||aim.lengthSq()<1e-4)return;this.fpsYaw=Math.atan2(aim.x,aim.z);this.fpsPitch=THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(aim.y,-1,1)),-1.08,1.25)}
  mountedRole(unit,vehicle=unit?.mountedMotorcycle){if(!unit||!vehicle)return'none';if(vehicle.driver===unit)return vehicle.vehicleKind==='tank'?'tank-driver':'driver';return vehicle.type==='motorcycle'?'motorcycle-backrider':'passenger'}
  mountedCanFire(unit,vehicle=unit?.mountedMotorcycle){const role=this.mountedRole(unit,vehicle);return role==='tank-driver'||role==='motorcycle-backrider'}
  mountedLookDirection(vehicle,yawOffset=this.mountedViewYaw||0,pitch=this.mountedViewPitch||0){const yaw=vehicle.group.rotation.y+yawOffset;return new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).normalize()}
  syncMountedView(unit,vehicle){const role=this.mountedRole(unit,vehicle);if(this.mountedControlRole===role)return role;this.mountedControlRole=role;this.mountedViewYaw=0;this.mountedViewPitch=role==='tank-driver'?(vehicle.controlPitch??Math.asin(vehicle.aim?.y||0)):0;if(role==='tank-driver'){vehicle.controlYaw=vehicle.controlYaw??Math.atan2(vehicle.aim.x,vehicle.aim.z);vehicle.controlPitch=this.mountedViewPitch}if(unit===this.player){this.hud.setTurretMode(role==='tank-driver','tank');this.hud.setVehicleRole?.(role)}return role}
  updateViewModeInput(p){const mounted=Boolean(p.mountedMotorcycle);if(this.input.consume('KeyP')){if(mounted){this.hud.toast('VEHICLES USE THIRD-PERSON · E TO EXIT');return}this.fpsMode=!this.fpsMode;this.hud.toast(this.fpsMode?'FIRST-PERSON MODE ENABLED':'THIRD-PERSON MODE ENABLED');if(!this.fpsMode)this.restoreCrateAndHandsOpacity(p);this.requestMouseCapture()}}
  updatePlayer(dt){if(this.input.consume('Tab')){if(this.player?.mountedTurret||this.player?.mountedBunker||this.player?.mountedMotorcycle)this.exitInteractive(this.player);else this.switchPlayer()}const p=this.player;if(p.dead)return;if(!this.input.mouse.down)this._mouseCaptureClick=false;this.updateViewModeInput(p);p.fireCooldown=Math.max(0,p.fireCooldown-dt);if(p.stun>0){p.stun-=dt;p.group.position.addScaledVector(p.velocity,dt);p.velocity.multiplyScalar(Math.pow(.15,dt));return}
    if(p.mountedTurret){this.updateMountedTurret(p,p.mountedTurret,dt);return}
    if(p.mountedBunker){this.updateMountedBunker(p,p.mountedBunker,dt);return}
    if(p.mountedMotorcycle){this.updateMountedMotorcycle(p,p.mountedMotorcycle,dt);return}
    if(this.input.consume('Digit1'))this.switchWeaponSlot(p,'primary');
    if(this.input.consume('Digit2'))this.switchWeaponSlot(p,'pistol');
    // heal-targeting mode: left-click attaches the wires, Q/right-click cancels
    if(this.healAim){
      if(this.input.consume('KeyQ')||this.input.mouse.rightPressed){this.input.mouse.rightPressed=false;this.setHealAim(false);this.hud.toast('HEAL CANCELLED')}
      else if(this.input.mouse.down){this.input.mouse.down=false;this._suppressFire=true;const t=this.healTargetNearCursor();if(t)this.startHealLink(p,t);else this.hud.toast('NO ALLY UNDER CROSSHAIR',true)}
    }
    if(this.grappleAim){
      if(this.input.mouse.rightPressed){this.input.mouse.rightPressed=false;this.setGrappleAim(false);this.hud.toast('GRAPPLE CANCELLED')}
      else if(this.input.mouse.down){this.input.mouse.down=false;this._suppressFire=true;if(!this.startGrapple(p,this.hoverPoint))this.hud.toast('INVALID GRAPPLE TARGET',true)}
    }
    if(!this.input.mouse.down)this._suppressFire=false;
    const axis=this.input.axis(),speed=p.classDef.speed*(p.statusTimer>0?1.6:1)*(p.rallyTimer>0?1.25:1)*(p.buffs.speed>0?1.55:1)*(p.passive?.id==='swift'?1.15:1)*((p.paceAura||0)>0?1.08:1)*(this.world.isWater(p.group.position)?0.5:1)*(p.carriedCrate?.questHeavy?0.5:1);
    // movement is always camera-relative: W runs toward the crosshair, A/D strafe.
    // screen-right for a camera looking along (sin,0,cos) is (-cos,0,sin).
    const moveYaw = this.fpsYaw || 0;
    const forwardDir = new THREE.Vector3(Math.sin(moveYaw), 0, Math.cos(moveYaw));
    const rightDir = new THREE.Vector3(-Math.cos(moveYaw), 0, Math.sin(moveYaw));
    const moveVec = rightDir.multiplyScalar(axis.x).addScaledVector(forwardDir, -axis.z);
    const targetVelX = moveVec.x * speed;
    const targetVelZ = moveVec.z * speed;
    p.velocity.x=THREE.MathUtils.lerp(p.velocity.x,targetVelX,Math.min(1,dt*14));p.velocity.z=THREE.MathUtils.lerp(p.velocity.z,targetVelZ,Math.min(1,dt*14));p.group.position.x+=p.velocity.x*dt;p.group.position.z+=p.velocity.z*dt;this.world.resolveCollisions(p);
    const ground=this.world.groundAt(p.group.position);p.groundY=ground;
    if (this.world.isWater(p.group.position) && p.group.position.y <= ground + 0.05) {
      if (p.velocity.lengthSq() > 0.5) {
        p.waterWalkTimer = (p.waterWalkTimer || 0) - dt;
        if (p.waterWalkTimer <= 0) {
          this.particles.waterSplash(p.group.position, 2.2, 5, 0.65);
          p.waterWalkTimer = 0.28;
        }
      }
    }
    // One grounded press produces one jump. Crates are stable supports, while a
    // real equipped jetpack can add a short, fuel-limited burn to held Space.
    const under=this.world.crateTopAt(p.group.position),crateSupport=under&&p.group.position.y>=under.top-.2?under.top:null,support=crateSupport===null?ground:Math.max(ground,crateSupport),grounded=p.state==='grounded'&&p.group.position.y<=support+.055;
    const jump=stepJumpState({motion:p.state||'grounded',verticalVelocity:p.verticalVelocity||0,jetpackBurn:p.jetpackBurn||0,mp:p.mp,doubleJumped:p.doubleJumped},{grounded,jumpPressed:this.input.consume('Space'),jumpHeld:this.input.keys.has('Space'),hasJetpack:Boolean(p.jetpack),hasDoubleJump:p.boots==='lemon-quake-boots',blocked:Boolean(p.carriedCrate?.questHeavy),jumpScale:p.passive?.id==='highjumper'?1.4:1},dt);
    p.state=jump.motion;p.verticalVelocity=jump.verticalVelocity;p.jetpackBurn=jump.jetpackBurn;p.jetpackActive=jump.jetpackActive;p.doubleJumped=jump.doubleJumped;p.mp=jump.mp;
    if(jump.jumped){this.audio.play('pickup',jump.secondJumped?2.1:1.6);if(jump.secondJumped){const burst=p.group.position.clone().add(new THREE.Vector3(0,.35,0));this.particles.burst(burst,0xffe337,22,6);this.particles.burst(burst,0x62f577,14,4);this.hud.toast('LEMON-QUAKE BOOST!')}if(this.world.isWater(p.group.position))this.particles.waterSplash(p.group.position,5,12,1.1)}
    if(p.jetpackActive){p.jetpackFxTimer=(p.jetpackFxTimer||0)-dt;if(p.jetpackFxTimer<=0){p.jetpackFxTimer=.055;const exhaust=p.group.position.clone().add(new THREE.Vector3(0,.55,0));this.particles.burst(exhaust,Math.random()>.45?0x55d9ff:0xff9b32,3,1.6)}}
    const before=p.group.position.y;p.group.position.y=THREE.MathUtils.clamp(p.group.position.y+p.verticalVelocity*dt,ground,ground+16);
    if(p.group.position.y<=support&&p.verticalVelocity<=0){
      if(before>support+.4) {
        if (this.world.isWater(p.group.position)) {
          this.particles.waterSplash(p.group.position, 6.0, 18, 1.4);
          this.audio.play('water_splash', p.group.position, .95);
        } else {
          this.particles.impact(p.group.position.clone(),0xd8ccb0);
        }
      }
      p.verticalVelocity=0;p.group.position.y=support;p.state='grounded';p.jetpackActive=false;p.jetpackBurn=0;
    }
    else if(p.group.position.y>support+.055)p.state='airborne';
    this.world.clamp(p.group.position);this.updateAim(dt);if(this.input.mouse.down&&!this._mouseCaptureClick&&!p.carriedCrate&&!this.healAim&&!this._suppressFire&&!p.healPumping){if(this.combat.shoot(p,p.aim)){if(this.save.data.settings.cameraShake)this.camShake=Math.min(1,(this.camShake||0)+.4)}}if(this.input.consume('KeyG'))this.throwGrenade(p);if(this.input.consume('KeyT'))this.dropWeapon(p);if(this.input.consume('KeyQ'))this.useAbility();this.handleInteraction();this.handleMaterialize();if(this.input.mouse.alt){this.issueSquadCommand();this.input.mouse.alt=false}

    if (this.fpsMode && p.carriedCrate) {
      if (this.fpsCrateTransparent !== p.carriedCrate) {
        if (this.fpsCrateTransparent) {
          this.restoreCrateAndHandsOpacity(p);
        }
        this.fpsCrateTransparent = p.carriedCrate;
        this.setHandsAndCrateOpacity(p, 0.45);
      }
    } else {
      if (this.fpsCrateTransparent || !this.fpsMode) {
        this.restoreCrateAndHandsOpacity(p);
        this.fpsCrateTransparent = null;
      }
    }
  }
  handleMaterialize(){if(!this.input.consume('KeyF'))return;const p=this.player;if(p.carriedCrate?.nonMaterializable||p.carriedCrate?.questItem){this.hud.toast('THE SUN CORE CANNOT BE MATERIALIZED',true);return}
    if(this.builder&&this.builder.distanceTo(p.group.position)<4.2){const r=this.builder.manufacture();if(r)return;this.hud.toast('INVALID STACK — CLEAN TOWERS ONLY',true);return}
    // outside a builder: F cracks open a crate for field drops
    const crate=p.carriedCrate||this.nearestLooseCrate(3);if(crate){this.openCrate(crate);if(p.carriedCrate===crate)p.carriedCrate=null;return}
    this.hud.toast('NOTHING TO MATERIALIZE',true)}
  nearestLooseCrate(range){let best=null,dist=range;for(const c of this.world.crates){if(c.carried||c.placed||c.falling)continue;const d=c.group.position.distanceTo(this.player.group.position);if(d<dist){dist=d;best=c}}return best}
  // loose crate materialize: pops open and scatters pickups by rarity
  openCrate(crate,opener=this.player){if(crate?.nonMaterializable||crate?.questItem)return false;const i=this.world.crates.indexOf(crate);if(i<0)return false;this.world.crates.splice(i,1);const type=crate.originalType||crate.crateType,pos=crate.group.position.clone();pos.y=this.world.groundAt(pos);this.audio.play('build');this.particles.burst(pos.clone().add(new THREE.Vector3(0,.8,0)),type.color,26,7);
    this.recordStat(opener.team,'cratesConsumed',1);
    gsap.to(crate.group.scale,{x:1.35,y:1.5,z:1.35,duration:.12,yoyo:true,repeat:1,ease:'power2.out',onComplete:()=>{gsap.to(crate.group.scale,{x:.02,y:.02,z:.02,duration:.2,ease:'back.in(2)',onComplete:()=>this.world.scene.remove(crate.group)})}});
    let count=type.drops+(opener.passive?.id==='packrat'?1:0);
    for(let n=0;n<count;n++){const drop=rollDrop();const offset=new THREE.Vector3((Math.random()-.5)*2.4,0,(Math.random()-.5)*2.4);const pickup=this.factory.createPickup(drop,pos.clone().add(offset));pickup.group.scale.setScalar(.01);gsap.to(pickup.group.scale,{x:1,y:1,z:1,duration:.3,delay:.1+n*.06,ease:'back.out(3)'});this.world.pickups.push(pickup)}
    // rare crates very likely eject a real weapon, its quality scaled by the crate
    const weaponId=rollCrateWeapon(type.id);
    if(weaponId){
      const weapon=buildWeaponVariant(weaponId,[{crateType:type}]);
      const drop={id:'weapon',name:weapon.baseName,weaponId,weapon,color:type.color};
      const pickup=this.factory.createPickup(drop,pos.clone().add(new THREE.Vector3((Math.random()-.5)*2,0,(Math.random()-.5)*2)));
      pickup.group.scale.setScalar(.01);gsap.to(pickup.group.scale,{x:1,y:1,z:1,duration:.35,delay:.15,ease:'back.out(3)'});
      this.world.pickups.push(pickup);
      if(!this.hostile(opener.team,this.playerTeam))this.hud.toast(`${type.name.toUpperCase()} EJECTED A ${weapon.baseName.toUpperCase()}!`);
    }
    return true}
  updatePickups(dt){const collectors=this.combatants.filter(e=>e.type==='unit'&&!e.dead&&!e.mountedTurret&&!e.missionVIP);for(let i=this.world.pickups.length-1;i>=0;i--){const item=this.world.pickups[i];item.life-=dt;item.pickupDelay=Math.max(0,(item.pickupDelay||0)-dt);if(item.pickupDelay>0)continue;let collector=null,best=Infinity;for(const unit of collectors){if(item.drop.id==='weapon'&&item.drop.spent&&(unit.ammo||0)<=0)continue;const range=(unit.magneticGloves?2.6:1.6)*(unit.passive?.id==='scavenger'?2:1),dist=item.group.position.distanceTo(unit.group.position);if(dist<range&&dist<best){best=dist;collector=unit}}if(collector){this.applyDrop(item.drop,collector);this.scene.remove(item.group);this.world.pickups.splice(i,1);this.audio.play('pickup',collector===this.player?1.2:.45);continue}if(item.life<=0){this.scene.remove(item.group);this.world.pickups.splice(i,1)}}}
  applyDrop(drop,unit){switch(drop.id){case 'ammo':unit.ammo=(unit.ammo||0)+40;this.showOverheadIcon(unit,'ammo');break;case 'health':unit.hp=Math.min(unit.maxHp,unit.hp+50);this.showOverheadIcon(unit,'heart');break;case 'mana':unit.mp=Math.min(unit.maxMp,unit.mp+40);this.showOverheadIcon(unit,'mana');break;case 'speed':unit.buffs.speed=drop.duration;break;case 'shield':unit.shield=Math.max(unit.shield,drop.shield);break;case 'damage':unit.buffs.damage=drop.duration;break;case 'rapid':unit.buffs.rapid=drop.duration;break;case 'chips':if(!this.observerOnly&&unit.team===this.playerTeam)this.save.earn(100);break;case 'grenades':unit.grenades=Math.min(2,(unit.grenades||0)+(drop.amount||1));this.showOverheadIcon(unit,'ammo');break;
    case 'weapon':{const weapon=drop.weapon||WEAPONS[drop.weaponId],ammo=drop.droppedWeapon?(unit.ammo||0)+(drop.ammo||0):(unit.ammo||0)+45;if(drop.weaponId==='pistol'){unit.ammo=ammo;this.switchWeaponSlot(unit,'pistol',false)}else this.equipPrimaryWeapon(unit,drop.weaponId,weapon,ammo,weapon.variant?.rank||1);this.showOverheadIcon(unit,'weapon',{weaponId:drop.weaponId,weapon});if(unit.team===this.playerTeam&&unit!==this.player)this.hud.toast(`${unit.classDef?.name.toUpperCase()??'ALLY'} GRABBED A ${(weapon.baseName||weapon.name).toUpperCase()}`);break}}
    if(unit===this.player){this.hud.toast(drop.name.toUpperCase());this.spawnDamageNumber(unit.group.position,drop.name.toUpperCase(),'pickup')}}
  equipPrimaryWeapon(unit,weaponId,weapon=WEAPONS[weaponId],ammo=unit?.ammo??0,tier=weapon?.variant?.rank||0){if(!unit||!weapon||weaponId==='pistol')return false;unit.primaryWeaponId=weaponId;unit.primaryWeapon=weapon;unit.primaryWeaponTier=tier;unit.weaponTier=tier;unit.ammo=Math.max(0,this.debugMode&&unit.team===this.playerTeam?DEBUG_AMMO:ammo);unit.seekingReplacement=false;this.factory.setWeaponModel(unit,weaponId,weapon);return true}
  switchWeaponSlot(unit,slot,notify=unit===this.player){if(!unit)return false;if(slot==='pistol'){if(unit.weaponId===unit.primaryWeaponId){unit.primaryWeapon=unit.weapon;unit.primaryWeaponTier=unit.weaponTier||0}this.factory.setWeaponModel(unit,'pistol',WEAPONS.pistol);unit.weaponTier=0;if(notify)this.hud.toast('PISTOL · INFINITE AMMO');return true}if(slot!=='primary'||!unit.primaryWeaponId||!unit.primaryWeapon){if(notify)this.hud.toast('NO PRIMARY WEAPON',true);return false}if((unit.ammo||0)<=0){if(notify)this.hud.toast('PRIMARY HAS NO AMMO',true);return false}this.factory.setWeaponModel(unit,unit.primaryWeaponId,unit.primaryWeapon);unit.weaponTier=unit.primaryWeaponTier||0;if(notify)this.hud.toast(`${(unit.primaryWeapon.baseName||unit.primaryWeapon.name).toUpperCase()} EQUIPPED`);return true}
  dropWeapon(unit,automatic=false){if(!unit||unit.weaponId==='pistol'||unit.weaponId==='unarmed'){if(!automatic&&unit===this.player)this.hud.toast(unit?.weaponId==='pistol'?'PISTOL CANNOT BE THROWN':'NO WEAPON TO THROW',true);return false}const weaponId=unit.weaponId,weapon=unit.weapon,ammo=Math.max(0,unit.ammo||0),drop={id:'weapon',name:weapon.baseName||weapon.name,weaponId,weapon,ammo,droppedWeapon:true,spent:ammo<=0,color:weapon.rarityColor||0xffd23f},pos=unit.group.position.clone().addScaledVector(unit.aim,1.3);pos.y+=1.1;const pickup=this.factory.createPickup(drop,pos);pickup.physicsActive=true;pickup.pickupDelay=.7;pickup.velocity.copy(unit.aim).multiplyScalar(7);pickup.velocity.y=4.5;pickup.angularVelocity.set(5,7,-4);this.world.pickups.push(pickup);unit.primaryWeaponId=null;unit.primaryWeapon=null;unit.primaryWeaponTier=0;unit.weaponTier=0;unit.ammo=0;unit.seekingReplacement=Boolean(automatic);this.factory.setWeaponModel(unit,'pistol',WEAPONS.pistol);if(unit===this.player)this.hud.toast(automatic?`${drop.name.toUpperCase()} EMPTY · PISTOL DRAWN`:`${drop.name.toUpperCase()} THROWN`);return true}
  updateWeaponFallbacks(){for(const unit of this.combatants||[])if(unit?.type==='unit'&&!unit.dead&&unit.weaponId!=='pistol'&&Number.isFinite(unit.ammo)&&unit.ammo<=0)this.dropWeapon(unit,true)}
  throwGrenade(unit){if(!unit||unit.mountedTurret)return false;if((unit.grenades||0)<=0){this.hud.toast('NO GRENADES · FIND THEM IN CRATES',true);return false}unit.grenades--;
    const group=new THREE.Group(),body=createGrenadeModel(1.55);group.add(body);
    group.position.copy(unit.group.position).addScaledVector(unit.aim,1);group.position.y+=1.1;this.scene.add(group);const velocity=unit.aim.clone().multiplyScalar(18);velocity.y+=4;this.thrownGrenades.push({group,body,velocity,source:unit,weapon:{...WEAPONS.grenade,damage:110,knockback:28,projectileScale:1.55}});this.particles.muzzleFlash?.(group.position,velocity.clone().normalize(),WEAPONS.grenade);this.audio.play('pickup',1.7);this.hud.toast(`IMPACT GRENADE OUT · ${unit.grenades}/2 LEFT`);return true}
  updateThrownGrenades(dt){for(let i=this.thrownGrenades.length-1;i>=0;i--){const g=this.thrownGrenades[i],previous=g.group.position.clone(),gravity=18*(50/g.weapon.shotPower);g.group.position.addScaledVector(g.velocity,dt);g.group.position.y-=.5*gravity*dt*dt;g.velocity.y-=gravity*dt;g.body.rotation.x+=dt*8;g.body.rotation.z+=dt*11;const probe={shooter:g.source,weapon:g.weapon,mine:false,velocity:g.velocity},impact=this.combat.findImpact(probe,previous,g.group.position);if(!impact)continue;const pos=impact.point.clone();this.scene.remove(g.group);if(impact.reason==='bounds')this.particles.impact(pos,g.weapon.color,{kind:'boundary',normal:impact.normal,surface:'boundary'});else{this.combat.radial(pos,8,110,g.source,28);this.particles.impact(pos,0xff5a24,{kind:'explosive',normal:impact.normal,surface:impact.surface});this.particles.burst(pos,0xff5a24,90,22);this.particles.burst(pos,0x555866,70,15);this.particles.burst(pos,0xffd23f,40,28);const s=this.toScreen(pos);if(s)this.hud.burstingText(s.x,s.y,Math.random()>.5?'KABOOM!':'BAMMM!');this.audio.play('explosion',1.8)}this.thrownGrenades.splice(i,1)}}
  nearestInteractive(unit,range=4){let best=null,d=range;const all=[...Object.values(this.world.baseTurrets||{}),...(this.world.interactiveStructures||[]),...(this.world.motorcycles||[]),...(this.world.cars||[]),...(this.world.vehicles||[])];for(const e of all){if(e.dead)continue;const available=e.type==='turret'?(!e.rider&&e.team===unit.team):e.type==='bunker'?(e.occupants.length<e.capacity):Array.isArray(e.passengers)?(!e.driver||(e.passengers.length<e.capacity-1&&e.driver.team===unit.team)):(!e.driver||(!e.passenger&&e.driver.team===unit.team));if(!available)continue;const dist=e.group.position.distanceTo(unit.group.position);if(dist<d){d=dist;best=e}}return best}
  mountTurret(unit,turret){if(!unit||!turret||turret.rider||turret.dead)return false;turret.rider=unit;unit.mountedTurret=turret;unit.velocity.set(0,0,0);unit.group.visible=false;turret.controlYaw=Math.atan2(turret.aim.x,turret.aim.z);turret.controlPitch=Math.asin(turret.aim.y);if(unit===this.player){this.turretLockTarget=null;this.lockTarget=null;this.seedLookFromAim?.(turret.aim);this.hud.setTurretMode(true);this.hud.toast('ARMORED TURRET · CROSSHAIR GUNNERY · RMB LOCK · E EXIT')}return true}
  mountBunker(unit,bunker){if(!unit||!bunker||bunker.dead||bunker.occupants.length>=bunker.capacity)return false;bunker.occupants.push(unit);unit.mountedBunker=bunker;unit.velocity.set(0,0,0);unit.group.visible=false;if(unit===this.player){this.lockTarget=null;this.seedLookFromAim?.(unit.aim);this.hud.setTurretMode(true,'bunker');this.hud.toast(`BUNKER FIRING PORT ${bunker.occupants.length}/3 · E EXIT`)}return true}
  mountMotorcycle(unit,bike){if(!unit||!bike||bike.dead)return false;let role='driver';if(!bike.driver)bike.driver=unit;else if(Array.isArray(bike.passengers)&&bike.passengers.length<(bike.capacity||2)-1&&bike.driver.team===unit.team){bike.passengers.push(unit);role='passenger'}else if(!bike.passenger&&bike.driver.team===unit.team){bike.passenger=unit;role='passenger'}else return false;bike.team=unit.team;unit.mountedMotorcycle=bike;unit.motorcycleRole=role;unit.velocity.set(0,0,0);if(bike.vehicleKind==='tank'&&role==='driver'){bike.controlYaw=Math.atan2(bike.aim.x,bike.aim.z);bike.controlPitch=Math.asin(bike.aim.y)}if(unit===this.player){this.preMountFpsMode=false;this.fpsMode=false;this.mountedControlRole=null;this.syncMountedView(unit,bike);this.turretLockTarget=null;this.lockTarget=null;this.fpsYaw=bike.group.rotation.y;this.fpsPitch=-.08;this.hud.setTurretMode(this.mountedRole(unit,bike)==='tank-driver','tank');const mountedRole=this.mountedRole(unit,bike);this.hud.toast(mountedRole==='tank-driver'?`${bike.name.toUpperCase()} · WASD HULL · CROSSHAIR TURRET · LMB CANNON · E EXIT`:mountedRole==='driver'?`${bike.name.toUpperCase()} · W/S THROTTLE · A/D STEER · E EXIT`:mountedRole==='motorcycle-backrider'?'MOTORCYCLE BACKRIDER · CROSSHAIR FIRE · E EXIT':`${bike.name.toUpperCase()} PASSENGER · THIRD-PERSON VIEW · E EXIT`)}return true}
  exitInteractive(unit,forced=false){if(!unit)return false;const carrier=unit.mountedTurret||unit.mountedBunker||unit.mountedMotorcycle;if(!carrier)return false;const wasVehicle=Boolean(unit.mountedMotorcycle);if(unit.mountedTurret)carrier.rider=null;if(unit.mountedBunker)carrier.occupants=carrier.occupants.filter(u=>u!==unit);if(unit.mountedMotorcycle){if(Array.isArray(carrier.passengers)){if(carrier.driver===unit){carrier.driver=carrier.passengers.shift()||null;if(carrier.driver)carrier.driver.motorcycleRole='driver'}else carrier.passengers=carrier.passengers.filter(u=>u!==unit)}else if(carrier.driver===unit){carrier.driver=null;if(carrier.passenger){carrier.driver=carrier.passenger;carrier.driver.motorcycleRole='driver';carrier.passenger=null}}else if(carrier.passenger===unit)carrier.passenger=null}unit.mountedTurret=null;unit.mountedBunker=null;unit.mountedMotorcycle=null;unit.motorcycleRole=null;unit.group.visible=true;const side=new THREE.Vector3(carrier.aim?.z||1,0,-(carrier.aim?.x||0));unit.group.position.copy(carrier.group.position).addScaledVector(side,(carrier.radius||1)+1.2);unit.group.position.y=this.world.groundAt(unit.group.position);if(unit===this.player){this.turretLockTarget=null;this.mountedControlRole=null;this.mountedViewYaw=0;this.mountedViewPitch=0;if(wasVehicle){this.fpsMode=false;this.preMountFpsMode=false}this.seedLookFromAim?.(unit.aim);this.hud.setTurretMode(false);this.hud.setVehicleRole?.('none');if(!forced)this.hud.toast('EXITED')}return true}
  exitTurret(unit,forced=false){return this.exitInteractive(unit,forced)}
  updateMountedTurret(unit,turret,dt){this.hud.prompt('');if(turret.dead){this.exitInteractive(unit,true);return}unit.group.position.copy(turret.group.position).setY(turret.group.position.y+2.45);turret.fireCooldown=Math.max(0,turret.fireCooldown-dt);this.updateTurretAim(turret,60,dt);if(this.input.consume('KeyE')){this.exitInteractive(unit);return}if(turret.reloadTimer>0){turret.reloadTimer=Math.max(0,turret.reloadTimer-dt);if(turret.reloadTimer===0){turret.ammo=turret.magazineSize;this.hud.toast('TURRET RELOADED')}}else if(this.input.mouse.down&&!turret.critical){if(turret.ammo<=0){turret.reloadTimer=2;this.hud.toast('RELOADING · 2s')}else this.combat.shoot(turret,turret.aim)}if(turret.ammo<=0&&turret.reloadTimer<=0)turret.reloadTimer=2}
  updateMountedBunker(unit,bunker,dt){this.hud.prompt('');if(bunker.dead){this.exitInteractive(unit,true);return}const slot=Math.max(0,bunker.occupants.indexOf(unit));unit.group.position.copy(bunker.group.position).add(bunker.slots[slot]||bunker.slots[0]);unit.fireCooldown=Math.max(0,unit.fireCooldown-dt);this.updateTurretAim(unit,45,dt);if(this.input.consume('KeyE')){this.exitInteractive(unit);return}if(this.input.mouse.down&&unit.weaponId!=='unarmed')this.combat.shoot(unit,unit.aim)}
  updateMountedMotorcycle(unit,bike,dt){this.hud.prompt('');if(bike.dead){this.exitInteractive(unit,true);return}if(this.input.consume('KeyE')){this.exitInteractive(unit);return}const role=this.syncMountedView(unit,bike),axis=this.input.axis();if(role==='tank-driver'){bike.throttle=-axis.z;bike.playerSteer=axis.x;bike.fireCooldown=Math.max(0,bike.fireCooldown-dt);this.updateTurretAim(bike,bike.weapon?.effectiveRange||60,dt);if(this.input.mouse.down)this.combat.shoot(bike,bike.aim);return}if(role==='driver'){bike.throttle=-axis.z;bike.playerSteer=axis.x;this.updateTurretAim(unit,45,dt);return}this.updateTurretAim(unit,45,dt);unit.fireCooldown=Math.max(0,unit.fireCooldown-dt);if(role==='motorcycle-backrider'&&this.input.mouse.down&&unit.weaponId!=='unarmed')this.combat.shoot(unit,unit.aim)}
  // mounted-platform aim: the shoulder camera turns with the mouse and the gun
  // tracks whatever sits under the centered crosshair (or the locked target)
  updateTurretAim(platform,range=60,dt=.016){this.ballisticOutOfRange=false;const sensitivity=.0022*(this.save?.data?.settings?.mouseSensitivity??1);
    const mouseMoved=Boolean(this.input.mouse.dx||this.input.mouse.dy),mobileMoved=Boolean(this.input.mobile&&this.input.aimAxis&&(this.input.aimAxis.x||this.input.aimAxis.y));
    this.fpsYaw=(this.fpsYaw??Math.atan2(platform.aim.x,platform.aim.z))-this.input.mouse.dx*sensitivity;
    this.fpsPitch=THREE.MathUtils.clamp((this.fpsPitch||0)-this.input.mouse.dy*sensitivity,THREE.MathUtils.degToRad(-38),THREE.MathUtils.degToRad(58));
    if(mobileMoved){
      this.fpsYaw-=this.input.aimAxis.x*dt*2.4;
      this.fpsPitch=THREE.MathUtils.clamp(this.fpsPitch+this.input.aimAxis.y*dt*1.8,THREE.MathUtils.degToRad(-38),THREE.MathUtils.degToRad(58));
    }
    const originY=platform.type==='turret'?2.55:platform.type==='vehicle'?2.2:1.4,origin=platform.group.position.clone().add(new THREE.Vector3(0,originY,0));
    if(this.turretLockTarget&&(this.turretLockTarget.dead||this.turretLockTarget.group.position.distanceTo(origin)>range))this.turretLockTarget=null;
    if(this.input.mouse.rightPressed){this.turretLockTarget=this.turretLockTarget?null:this.enemyNearCursor();if(this.turretLockTarget)this.hud.lockPulse()}
    let targetPoint;
    if(this.turretLockTarget)targetPoint=this.turretLockTarget.group.position.clone().add(new THREE.Vector3(0,1.1,0));
    // updateHover runs after player input, so its point belongs to the previous
    // camera angle. While the view is moving, aim from the fresh mouse angles
    // instead of letting that stale point pull the gun away from the reticle.
    else if(!mouseMoved&&!mobileMoved)targetPoint=stableCrosshairPoint(this,origin,new THREE.Vector3(Math.sin(this.fpsYaw)*Math.cos(this.fpsPitch),Math.sin(this.fpsPitch),Math.cos(this.fpsYaw)*Math.cos(this.fpsPitch)),AIM_CONVERGENCE.mounted);
    else targetPoint=origin.clone().add(new THREE.Vector3(Math.sin(this.fpsYaw)*Math.cos(this.fpsPitch),Math.sin(this.fpsPitch),Math.cos(this.fpsYaw)*Math.cos(this.fpsPitch)).multiplyScalar(range));
    if(!targetPoint)targetPoint=origin.clone().add(new THREE.Vector3(Math.sin(this.fpsYaw)*Math.cos(this.fpsPitch),Math.sin(this.fpsPitch),Math.cos(this.fpsYaw)*Math.cos(this.fpsPitch)).multiplyScalar(range));
    const solved=this.turretLockTarget?this.combat.ballisticDirectionFor?.(platform,this.turretLockTarget):this.combat.ballisticDirectionTo?.(platform,targetPoint),raw=solved||targetPoint.sub(origin);this.ballisticOutOfRange=!solved;if(raw.lengthSq()<.01)return;raw.normalize();const yaw=Math.atan2(raw.x,raw.z),pitch=THREE.MathUtils.clamp(Math.asin(raw.y),THREE.MathUtils.degToRad(-35),THREE.MathUtils.degToRad(55));platform.controlYaw=yaw;platform.controlPitch=pitch;platform.aim.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).normalize();platform.aimPitch=pitch;if(platform.head)platform.head.rotation.y=platform.type==='vehicle'?yaw-platform.group.rotation.y:yaw;for(const barrel of platform.barrels||[])barrel.rotation.x=Math.PI/2-pitch;if(platform===this.player)this.player.group.rotation.y=yaw}
  updateMotorcycles(dt){
    for(const bike of [...(this.world.motorcycles||[]),...(this.world.cars||[]),...(this.world.vehicles||[])]){
      if(bike.dead)continue;
      const forward=new THREE.Vector3(Math.sin(bike.group.rotation.y),0,Math.cos(bike.group.rotation.y));
      if(bike.aiDirection){const desired=Math.atan2(bike.aiDirection.x,bike.aiDirection.z),delta=Math.atan2(Math.sin(desired-bike.group.rotation.y),Math.cos(desired-bike.group.rotation.y));bike.group.rotation.y+=THREE.MathUtils.clamp(delta,-bike.turnSpeed*dt,bike.turnSpeed*dt)}
      else bike.group.rotation.y-=(bike.playerSteer||0)*bike.turnSpeed*dt*(bike.throttle>=0?1:-1);
      forward.set(Math.sin(bike.group.rotation.y),0,Math.cos(bike.group.rotation.y));if(bike.type!=='vehicle')bike.aim.copy(forward);
      const targetSpeed=(bike.throttle||0)*bike.speed;bike.velocity.lerp(forward.clone().multiplyScalar(targetSpeed),Math.min(1,dt*4));bike.group.position.addScaledVector(bike.velocity,dt);const collisionCount=this.world.resolveCollisions(bike)||0;bike.aiCollisionFrames=collisionCount?Math.min(10,(bike.aiCollisionFrames||0)+1):Math.max(0,(bike.aiCollisionFrames||0)-1);if(collisionCount)bike.velocity.multiplyScalar(.45);this.world.clamp(bike.group.position);bike.group.position.y=this.world.groundAt(bike.group.position);
      bike.wheelSpin+=bike.velocity.length()*dt/.48;for(const w of bike.wheels)w.rotation.x=bike.wheelSpin;
      const riders=Array.isArray(bike.passengers)?[[bike.driver,.62],...bike.passengers.map((u,i)=>[u,i ? .05 : -.55])]:[[bike.driver,.1],[bike.passenger,-.78]];
      for(const [u,z] of riders){if(!u)continue;u.group.visible=bike.type==='motorcycle';u.group.position.copy(bike.group.position).addScaledVector(forward,z);u.group.position.y+=1.1;u.group.rotation.y=bike.group.rotation.y}
      bike.throttle*=Math.pow(.18,dt);bike.playerSteer=0;bike.aiDirection=null;
    }
  }
  updateBaseTurrets(dt){for(const turret of Object.values(this.world.baseTurrets||{})){if(turret.dead)continue;if(!turret.critical){turret.warning.visible=false;continue}turret.explosionTimer=Math.max(0,turret.explosionTimer-dt);const ctx=turret.warningContext,c=turret.warningCanvas;ctx.clearRect(0,0,c.width,c.height);ctx.textAlign='center';ctx.font='900 72px Impact, sans-serif';ctx.lineWidth=14;ctx.strokeStyle='#151a38';ctx.strokeText('GET OUT!!!',256,72);ctx.fillStyle=Math.sin(this.elapsed*14)>0?'#ff3045':'#ffd23f';ctx.fillText('GET OUT!!!',256,72);ctx.font='900 64px Impact, sans-serif';ctx.strokeText(turret.explosionTimer.toFixed(1),256,152);ctx.fillStyle='#fff';ctx.fillText(turret.explosionTimer.toFixed(1),256,152);turret.warningTexture.needsUpdate=true;turret.warning.visible=true;turret.warning.position.y=5.7+Math.abs(Math.sin(this.elapsed*7))*.6;
      if(turret.explosionTimer<=0){const pos=turret.group.position.clone();const rider=turret.rider;if(rider)this.exitTurret(rider,true);turret.dead=true;turret.warning.visible=false;this.triggerDeathExplosion(turret,pos,10,135,32);this.particles.burst(pos.clone().add(new THREE.Vector3(0,2,0)),0xff4a24,120,26);this.particles.burst(pos.clone().add(new THREE.Vector3(0,2,0)),0x444854,80,18);this.handleDeath(turret,turret.lastDamageSource)}}}
  updateWildlife(dt){const combatants=this.combatants.filter(e=>!e.dead);for(const w of this.world.wildlife){if(w.dead)continue;w.attackCooldown=Math.max(0,w.attackCooldown-dt);w.decisionTimer-=dt;let target=null;if(w.kind==='wolf'||w.kind==='bear'){let best=Infinity;for(const e of combatants){const d=e.group.position.distanceToSquared(w.group.position);if(d<best){best=d;target=e}}const bear=w.kind==='bear',aggro=bear?196:100;if(target&&best<aggro){const dir=target.group.position.clone().sub(w.group.position).setY(0),dist=dir.length();dir.normalize();w.velocity.lerp(dir.multiplyScalar(w.speed),dt*(bear?2.8:4));w.aim.copy(dir);if(dist<(bear?2.05:1.35)&&w.attackCooldown<=0){this.combat.applyDamage(target,bear?22:9,w,dir,bear?5:2);w.attackCooldown=bear?1.15:.8}}else target=null}else if(w.kind==='slime'){let best=Infinity;for(const c of this.world.crates){if(c.carried||c.placed||c.falling)continue;const d=c.group.position.distanceToSquared(w.group.position);if(d<best){best=d;target=c}}if(target){const dir=target.group.position.clone().sub(w.group.position).setY(0),dist=dir.length();dir.normalize();w.velocity.lerp(dir.multiplyScalar(w.speed),dt*3);if(dist<1.1){this.scene.remove(target.group);this.world.crates.splice(this.world.crates.indexOf(target),1);target=null}}}if(!target){if(w.decisionTimer<=0){w.decisionTimer=1.5+Math.random()*2;w.wanderAngle+=(Math.random()-.5)*2.4}w.velocity.lerp(new THREE.Vector3(Math.sin(w.wanderAngle),0,Math.cos(w.wanderAngle)).multiplyScalar(w.speed*.45),dt*2)}w.group.position.addScaledVector(w.velocity,dt);this.world.clamp(w.group.position);w.group.position.y=this.world.groundAt(w.group.position);if(w.velocity.lengthSq()>.05)w.group.rotation.y=Math.atan2(w.velocity.x,w.velocity.z);if(w.kind==='slime')w.group.scale.y=.92+Math.sin(this.elapsed*7+w.wanderAngle)*.08}}
  updateObjective(dt){if(this.mission.type!=='capture')return;const near=list=>list.filter(e=>!e.dead&&e.group.position.distanceTo(this.world.cavePosition)<6).length,blue=near(this.allies),red=near(this.enemies);if(blue>red&&blue>0)this.objectiveProgress=Math.min(this.mission.duration,this.objectiveProgress+dt);else this.objectiveProgress=Math.max(0,this.objectiveProgress-dt*.35);this.world.caveRing.material.color.setHex(blue>red&&blue>0?0x4cff8a:red>blue?0xff4b55:0x5bd9ff);this.hud.el.objective.textContent=`Hold the mineral cave · ${Math.ceil(this.mission.duration-this.objectiveProgress)}s`;if(this.objectiveProgress>=this.mission.duration)this.endMission(true)}
  configureModeHud(){
    const root=document.getElementById('domination-hud'),boss=document.getElementById('boss-panel'),timer=document.getElementById('sudden-death-timer');
    document.body.classList.toggle('domination-mode',this.gameMode==='domination');
    if(this.gameMode!=='domination'){root?.classList.add('hidden');boss?.classList.remove('hidden');return;}
    boss?.classList.add('hidden');timer?.classList.add('hidden');root?.classList.remove('hidden');
    const scores=document.getElementById('domination-scores');if(scores)scores.innerHTML=this.teams.map(t=>`<div class="dom-team" data-dom-team="${t.id}" style="--team:${hex(t.color)}"><span>${escapeHtml(t.name).toUpperCase()}</span><strong>0</strong><i></i></div>`).join('');
    const towers=document.getElementById('domination-towers');if(towers)towers.innerHTML=this.world.dominationTowers.map(t=>`<div class="dom-tower" data-dom-tower="${t.id}"><b>${t.label}</b><span><i></i></span><small>NEUTRAL</small></div>`).join('');
  }
  dominationAnnouncement(kicker,title,subtitle,color=0xffffff){const el=document.getElementById('domination-announcement');if(!el)return;el.querySelector('span').textContent=kicker;el.querySelector('strong').textContent=title;el.querySelector('small').textContent=subtitle;el.style.setProperty('--announce',hex(color));el.classList.remove('hidden');gsap.fromTo(el,{scale:.35,rotation:-3,opacity:0},{scale:1,rotation:0,opacity:1,duration:.55,ease:'back.out(2.4)'});clearTimeout(this._dominationAnnouncementTimer);this._dominationAnnouncementTimer=setTimeout(()=>el.classList.add('hidden'),2600)}
  updateDomination(dt){
    if(!this.domination||(this.state!=='mission'&&this.state!=='observer'))return;
    const events=this.domination.update(dt,this.combatants);
    for(const event of events){
      if(event.type==='capture-start'&&event.teamId===this.playerTeam)this.audio.play('pickup',.55);
      if(event.type==='captured'){
        const team=this.teamMap[event.teamId],color=team?.color||0xffffff,tower=event.tower;for(const mat of [tower.pedestalMat,tower.spireMat]){mat.color.setHex(color);mat.emissive.setHex(team?.dark||color);mat.emissiveIntensity=.75;}for(const mat of tower.squareMats||[])mat.color.setHex(color);tower.beamMat.color.setHex(color);tower.visualColor=color;tower.captureFlash=1;
        const towerHud=document.querySelector(`[data-dom-tower="${tower.id}"]`);if(towerHud){towerHud.style.setProperty('--tower',hex(color));towerHud.classList.remove('capturing','captured');void towerHud.offsetWidth;towerHud.classList.add('captured');setTimeout(()=>towerHud.classList.remove('captured'),900);}
        this.particles.burst(tower.position.clone().add(new THREE.Vector3(0,2,0)),color,110,18);this.particles.burst(tower.position.clone().add(new THREE.Vector3(0,9,0)),0xffe66c,70,14);this.audio.play('build',tower.position,1.5);this.dominationAnnouncement(event.previousTeam?'TOWER FLIPPED':'TOWER AWAKENED',`${team.name.toUpperCase()} CLAIMS ${tower.label}`,event.previousTeam?'The old banner is down. The point surge begins!':'A neutral relic now fights for the team.',color);
      }
      if(event.type==='victory')this.startVictorySequence(this.teamMap[event.teamId]);
    }
    const roundedSecond=Math.floor(this.elapsed*4);if(roundedSecond===this.dominationHudSecond)return;this.dominationHudSecond=roundedSecond;
    for(const team of this.teams){const row=document.querySelector(`[data-dom-team="${team.id}"]`),score=Math.floor(this.domination.scores[team.id]);if(row){row.querySelector('strong').textContent=score;row.querySelector('i').style.width=`${score/this.domination.maxScore*100}%`;}}
    for(const tower of this.world.dominationTowers){const row=document.querySelector(`[data-dom-tower="${tower.id}"]`),team=this.teamMap[tower.ownerTeam],capturer=this.teamMap[tower.captureTeam],visual=capturer||team,visualColor=visual?.color||0x111725;tower.visualColor=visualColor;for(const mat of tower.squareMats||[])mat.color.setHex(visualColor);tower.beamMat.color.setHex(visualColor);if(!row)continue;row.style.setProperty('--tower',team?hex(team.color):'#090b10');row.style.setProperty('--capturing',capturer?hex(capturer.color):'#fff');row.classList.toggle('contested',tower.contested);row.classList.toggle('capturing',Boolean(capturer)&&!tower.contested);row.querySelector('small').textContent=tower.contested?'CONTESTED':capturer?`UNDER CAPTURE · ${Math.ceil(CAPTURE_SECONDS-tower.captureProgress)}s`:team?team.name.toUpperCase():'NEUTRAL';row.querySelector('i').style.width=`${tower.captureProgress/CAPTURE_SECONDS*100}%`;}
    const nearby=this.world.dominationTowers.find(t=>this.player&&!this.player.dead&&Math.hypot(this.player.group.position.x-t.position.x,this.player.group.position.z-t.position.z)<t.radius+2);this.hud.el.objective.textContent=nearby?(nearby.contested?`${nearby.label} CONTESTED · clear the pedestal`:nearby.ownerTeam===this.playerTeam?`${nearby.label} SECURED · +1 point/sec`:`Capturing ${nearby.label} · ${Math.ceil(CAPTURE_SECONDS-nearby.captureProgress)}s`):`Capture towers · first to ${this.domination.maxScore}`;
    const ranking=[...this.teams].sort((a,b)=>this.domination.scores[b.id]-this.domination.scores[a.id]),leader=ranking[0],leadScore=this.domination.scores[leader.id],runner=this.domination.scores[ranking[1]?.id]||0;if(leadScore>=10&&leadScore-runner>=5&&this.dominationLead!==leader.id){this.dominationLead=leader.id;this.dominationAnnouncement('MOMENTUM SHIFT',`${leader.name.toUpperCase()} TAKES THE LEAD`,`${Math.floor(leadScore)} / ${this.domination.maxScore} · hunt their towers now`,leader.color);}
  }
  // aim: shoulder-cam mouse look — the reticle stays screen-centered and the
  // camera turns with the mouse; right-click snaps the aim onto a locked target
  updateAim(dt){const p=this.player;this.ballisticOutOfRange=false;const sensitivity=.0022*(this.save?.data?.settings?.mouseSensitivity??1);
    // updateHover runs at the end of the previous frame, so while the view is turning
    // its point is stale — aim along the fresh look ray instead (same rule as turrets)
    const mouseMoved=Boolean(this.input.mouse.dx||this.input.mouse.dy),mobileMoved=Boolean(this.input.mobile&&this.input.aimAxis&&(this.input.aimAxis.x||this.input.aimAxis.y));
    if (this.fpsMode) {
      this.fpsYaw = (this.fpsYaw || 0) - this.input.mouse.dx * sensitivity;
      this.fpsPitch = THREE.MathUtils.clamp((this.fpsPitch || 0) - this.input.mouse.dy * sensitivity, -Math.PI / 2.1, Math.PI / 2.1);

      const look = new THREE.Vector3(
        Math.sin(this.fpsYaw) * Math.cos(this.fpsPitch),
        Math.sin(this.fpsPitch),
        Math.cos(this.fpsYaw) * Math.cos(this.fpsPitch)
      );
      // fire toward the point under the reticle with ballistic compensation; the FPS
      // camera follows lookDirection(), so a compensated aim never tilts the view
      const eye=p.group.position.clone().add(new THREE.Vector3(0,1.62,0));
      const targetPoint=(!mouseMoved&&!mobileMoved&&stableCrosshairPoint(this,eye,look,AIM_CONVERGENCE.firstPerson))||eye.clone().addScaledVector(look,Math.max(60,p.weapon?.effectiveRange||45));
      const solved=this.combat?.ballisticDirectionTo?.(p,targetPoint);
      if(solved)p.aim.copy(solved).normalize();
      else{const muzzle=this.combat?.muzzlePosition?.(p,0,new THREE.Vector3())||eye,dir=targetPoint.sub(muzzle);p.aim.copy(dir.lengthSq()>.01?dir.normalize():look)}
      p.group.rotation.y = this.fpsYaw;
      p.headPitch = -this.fpsPitch;
      return;
    }
    this.fpsYaw=(this.fpsYaw||0)-this.input.mouse.dx*sensitivity;
    this.fpsPitch=THREE.MathUtils.clamp((this.fpsPitch||0)-this.input.mouse.dy*sensitivity,-1.08,1.25);
    if(this.input.mobile&&this.input.aimAxis&&(this.input.aimAxis.x||this.input.aimAxis.y)){
      this.fpsYaw-=this.input.aimAxis.x*dt*2.4;
      this.fpsPitch=THREE.MathUtils.clamp(this.fpsPitch+this.input.aimAxis.y*dt*1.8,-1.08,1.25);
    }
    const look=new THREE.Vector3(Math.sin(this.fpsYaw)*Math.cos(this.fpsPitch),Math.sin(this.fpsPitch),Math.cos(this.fpsYaw)*Math.cos(this.fpsPitch));
    const lockRange=p.weapon?.effectiveRange||45;if(this.lockTarget&&(this.lockTarget.dead||this.lockTarget.group.position.distanceTo(p.group.position)>lockRange)){this.lockTarget=null;this.hud.toast('LOCK LOST',true)}
    if(this.input.mouse.rightPressed){
      if(this.lockTarget){
        this.lockTarget=null;
        this.rightLockDone=true;
        this.audio.play('pickup',0.8);
        this.hud.toast('LOCK RELEASED');
      } else {
        const hoverLockable=this.hoverEntity&&this.isLockable(this.hoverEntity);
        const target=hoverLockable?this.hoverEntity:this.enemyNearCursor();
        if(target){
          this.lockTarget=target;
          this.rightLockDone=true;
          this.audio.play('pickup',1.8);
          this.hud.lockPulse();
        } else {
          this.hud.toast('NO TARGET NEAR CROSSHAIR',true);
        }
      }
    }
    if(!this.input.mouse.right)this.rightLockDone=false;
    if(this.lockTarget){
      const targetPos=this.lockTarget.group.position.clone(),targetHeight=targetPos.y+(this.lockTarget.type==='unit'?1.2:1),solved=this.combat?.ballisticDirectionFor?.(p,this.lockTarget);
      this.ballisticOutOfRange=!solved;const dir=solved||new THREE.Vector3(targetPos.x,targetHeight,targetPos.z).sub(this.combat?.muzzlePosition?.(p,0,new THREE.Vector3())||new THREE.Vector3(p.group.position.x,p.group.position.y+1.35,p.group.position.z));
      if(dir.lengthSq()>.01)p.aim.copy(dir.normalize());
    }
    else{
      // exact crosshair convergence: solve from the muzzle (where the round actually
      // spawns) to the point under the reticle, so the shot lands on the crosshair.
      // No smoothing on the fired direction — lag here is a guaranteed miss.
      let targetPoint=(!mouseMoved&&!mobileMoved)?stableCrosshairPoint(this,this.combat?.muzzlePosition?.(p,0,new THREE.Vector3())||new THREE.Vector3(p.group.position.x,p.group.position.y+1.35,p.group.position.z),look,AIM_CONVERGENCE.shoulder):null;
      const hovered=Boolean(targetPoint);
      if(!targetPoint){
        // nothing (fresh) under the reticle: aim at a far point on the exact crosshair
        // ray, reconstructed from the shoulder-camera pivot (same rig as updateCamera)
        const yaw=this.fpsYaw||0,right=new THREE.Vector3(-Math.cos(yaw),0,Math.sin(yaw));
        targetPoint=p.group.position.clone().add(new THREE.Vector3(0,2.05,0)).addScaledVector(right,.85).addScaledVector(look,Math.max(60,p.weapon?.effectiveRange||45));
      }
      const solved=this.combat?.ballisticDirectionTo?.(p,targetPoint);
      if(hovered)this.ballisticOutOfRange=!solved;
      const dir=solved||targetPoint.sub(this.combat?.muzzlePosition?.(p,0,new THREE.Vector3())||new THREE.Vector3(p.group.position.x,p.group.position.y+1.35,p.group.position.z));
      if(dir.lengthSq()>.01)p.aim.copy(dir.normalize());else p.aim.copy(look);
    }
    p.headPitch=-Math.asin(THREE.MathUtils.clamp(p.aim.y,-1,1))*.55;
    p.group.rotation.y=Math.atan2(p.aim.x,p.aim.z)}
  isLockable(e){if(!e||e.dead)return false;if(e.type==='prop'||e.type==='wildlife')return true;if(e.type==='bunker')return e.occupants?.some(u=>this.hostile(this.playerTeam,u.team));return e.team&&e.team!=='neutral'&&this.hostile(this.playerTeam,e.team)}
  lockCandidates(){const list=this.enemies.filter(e=>!e.dead);for(const tid of Object.keys(this.world.factories)){const f=this.world.factories[tid];if(!f.dead&&this.hostile(this.playerTeam,tid))list.push(f)}for(const w of this.world.wildlife)if(!w.dead)list.push(w);for(const d of this.world.destructibles)if(!d.dead)list.push(d);for(const b of this.world.interactiveStructures||[])if(this.isLockable(b))list.push(b);for(const m of [...(this.world.motorcycles||[]),...(this.world.cars||[])])if(this.isLockable(m))list.push(m);return list}
  enemyNearCursor(x=innerWidth/2,y=innerHeight/2){let best=null,bestD=170;for(const e of this.lockCandidates()){const s=this.toScreen(e.group.position);if(!s)continue;const d=Math.hypot(s.x-x,s.y-y);if(d<bestD){bestD=d;best=e}}return best}
  toScreen(position){
    if (!this._toScreenVec) {
      this._toScreenVec = new THREE.Vector3();
      this._toScreenOffsetVec = new THREE.Vector3(0, 1.6, 0);
    }
    const v = this._toScreenVec.copy(position).add(this._toScreenOffsetVec).project(this.camera);
    if(v.z>1)return null;
    return{x:(v.x+1)/2*innerWidth,y:(1-v.y)/2*innerHeight}
  }
  // cursor raycast: crosshair goes red over enemies; when locked it clamps onto the target
  updateHover(){
    this._hoverFrame = (this._hoverFrame || 0) + 1;
    if (this._hoverFrame % 2 !== 0) return; // Throttle check to every 2 frames
    const rect=this.renderer.domElement.getBoundingClientRect();
    if (!this._hoverMouse) {
      this._hoverMouse = new THREE.Vector2();
      this._hoverRaycaster = new THREE.Raycaster();
    }
    // the reticle is pinned to screen center: everything is picked along the camera's forward ray
    const pointerX=rect.left+rect.width/2,pointerY=rect.top+rect.height/2;
    this._hoverMouse.set((pointerX-rect.left)/rect.width*2-1,-((pointerY-rect.top)/rect.height)*2+1);
    this._hoverRaycaster.setFromCamera(this._hoverMouse,this.camera);
    // Keep the sample tied to the view which produced it. updateHover is
    // intentionally throttled, so an old near hit must not be reused after a
    // quick mouse turn on the skipped frame.
    this._hoverViewYaw=this.fpsYaw||0;
    this._hoverViewPitch=this.fpsPitch||0;
    // ignore hits between the shoulder camera and the player (walls behind the character)
    const minHitDist=(!this.fpsMode&&this.camera?.position&&this.player?.group)?this.camera.position.distanceTo(this.player.group.position)*.82:0;

    // Perform targeted raycasting only against relevant meshes
    const targets = [];
    const ground = this.scene.getObjectByName('generated-terrain-ground')||this.scene.getObjectByName('generated-grass-ground');
    if (ground) targets.push(ground);
    for(const surface of this.world.surfaceMeshes||[])if(surface!==ground)targets.push(surface);
    if (this.world.water) targets.push(this.world.water);
    // A mounted camera begins inside/alongside its carrier. Raycasting against
    // the rider or carrier makes the crosshair select the mount itself and
    // drives the gun toward that nearby (usually overhead) hit forever.
    const activeCarrier=this.player?.mountedTurret||this.player?.mountedBunker||this.player?.mountedMotorcycle;
    const ignoredEntities=new Set([this.player,activeCarrier].filter(Boolean));
    for (const c of this.combatants) { if (c.group && !c.dead && !ignoredEntities.has(c)) targets.push(c.group); }
    for (const f of Object.values(this.world.factories)) { if (f.group && !f.dead) targets.push(f.group); }
    for (const w of this.world.wildlife) { if (w.group && !w.dead) targets.push(w.group); }
    for (const d of this.world.destructibles) { if (d.group && !d.dead) targets.push(d.group); }
    for (const d of this.world.interactiveStructures||[]) { if (d.group && !d.dead && !ignoredEntities.has(d)) targets.push(d.group); }
    for (const d of this.world.motorcycles||[]) { if (d.group && !d.dead && !ignoredEntities.has(d)) targets.push(d.group); }
    for (const d of this.world.cars||[]) { if (d.group && !d.dead && !ignoredEntities.has(d)) targets.push(d.group); }
    for (const c of this.world.crates) { if (c.group && !c.carried && !c.placed) targets.push(c.group); }
    for (const pickup of this.world.pickups||[]) { if (pickup.group) targets.push(pickup.group); }

    const hits=this._hoverRaycaster.intersectObjects(targets,true);
    let found=null;
    for(const h of hits){
      if(h.distance<minHitDist)continue;
      let obj = h.object;
      let e = null;
      while (obj) {
        if (obj.userData?.entity) { e = obj.userData.entity; break; }
        obj = obj.parent;
      }
      if(e&&!e.dead&&!ignoredEntities.has(e)&&['unit','vehicle','turret','factory','wildlife','prop','bunker','motorcycle','pickup'].includes(e.type)){
        found=e;
        break;
      }
    }
    this.hoverEntity=found;
    let hoverPt=null;
    for(const h of hits){
      if(h.distance<minHitDist)continue;
      const objName=h.object.name;
      let hasEntity=false;
      let obj = h.object;
      while (obj) {
        if (obj.userData?.entity) { hasEntity = true; break; }
        obj = obj.parent;
      }
      if(objName==='generated-grass-ground'||objName==='generated-terrain-ground'||objName?.startsWith('terrain-surface-')||h.object===this.world.water||(hasEntity&&!ignoredEntities.has(obj.userData?.entity))){
        hoverPt=h.point;
        break;
      }
    }
    this.hoverPoint=hoverPt;
    const platformMode=Boolean(this.player?.mountedTurret||this.player?.mountedBunker||this.mountedCanFire(this.player)),overEnemy=this.isLockable(found)&&found.type!=='prop';
    const activeLock=platformMode?this.turretLockTarget:this.lockTarget;
    // reticle spread breathes with recoil and movement; the lock bracket rides the target
    const spread=Math.min(24,(this.player?.recoil||0)*22+Math.hypot(this.player?.velocity?.x||0,this.player?.velocity?.z||0)*.8);
    this.hud.setCrosshair(overEnemy,Boolean(activeLock),Boolean(activeLock&&this.ballisticOutOfRange),spread);
    if(activeLock){const s=this.toScreen(activeLock.group.position);this.hud.setLockMarker?.(s?s.x:null,s?s.y:null,Boolean(this.ballisticOutOfRange))}
    else this.hud.setLockMarker?.(null,null,false);
    this.hud.showInfo(found&&found.type!=='prop'?found:null,pointerX+26,pointerY+26)}
  handleInteraction(){const p=this.player,interactive=this.nearestInteractive(p);if(interactive&&!p.carriedCrate){const label=interactive.type==='turret'?'ARMORED TURRET':interactive.type==='bunker'?`BUNKER (${interactive.occupants.length}/3)`:interactive.type==='vehicle'?`${interactive.name.toUpperCase()} (${interactive.occupants.length}/${interactive.capacity})`:(interactive.driver?'MOTORCYCLE GUNNER SEAT':'MOTORCYCLE');this.hud.prompt(`E · ENTER ${label}`);if(this.input.consume('KeyE')){if(interactive.type==='turret')this.mountTurret(p,interactive);else if(interactive.type==='bunker')this.mountBunker(p,interactive);else this.mountMotorcycle(p,interactive)}return}if(p.carriedCrate){const questDelivery=p.carriedCrate.questHeavy&&this.extractionPoint&&p.group.position.distanceTo(this.extractionPoint)<5;if(questDelivery){this.hud.prompt('E · DELIVER THE SUN CORE');if(this.input.consume('KeyE')){const crate=p.carriedCrate;crate.carried=false;crate.physicsActive=false;crate.velocity.set(0,0,0);crate.angularVelocity.set(0,0,0);crate.group.position.copy(this.extractionPoint);crate.group.position.y=this.world.groundAt(crate.group.position);p.carriedCrate=null;this.goldenDelivered=true;this.hud.toast('SUN CORE SECURED!');this.particles.burst(this.extractionPoint.clone().add(new THREE.Vector3(0,1,0)),0xffd23f,58,12)}return}const airborne=p.group.position.y>p.groundY+.35,nearBuilder=!p.carriedCrate.noBuilder&&this.builder&&this.builder.distanceTo(p.group.position)<3.6;if(airborne&&!p.carriedCrate.questHeavy)this.hud.prompt(`E · THROW ${p.carriedCrate.crateType.name.toUpperCase()} · ${p.carriedCrate.mass.toFixed(1)} MASS`);else if(nearBuilder)this.hud.prompt('E · STACK CRATE ON D-BUILDER');else this.hud.prompt(p.carriedCrate.questHeavy?'E · DROP SUN CORE · HEAVY CARGO':'E · DROP CRATE  ·  F · MATERIALIZE');if(this.input.consume('KeyE')){const crate=p.carriedCrate;if(airborne&&!crate.questHeavy){this.world.launchCrate(crate,p.group.position,p.aim,p.velocity);this.hud.toast(`${crate.crateType.name.toUpperCase()} THROWN`)}else if(nearBuilder){const forward = new THREE.Vector3(Math.sin(p.group.rotation.y), 0, Math.cos(p.group.rotation.y));const defaultPos = p.group.position.clone().addScaledVector(forward, 1.25);let bestCol = 0;let bestDist = Infinity;for (let col = 0; col < 4; col++) {const colPos = this.builder.cellPosition(col, 0);const d = new THREE.Vector2(defaultPos.x - colPos.x, defaultPos.z - colPos.z).lengthSq();if (d < bestDist) {bestDist = d;bestCol = col;}}if(!this.builder.place(crate,p.group.position,'nearest',bestCol)){this.hud.toast('PAD FULL',true);return}this.audio.play('build',1.3)}else{crate.carried=false;crate.physicsActive=true;crate.velocity.copy(p.velocity).multiplyScalar(.2);crate.angularVelocity.set((Math.random()-.5)*2,0,(Math.random()-.5)*2);crate.group.position.copy(p.group.position).addScaledVector(p.aim,1.6);crate.group.position.y=p.group.position.y+.25}this.restoreCrateAndHandsOpacity(p);p.carriedCrate=null;this.audio.play('pickup',.8)}return}
    let nearest=null,dist=p.magneticGloves?3.6:2.35;for(const c of this.world.crates){if(c.carried||c.placed||c.falling)continue;const d=c.group.position.distanceTo(p.group.position);if(d<dist){dist=d;nearest=c}}
    const nearBuilder=Boolean(this.builder&&this.builder.distanceTo(p.group.position)<4.2),recipe=nearBuilder?this.builder.recipe():null;
    const recipeWeapon=recipe?.output==='weapon'?WEAPONS[recipe.weaponId||recipe.weapons?.[0]]:null,recipeStats=recipeWeapon?` · SPD ${Math.round(recipeWeapon.bulletSpeed)} · PWR ${Math.round(recipeWeapon.shotPower)}`:'';
    // placed crates stay retrievable until the stack is actually combined
    const canTakeBack=!nearest&&nearBuilder&&this.builder.count()>0;
    this.hud.prompt(nearest?`E · CARRY ${nearest.crateType.name.toUpperCase()}${nearBuilder&&recipe?`  ·  F · ${recipe.label}${recipeStats}`:''}`:canTakeBack?`E · TAKE CRATE BACK${recipe?`  ·  F · ${recipe.label}${recipeStats}`:''}`:recipe?`F · MATERIALIZE ${recipe.label}${recipeStats}`:'');
    if(nearest&&this.input.consume('KeyE')){nearest.carried=true;nearest.physicsActive=false;nearest.velocity?.set(0,0,0);nearest.angularVelocity?.set(0,0,0);nearest.visual?.rotation.set(0,0,0);p.carriedCrate=nearest;this.audio.play('pickup')}
    else if(canTakeBack&&this.input.consume('KeyE')){const crate=this.builder.takeBack(p.group.position);if(crate){crate.carried=true;crate.physicsActive=false;crate.velocity?.set(0,0,0);crate.angularVelocity?.set(0,0,0);crate.visual?.rotation.set(0,0,0);p.carriedCrate=crate;this.audio.play('pickup');this.hud.toast(`${crate.crateType.name.toUpperCase()} RETRIEVED`)}}}
  switchPlayer(){if(this.player.carriedCrate){this.hud.toast('DROP THE CRATE FIRST',true);return}const controllable=this.livingUnits(this.playerTeam);if(controllable.length<2)return;const next=controllable[(controllable.indexOf(this.player)+1)%controllable.length];this.possess(next);this.hud.toast(`${next.classDef.name.toUpperCase()} SELECTED`)}
  possess(unit){if(this.player)this.player.player=false;this.setHealAim(false);this.setGrappleAim(false);unit.player=true;unit.ammo=unit.ammo??60;this.player=unit;this.lockTarget=null;this.seedLookFromAim?.(unit.aim);if(AI_BEHAVIORS[this.aiBehaviorIndex]?.id==='bodyguard'){for(const ally of this.livingUnits(this.playerTeam)){ally.patrolPoint=null;ally.commandPoint=null}this.hud.toast(`BODYGUARD PRIORITY · ${unit.classDef.name.toUpperCase()}`)}}
  setCloak(entity,enabled){entity.group.traverse(o=>{if(!o.isMesh||!o.material)return;o.material.transparent=enabled;o.material.opacity=enabled?.24:1;o.material.depthWrite=!enabled;o.material.needsUpdate=true})}
  useAbility(){const p=this.player;
    if(p.active){if(p.abilityCooldown>0||p.mp<p.active.cost){this.hud.toast('SKILL NOT READY',true);return}this.executeActiveSkill(p);return}
    // Medic's Heal is a targeted tether — Q toggles targeting / detaches the wires
    if(p.classId==='medic'){this.toggleHealAim();return}
    if(p.classId==='commando'){this.toggleGrappleAim();return}
    if(p.abilityCooldown>0||p.mp<p.classDef.cost){this.hud.toast('ABILITY NOT READY',true);return}p.mp-=p.classDef.cost;p.abilityCooldown=p.classDef.cooldown;switch(p.classId){case 'scout':p.statusTimer=4;break;case 'sniper':p.cloakTimer=6;p.nextShotMultiplier=2.5;this.setCloak(p,true);break;case 'gunner':p.overdriveTimer=4;break;case 'explosives':for(let i=-2;i<=2;i++){const dir=p.aim.clone().applyAxisAngle(new THREE.Vector3(0,1,0),i*.16);this.combat.spawn(p,dir,{...WEAPONS.grenade,damage:36});}break;case 'commando':this.combat.radial(p.group.position,7,55,p,16);p.velocity.addScaledVector(p.aim,-4);break;case 'officer':for(const a of this.friendsOf(p))if(a.group.position.distanceTo(p.group.position)<12)a.rallyTimer=8;break;case 'saboteur':for(const e of this.foesOf(p))if(e.group.position.distanceTo(p.group.position)<10){e.stun=e.type==='vehicle'?5:1.8;if(Number.isFinite(e.mp))e.mp=0}this.particles.burst(p.group.position.clone().add(new THREE.Vector3(0,1,0)),0x86c8ff,30,7);break;case 'heavy':p.barrierTimer=6;for(const a of this.friendsOf(p))if(a!==p&&a.type==='unit'&&a.group.position.distanceTo(p.group.position)<6)a.barrierTimer=Math.max(a.barrierTimer||0,6);break;case 'engineer':{const turret=this.factory.createTurret(this.playerTeam,p.group.position.clone().addScaledVector(p.aim,2.2));turret.group.position.y=this.world.groundAt(turret.group.position);this.combatants.push(turret);this.entities.push(turret);break}}this.hud.toast(p.classDef.ability.toUpperCase());this.particles.burst(p.group.position.clone().add(new THREE.Vector3(0,1,0)),this.teamMap[this.playerTeam].color,18,4)}
  setGrappleAim(on){this.grappleAim=Boolean(on);this.hud.setGrappleMode(this.grappleAim)}
  toggleGrappleAim(){const p=this.player;if(this.grappleAim){this.setGrappleAim(false);this.hud.toast('GRAPPLE CANCELLED');return}if(p.abilityCooldown>0||p.mp<p.classDef.cost){this.hud.toast('GRAPPLE NOT READY',true);return}this.setHealAim(false);this.setGrappleAim(true);this.hud.toast(`SELECT GRAPPLE POINT · MAX ${GRAPPLE_RANGE}m`)}
  startGrapple(unit,targetPoint){if(!targetPoint)return false;const target=targetPoint.clone(),start=unit.group.position.clone();target.y=this.world.groundAt(target)+.12;const distance=Math.hypot(target.x-start.x,target.z-start.z);if(distance<2||distance>GRAPPLE_RANGE)return false;
    unit.mp=Math.max(0,unit.mp-unit.classDef.cost);unit.abilityCooldown=3;unit.grappling=true;this.setGrappleAim(false);
    const chest=start.clone().add(new THREE.Vector3(0,1.25,0)),geometry=new THREE.BufferGeometry().setFromPoints([chest,chest]);
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x8df3ff,transparent:true,opacity:.95}));
    const hook=new THREE.Mesh(new THREE.ConeGeometry(.18,.55,6),new THREE.MeshBasicMaterial({color:0xffd23f}));hook.rotation.x=Math.PI/2;this.scene.add(line,hook);
    this.grapples.push({unit,start,target,line,hook,elapsed:0});this.audio.play('pistol',unit.group.position,1.35);this.hud.toast('HOOK AWAY!');return true}
  updateGrapples(dt){for(let i=this.grapples.length-1;i>=0;i--){const g=this.grapples[i],chest=g.unit.group.position.clone().add(new THREE.Vector3(0,1.25,0));g.elapsed+=dt;let hookPos;
      if(g.elapsed<GRAPPLE_LAUNCH_TIME){const t=g.elapsed/GRAPPLE_LAUNCH_TIME;hookPos=g.start.clone().lerp(g.target,t).add(new THREE.Vector3(0,1.1*(1-t),0))}
      else{const t=Math.min(1,(g.elapsed-GRAPPLE_LAUNCH_TIME)/GRAPPLE_PULL_TIME),ease=1-Math.pow(1-t,3);g.unit.group.position.copy(g.start).lerp(g.target,ease);g.unit.group.position.y+=Math.sin(t*Math.PI)*2.1;g.unit.velocity.set(0,0,0);hookPos=g.target.clone();if(t>=1){g.unit.grappling=false;g.unit.group.position.copy(g.target);g.unit.groundY=this.world.groundAt(g.target);this.combat.radial(g.target,3.5,22,g.unit,8);this.particles.burst(g.target.clone().add(new THREE.Vector3(0,.6,0)),0x55e9ff,24,7);this.scene.remove(g.line,g.hook);g.line.geometry.dispose();g.line.material.dispose();g.hook.geometry.dispose();g.hook.material.dispose();this.grapples.splice(i,1);continue}}
      g.hook.position.copy(hookPos);g.line.geometry.setFromPoints([chest,hookPos]);g.line.geometry.attributes.position.needsUpdate=true}}
  // the 20 Active Skills carried by Special Destructos
  executeActiveSkill(u){const skill=u.active;if(!skill||u.abilityCooldown>0||u.mp<skill.cost)return;u.mp-=skill.cost;u.abilityCooldown=skill.cooldown;const pos=u.group.position,foes=this.foesOf(u),friends=this.friendsOf(u);
    switch(skill.id){
      case 'fireball':this.combat.spawn(u,u.aim,{...WEAPONS.rocket,damage:60,bulletSpeed:22,color:0xff8a2c});break;
      case 'blink':this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),0x9fe8ff,16,5);u.group.position.addScaledVector(u.aim,8);this.world.clamp(u.group.position);u.group.position.y=this.world.groundAt(u.group.position);this.particles.burst(u.group.position.clone().add(new THREE.Vector3(0,1,0)),0x9fe8ff,16,5);break;
      case 'healburst':for(const f of friends)if(f.group.position.distanceTo(pos)<8&&Number.isFinite(f.maxHp)){const healed=this.healUnit(f,40,u);f.freeze=0;f.stun=0;if(healed)this.spawnDamageNumber(f.group.position,`+${Math.round(healed)}`,'heal')}this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),0x67ffc4,26,6);break;
      case 'shockwave':this.combat.radial(pos,6,30,u,14);break;
      case 'decoy':{const d=this.factory.createUnit(u.classId,u.team,pos.clone().addScaledVector(u.aim,2));d.hp=d.maxHp=60;d.weapon={...WEAPONS.pistol,effectiveRange:0};d.stationary=true;d.decoy=true;this.combatants.push(d);this.entities.push(d);break}
      case 'frenzy':u.frenzyTimer=5;for(const f of friends)if(f!==u&&f.type==='unit'&&f.buffs&&f.group.position.distanceTo(pos)<8)f.buffs.rapid=Math.max(f.buffs.rapid,3);break;
      case 'icenova':for(const f of foes)if(f.group.position.distanceTo(pos)<7){f.freeze=2.5;this.spawnDamageNumber(f.group.position,'FROZEN','status')}this.particles.burst(pos.clone().add(new THREE.Vector3(0,.6,0)),0x9fe8ff,32,8);break;
      case 'magnetpull':for(const c of this.world.crates){if(c.carried||c.placed||c.falling)continue;if(c.group.position.distanceTo(pos)<12){const dir=pos.clone().sub(c.group.position).setY(0).normalize();c.group.position.add(dir.multiplyScalar(Math.max(0,c.group.position.distanceTo(pos)-2)))}}break;
      case 'smokescreen':for(const f of foes)if(f.group.position.distanceTo(pos)<9)f.fireCooldown=Math.max(f.fireCooldown,2.5);this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),0x8b93a5,44,5);break;
      case 'sentry':{const t=this.factory.createTurret(u.team,pos.clone().addScaledVector(u.aim,2.2));t.group.position.y=this.world.groundAt(t.group.position);this.combatants.push(t);this.entities.push(t);break}
      case 'minefield':for(let i=0;i<4;i++){const dir=new THREE.Vector3(Math.sin(i*1.57+.7),0,Math.cos(i*1.57+.7));this.combat.spawn(u,dir,WEAPONS.mine)}break;
      case 'dashstrike':u.velocity.addScaledVector(u.aim,18);this.combat.radial(pos.clone().addScaledVector(u.aim,2),3,25,u,6);break;
      case 'groundpound':u.verticalVelocity=8;this.combat.radial(pos,5,40,u,12);break;
      case 'barrierdome':u.barrierTimer=6;for(const f of friends)if(f!==u&&f.group.position.distanceTo(pos)<6)f.barrierTimer=Math.max(f.barrierTimer||0,6);break;
      case 'chainlightning':{let hit=0;for(const f of foes.sort((a,b)=>a.group.position.distanceToSquared(pos)-b.group.position.distanceToSquared(pos))){if(hit>=4||f.group.position.distanceTo(pos)>12)break;this.combat.applyDamage(f,25,u,f.group.position.clone().sub(pos).normalize(),3);this.particles.burst(f.group.position.clone().add(new THREE.Vector3(0,1.4,0)),0xaef3ff,10,4);hit++}break}
      case 'rocketbarrage':for(let i=-2;i<=2;i++){const dir=u.aim.clone().applyAxisAngle(new THREE.Vector3(0,1,0),i*.14);this.combat.spawn(u,dir,{...WEAPONS.rocket,damage:45})}break;
      case 'snaretrap':{const f=foes.sort((a,b)=>a.group.position.distanceToSquared(pos)-b.group.position.distanceToSquared(pos))[0];if(f&&f.group.position.distanceTo(pos)<10){f.freeze=3;this.spawnDamageNumber(f.group.position,'SNARED','status')}break}
      case 'warcry':for(const f of friends)if(f.group.position.distanceTo(pos)<12){f.rallyTimer=8;if(f.buffs)f.buffs.damage=Math.max(f.buffs.damage,8)}this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),0xffd23f,26,7);break;
      case 'quake':for(const f of foes){const rel=f.group.position.clone().sub(pos),along=rel.dot(u.aim);if(along>0&&along<14&&rel.clone().addScaledVector(u.aim,-along).length()<3){f.stun=2;this.combat.applyDamage(f,20,u,u.aim,4)}}this.particles.burst(pos.clone().addScaledVector(u.aim,4).add(new THREE.Vector3(0,.4,0)),0xc9a45c,30,8);break;
      case 'overcharge':u.overchargeShots=3;for(const f of friends)if(f!==u&&f.type==='unit'&&f.group.position.distanceTo(pos)<8)f.overchargeShots=Math.max(f.overchargeShots||0,1);break;
    }
    if(u.team===this.playerTeam)this.hud.toast(skill.name.toUpperCase());this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),this.teamMap[u.team]?.color??0xffffff,14,4)}
  updateAbilityZones(dt){for(let i=this.abilityZones.length-1;i>=0;i--){const z=this.abilityZones[i];z.life-=dt;z.tick-=dt;z.mesh.material.opacity=Math.max(0,z.life/6*.35);z.mesh.rotation.z+=dt*.3;if(z.tick<=0){z.tick=.5;for(const a of this.friendsOf(z.owner))if(a.group.position.distanceTo(z.mesh.position)<6)this.healUnit(a,7.5,z.owner)}if(z.life<=0){this.scene.remove(z.mesh);z.mesh.geometry.dispose();z.mesh.material.dispose();this.abilityZones.splice(i,1)}}}
  // ── Heal tether: green wires attach the Medic to an ally and pump HP across ──
  setHealAim(on){this.healAim=Boolean(on);this.hud.setHealMode(this.healAim)}
  toggleHealAim(){const p=this.player;
    const existing=this.healLinks.find(l=>l.healer===p);
    if(existing){this.endHealLink(existing,'released');this.hud.toast('HEAL WIRES DETACHED');return}
    if(this.healAim){this.setHealAim(false);this.hud.toast('HEAL CANCELLED');return}
    if(p.abilityCooldown>0||p.mp<(p.classDef.cost||10)){this.hud.toast('HEAL NOT READY',true);return}
    this.setHealAim(true);this.hud.toast('SELECT A HEAL TARGET · Q OR RIGHT-CLICK TO CANCEL')}
  healTargetNearCursor(){const p=this.player;
    const candidates=this.friendsOf(p).filter(e=>e!==p&&e.type==='unit'&&!e.dead);
    if(this.hoverEntity&&candidates.includes(this.hoverEntity))return this.hoverEntity;
    let best=null,bestD=140;
    for(const e of candidates){const s=this.toScreen(e.group.position);if(!s)continue;const d=Math.hypot(s.x-innerWidth/2,s.y-innerHeight/2);if(d<bestD){bestD=d;best=e}}
    return best}
  startHealLink(healer,target){
    const mine=healer.team===this.playerTeam;
    if(healer.group.position.distanceTo(target.group.position)>HEAL_RANGE){if(healer===this.player)this.hud.toast('TOO FAR — MOVE CLOSER TO ATTACH',true);return false}
    if(target.hp>=target.maxHp){if(healer===this.player)this.hud.toast('TARGET AT FULL HEALTH',true);return false}
    healer.mp=Math.max(0,healer.mp-(healer.classDef?.cost||10));
    const group=new THREE.Group(),lines=[];
    for(let j=0;j<3;j++){
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(HEAL_WIRE_POINTS*3),3));
      const mat=new THREE.LineBasicMaterial({color:0x59ff9a,transparent:true,opacity:j===0?.95:.5,blending:THREE.AdditiveBlending,depthWrite:false});
      const line=new THREE.Line(geo,mat);line.frustumCulled=false;lines.push(line);group.add(line);
    }
    const orbs=[0,1].map(()=>{const orb=new THREE.Mesh(new THREE.SphereGeometry(.1,6,5),new THREE.MeshBasicMaterial({color:0xb6ffd4,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));group.add(orb);return orb});
    this.scene.add(group);
    healer.healPumping=true;
    this.healLinks.push({healer,target,group,lines,orbs,time:0,tick:0});
    if(healer===this.player)this.setHealAim(false);
    this.audio.play('build',1.4);
    if(mine)this.hud.toast(`HEAL WIRES ATTACHED · ${target.classDef.name.toUpperCase()}`);
    this.particles.burst(target.group.position.clone().add(new THREE.Vector3(0,1.4,0)),0x67ffc4,14,4);
    return true}
  endHealLink(link,reason='ended'){
    const i=this.healLinks.indexOf(link);if(i>=0)this.healLinks.splice(i,1);
    this.scene.remove(link.group);
    for(const l of link.lines){l.geometry.dispose();l.material.dispose()}
    for(const o of link.orbs){o.geometry.dispose();o.material.dispose()}
    link.healer.healPumping=false;
    link.healer.abilityCooldown=Math.max(link.healer.abilityCooldown||0,reason==='complete'?2:3.5)}
  snapHealLink(link){
    const mid=link.healer.group.position.clone().lerp(link.target.group.position,.5).add(new THREE.Vector3(0,1.3,0));
    this.particles.burst(mid,0x59ff9a,24,8);this.particles.burst(mid,0xffd23f,10,5);
    this.audio.play('explosion',.35);
    if(link.healer.team===this.playerTeam)this.hud.toast('HEAL WIRES SNAPPED — TOO FAR',true);
    this.endHealLink(link,'snapped')}
  updateHealLinks(dt){
    const chestA=new THREE.Vector3(),chestB=new THREE.Vector3(),pt=new THREE.Vector3();
    for(let i=this.healLinks.length-1;i>=0;i--){
      const l=this.healLinks[i],{healer,target}=l;
      if(healer.dead||target.dead){this.endHealLink(l,'lost');continue}
      const dist=healer.group.position.distanceTo(target.group.position);
      if(dist>HEAL_RANGE){this.snapHealLink(l);continue}
      healer.mp=Math.max(0,healer.mp-dt*HEAL_MP_DRAIN);
      this.healUnit(target,dt*HEAL_RATE,healer);
      l.time+=dt;l.tick-=dt;
      if(l.tick<=0){l.tick=.55;this.spawnDamageNumber(target.group.position,`+${Math.round(HEAL_RATE*.55)}`,'heal');this.particles.impact(target.group.position.clone().add(new THREE.Vector3(0,1.4,0)),0x67ffc4)}
      if(target.hp>=target.maxHp){if(healer.team===this.playerTeam)this.hud.toast('HEAL COMPLETE');this.endHealLink(l,'complete');continue}
      if(healer.mp<=0){if(healer===this.player)this.hud.toast('MANA DEPLETED — WIRES RETRACTED',true);this.endHealLink(l,'drained');continue}
      // wire geometry: sagging cable with a live wobble; tension shifts color near the limit
      chestA.copy(healer.group.position);chestA.y+=1.35;chestB.copy(target.group.position);chestB.y+=1.2;
      const tension=THREE.MathUtils.smoothstep(dist/HEAL_RANGE,.72,1);
      for(let j=0;j<l.lines.length;j++){
        const line=l.lines[j],attr=line.geometry.attributes.position;
        for(let k=0;k<HEAL_WIRE_POINTS;k++){
          const t=k/(HEAL_WIRE_POINTS-1);
          pt.lerpVectors(chestA,chestB,t);
          const sag=Math.sin(Math.PI*t)*((.4+dist*.07)*(1-tension*.85));
          pt.y-=sag*(1+j*.28);
          pt.x+=Math.sin(l.time*7+t*9+j*2.1)*.07*(1-tension);
          pt.z+=Math.cos(l.time*6+t*8+j*2.1)*.07*(1-tension);
          attr.setXYZ(k,pt.x,pt.y,pt.z);
        }
        attr.needsUpdate=true;
        line.material.color.setHex(tension>.6?0xffd23f:0x59ff9a);
        line.material.opacity=(j===0?.95:.5)*(.75+Math.sin(l.time*10+j)*.25);
      }
      l.orbs.forEach((orb,idx)=>{const t=(l.time*.85+idx*.5)%1;orb.position.lerpVectors(chestA,chestB,t);orb.position.y-=Math.sin(Math.PI*t)*(.4+dist*.07)*(1-tension*.85);orb.scale.setScalar(.8+Math.sin(l.time*12+idx*3)*.3)});
    }}
  // AI medics run their own tethers on wounded squadmates
  updateAIHealers(dt){
    this.aiHealTimer-=dt;if(this.aiHealTimer>0)return;this.aiHealTimer=.6;
    for(const e of this.combatants){
      if(e.dead||e.player||e.type!=='unit'||e.classId!=='medic'||e.active)continue;
      if((e.abilityCooldown||0)>0||e.mp<15||this.healLinks.some(l=>l.healer===e))continue;
      const wounded=this.friendsOf(e).filter(f=>f!==e&&f.type==='unit'&&!f.dead&&f.hp<f.maxHp*.7&&f.group.position.distanceTo(e.group.position)<HEAL_RANGE*.8)
        .sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(wounded)this.startHealLink(e,wounded);
    }}
  // ── Overhead pickup icons: hearts / ammo / weapons announced above the unit ──
  showOverheadIcon(unit,kind,opts={}){
    if(!unit||unit.dead)return;
    this.overheadIcons.push({group:this.factory.createOverheadIcon(kind,opts),owner:unit,life:2.1,age:0})}
  updateOverheadIcons(dt){
    for(let i=this.overheadIcons.length-1;i>=0;i--){
      const o=this.overheadIcons[i];o.age+=dt;o.life-=dt;
      if(o.life<=0||o.owner.dead){this.scene.remove(o.group);this.overheadIcons.splice(i,1);continue}
      const base=o.owner.group.position;
      o.group.position.set(base.x,base.y+3.15+o.age*.4+Math.sin(o.age*5.5)*.07,base.z);
      o.group.rotation.y+=dt*4.5;
      const s=o.age<.22?o.age/.22:o.life<.4?Math.max(.01,o.life/.4):1;
      o.group.scale.setScalar(s*(1+Math.sin(o.age*9)*.06));
    }}
  // ── Temporary overhead HP bars: shown on damage, hidden after 3s of peace ────
  updateOverheadBars(dt){
    for(const e of this.entities){
      if(e.hpBarTimer===undefined&&!e.hpBar)continue;
      e.hpBarTimer=Math.max(0,(e.hpBarTimer||0)-dt);
      if(e.hpBarTimer<=0||e.dead||!Number.isFinite(e.maxHp)){if(e.hpBar)e.hpBar.group.visible=false;continue}
      if(!e.hpBar)e.hpBar=this.factory.createHPBar(e.type==='factory'?3:e.type==='vehicle'?2.2:1.5);
      const bar=e.hpBar;bar.group.visible=true;
      const h=e.type==='factory'?6.6:e.type==='vehicle'?3.4:e.type==='prop'?(e.radius||1)+1.7:e.type==='turret'?2.3:e.type==='wildlife'?2.1:3.15;
      bar.group.position.set(e.group.position.x,e.group.position.y+h,e.group.position.z);
      const pct=Math.max(0,Math.min(1,e.hp/e.maxHp));
      bar.fill.scale.x=Math.max(.02,(bar.width-.04)*pct);
      bar.fill.material.color.setHSL(pct*.33,.85,.5);
    }}
  // ── Destructo death debris: textured blocks scatter, then sink away ──────────
  spawnDeathDebris(target){
    const material=target.body?.material;if(!material)return;
    this.debrisGeo=this.debrisGeo||new THREE.BoxGeometry(1,1,1);
    const count=5+Math.floor(Math.random()*8);
    for(let i=0;i<count;i++){
      const m=new THREE.Mesh(this.debrisGeo,material);
      m.castShadow=true;m.scale.setScalar(.2+Math.random()*.28);
      m.position.copy(target.group.position).add(new THREE.Vector3((Math.random()-.5)*.9,.9+Math.random(),(Math.random()-.5)*.9));
      m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
      this.scene.add(m);
      this.debris.push({mesh:m,velocity:new THREE.Vector3((Math.random()-.5)*8,3.5+Math.random()*5.5,(Math.random()-.5)*8),angular:new THREE.Vector3((Math.random()-.5)*10,(Math.random()-.5)*10,(Math.random()-.5)*10),sunk:0});
    }}
  updateDebris(dt){
    for(let i=this.debris.length-1;i>=0;i--){
      const d=this.debris[i],g=this.world.groundAt(d.mesh.position),floor=g+d.mesh.scale.y*.5;
      const airborne=d.mesh.position.y>floor+.02||Math.abs(d.velocity.y)>1.4||d.velocity.lengthSq()>1.2;
      if(airborne&&d.sunk===0){
        d.velocity.y-=20*dt;d.mesh.position.addScaledVector(d.velocity,dt);
        d.mesh.rotation.x+=d.angular.x*dt;d.mesh.rotation.y+=d.angular.y*dt;d.mesh.rotation.z+=d.angular.z*dt;
        if(d.mesh.position.y<floor){d.mesh.position.y=floor;d.velocity.y=Math.abs(d.velocity.y)*.42;d.velocity.x*=.68;d.velocity.z*=.68;d.angular.multiplyScalar(.68)}
      }else{
        // settled: sink into the ground over 3 seconds, then vanish
        d.sunk+=dt;const t=d.sunk/3;
        d.mesh.position.y=floor-(d.mesh.scale.y+.3)*t;
        d.mesh.rotation.y+=dt*.5;
        if(t>=1){this.scene.remove(d.mesh);this.debris.splice(i,1)}
      }
    }}
  // builder output: weapons, destructos (normal/elite/special) or tanks — quality scales with crate rarity tier
  handleBuild(recipe,tier=0,builder=this.builder){const team=builder.team,mine=team===this.playerTeam;if(recipe.output==='unit'&&mine&&this.mission?.maxPlayerDestructos&&this.livingUnits(team).length>=this.mission.maxPlayerDestructos){this.hud.toast(`SQUAD CAP REACHED · MAX ${this.mission.maxPlayerDestructos} DESTRUCTOS`,true);return false}this.audio.play('build');const toCenter=builder.pad.clone().multiplyScalar(-1).setY(0).normalize();const pos=builder.pad.clone().addScaledVector(toCenter,4);pos.y=this.world.groundAt(pos);const tierLabel=['','UNCOMMON ','RARE ','LEGENDARY '][tier]||'';
    const cratesCount=builder.count(),profile=builder.profile();this.recordStat(team,'cratesConsumed',cratesCount);
    if(recipe.output==='unit'){
      const grade=recipe.grade||'normal',classPool={normal:['scout','gunner','medic'],elite:['commando','sniper','officer','explosives'],special:['commando','officer','heavy','engineer','saboteur']}[grade],classId=pick(classPool);
      const opts={grade};if(grade==='elite'||grade==='special')opts.passive=pick(PASSIVE_SKILLS);if(grade==='special')opts.active=pick(ACTIVE_SKILLS);
      const unit=this.addUnit(classId,team,pos,opts);
      const speedBonus=destructoSpeedBonus(profile);if(speedBonus>0){unit.classDef={...unit.classDef,speed:unit.classDef.speed*(1+speedBonus)};unit.group.scale.multiplyScalar(1+Math.min(.12,speedBonus*.35));this.factory.applyCrateVariant(unit,profile)}
      if(mine)this.hud.toast(`${tierLabel}${recipe.label}${opts.passive?` · ${opts.passive.name.toUpperCase()}`:''}${opts.active?` + ${opts.active.name.toUpperCase()}`:''} READY`)}
    else if(recipe.output==='vehicle'){const tank=this.factory.createTank(team,pos,recipe.vehicleId||'tank'),hpBonus=tankHpBonus(profile);tank.maxHp=Math.round(tank.maxHp*(1+hpBonus));tank.hp=tank.maxHp;tank.crateVariant=profile.dominant;this.world.vehicles.push(tank);this.combatants.push(tank);this.entities.push(tank);if(mine)this.hud.toast(`${tierLabel}${recipe.label} READY · ${tank.capacity} CREW`)}
    else{
      const weaponId = recipe.weaponId || recipe.weapons[Math.min(tier, recipe.weapons.length - 1)];
      const weapon = buildWeaponVariant(weaponId,builder.sourceCrates());
      if(mine){
        const recipient=builder.campaignRecipient||this.player;
        if(weaponId==='pistol'){recipient.ammo=(recipient.ammo||0)+50;this.switchWeaponSlot(recipient,'pistol',false)}
        else this.equipPrimaryWeapon(recipient,weaponId,weapon,(recipient.ammo||0)+50,profile.rank);
        this.showOverheadIcon(recipient,'weapon',{weaponId,weapon});
        this.hud.toast(`${weapon.name.toUpperCase()} · POWER ${profile.strength.toFixed(1)} (+50 AMMO)`);
      } else {
        const recipient = this.livingUnits(team).sort((a,b)=>(a.weaponTier||0)-(b.weaponTier||0))[0];
        if (recipient) {
          if(weaponId==='pistol')this.switchWeaponSlot(recipient,'pistol',false);else this.equipPrimaryWeapon(recipient,weaponId,weapon,recipient.ammo||0,profile.rank);
          this.showOverheadIcon(recipient,'weapon',{weaponId,weapon});
        }
      }
    }
    if(mine)this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),TEAM.YELLOW,30,8);
    if(this.mission.type==='build'&&mine&&recipe.output==='unit'&&recipe.count>=4)setTimeout(()=>this.endMission(true),700);
    return true}
  handleDamage(target,amount,source,direction=null,explosive=false){if(amount<=0){if(target.passive?.id==='lucky')this.spawnDamageNumber(target.group.position,'DODGE','status');return}
    // AI reactions: the victim aggros its first attacker, and hits on a base
    // building sound the home-defense alarm for that team
    this.ai?.notifyDamage?.(target,source);if(target.missionVIP)target.lastDamagedAt=this.elapsed||0;
    if((target.type==='factory'||target.baseTurret)&&target.team&&!(this.campaignActive&&this.mission.id==='golden-shield'))this.ai?.notifyBaseAttack?.(target.team,source);
    // temporary overhead HP bar for anything that just took a hit
    if(target.group&&Number.isFinite(target.maxHp))target.hpBarTimer=3;
    // blood spray + ground stain for anything fleshy
    if(target.type==='unit'||target.type==='wildlife')this.particles.blood(target.group.position.clone().add(new THREE.Vector3(0,1.2,0)),direction&&direction.lengthSq()>.001?direction.clone().setY(0).normalize():null,amount>25?16:9);
    if(['prop','factory','turret','bunker'].includes(target.type)&&target.group){
      if(!target.originalScale){
        target.originalScale=target.group.scale.clone();
        target.originalQuaternion=target.group.quaternion.clone();
        target.wobbleScaleY=0;
        target.wobbleScaleX=0;
        target.wobbleScaleZ=0;
        target.wobbleScaleYVel=0;
        target.wobbleScaleXVel=0;
        target.wobbleScaleZVel=0;
        target.wobbleTilt=0;
        target.wobbleTiltVel=0;
        target.wobbleTiltAxis=new THREE.Vector3(0,1,0);
      }
      const force=Math.min(2.0,amount*0.12)*(target.jellyStrength??1);
      target.wobbleScaleYVel-=force*4.0;
      target.wobbleScaleXVel+=force*2.0;
      target.wobbleScaleZVel+=force*2.0;
      if(direction){
        const tiltDir=direction.clone().setY(0).normalize();
        const axis=new THREE.Vector3(0,1,0).cross(tiltDir).normalize();
        if(axis.lengthSq()>0.01){
          target.wobbleTiltAxis.copy(axis);
          target.wobbleTiltVel=force*3.0;
        }
      }
    }
    const kind=target===this.player?'hurt-player':this.hostile(this.playerTeam,target.team)?'hurt-enemy':target.team?'hurt-ally':'hurt';
    this.spawnDamageNumber(target.group.position,String(Math.max(1,Math.round(amount))),kind);
    // Play hit sound spatially
    if (target.group && target.group.position) {
      const pos = target.group.position;
      if (target.type === 'unit') {
        this.audio.play('destructo_hit', pos);
        const now=this.elapsed||0;
        if(now>=this.damageVoiceCooldown&&Math.random()<.15){const running=Math.hypot(target.velocity?.x||0,target.velocity?.z||0)>target.classDef.speed*.55;this.audio.play(running?'destructo_damaged_running':'destructo_damaged',pos);this.damageVoiceCooldown=now+15}
      } else if (['factory', 'turret', 'bunker', 'vehicle', 'motorcycle', 'cars'].includes(target.type)) {
        this.audio.play('metal_hit', pos);
      } else if (target.type === 'prop') {
        const subtype = (target.subtype || '').toLowerCase();
        if (subtype.includes('tree')) {
          this.audio.play('tree_hit', pos);
        } else if (subtype.includes('wood')) {
          this.audio.play('wood_hit', pos);
        } else if (subtype.includes('metal') || subtype.includes('steel') || subtype.includes('panel') || subtype.includes('corrugated') || subtype.includes('iron')) {
          this.audio.play('metal_hit', pos);
        } else {
          this.audio.play('rock_hit', pos);
        }
      }
    }
    if(target===this.player)this.hud.damage()}
  spawnDamageNumber(position,text,kind){const s=this.toScreen(position);if(s)this.hud.damageNumber(s.x,s.y,text,kind)}
  spawnDeathQuip(target){const s=this.toScreen(target.group.position);if(!s)return;const words=['PWNED!','BONKED!','KAPOW!','OOPS!','SPLATTED!','YEETED!','WRECKED!','BYE-BYE!'];this.hud.burstingText(s.x,s.y,pick(words))}
  spawnDestructibleSupply(target,random=Math.random){
    if(!target||target.supplyDropRolled||!['prop','factory','turret','bunker'].includes(target.type))return null;target.supplyDropRolled=true;const drop=rollDestructibleSupply(random);if(!drop)return null;
    const pos=target.group.position.clone();pos.y=this.world.groundAt(pos)+.12;const pickup=this.factory.createPickup(drop,pos);pickup.group.scale.setScalar(.01);gsap.to(pickup.group.scale,{x:1,y:1,z:1,duration:.32,delay:.08,ease:'back.out(3)'});this.world.pickups.push(pickup);return pickup;
  }
  triggerDeathExplosion(target,position=target?.group?.position,radius=null,damage=null,knockback=null){
    if(!target||!position||target.deathExplosionApplied)return false;
    const explosiveVehicle=['vehicle','car','motorcycle'].includes(target.type),explosiveStructure=['factory','turret','bunker'].includes(target.type)||(target.type==='prop'&&((target.radius||0)>=2||target.subtype==='building'));
    if(!explosiveVehicle&&!explosiveStructure)return false;
    target.deathExplosionApplied=true;
    const large=target.type==='factory'||target.baseTurret||target.type==='bunker'||target.vehicleKind==='tank';
    this.combat.radial(position.clone(),radius??(large?10:explosiveVehicle?8:7),damage??(large?145:explosiveVehicle?110:85),{team:'neutral',type:'neutral-explosion'},knockback??(large?34:explosiveVehicle?28:22));
    this.particles.burst(position.clone().add(new THREE.Vector3(0,1.2,0)),0xff5a24,large?100:62,large?24:17);
    this.particles.burst(position.clone().add(new THREE.Vector3(0,1,0)),0x555866,large?70:42,large?17:12);
    return true;
  }
  // unit deaths burst apart: limbs fly, big flash, then the husk vanishes
  explodeUnit(target){const pos=target.group.position.clone().add(new THREE.Vector3(0,1,0)),color=this.teamMap[target.team]?.color??0xff8a3c;
    this.particles.burst(pos,color,34,10);this.particles.burst(pos,0xff8a3c,22,13);
    if(target.type==='unit')this.spawnDeathDebris(target);
    if(target.type==='unit'){for(const part of [target.head,target.leftHand,target.rightHand,target.leftBoot,target.rightBoot]){if(!part)continue;const dx=(Math.random()-.5)*5,dz=(Math.random()-.5)*5;gsap.to(part.position,{x:part.position.x+dx,y:part.position.y+2.5+Math.random()*2,z:part.position.z+dz,duration:.5,ease:'power2.out'});gsap.to(part.rotation,{x:Math.random()*9,z:Math.random()*9,duration:.5});gsap.to(part.scale,{x:.02,y:.02,z:.02,duration:.5,ease:'back.in(2)'})}
      gsap.to(target.body.scale,{x:1.6,y:.2,z:1.6,duration:.16,ease:'power3.out',onComplete:()=>{gsap.to(target.group.scale,{x:.02,y:.02,z:.02,duration:.3,ease:'back.in(2)',onComplete:()=>{target.group.visible=false}})}})}
    else gsap.to(target.group.scale,{x:.05,y:.05,z:.05,duration:.45,ease:'back.in(2)',onComplete:()=>{target.group.visible=false}})}
  playCosmeticEffect(id,position,intensity=1){const item=COSMETICS.find(entry=>entry.id===id);if(!item||!position)return;const pos=position.clone().add(new THREE.Vector3(0,1,0)),primary=item.visual?.primary||0xffd23f,secondary=item.visual?.secondary||0xffffff,model=item.visual?.model;this.particles.burst(pos,primary,Math.round((model==='fireworks'||model==='jackpot'?70:38)*intensity),10*intensity);this.particles.burst(pos,secondary,Math.round(24*intensity),model==='lightning'?18:7*intensity)}
  handleDeath(target,source,details={}){
    if (target.group && target.group.position) {
      const pos = target.group.position;
      if (target.type === 'unit') {
        this.audio.play(details.explosive?'destructo_explosion_death':'destructo_death', pos);
        this.audio.play('destructo_bloodsplash', pos);
      } else if (target.type === 'prop' && (target.subtype || '').toLowerCase().includes('tree')) {
        this.audio.play('tree_explode', pos);
      } else if (['factory', 'turret', 'bunker'].includes(target.type)) {
        this.audio.play('structure_death', pos);
      } else {
        this.audio.play('explosion', pos, target.type === 'factory' ? 0.7 : 1.1);
      }
    } else {
      this.audio.play('explosion', null, target.type === 'factory' ? 0.7 : 1.1);
    }
    if(target.type==='unit')this.spawnDeathQuip(target);if(target.deathEffect)this.playCosmeticEffect(target.deathEffect,target.group.position,1);if(source?.killEffect&&target.type==='unit')this.playCosmeticEffect(source.killEffect,target.group.position,1.15);this.world.removeCollidersFor?.(target);this.spawnDestructibleSupply(target);if(this.campaignActive&&this.mission.id==='atlas-homecoming'&&target.type==='unit'&&this.hostile(this.playerTeam,target.team))this.spawnAtlasEnemyDrop(target);if(target.missionVIP)this.quest?.fail('PROFESSOR LEODONES WAS KILLED');if(this.lockTarget===target)this.lockTarget=null;if(this.turretLockTarget===target)this.turretLockTarget=null;if(target.mountedTurret||target.mountedBunker||target.mountedMotorcycle)this.exitInteractive(target,true);if(target.rider)this.exitInteractive(target.rider,true);if(target.occupants)for(const u of [...target.occupants])this.exitInteractive(u,true);if(target.driver)this.exitInteractive(target.driver,true);if(target.passenger)this.exitInteractive(target.passenger,true);if(target.carriedCrate){target.carriedCrate.carried=false;target.carriedCrate.physicsActive=true;target.carriedCrate.velocity.copy(target.velocity||new THREE.Vector3()).multiplyScalar(.35);target.carriedCrate.angularVelocity.set(2,1,-2);target.carriedCrate=null}this.triggerDeathExplosion(target);
    if(this.state==='observer'&&target.type==='unit'&&source?.team&&this.hostile(target.team,source.team))this.featureObserverKill(source,target);
    if(target.danger)target.danger.visible=false;
    if(['unit','vehicle','turret'].includes(target.type)){if(target.team)this.recordStat(target.team,'deaths');if(source&&source.team)this.recordStat(source.team,'kills');}
    else if(target.type==='factory'){if(source&&source.team)this.recordStat(source.team,'structuresDestroyed');}
    else if(target.type==='wildlife'){if(source&&source.team)this.recordStat(source.team,'neutralKills');}
    else if(target.type==='prop'){
      const isStructure=['brick','concrete','cobble','marble','plating','crystal'].includes(target.subtype);
      if(source&&source.team)this.recordStat(source.team,isStructure?'structuresDestroyed':'destructiblesDestroyed');
    }
    if(!this.observerOnly&&target===this.player){const next=(this.campaignActive?this.controllableUnits(this.playerTeam):this.livingUnits(this.playerTeam))[0];if(next){this.possess(next);this.hud.toast(`${next.classDef.name.toUpperCase()} TAKING COMMAND`)}else if(!this.world.factories[this.playerTeam].dead)this.hud.toast('SQUAD WIPED — REINFORCEMENT INCOMING',true)}
    if(target.type==='factory'){this.hud.toast(`${this.teamMap[target.team]?.name.toUpperCase()??'A'} BASE DESTROYED${target.team===this.playerTeam?' — NO MORE RESPAWNS':''}`,target.team===this.playerTeam);this.particles.burst(target.group.position.clone().add(new THREE.Vector3(0,2,0)),this.teamMap[target.team]?.color??0xff5062,90,15);
      if(target===this.world.redFactory&&this.mission.type==='assault'){setTimeout(()=>this.startVictorySequence(this.teamMap[this.playerTeam]),900);return}}
    if(target.type==='unit'&&this.hostile(this.playerTeam,target.team)){this.kills++;if(source)source.kills=(source.kills||0)+1}
    if(target.type==='wildlife'&&target.kind==='slime'){const charged=this.factory.createCrate(target.group.position.clone(),'blue');this.world.crates.push(charged)}
    this.explodeUnit(target)}
  updateSunShadow(dt=.016){
    if(!this.sun||!this.camera)return;const quality=this.performanceGovernor?.quality??1,interval=quality<.45?1/6:quality<.7?1/12:1/24;this._shadowTimer=(this._shadowTimer??interval)+dt;if(this._shadowTimer<interval)return;this._shadowTimer%=interval;this._shadowFocus=this._shadowFocus||new THREE.Vector3();this._shadowNextFocus=this._shadowNextFocus||new THREE.Vector3();const focus=this._shadowNextFocus.set(this.camera.position.x,0,this.camera.position.z);if(this.player?.group?.position&&this.state==='mission')focus.lerp(this.player.group.position,.7);const moved=focus.distanceToSquared(this._shadowFocus)>.04;if(moved){this._shadowFocus.copy(focus);this.sun.position.set(focus.x-45,focus.y+78,focus.z-35);this.sun.target.position.copy(focus);this.sun.updateMatrixWorld();this.sun.target.updateMatrixWorld();}if(this.renderer?.shadowMap?.enabled)this.renderer.shadowMap.needsUpdate=true;
  }
  updateSecretDiscoveries(){
    if(this.state!=='mission'||!this.player||!this.world?.secretPlaces?.length)return;this.discoveredSecrets=this.discoveredSecrets||new Set();for(const secret of this.world.secretPlaces){if(this.discoveredSecrets.has(secret.name)||this.player.group.position.distanceToSquared(secret.position)>(secret.radius||11)**2)continue;this.discoveredSecrets.add(secret.name);this.hud.toast(`SECRET FOUND \u00b7 ${secret.name}`,false);this.audio.play('pickup',1.25);this.particles?.burst(secret.position.clone().add(new THREE.Vector3(0,1.4,0)),this.teamMap[this.playerTeam]?.color||0xffd23f,28,7);}
  }
  updateCamera(dt){
    if(this.state==='victory_sequence'){
      const hero=this.victoryHero;
      if(hero){
        this.victoryCamAngle=(this.victoryCamAngle||0)+dt*0.5;
        const camPos=new THREE.Vector3(hero.group.position.x+Math.sin(this.victoryCamAngle)*4.5,hero.group.position.y+1.2+Math.sin(this.victoryCamAngle*0.5)*0.4,hero.group.position.z+Math.cos(this.victoryCamAngle)*4.5);
        this.camera.position.lerp(camPos,1-Math.pow(0.001,dt));this.camera.lookAt(hero.group.position.clone().add(new THREE.Vector3(0,1.2,0)));
      }
      return;
    }
    if(this.state==='observer'){
      this.updateObserverCamera(dt);
      return;
    }
    const p=this.player;if(!p)return;
    if(this.fpsMode){
      if(this.camera.fov!==72){
        this.camera.fov=72;
        this.camera.updateProjectionMatrix();
      }
      // follow the raw look direction, not p.aim: the aim now carries ballistic
      // compensation and would otherwise tilt the first-person view upward
      const fpsLook=this.lookDirection();
      const eye=p.group.position.clone().add(new THREE.Vector3(0,1.62,0)).addScaledVector(fpsLook,.42);
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().add(fpsLook));
      this.applyCameraShake(dt);
      return;
    }
    // ── shoulder camera: the boom hangs behind the mouse-look direction, the
    //    crosshair stays screen-centered, and mounts just swap rig dimensions ──
    if(this.camera.fov!==62){this.camera.fov=62;this.camera.updateProjectionMatrix()}
    const look=this.lookDirection();
    let anchor=p.group.position,height=2.05,dist=5.2,side=.85;
    if(p.mountedTurret){anchor=p.mountedTurret.group.position;height=3.55;dist=6.6;side=1.05}
    else if(p.mountedBunker){anchor=p.mountedBunker.group.position;height=3.4;dist=7.4;side=.9}
    else if(p.mountedMotorcycle){const bike=p.mountedMotorcycle;anchor=bike.group.position;height=2.7;dist=bike.vehicleKind==='tank'?9.6:7.6;side=0}
    const yaw=this.fpsYaw||0,right=new THREE.Vector3(-Math.cos(yaw),0,Math.sin(yaw));
    const pivot=anchor.clone().add(new THREE.Vector3(0,height,0)).addScaledVector(right,side);
    const desired=pivot.clone().addScaledVector(look,-dist);
    const minY=this.world.groundAt(desired)+.45;if(desired.y<minY)desired.y=minY;
    if(this.cameraScout){
      const scout=this.cameraScout;
      if(!scout.returning){scout.elapsed+=dt;const scoutPos=scout.point.clone().add(new THREE.Vector3(0,24,18));this.camera.position.lerp(scoutPos,1-Math.pow(.00001,dt));this.camera.lookAt(scout.point);if(scout.elapsed>=3)scout.returning=true;return}
      this.camera.position.lerp(desired,1-Math.pow(.00001,dt));this.camera.lookAt(pivot.clone().addScaledVector(look,30));
      if(this.camera.position.distanceTo(desired)<.8)this.cameraScout=null;
      return;
    }
    this.camera.position.copy(desired);
    this.camera.lookAt(pivot.clone().addScaledVector(look,30));
    this.applyCameraShake(dt)}
  // impulse-based shake: shots pump camShake, the boom jitters and settles
  applyCameraShake(dt){
    this.camShake=Math.max(0,(this.camShake||0)-dt*3.4);
    if(this.camShake>0){const s=this.camShake*this.camShake;this.camera.position.add(new THREE.Vector3((Math.random()-.5)*.34*s,(Math.random()-.5)*.22*s,(Math.random()-.5)*.34*s))}
  }
  endMission(won){if(this.state!=='mission' && this.state!=='scoreboard')return;const reward=this.observerOnly?0:won?this.mission.reward+this.kills*35:Math.floor(this.kills*12);if(!this.observerOnly)this.save.recordMission(won,this.kills,reward);this.endRuntime();this.state='results';this.presentMenuBackdrop();
    if (this.observerOnly) {
      this.audio.playMusic('/music/battle_win.mp3', false);
    } else if (won) {
      this.audio.playMusic('/music/battle_win.mp3', false);
    } else {
      this.audio.playMusic('/music/battle_lost.mp3', false);
    }
    this.screen.innerHTML=`<main class="menu mission-end"><span class="eyebrow">${this.gameMode==='domination'?'TOWER DOMINION':this.mission.name.toUpperCase()}</span><h2>${this.observerOnly?'MATCH COMPLETE':won?'VICTORY':'SQUAD LOST'}</h2><div class="stat-row"><div><strong>${(this.winningTeam||this.teams.find(t=>!t.eliminated))?.name?.toUpperCase()||'—'}</strong><span>WINNER</span></div><div><strong>${Math.floor(this.elapsed/60)}:${String(Math.floor(this.elapsed%60)).padStart(2,'0')}</strong><span>TIME</span></div><div><strong>${reward}</strong><span>MISSION CHIPS</span></div></div><div class="menu-actions"><button class="btn primary" data-action="menu">MAIN MENU</button><button class="btn" data-action="missions">MISSION SELECT</button></div></main>`}
  recordStat(teamId,statName,amount=1){if(this.teamStats&&this.teamStats[teamId]){this.teamStats[teamId][statName]=(this.teamStats[teamId][statName]||0)+amount;}}
  recordDestructoCreated(unit){const stats=this.teamStats?.[unit?.team];if(!stats||unit.type!=='unit')return;const id=unit.classId||'unknown';stats.destructosCreated[id]=(stats.destructosCreated[id]||0)+1}
  healUnit(target,amount,healer=target){if(!target||target.dead||!Number.isFinite(target.maxHp))return 0;const before=target.hp;target.hp=Math.min(target.maxHp,target.hp+amount);const healed=Math.max(0,target.hp-before);if(healed&&healer?.team)this.recordStat(healer.team,'healing',healed);return healed}
  enterObserverMode(){if(this.state==='observer')return;this.endRuntime();document.exitPointerLock?.();this.input.mouse.down=false;this.input.enabled=true;this.state='observer';document.getElementById('respawn-overlay')?.classList.add('hidden');document.getElementById('observer-panel')?.classList.remove('hidden');document.body.classList.add('observing');if(this.gameMode==='domination')this.configureModeHud();this.obsZoom=1;this.obsRotation=0;this.obsPitch=.65;this.observerMode='free';this.directorTimer=0;this.freeLookPosition=this.camera.position.clone();this.freeLookYaw=0;this.freeLookPitch=-.35;this.observerTarget=this.observerUnits()[0]||null;this.directorTarget=this.observerTarget;this.directorCutDelay=0;this.pendingCutTarget=null;this.pendingCutAngle=null;this.pendingCutFeature=null;this.wasInBattle=false;this.transparentCrate=null;this.cameraScout=null;this.lockTarget=null;this.turretLockTarget=null;this._observerUiAccumulator=0;this._observerMapAccumulator=0;this._observerStrengthKey=null;this.initObserverUI();this.setObserverMode(this.observerMode);this.updateObserverUI()}
  initObserverUI(){
    const teamSelect=document.getElementById('obs-team-select');const unitSelect=document.getElementById('obs-unit-select');
    this.selectedBetTeam=null;const amount=document.getElementById('obs-bet-amount'),button=document.getElementById('obs-bet-btn');amount.disabled=false;button.disabled=false;document.getElementById('obs-bet-status').textContent='SELECT A TEAM';
    teamSelect.innerHTML='';
    const teams=this.teams.filter(t=>!t.eliminated);
    for(const t of teams){const opt=document.createElement('option');opt.value=t.id;opt.textContent=t.name.toUpperCase();teamSelect.appendChild(opt);}
    if(teams.length){const preferred=teams.some(t=>t.id===this.observerTarget?.team)?this.observerTarget.team:teams[0].id;teamSelect.value=preferred;this.observeTeam(preferred,Math.max(0,this.livingUnits(preferred).indexOf(this.observerTarget)));}
    teamSelect.onchange=(e)=>{this.observeTeam(e.target.value);};
    unitSelect.onchange=(e)=>{const units=this.livingUnits(teamSelect.value);const idx=parseInt(e.target.value);if(units[idx]){this.observerTarget=units[idx];if(this.observerMode==='free')this.setObserverMode('follow')}};
    document.querySelectorAll('[data-obs-mode]').forEach(button=>button.onclick=()=>this.setObserverMode(button.dataset.obsMode));
    const prev=document.getElementById('obs-prev-unit'),next=document.getElementById('obs-next-unit'),nextTeam=document.getElementById('obs-next-team');
    if(prev)prev.onclick=()=>this.cycleObserverUnit(-1);if(next)next.onclick=()=>this.cycleObserverUnit(1);if(nextTeam)nextTeam.onclick=()=>this.cycleObserverTeam(1);
    document.getElementById('obs-bet-btn').onclick=()=>this.placeObserverBet();this.refreshObserverOdds();
  }
  observeTeam(teamId,index=0){
    const unitSelect=document.getElementById('obs-unit-select');unitSelect.innerHTML='';
    const units=this.livingUnits(teamId);
    units.forEach((u,i)=>{const opt=document.createElement('option');opt.value=i;opt.textContent=`${u.classDef.name.toUpperCase()} (HP ${Math.ceil(u.hp)})`;unitSelect.appendChild(opt);});
    if(units.length>0){const safe=(index+units.length)%units.length;this.observerTarget=units[safe];unitSelect.value=String(safe);}else{this.observerTarget=null;}
  }
  observerTeams(){return (this.teams||[]).filter(team=>!team.eliminated&&this.livingUnits(team.id).length>0)}
  observerUnits(){return this.observerTeams().flatMap(team=>this.livingUnits(team.id))}
  syncObserverSelection(){const target=this.observerTarget;if(!target)return;const team=document.getElementById('obs-team-select'),unit=document.getElementById('obs-unit-select');if(team&&team.value!==target.team){team.value=target.team;this.observeTeam(target.team,Math.max(0,this.livingUnits(target.team).indexOf(target)));return}if(unit)unit.value=String(Math.max(0,this.livingUnits(target.team).indexOf(target)))}
  cycleObserverUnit(delta){if(this.observerMode!=='follow')return;const teamId=this.observerTarget?.team||document.getElementById('obs-team-select')?.value,units=this.livingUnits(teamId);if(!units.length){this.cycleObserverTeam(delta>=0?1:-1);return}const current=Math.max(0,units.indexOf(this.observerTarget)),next=(current+delta+units.length)%units.length;this.observerTarget=units[next];this.syncObserverSelection()}
  cycleObserverTeam(delta=1){if(this.observerMode!=='follow')return;const teams=this.observerTeams();if(!teams.length){this.observerTarget=null;return}const currentId=this.observerTarget?.team||document.getElementById('obs-team-select')?.value,current=Math.max(0,teams.findIndex(t=>t.id===currentId)),next=teams[(current+delta+teams.length)%teams.length];const select=document.getElementById('obs-team-select');if(select)select.value=next.id;this.observeTeam(next.id,0)}
  updateObserverInput(){
    for(const [key,mode] of [['Digit1','follow'],['Digit2','pov'],['Digit3','free'],['Digit4','cinematic']])if(this.input.consume(key))this.setObserverMode(mode);
    if(this.observerMode==='follow'){if(this.input.consume('KeyQ')||this.input.consume('BracketLeft'))this.cycleObserverUnit(-1);if(this.input.consume('KeyE')||this.input.consume('BracketRight'))this.cycleObserverUnit(1);if(this.input.consume('KeyR'))this.cycleObserverTeam(1)}
    else{if(this.input.consume('BracketLeft'))this.cycleObserverTarget(-1);if(this.input.consume('BracketRight'))this.cycleObserverTarget(1)}
  }
  updateObserverUI(){
    const teamSelect=document.getElementById('obs-team-select');
    if(!this.observerTarget||this.observerTarget.dead){
      const previousTeam=this.observerTarget?.team,remaining=previousTeam?this.livingUnits(previousTeam):[];
      if(remaining.length){this.observerTarget=remaining[0];this.syncObserverSelection()}else{const t=this.observerTeams()[0];if(t){teamSelect.value=t.id;this.observeTeam(t.id);}else{this.observerTarget=null;}}
    }
    const clock=document.getElementById('obs-clock');if(clock)clock.textContent=`${Math.floor(this.elapsed/60)}:${String(Math.floor(this.elapsed%60)).padStart(2,'0')}`;
    this.updateObserverStrength();
    this.syncObserverSelection();const unitCount=this.observerTarget?this.livingUnits(this.observerTarget.team).length:0,teamCount=this.observerTeams().length;for(const id of ['obs-prev-unit','obs-next-unit']){const button=document.getElementById(id);if(button)button.disabled=unitCount<2}const teamButton=document.getElementById('obs-next-team');if(teamButton)teamButton.disabled=teamCount<2;
    this._oddsRefresh=(this._oddsRefresh||0)+.033;if(this._oddsRefresh>.8&&!this.observerBet){this._oddsRefresh=0;this.refreshObserverOdds()}
  }
  updateObserverStrength(){const root=document.getElementById('observer-strength');if(!root||!this.factory)return;const signature=this.teams.map(t=>`${t.id}:${this.livingUnits(t.id).map(u=>u.id).join(',')}`).join('|');if(signature===this._observerStrengthKey)return;this._observerStrengthKey=signature;root.innerHTML=this.teams.map(team=>{const units=this.livingUnits(team.id),icons=units.map(unit=>`<img src="${this.factory.unitPortrait(unit)}" alt="${escapeHtml(unit.classDef?.name||'Destructo')}" title="${escapeHtml(unit.classDef?.name||'Destructo')}">`).join('')||'<span class="empty">ELIMINATED</span>';return`<div class="obs-strength-team" style="--team:${hex(team.color)}"><strong>${escapeHtml(team.name)} · ${units.length}</strong><div class="obs-heads">${icons}</div></div>`}).join('')}
  resetObserverCamera(){this.obsZoom=1;this.obsRotation=0;this.obsPitch=.65;this.camera.up?.set?.(0,1,0);this.camera.quaternion?.identity?.();const focus=this.observerTarget?.group?.position||new THREE.Vector3();this.camera.position.copy(focus).add(new THREE.Vector3(0,21,20));this.camera.lookAt(focus.clone().add(new THREE.Vector3(0,1.2,0)));if(this.camera.fov!==48){this.camera.fov=48;this.camera.updateProjectionMatrix()}}
  setObserverMode(mode){if(!['follow','pov','free','cinematic'].includes(mode))return;this.resetObserverCamera();this.observerMode=mode;this.directorCutDelay=0;this.pendingCutTarget=null;this.pendingCutAngle=null;this.pendingCutFeature=null;this.wasInBattle=false;if(this.transparentCrate){this.restoreCrateOpacity(this.transparentCrate);this.transparentCrate=null;}if(mode==='free'){this.freeLookPosition=this.camera.position.clone();const d=new THREE.Vector3();this.camera.getWorldDirection(d);this.freeLookYaw=Math.atan2(d.x,d.z);this.freeLookPitch=Math.asin(THREE.MathUtils.clamp(d.y,-1,1))}if(mode==='cinematic')this.directorTimer=0;const fov=mode==='pov'?72:48;if(this.camera.fov!==fov){this.camera.fov=fov;this.camera.updateProjectionMatrix()}document.querySelectorAll('[data-obs-mode]').forEach(b=>b.classList.toggle('active',b.dataset.obsMode===mode));document.getElementById('obs-follow-controls')?.classList.toggle('hidden',mode!=='follow');const label=document.getElementById('obs-mode-label'),guide=document.getElementById('obs-control-guide');if(label)label.textContent=mode==='pov'?'PLAYER POV':mode==='free'?'FREELOOK':mode==='cinematic'?'AI DIRECTOR':'FOLLOW CAM';if(guide)guide.textContent=mode==='follow'?'Q PREV UNIT · E NEXT UNIT · R NEXT TEAM · [ / ] UNIT ALIASES · DRAG ROTATE':mode==='free'?'WASD MOVE · Q/E ALTITUDE · DRAG LOOK · WHEEL ZOOM · 1–4 CAMERA MODES':mode==='pov'?'TARGET LOCKED · WHEEL FOV · 1–4 CAMERA MODES':'AUTOMATIC BATTLE CUTS · 1–4 CAMERA MODES';this.updateObserverUI()}
  cycleObserverTarget(delta){const units=this.observerUnits();if(!units.length){this.observerTarget=null;return}const i=Math.max(0,units.indexOf(this.observerTarget));const next=units[(i+delta+units.length)%units.length];this.observerTarget=next;this.syncObserverSelection()}
  observerMapCommand(point){if(this.state!=='observer')return;const pos=new THREE.Vector3(point.x,this.world.heightAt(point.x,point.z)+24,point.z+12);if(this.observerMode==='free'){this.freeLookPosition=pos;return}let best=null,d=Infinity;for(const u of this.observerUnits()){const n=(u.group.position.x-point.x)**2+(u.group.position.z-point.z)**2;if(n<d){d=n;best=u}}if(best&&d<225){this.observerTarget=best;if(this.observerMode!=='pov')this.setObserverMode('follow')}else{this.freeLookPosition=pos;this.setObserverMode('free')}}
  updateObserverCamera(dt){
    let targetCrate=null;
    if(this.observerMode==='pov'&&this.observerTarget&&!this.observerTarget.dead&&this.observerTarget.carriedCrate){
      targetCrate=this.observerTarget.carriedCrate;
    }
    if(targetCrate!==this.transparentCrate){
      if(this.transparentCrate)this.restoreCrateOpacity(this.transparentCrate);
      this.transparentCrate=targetCrate;
      if(targetCrate)this.makeCrateTransparent(targetCrate);
    }
    const target=this.observerTarget;
    if(this.input.mouse.down){
      this.obsRotation-=this.input.mouse.dx*.009;
      this.obsPitch=THREE.MathUtils.clamp(this.obsPitch+this.input.mouse.dy*.006,-1.35,1.45);
      if(this.observerMode==='free'){
        this.freeLookYaw-=this.input.mouse.dx*.004;
        this.freeLookPitch=THREE.MathUtils.clamp(this.freeLookPitch-this.input.mouse.dy*.004,-1.45,1.45);
      }
    }
    if(this.input.mouse.wheelDelta){
      this.obsZoom=THREE.MathUtils.clamp(this.obsZoom+this.input.mouse.wheelDelta*.0015,.25,8);
    }
    if(this.observerMode==='free'){
      const targetFov=THREE.MathUtils.clamp(48*this.obsZoom,10,120);
      if(this.camera.fov!==targetFov){
        this.camera.fov=targetFov;
        this.camera.updateProjectionMatrix();
      }
      const axis=this.input.axis(),speed=(this.input.keys.has('ShiftLeft')?70:32)*dt,forward=new THREE.Vector3(Math.sin(this.freeLookYaw),0,Math.cos(this.freeLookYaw)),right=new THREE.Vector3(-forward.z,0,forward.x);
      this.freeLookPosition.addScaledVector(forward,-axis.z*speed).addScaledVector(right,axis.x*speed);
      if(this.input.keys.has('KeyQ'))this.freeLookPosition.y+=speed;
      if(this.input.keys.has('KeyE'))this.freeLookPosition.y-=speed;
      const b=this.world.bounds||78;
      this.freeLookPosition.x=THREE.MathUtils.clamp(this.freeLookPosition.x,-b,b);
      this.freeLookPosition.z=THREE.MathUtils.clamp(this.freeLookPosition.z,-b,b);
      this.freeLookPosition.y=THREE.MathUtils.clamp(this.freeLookPosition.y,this.world.groundAt(this.freeLookPosition)+2,140);
      const look=new THREE.Vector3(Math.sin(this.freeLookYaw)*Math.cos(this.freeLookPitch),Math.sin(this.freeLookPitch),Math.cos(this.freeLookYaw)*Math.cos(this.freeLookPitch));
      this.camera.position.copy(this.freeLookPosition);
      this.camera.lookAt(this.freeLookPosition.clone().add(look));
      return;
    }
    if(!target)return;
    if(this.observerMode==='pov'){
      // live shoulder-cam POV: ride behind the Destructo exactly like the
      // player's own combat camera, steered by wherever the unit is aiming
      const targetFov=THREE.MathUtils.clamp(72*this.obsZoom,10,120);
      if(this.camera.fov!==targetFov){
        this.camera.fov=targetFov;
        this.camera.updateProjectionMatrix();
      }
      const aim=target.aim?.clone()||new THREE.Vector3(Math.sin(target.group.rotation.y),0,Math.cos(target.group.rotation.y));
      if(aim.lengthSq()<.001)aim.set(Math.sin(target.group.rotation.y),0,Math.cos(target.group.rotation.y));
      aim.normalize();
      const yaw=Math.atan2(aim.x,aim.z),right=new THREE.Vector3(-Math.cos(yaw),0,Math.sin(yaw));
      const pivot=target.group.position.clone().add(new THREE.Vector3(0,2.0,0)).addScaledVector(right,.8);
      const desired=pivot.clone().addScaledVector(aim,-4.8);
      const minY=(this.world?.groundAt?.(desired)??0)+.4;if(desired.y<minY)desired.y=minY;
      this.camera.position.lerp(desired,1-Math.pow(.0001,dt));
      this.camera.lookAt(pivot.clone().addScaledVector(aim,30));
      return;
    }
    if(this.observerMode==='cinematic'){
      if(this.camera.fov!==48){
        this.camera.fov=48;
        this.camera.updateProjectionMatrix();
      }
      this.updateDirector(dt);
      return;
    }
    if(this.camera.fov!==48){
      this.camera.fov=48;
      this.camera.updateProjectionMatrix();
    }
    const radius=25*this.obsZoom,offset=new THREE.Vector3(Math.sin(this.obsRotation)*Math.cos(this.obsPitch)*radius,Math.sin(this.obsPitch)*radius,Math.cos(this.obsRotation)*Math.cos(this.obsPitch)*radius),desired=target.group.position.clone().add(offset);
    this.camera.position.lerp(desired,1-Math.pow(.001,dt));
    this.camera.lookAt(target.group.position.clone().add(new THREE.Vector3(0,1.2,0)));
  }
  makeCrateTransparent(crate){
    if(!crate)return;
    if(crate.box&&crate.box.material){
      crate.box.material.transparent=true;
      crate.box.material.opacity=0.15;
      crate.box.material.needsUpdate=true;
    }
    for(const band of crate.bands||[]){
      if(band.material){
        band.material.transparent=true;
        band.material.opacity=0.15;
        band.material.needsUpdate=true;
      }
    }
  }
  restoreCrateOpacity(crate){
    if(!crate)return;
    if(crate.box&&crate.box.material){
      crate.box.material.transparent=false;
      crate.box.material.opacity=1.0;
      crate.box.material.needsUpdate=true;
    }
    for(const band of crate.bands||[]){
      if(band.material){
        band.material.transparent=false;
        band.material.opacity=1.0;
        band.material.needsUpdate=true;
      }
    }
  }
  updateDirector(dt){
    if(this.directorCutDelay>0){
      this.directorCutDelay-=dt;
      if(this.directorCutDelay<=0){
        this.directorCutDelay=0;
        if(this.pendingCutTarget&&!this.pendingCutTarget.dead){
          this.directorTarget=this.pendingCutTarget;
          this.observerTarget=this.pendingCutTarget;
          if(this.pendingCutAngle!==null)this.directorAngle=this.pendingCutAngle;
          if(this.pendingCutFeature){
            this.showObserverFeature(
              this.pendingCutFeature.kicker,
              this.pendingCutFeature.title,
              this.pendingCutFeature.subtitle,
              this.pendingCutFeature.duration
            );
          }
          this.directorTimer=3.5+Math.random()*2;
        } else {
          this.directorTimer=0;
        }
        this.pendingCutTarget=null;
        this.pendingCutAngle=null;
        this.pendingCutFeature=null;
      }
    }
    if(this.directorCutDelay<=0){
      const t=this.directorTarget;
      if(!t||t.dead){
        this.directorCutDelay=2.0;
        this.pendingCutTarget=null;
        this.wasInBattle=false;
      } else {
        const foe=this.combatants.find(v=>!v.dead&&this.hostile(t.team,v.team)&&v.group.position.distanceTo(t.group.position)<22);
        const inBattle=!!foe;
        if(inBattle){
          this.wasInBattle=true;
          this.directorTimer=3.5+Math.random()*2;
        } else {
          if(this.wasInBattle){
            this.directorCutDelay=2.0;
            this.pendingCutTarget=null;
            this.wasInBattle=false;
          } else {
            this.directorTimer-=dt;
            if(this.directorTimer<=0)this.directorTimer=0;
          }
        }
      }
      if(this.directorTimer<=0&&this.directorCutDelay<=0){
        this.directorTimer=3.5+Math.random()*2;
        let best=null,score=-Infinity;
        for(const u of this.observerUnits()){
          const nearby=this.combatants.filter(v=>!v.dead&&this.hostile(u.team,v.team)&&v.group.position.distanceTo(u.group.position)<18).length;
          const s=nearby*40+(u.kills||0)*12+(1-u.hp/u.maxHp)*18+Math.random()*15;
          if(s>score){
            score=s;
            best=u;
          }
        }
        this.directorTarget=best||this.observerTarget;
        if(this.directorTarget){
          this.observerTarget=this.directorTarget;
          this.showObserverFeature('AI DIRECTOR',score>45?'ENGAGEMENT DETECTED':'PLAYER TO WATCH',`${this.teamMap[this.directorTarget.team]?.name} · ${this.directorTarget.classDef.name}`,.9);
          const foe=this.combatants.find(v=>!v.dead&&this.hostile(this.directorTarget.team,v.team)&&v.group.position.distanceTo(this.directorTarget.group.position)<22);
          this.wasInBattle=!!foe;
        }
      }
    }
    const t=this.directorTarget;
    if(!t)return;
    this.directorAngle=(this.directorAngle||0)+dt*.3;
    const foe=this.combatants.find(v=>!v.dead&&this.hostile(t.team,v.team)&&v.group.position.distanceTo(t.group.position)<22);
    const focus=foe?t.group.position.clone().lerp(foe.group.position,.45):t.group.position.clone();
    const radius=(foe?10:16)*this.obsZoom;
    const height=(5.5+Math.sin(this.directorAngle*.7)*2)*this.obsZoom;
    const desired=focus.clone().add(new THREE.Vector3(Math.sin(this.directorAngle)*radius,height,Math.cos(this.directorAngle)*radius));
    this.camera.position.lerp(desired,1-Math.pow(.00005,dt));
    this.camera.lookAt(focus.clone().add(new THREE.Vector3(0,1,0)));
  }
  showObserverFeature(kicker,title,subtitle,duration=3.5){const el=document.getElementById('observer-feature');if(!el)return;document.getElementById('observer-feature-kicker').textContent=kicker;document.getElementById('observer-feature-title').textContent=title;document.getElementById('observer-feature-subtitle').textContent=subtitle;el.classList.remove('hidden');clearTimeout(this._featureTimer);this._featureTimer=setTimeout(()=>el.classList.add('hidden'),duration*1000)}
  featureObserverKill(killer,victim){
    if(this.observerMode==='cinematic'){
      this.directorCutDelay=2.0;
      this.pendingCutTarget=killer;
      this.pendingCutAngle=Math.atan2(killer.group.position.x-victim.group.position.x,killer.group.position.z-victim.group.position.z)+1.2;
      this.pendingCutFeature={
        kicker:'FIGHT WINNER',
        title:`${this.teamMap[killer.team]?.name.toUpperCase()} STRIKES`,
        subtitle:`${killer.classDef?.name||'Destructo'} · ${(killer.kills||0)+1} eliminations`,
        duration:4.2
      };
    } else {
      this.directorTarget=killer;
      this.directorTimer=4.5;
    }
  }
  liveTeamData(){return Object.fromEntries(this.teams.map(t=>{const units=this.livingUnits(t.id),hp=units.length?units.reduce((n,u)=>n+u.hp/u.maxHp*100,0)/units.length:5;return[t.id,{units:units.length,hp}]}))}
  refreshObserverOdds(){if(!this.teams)return;this.currentOdds=this.league.oddsFor(this.teams.filter(t=>!t.eliminated),this.liveTeamData(),this.world);const root=document.getElementById('obs-odds');if(!root)return;root.innerHTML=this.teams.filter(t=>!t.eliminated).map(t=>`<button data-bet-team="${t.id}" style="--team:#${t.color.toString(16).padStart(6,'0')}"><span>${escapeHtml(t.name)}<small>${t.profile?.mmr||1000} MMR · ${t.profile?.wins||0}-${t.profile?.losses||0}</small></span><strong>${(this.currentOdds[t.id]||1).toFixed(2)}×</strong></button>`).join('');root.querySelectorAll('[data-bet-team]').forEach(b=>b.onclick=()=>{if(this.observerBet)return;this.selectedBetTeam=b.dataset.betTeam;root.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));document.getElementById('obs-bet-status').textContent=`BACKING ${this.teamMap[this.selectedBetTeam].name.toUpperCase()}`});document.getElementById('obs-wallet').textContent=`${this.save.data.chips} CHIPS`}
  placeObserverBet(){if(this.observerBet)return;const amount=Math.floor(Number(document.getElementById('obs-bet-amount').value));if(!this.selectedBetTeam){document.getElementById('obs-bet-status').textContent='SELECT A TEAM FIRST';return}if(!Number.isFinite(amount)||amount<1||!this.save.spend(amount)){document.getElementById('obs-bet-status').textContent='INVALID WAGER OR INSUFFICIENT CHIPS';return}this.observerBet={teamId:this.selectedBetTeam,amount,odds:this.currentOdds[this.selectedBetTeam]};document.getElementById('obs-bet-status').textContent=`BET LOCKED · ${amount} CHIPS · POTENTIAL ${Math.floor(amount*this.observerBet.odds)}`;document.getElementById('obs-bet-btn').disabled=true;document.getElementById('obs-bet-amount').disabled=true;this.refreshObserverOdds()}
  settleLeague(winningTeam){if(this.leagueSettled)return;this.leagueSettled=true;for(const t of this.teams)t.stats=this.teamStats[t.id];const mmrDelta=this.league.settle(winningTeam.id,this.observerOnly?null:this.playerTeam,this.teams,this.gameMode),won=winningTeam.id===this.playerTeam;this.lastMmrDelta=mmrDelta;this.save.setLeague(this.league.profiles,mmrDelta,this.observerOnly?null:won,this.gameMode);if(this.observerBet){const hit=this.observerBet.teamId===winningTeam.id,payout=hit?Math.floor(this.observerBet.amount*this.observerBet.odds):0;this.lastBetResult={hit,payout};if(payout)this.save.earn(payout);this.save.recordBet({...this.observerBet,winnerId:winningTeam.id,payout,at:Date.now()});this.showObserverFeature(hit?'BET WON':'BET LOST',hit?`+${payout} CHIPS`:`${winningTeam.name.toUpperCase()} WON`,`${this.observerBet.amount} wagered at ${this.observerBet.odds.toFixed(2)}×`,5)}}
  startVictorySequence(winningTeam){
    if(this.state==='victory_sequence')return;
    this.winningTeam=winningTeam;this.settleLeague(winningTeam);document.body.classList.remove('observing');
    this.hud.show(false);document.exitPointerLock?.();
    document.getElementById('domination-hud')?.classList.add('hidden');document.getElementById('domination-announcement')?.classList.add('hidden');
    document.getElementById('observer-panel').classList.add('hidden');
    document.getElementById('respawn-overlay').classList.add('hidden');
    this.state='victory_sequence';
    const living=this.livingUnits(winningTeam.id);
    let hero=null;if(living.length>0){hero=living.sort((a,b)=>(b.kills||0)-(a.kills||0))[0];}
    this.victoryHero=hero;if(hero){hero.state='victory';}
    this.victoryCamAngle=0;this.audio.play('pickup',2.0);if(!this.observerOnly&&winningTeam.id!==this.playerTeam)this.audio.play('defeat');
    const victoryOverlay=document.getElementById('victory-overlay');
    const subtitle=document.getElementById('victory-subtitle');
    subtitle.textContent=`TEAM ${winningTeam.name.toUpperCase()}${this.observerOnly?'':` · ${this.lastMmrDelta>=0?'+':''}${this.lastMmrDelta} MMR`}${this.lastBetResult?.hit?` · BET +${this.lastBetResult.payout} CHIPS`:''}`;
    victoryOverlay.classList.remove('hidden');
    setTimeout(()=>{this.showScoreboard();},6000);
  }
  showScoreboard(){
    this.state='scoreboard';
    document.getElementById('victory-overlay').classList.add('hidden');
    const scoreboardOverlay=document.getElementById('scoreboard-overlay');
    scoreboardOverlay.classList.remove('hidden');
    const tbody=document.getElementById('scoreboard-tbody');tbody.innerHTML='';
    for(const t of this.teams){
      const stats=this.teamStats[t.id]||{kills:0,deaths:0,bulletsFired:0,bulletsHit:0,destructiblesDestroyed:0,structuresDestroyed:0,cratesConsumed:0,neutralKills:0};
      const accuracy=stats.bulletsFired>0?((stats.bulletsHit/stats.bulletsFired)*100).toFixed(1)+'%':'0.0%';
      const created=Object.entries(stats.destructosCreated||{}).map(([id,count])=>`${CLASSES[id]?.name||id} ×${count}`).join(', ')||'—';
      const tr=document.createElement('tr');const teamColor=`#${t.color.toString(16).padStart(6,'0')}`;
      tr.innerHTML=`<td class="team-name-cell" style="color: ${teamColor}">${t.name.toUpperCase()}</td>
        <td>${stats.kills}</td><td>${stats.deaths}</td><td>${accuracy} <small style="color: #8b93a5">(${stats.bulletsHit}/${stats.bulletsFired})</small></td>
        <td>${stats.cratesConsumed}</td><td>${stats.destructiblesDestroyed}</td><td>${stats.structuresDestroyed}</td><td>${stats.neutralKills}</td><td class="created-cell">${created}</td><td>${Math.round(stats.healing||0)} HP</td>`;
      tbody.appendChild(tr);
    }
    const awardsList=document.getElementById('awards-list');awardsList.innerHTML='';
    const awardsDef=[
      {id:'apex',title:'APEX PREDATOR',icon:'☠️',desc:'Granted for the most unit and vehicle eliminations.',stat:'kills'},
      {id:'bullet',title:'BULLET STORM',icon:'☄️',desc:'Granted for firing the highest volume of projectiles.',stat:'bulletsFired'},
      {id:'demolisher',title:'TACTICAL DEMOLISHER',icon:'💥',desc:'Granted for destroying the most props and bases.',stat:'structuresDestroyed'},
      {id:'hoarder',title:'CRATE HOARDER',icon:'📦',desc:'Granted for collecting and consuming the most crates.',stat:'cratesConsumed'},
      {id:'neutralizer',title:'WILDLIFE NEUTRALIZER',icon:'🐺',desc:'Granted for eliminating the most neutral creatures.',stat:'neutralKills'},
      {id:'marksman',title:'MARKSMAN ELITE',icon:'🎯',desc:'Granted for achieving the highest projectile accuracy.',stat:'accuracy'}
    ];
    awardsDef.forEach(award=>{
      let bestTeam=null;let bestValue=-1;
      for(const t of this.teams){
        const stats=this.teamStats[t.id]||{kills:0,deaths:0,bulletsFired:0,bulletsHit:0,destructiblesDestroyed:0,structuresDestroyed:0,cratesConsumed:0,neutralKills:0};
        let val=award.stat==='accuracy'?(stats.bulletsFired>0?(stats.bulletsHit/stats.bulletsFired):0):(stats[award.stat]||0);
        if(val>bestValue&&val>0){bestValue=val;bestTeam=t;}
      }
      if(bestTeam){
        let valueStr=award.stat==='accuracy'?`${(bestValue*100).toFixed(1)}% Accuracy`:award.stat==='bulletsFired'?`${bestValue} Fired`:`${bestValue} Count`;
        const card=document.createElement('div');card.className='award-card';const teamColor=`#${bestTeam.color.toString(16).padStart(6,'0')}`;
        card.innerHTML=`<div class="award-icon">${award.icon}</div><div class="award-details">
          <span class="award-title">${award.title}</span><span class="award-recipient" style="color: ${teamColor}">TEAM ${bestTeam.name.toUpperCase()}</span>
          <span class="award-desc">${award.desc} (${valueStr})</span></div>`;
        awardsList.appendChild(card);
      }
    });
    document.getElementById('scoreboard-continue-btn').onclick=()=>{
      scoreboardOverlay.classList.add('hidden');
      const playerWon=this.winningTeam?this.winningTeam.id===this.playerTeam:!this.teams.find(t=>t.id===this.playerTeam).eliminated;
      this.endMission(playerWon);
    };
  }
  applySetupPreset(id){const count=id==='duel'?2:id==='chaos'?8:4;this.setup=defaultTeamSetup(count);if(id==='pairs')this.setup.forEach((t,i)=>t.group=Math.floor(i/2));this.matchSetup=freshMatchSetup({squadSize:id==='duel'?2:id==='chaos'?2:3,aiDifficulty:id==='chaos'?'veteran':'regular'});this.showGameSetup()}
  randomizeSetup(){const colors=[...TEAM_COLORS.keys()].sort(()=>Math.random()-.5);this.setup.forEach((t,i)=>{t.colorIndex=colors[i%colors.length];t.uniformIndex=Math.floor(Math.random()*SKIN_TEXTURES.length);t.group=i});this.showGameSetup()}
  hasHostileSetup(){return this.setup.some((a,i)=>this.setup.some((b,j)=>i!==j&&a.group!==b.group))}
  captureSetupView(){
    if(this.state!=='setup')return null;
    const menu=this.screen.querySelector('.setup-menu'),list=this.screen.querySelector('.setup-list'),active=document.activeElement;
    const focus=active&&this.screen.contains(active)?{
      teamName:active.dataset?.teamName,startingClass:active.dataset?.startingClass,setupRule:active.dataset?.setupRule,action:active.dataset?.action,
      selectionStart:Number.isFinite(active.selectionStart)?active.selectionStart:null,selectionEnd:Number.isFinite(active.selectionEnd)?active.selectionEnd:null,
    }:null;
    return{screenTop:this.screen.scrollTop||0,menuTop:menu?.scrollTop||0,listTop:list?.scrollTop||0,focus};
  }
  restoreSetupView(view){
    if(!view)return;
    const menu=this.screen.querySelector('.setup-menu'),list=this.screen.querySelector('.setup-list');
    const restoreScroll=()=>{this.screen.scrollTop=view.screenTop;if(menu)menu.scrollTop=view.menuTop;if(list)list.scrollTop=view.listTop};restoreScroll();
    const f=view.focus;if(!f)return;
    const selector=f.teamName!==undefined?`[data-team-name="${f.teamName}"]`:f.startingClass!==undefined?`[data-starting-class="${f.startingClass}"]`:f.setupRule?`[data-setup-rule="${f.setupRule}"]`:f.action?`[data-action="${f.action}"]`:null;
    const target=selector?this.screen.querySelector(selector):null;if(!target)return;target.focus?.({preventScroll:true});
    if(f.selectionStart!==null&&target.setSelectionRange)target.setSelectionRange(f.selectionStart,f.selectionEnd);restoreScroll();
  }
  // ── Game setup: team-oriented Battle Lab (alliance board for Deathmatch,
  //    free-for-all contender grid for Tower Dominion) ────────────────────────
  showGameSetup(){const setupView=this.captureSetupView();this.endRuntime();this.state='setup';this.presentMenuBackdrop();this.audio.playMusic('/music/main_theme.mp3');
    const dominationMode=this.selectedMode==='domination';
    if(dominationMode)this.setup.forEach((team,index)=>team.group=index);else normalizeAllianceGroups(this.setup);
    const option=(value,label,current)=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${label}</option>`;
    const hostile=this.hasHostileSetup(),humanIndex=this.setup.findIndex(t=>t.isHuman),observerOnly=humanIndex<0;
    const mapLimit=Math.min(MAX_PLAYERS,ALL_MAPS[this.selectedMap]?.maxTeams||MAX_PLAYERS),withinMapLimit=this.setup.length<=mapLimit;
    const displaySquadSize=dominationMode?DOMINATION_RULES.squadSize:this.matchSetup.squadSize;
    // one card per team: controller, name, aura, uniform (+ alliance mover in Deathmatch)
    const teamCard=(t,i)=>{const c=TEAM_COLORS[t.colorIndex%TEAM_COLORS.length],uniform=SKIN_TEXTURES[t.uniformIndex||0],human=Boolean(t.isHuman);
      return `<div class="team-card ${human?'human-card':''}" style="--team:${hex(c.color)}"><div class="team-card-top"><button class="role-switch ${human?'human':'cpu'}" data-action="setup:role:${i}" title="Switch between player and AI control"><span>${human?'PLAYER':'AI'}</span><small>${human?'CONTROL':'AUTOPILOT'}</small></button><input class="team-name" data-team-name="${i}" maxlength="14" value="${escapeHtml(t.name)}" aria-label="Team name"></div><div class="team-card-looks"><button class="aura-btn" data-action="teamcolor:${i}" style="--aura:${hex(c.color)}" title="Change aura color"><i></i><span>${c.name.toUpperCase()}</span></button><button class="uniform-preview" data-action="teamuniform:${i}" title="Change uniform texture"><canvas width="128" height="128" data-skin="${uniform}"></canvas><span>${uniform.toUpperCase()}</span></button></div>${dominationMode?'':`<div class="ally-move"><button class="ally-arrow" data-action="setup:alliance:${i}:-1" title="Move to the previous alliance">◀</button><span>ALLIANCE ${String.fromCharCode(65+t.group)}</span><button class="ally-arrow" data-action="setup:alliance:${i}:1" title="Move right — past the last column founds a new alliance">▶</button></div>`}</div>`};
    let roster;
    if(dominationMode){
      roster=`<div class="ffa-banner"><strong>${this.setup.length}-WAY FREE FOR ALL</strong><span>Every team fights alone in Tower Dominion — hold the pedestals to score.</span></div><div class="ffa-grid">${this.setup.map((t,i)=>teamCard(t,i)).join('')}</div>`;
    }else{
      const groups=[...new Set(this.setup.map(t=>t.group))].sort((a,b)=>a-b);
      const columns=groups.map(g=>{const members=this.setup.map((t,i)=>({t,i})).filter(({t})=>t.group===g);
        return `<div class="alliance-column"><header class="alliance-head"><strong>ALLIANCE ${String.fromCharCode(65+g)}</strong><small>${members.length} TEAM${members.length>1?'S':''} · ${members.length*displaySquadSize} STARTING UNITS</small></header>${members.map(({t,i})=>teamCard(t,i)).join('')}</div>`}).join('');
      const ghost=groups.length<Math.min(this.setup.length,5)?`<div class="alliance-column ghost"><header class="alliance-head"><strong>+ NEW ALLIANCE</strong></header><p>Push a team ▶ past the last column to found its own alliance.</p></div>`:'';
      roster=`<div class="alliance-board">${columns}${ghost}</div>`;
    }
    const classOptions=current=>Object.entries(CLASSES).map(([id,c])=>option(id,c.name.toUpperCase(),current)).join('');
    const startingSlots=Array.from({length:displaySquadSize},(_,i)=>dominationMode?`<label>STARTING UNIT ${i+1}<select disabled><option>COMMANDO · ASSAULT RIFLE</option></select></label>`:`<label>STARTING UNIT ${i+1}<select data-starting-class="${i}">${classOptions(this.matchSetup.startingClasses[i]||'scout')}</select></label>`).join('');
    const modeRules=dominationMode
      ?`<label>MAX SCORE TO WIN<select data-setup-rule="maxScore">${[50,100,150,250,500].map(v=>option(v,`${v} POINTS`,this.matchSetup.maxScore)).join('')}</select></label><label>RESPAWN TIME<select data-setup-rule="dominationRespawnSeconds">${[3,5,8,12].map(v=>option(v,`${v} SEC`,this.matchSetup.dominationRespawnSeconds)).join('')}</select></label><label>CAPTURE TIME<select disabled><option>${CAPTURE_SECONDS} SECONDS</option></select></label><label class="toggle-rule">ENDLESS REINFORCEMENTS<input type="checkbox" checked disabled></label>`
      :`<label>SUDDEN DEATH<select data-setup-rule="matchMinutes">${[3,5,8,12].map(v=>option(v,`${v} MIN`,this.matchSetup.matchMinutes)).join('')}</select></label><label class="toggle-rule">REINFORCEMENTS<input type="checkbox" data-setup-rule="reinforcements" ${this.matchSetup.reinforcements?'checked':''}></label><label>REINFORCE EVERY<select data-setup-rule="reinforcementSeconds">${[5,10,15,25,40].map(v=>option(v,`${v} SEC`,this.matchSetup.reinforcementSeconds)).join('')}</select></label>`;
    const battleShape=dominationMode?`${this.setup.length}-WAY FFA`:allianceSummary(this.setup);
    const modeCards=Object.values(GAME_MODES).map(mode=>`<button class="mode-card ${mode.id===this.selectedMode?'selected':''}" data-action="mode:${mode.id}"><small>${mode.kicker}</small><strong>${mode.title}</strong><span>${mode.description}</span></button>`).join('');
    const mapCards=mapsForMode(this.selectedMode).map(map=>`<button class="map-card ${map.id===this.selectedMap?'selected':''}" data-action="map:${map.id}" style="--map-accent:${map.accent};--map-art:url('/assets/textures/maps/${map.texture}.webp')"><span class="map-icon">${map.icon}</span><small>${map.tag}</small><strong>${map.title}</strong><p>${map.description}</p><em>${map.weather}${map.towerCount?` · ${map.towerCount} TOWERS`:map.maxTeams?` · ${map.sizeClass} · MAX ${map.maxTeams} TEAMS`:''}</em></button>`).join('');
    const conflictLabel=!withinMapLimit?`REMOVE ${this.setup.length-mapLimit} TEAM${this.setup.length-mapLimit>1?'S':''} FOR THIS MAP`:hostile?(observerOnly?'AI SIMULATION READY':`${battleShape} · READY TO DEPLOY`):'ALL TEAMS ARE ALLIED — SPLIT THE ALLIANCES';
    const deployable=hostile&&withinMapLimit;
    this.screen.innerHTML=`<main class="menu setup-menu"><div class="screen-title"><div><span class="eyebrow">GAME SETUP · ${GAME_MODES[this.selectedMode].kicker}</span><h2>${dominationMode?'DOMINION LAB':'BATTLE LAB'}</h2></div><strong>${this.setup.length} / ${mapLimit} TEAMS · ${battleShape}</strong></div><section class="mode-select"><div class="map-select-head"><span class="eyebrow">GAME MODES</span><strong>${GAME_MODES[this.selectedMode].title}</strong></div><div class="mode-grid">${modeCards}</div></section><section class="map-select"><div class="map-select-head"><span class="eyebrow">CHOOSE MAP</span><strong>${ALL_MAPS[this.selectedMap].title}</strong></div><div class="map-grid ${dominationMode?'domination-maps':''}">${mapCards}</div></section><div class="preset-strip"><button class="btn" data-action="setup:preset:duel">DUEL 1v1</button><button class="btn" data-action="setup:preset:pairs">2v2 SQUADS</button><button class="btn" data-action="setup:preset:classic">CLASSIC FFA</button><button class="btn" data-action="setup:preset:chaos">CHAOS ×8</button><button class="btn" data-action="setup:randomize">RANDOMIZE LOOKS</button></div><div class="control-status ${observerOnly?'observer':'playing'}"><strong>${observerOnly?'OBSERVER-ONLY MATCH':`PLAYING AS ${escapeHtml(this.setup[humanIndex]?.name||'YOU').toUpperCase()}`}</strong><span>${observerOnly?'All teams are AI controlled · broadcast opens at kickoff':'Click another AI badge to transfer player control · click PLAYER again to observe'}</span></div><div class="setup-layout"><section class="roster-panel"><div class="setup-list">${roster}</div><div class="roster-actions"><button class="btn" data-action="setup:remove" ${this.setup.length<=2?'disabled':''}>− TEAM</button><button class="btn" data-action="setup:add" ${this.setup.length>=mapLimit?'disabled':''}>+ TEAM</button></div></section><aside class="rules-panel"><h3>MATCH RULES</h3><label>NUMBER OF STARTING UNITS<select ${dominationMode?'disabled':'data-setup-rule="squadSize"'}>${dominationMode?'<option>4 COMMANDOS · LOCKED</option>':[1,2,3,4,5].map(v=>option(v,`${v} UNIT${v>1?'S':''}`,this.matchSetup.squadSize)).join('')}</select></label>${startingSlots}<label>STARTING AMMO<select data-setup-rule="startingAmmo">${[30,60,90,150,240].map(v=>option(v,v,this.matchSetup.startingAmmo)).join('')}</select></label><label>CPU SKILL<select data-setup-rule="aiDifficulty">${option('rookie','ROOKIE',this.matchSetup.aiDifficulty)}${option('regular','REGULAR',this.matchSetup.aiDifficulty)}${option('veteran','VETERAN',this.matchSetup.aiDifficulty)}</select></label>${modeRules}<div class="supply-plan"><strong>${dominationMode?'3 NEUTRAL CRATE RELAYS':`${this.setup.length} TEAM DEPOTS + 4 RARE RELAYS`}</strong><span>${dominationMode?'NO D-BUILDERS · FIELD DROPS ONLY':'7 COMMON CRATES AT EVERY DROP SPOT'}</span><span>${dominationMode?`${ALL_MAPS[this.selectedMap].towerCount} TOWERS · FIRST TO ${this.matchSetup.maxScore}`:'THEN NORMAL TIMERS AND CAPS'}</span></div></aside></div><div class="setup-footer"><span class="conflict-check ${deployable?'ready':'blocked'}">${conflictLabel}</span><button class="btn" data-action="menu">BACK</button><button class="btn primary" data-action="deploy" ${deployable?'':'disabled'}>${observerOnly?'WATCH AI BATTLE':'START BATTLE'}</button></div></main>`;
    if(this.selectedMap==='crown'){const supply=this.screen.querySelector('.supply-plan');if(supply)supply.innerHTML='<strong>1 SUMMIT DROP ZONE · ENTIRE MAP</strong><span>3 COMMON CRATES EVERY 1–5 SECONDS</span><span>CONTROL THE CROWN OR GET BURIED IN IT</span>'}
    this.screen.querySelectorAll('canvas[data-skin]').forEach(canvas=>paintSkinPreview(canvas,canvas.dataset.skin));this.restoreSetupView(setupView);}
  endRuntime(){this.input.enabled=false;this.input.mouse.down=false;this.hud.show(false);this.hud.showInfo(null);this.hud.setHealMode(false);this.hud.setGrappleMode(false);this.hud.setLockMarker?.(null,null,false);this.hud.setVehicleRole?.('none');this.healAim=false;this.grappleAim=false;this.hud.clearSquad();document.body.classList.remove('observing','domination-mode','campaign-mode');document.getElementById('quest-hud')?.classList.add('hidden');document.getElementById('observer-panel')?.classList.add('hidden');document.getElementById('domination-hud')?.classList.add('hidden');document.getElementById('domination-announcement')?.classList.add('hidden');if(this.camera&&this.camera.fov!==48){this.camera.fov=48;this.camera.updateProjectionMatrix()}if(this.transparentCrate){this.restoreCrateOpacity(this.transparentCrate);this.transparentCrate=null;}}
  disposeScene(){if(!this.scene)return;this.scene.traverse(o=>{if(o.geometry)o.geometry.dispose?.();if(o.material&&!Array.isArray(o.material))o.material.dispose?.()});this.scene.clear();this.materials?.dispose?.();this.world?.dispose?.();this.materials=null;this.world=null}
  resize(){const w=innerWidth,h=innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h)}
  loop(){if(this.running)return;this.running=true;const frame=()=>{requestAnimationFrame(frame);const time=performance.now()/1000,dt=time-this.lastFrame;this.lastFrame=time;this.update(dt,time);this.renderer.render(this.scene,this.camera);if(['mission','observer','victory_sequence'].includes(this.state))this.performanceGovernor?.update(dt,this.combat?.diagnostics?.())};frame()}

  setHandsAndCrateOpacity(unit, opacity) {
    const parts = [unit.leftHand, unit.rightHand];
    for (const part of parts) {
      if (!part) continue;
      part.traverse(node => {
        if (node.isMesh) {
          if (!node.userData.originalMaterial) {
            node.userData.originalMaterial = node.material;
          }
          const mat = node.userData.originalMaterial.clone();
          mat.transparent = true;
          mat.opacity = opacity;
          mat.depthWrite = true;
          node.material = mat;
        }
      });
    }
    if (unit.carriedCrate && unit.carriedCrate.group) {
      unit.carriedCrate.group.traverse(node => {
        if (node.isMesh) {
          if (!node.userData.originalMaterial) {
            node.userData.originalMaterial = node.material;
          }
          const mat = node.userData.originalMaterial.clone();
          mat.transparent = true;
          mat.opacity = opacity;
          mat.depthWrite = true;
          node.material = mat;
        }
      });
    }
  }

  restoreCrateAndHandsOpacity(unit) {
    const parts = [unit.leftHand, unit.rightHand];
    for (const part of parts) {
      if (!part) continue;
      part.traverse(node => {
        if (node.isMesh && node.userData.originalMaterial) {
          node.material = node.userData.originalMaterial;
          node.userData.originalMaterial = null;
        }
      });
    }
    if (unit.carriedCrate && unit.carriedCrate.group) {
      unit.carriedCrate.group.traverse(node => {
        if (node.isMesh && node.userData.originalMaterial) {
          node.material = node.userData.originalMaterial;
          node.userData.originalMaterial = null;
        }
      });
    }
  }
}
