import * as THREE from 'three';
import { gsap } from 'gsap';
import { TEAM, TEAM_COLORS, MAX_PLAYERS, defaultTeamSetup, DEFAULT_TEAM_NAMES, CLASSES, WEAPONS, MISSIONS, COSMETICS, PASSIVE_SKILLS, ACTIVE_SKILLS, CRATE_TYPES, rollDrop, buildWeaponVariant, rollCrateWeapon, destructoSpeedBonus, tankHpBonus } from '../data/gameData.js';
import { SaveSystem } from './SaveSystem.js';
import { Input } from './Input.js';
import { HUD } from './HUD.js';
import { MaterialLibrary, SKIN_TEXTURES, paintSkinPreview } from './Materials.js';
import { EntityFactory } from './EntityFactory.js';
import { World } from './World.js';
import { DBuilder } from './DBuilder.js';
import { ParticleSystem } from './ParticleSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { AIController, AI_BEHAVIORS } from './AIController.js';
import { Minimap } from './Minimap.js';
import { AudioSystem } from './AudioSystem.js';
import { createGrenadeModel } from './ProjectileModels.js';
import { MAPS, DEFAULT_MAP_ID } from '../data/maps.js';
import { LeagueSystem, rankFor } from './LeagueSystem.js';

const pick = list => list[Math.floor(Math.random() * list.length)];
const hex = c => `#${c.toString(16).padStart(6, '0')}`;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const SETUP_DEFAULTS = Object.freeze({ squadSize: 3, startingClasses: Object.freeze(['scout', 'scout', 'medic', 'gunner', 'commando']), startingAmmo: 90, aiDifficulty: 'regular', matchMinutes: 5, reinforcements: true, reinforcementSeconds: 15 });
const freshMatchSetup = overrides => ({ ...SETUP_DEFAULTS, startingClasses: [...SETUP_DEFAULTS.startingClasses], ...overrides });
// heal tether: max wire length before the green wires snap, heal + drain rates
const HEAL_RANGE = 11, HEAL_RATE = 14, HEAL_MP_DRAIN = 6, HEAL_WIRE_POINTS = 22;
const GRAPPLE_RANGE = 18, GRAPPLE_LAUNCH_TIME = .18, GRAPPLE_PULL_TIME = .55;

export class Game{
  constructor(mount){this.mount=mount;this.screen=document.querySelector('#screen');this.save=new SaveSystem();this.league=new LeagueSystem(this.save.data.aiProfiles);this.input=new Input(mount);this.hud=new HUD();this.minimap=new Minimap(document.querySelector('#minimap'),p=>this.scoutFromMinimap(p));this.observerMinimap=new Minimap(document.querySelector('#observer-minimap'),p=>this.observerMapCommand(p));this.audio=new AudioSystem(this.save.data.settings.volume);this.lastFrame=performance.now()/1000;this.state='menu';this.running=false;this.entities=[];this.combatants=[];this.kills=0;this.elapsed=0;this.lockTarget=null;this.hoverEntity=null;this.setup=defaultTeamSetup(4);this.matchSetup=freshMatchSetup();this.selectedMap=DEFAULT_MAP_ID;this.teamStats={};this.aiBehaviorIndex=0;this.bindUI()}
  boot(){this.setupRenderer();this.showMenu();this.loop()}
  setupRenderer(){this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=this.save.data.settings.shadows;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;this.renderer.domElement.addEventListener('pointerdown',()=>{if(this.state==='mission'&&(this.fpsMode||this.player?.mountedMotorcycle)&&document.pointerLockElement!==this.renderer.domElement){this._mouseCaptureClick=true;this.requestMouseCapture()}});this.mount.appendChild(this.renderer.domElement);this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,700);this.camera.position.set(0,24,23);addEventListener('resize',()=>this.resize());}
  bindUI(){this.screen.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    if (action.startsWith('teamcolor:') || action.startsWith('teamuniform:') || action.startsWith('teamgroup:') || action.startsWith('setup:role:') || action === 'setup:add' || action === 'setup:remove' || action === 'setup:randomize' || action.startsWith('setup:preset:')) {
      this.audio.play('change_team');
    } else if (action.startsWith('cos:')) {
      this.audio.play('change_texture');
    } else {
      this.audio.play('button_click');
    }
    if(action==='start')this.showGameSetup();else if(action==='deploy')this.startMission('skirmish');else if(action==='missions')this.showMissions();else if(action.startsWith('mission:'))this.startMission(action.slice(8));else if(action==='hub')this.showHub();else if(action==='menu')this.showMenu();else if(action==='settings')this.showSettings();else if(action==='shop')this.showShop();else if(action==='dbuild')this.showDBuild();else if(action==='casino')this.playCasino();else if(action==='reset'){this.save.reset();this.league=new LeagueSystem([]);this.showMenu()}
    else if(action==='setup:add'){if(this.setup.length<MAX_PLAYERS)this.setup.push({name:DEFAULT_TEAM_NAMES[this.setup.length],colorIndex:this.setup.length%TEAM_COLORS.length,group:this.setup.length,uniformIndex:this.setup.length%SKIN_TEXTURES.length,isHuman:false});this.showGameSetup()}
    else if(action==='setup:remove'){if(this.setup.length>2)this.setup.pop();this.showGameSetup()}
    else if(action.startsWith('setup:preset:'))this.applySetupPreset(action.slice(13))
    else if(action.startsWith('map:')){this.selectedMap=action.slice(4);this.showGameSetup()}
    else if(action==='setup:randomize')this.randomizeSetup()
    else if(action.startsWith('setup:role:')){const i=Number(action.slice(11)),becomeHuman=!this.setup[i].isHuman;this.setup.forEach(t=>t.isHuman=false);this.setup[i].isHuman=becomeHuman;this.showGameSetup()}
    else if(action.startsWith('teamcolor:')){const i=Number(action.slice(10)),used=this.setup.map(t=>t.colorIndex);let next=(this.setup[i].colorIndex+1)%TEAM_COLORS.length;for(let k=0;k<TEAM_COLORS.length&&used.includes(next);k++)next=(next+1)%TEAM_COLORS.length;this.setup[i].colorIndex=next;this.showGameSetup()}
    else if(action.startsWith('teamuniform:')){const i=Number(action.slice(12));this.setup[i].uniformIndex=((this.setup[i].uniformIndex||0)+1)%SKIN_TEXTURES.length;this.showGameSetup()}
    else if(action.startsWith('teamgroup:')){const i=Number(action.slice(10));this.setup[i].group=(this.setup[i].group+1)%Math.min(this.setup.length,5);this.showGameSetup()}
    else if(action==='leaderboard')this.showLeaderboard();else if(action.startsWith('gear:'))this.buyGear(action.slice(5));else if(action.startsWith('cos:'))this.handleCosmetic(action.slice(4))});
    this.screen.addEventListener('input',e=>{if(e.target.dataset.teamName!==undefined){const i=Number(e.target.dataset.teamName);this.setup[i].name=e.target.value.slice(0,14);return}
      if(e.target.dataset.startingClass!==undefined){this.matchSetup.startingClasses[Number(e.target.dataset.startingClass)]=e.target.value;return}
      if(e.target.dataset.setupRule){const key=e.target.dataset.setupRule;this.matchSetup[key]=e.target.type==='checkbox'?e.target.checked:(key==='aiDifficulty'?e.target.value:Number(e.target.value));if(key==='squadSize')this.showGameSetup();return}
      if(!e.target.dataset.setting)return;const key=e.target.dataset.setting,value=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);this.save.setSetting(key,value);if(key==='volume')this.audio.setVolume(value);if(key==='shadows'&&this.renderer)this.renderer.shadowMap.enabled=value})}
  showMenu(){this.endRuntime();this.state='menu';this.audio.playMusic('/music/main_theme.mp3');this.screen.innerHTML=`<main class="menu"><h1 class="logo">Destructo</h1><p class="subtitle">Build the squad. Break the battlefield.</p><div class="menu-actions"><button class="btn primary" data-action="start">QUICK DEPLOY</button><button class="btn" data-action="missions">MISSION BOARD</button><button class="btn" data-action="hub">CENTRAL HUB</button><button class="btn" data-action="settings">SETTINGS</button></div><div class="meta"><span>WASD MOVE · SPACE JUMP · MOUSE FIRE · E INTERACT · F MATERIALIZE · G DROP WEAPON · H GRENADE · Q SKILL · TAB SQUAD</span><span>${this.save.data.missionsWon} VICTORIES · ${this.save.data.chips} CHIPS</span></div></main>`}
  // Game setup: choose team count (2-10), each team's name, color and alliance group
  showGameSetupLegacy(){this.endRuntime();this.state='setup';this.audio.playMusic('/music/main_theme.mp3');
    const rows=this.setup.map((t,i)=>{const c=TEAM_COLORS[t.colorIndex%TEAM_COLORS.length];
      const uniform=SKIN_TEXTURES[t.uniformIndex||0];return `<div class="team-row"><span class="slot ${i===0?'you':''}">${i===0?'YOU':'CPU'}</span><input class="team-name" data-team-name="${i}" maxlength="14" value="${t.name}" aria-label="Team name"><button class="swatch" data-action="teamcolor:${i}" style="background:${hex(c.color)}" title="Change aura color">${c.name.toUpperCase()} AURA</button><button class="btn uniform-btn" data-action="teamuniform:${i}">${uniform.toUpperCase()}</button><button class="btn group-btn" data-action="teamgroup:${i}">TEAM ${String.fromCharCode(65+t.group)}</button></div>`}).join('');
    this.screen.innerHTML=`<main class="menu"><div class="screen-title"><div><span class="eyebrow">GAME SETUP</span><h2>SETUP TEAMS</h2></div><strong>${this.setup.length} / ${MAX_PLAYERS} PLAYERS</strong></div><p class="subtitle">Same team letter = allies · color controls the body aura · uniform applies to the whole team.</p><div class="setup-list">${rows}</div><div class="menu-actions" style="margin-top:20px"><button class="btn" data-action="setup:remove" ${this.setup.length<=2?'disabled':''}>− REMOVE PLAYER</button><button class="btn" data-action="setup:add" ${this.setup.length>=MAX_PLAYERS?'disabled':''}>+ ADD PLAYER</button><button class="btn primary" data-action="deploy">START BATTLE</button><button class="btn" data-action="menu">BACK</button></div></main>`}
  showMissions(){this.endRuntime();this.state='missions';this.audio.playMusic('/music/main_theme.mp3');this.screen.innerHTML=`<main class="menu"><div class="screen-title"><div><span class="eyebrow">FIRST DIMENSION</span><h2>MISSION BOARD</h2></div></div><div class="hub-grid">${Object.values(MISSIONS).map(m=>`<article class="hub-card"><h3>${m.name.toUpperCase()}</h3><p>${m.briefing}</p><button class="btn ${m.id==='assault'?'primary':''}" data-action="mission:${m.id}">DEPLOY · ${m.reward} CHIPS</button></article>`).join('')}</div><button class="btn" style="margin-top:22px" data-action="menu">BACK</button></main>`}
  showHub(){this.endRuntime();this.state='hub';this.audio.playMusic('/music/main_theme.mp3');this.screen.innerHTML=`<main class="menu"><div class="screen-title"><div><span class="eyebrow">CENTRAL MILITARY HUB</span><h2>BETWEEN BATTLES</h2></div><strong>${this.save.data.chips} CHIPS</strong></div><div class="hub-grid"><article class="hub-card"><h3>MARKETPLACE</h3><p>License combat gear for future operations.</p><button class="btn" data-action="shop">BROWSE GEAR</button></article><article class="hub-card"><h3>CRATE CASINO</h3><p>Risk 100 chips. Match charged crates to win prototype payouts.</p><button class="btn" data-action="casino">SPIN · 100</button></article><article class="hub-card league-card"><span class="rank-badge">${rankFor(this.save.data.mmr)}</span><h3>RANKED CIRCUIT</h3><p>${this.save.data.mmr} MMR · ${this.save.data.rankedWins}-${this.save.data.rankedLosses} record. Scout persistent CPU rivals.</p><button class="btn primary" data-action="leaderboard">VIEW LEADERBOARD</button></article><article class="hub-card"><h3>D-BUILD STUDIO</h3><p>Customize your team's Destructos with hats and skins. ${this.save.data.totalKills} eliminations across ${this.save.data.missionsWon} victories.</p><button class="btn" data-action="dbuild">OPEN STUDIO</button></article></div><button class="btn" style="margin-top:22px" data-action="menu">BACK</button></main>`}
  showLeaderboard(){this.endRuntime();this.state='leaderboard';this.audio.playMusic('/music/main_theme.mp3');const rows=this.league.leaderboard(this.save.data).map((p,i)=>`<tr class="${p.player?'is-player':''}"><td>#${i+1}</td><td><strong>${escapeHtml(p.name)}</strong><small>${p.player?'PLAYER':`CPU · ${p.kills||0} KILLS`}</small></td><td>${rankFor(p.mmr)}</td><td>${p.mmr}</td><td>${p.wins}-${p.losses}</td><td>${p.streak>0?`🔥 ${p.streak}`:'—'}</td></tr>`).join('');this.screen.innerHTML=`<main class="menu leaderboard-menu"><div class="screen-title"><div><span class="eyebrow">GLOBAL SIMULATION CIRCUIT</span><h2>LEADERBOARD</h2></div><strong>${this.save.data.mmr} MMR</strong></div><div class="leaderboard-scroll"><table class="leaderboard-table"><thead><tr><th>RANK</th><th>COMPETITOR</th><th>DIVISION</th><th>MMR</th><th>RECORD</th><th>STREAK</th></tr></thead><tbody>${rows}</tbody></table></div><button class="btn" style="margin-top:22px" data-action="hub">BACK TO HUB</button></main>`}
  showSettings(){const s=this.save.data.settings;this.audio.playMusic('/music/main_theme.mp3');this.screen.innerHTML=`<main class="menu"><div class="screen-title"><h2>SETTINGS</h2></div><div class="settings"><label>DYNAMIC SHADOWS <input type="checkbox" data-setting="shadows" ${s.shadows?'checked':''}></label><label>CAMERA SHAKE <input type="checkbox" data-setting="cameraShake" ${s.cameraShake?'checked':''}></label><label>VOLUME <input type="range" min="0" max="1" step=".05" value="${s.volume}" data-setting="volume"></label></div><button class="btn" style="margin-top:22px" data-action="menu">BACK</button></main>`}
  showShop(){const gear=[['magnet','MAGNETIC GLOVES',900],['rearPlate','BALLISTIC REAR PLATE',1100],['jetpack','ROCKET JETPACK',1800]];this.audio.playMusic('/music/main_theme.mp3');this.screen.innerHTML=`<main class="menu"><div class="screen-title"><h2>MARKETPLACE</h2><strong>${this.save.data.chips} CHIPS</strong></div><div class="menu-actions">${gear.map(([id,name,price])=>`<button class="btn" data-action="gear:${id}" ${this.save.data.gear.includes(id)?'disabled':''}>${name}<br><small>${this.save.data.gear.includes(id)?'EQUIPPED':price+' CHIPS'}</small></button>`).join('')}</div><button class="btn" style="margin-top:22px" data-action="hub">BACK</button></main>`}
  // D-Build studio: buy + equip cosmetics for your team's Destructos
  showDBuild(){const owned=this.save.data.cosmetics,eq=this.save.data.equipped;this.audio.playMusic('/music/main_theme.mp3');const card=c=>{const isOwned=owned.includes(c.id),equipped=eq[c.kind]===c.id;return `<button class="btn cosmetic ${equipped?'equipped':''}" data-action="cos:${c.id}">${c.name.toUpperCase()}<br><small>${c.kind.toUpperCase()} · ${equipped?'EQUIPPED':isOwned?'TAP TO EQUIP':c.price+' CHIPS'}</small></button>`};this.screen.innerHTML=`<main class="menu"><div class="screen-title"><div><span class="eyebrow">D-BUILD STUDIO</span><h2>TEAM COSMETICS</h2></div><strong>${this.save.data.chips} CHIPS</strong></div><h3 class="shop-section">HATS</h3><div class="menu-actions">${COSMETICS.filter(c=>c.kind==='hat').map(card).join('')}</div><h3 class="shop-section">BODY SKINS</h3><div class="menu-actions">${COSMETICS.filter(c=>c.kind==='skin').map(card).join('')}</div><button class="btn" style="margin-top:22px" data-action="hub">BACK</button></main>`}
  handleCosmetic(id){const c=COSMETICS.find(x=>x.id===id);if(!c)return;if(this.save.data.cosmetics.includes(id)){this.save.equipCosmetic(c.kind,id);this.audio.play('change_texture')}else if(this.save.buyCosmetic(id,c.price))this.audio.play('change_texture');else{this.screen.querySelector('.screen-title strong').textContent='INSUFFICIENT CHIPS';return}this.showDBuild()}
  buyGear(id){const prices={magnet:900,rearPlate:1100,jetpack:1800};if(this.save.buyGear(id,prices[id])){this.audio.play('build');this.showShop()}else this.screen.querySelector('.screen-title strong').textContent='INSUFFICIENT CHIPS'}
  playCasino(){if(!this.save.spend(100)){this.showHub();return}const roll=Math.random(),reward=roll>.92?1500:roll>.7?250:0;if(reward)this.save.earn(reward);this.audio.playMusic('/music/main_theme.mp3');this.screen.innerHTML=`<main class="menu mission-end"><span class="eyebrow">CRATE SPINNER</span><h2>${reward?'WINNER!':'SCRAPPED'}</h2><div class="stat-row"><div><strong>${reward||0}</strong><span>CHIPS WON</span></div><div><strong>${this.save.data.chips}</strong><span>BALANCE</span></div></div><button class="btn primary" data-action="hub">CONTINUE</button></main>`}
  async startMission(id='skirmish'){this.mission=MISSIONS[id]||MISSIONS.skirmish;this.screen.innerHTML=`<main class="menu mission-end"><h2>DEPLOYING</h2><p class="subtitle">${this.mission.name.toUpperCase()}…</p></main>`;await this.createMission();this.screen.innerHTML='';if(this.observerOnly)this.enterObserverMode();else{this.hud.show(true);this.input.enabled=true;this.state='mission'}this.lastFrame=performance.now()/1000;
    const mapMusic = {
      crossroads: '/music/urban_vehicle_warfare.mp3',
      crown: '/music/king_of_the_hill.mp3',
      wilds: '/music/neutral_mayhem.mp3',
      rift: '/music/volcanic_scrapyard.mp3'
    };
    const track = mapMusic[this.selectedMap] || '/music/urban_vehicle_warfare.mp3';
    this.audio.playMusic(track);
  }
  teamCosmetics(){const eq=this.save.data.equipped;return{hat:eq.hat||undefined,skin:eq.skin||undefined}}
  // ── alliance helpers ────────────────────────────────────────────────────────
  hostile(a,b){const A=this.teamMap?.[a],B=this.teamMap?.[b];if(!A||!B)return a!==b;return A.group!==B.group}
  livingUnits(teamId){return this.combatants.filter(e=>e.team===teamId&&e.type==='unit'&&!e.dead)}
  friendsOf(u){return this.combatants.filter(e=>!e.dead&&e.team&&!this.hostile(u.team,e.team))}
  foesOf(u){return this.combatants.filter(e=>!e.dead&&e.team&&this.hostile(u.team,e.team))}
  respawnPos(teamId,i=0){const b=this.world.basePositions[teamId],pad=this.world.builderPositions[teamId];const dir=b.clone().multiplyScalar(-1).setY(0).normalize(),side=new THREE.Vector3(-dir.z,0,dir.x);const p=pad.clone().addScaledVector(dir,3).addScaledVector(side,((i%3)-1)*2.4).addScaledVector(dir,Math.floor(i/3)*2.4);p.y=this.world.groundAt(p);return p}
  async createMission(){this.disposeScene();this.scene=new THREE.Scene();this.materials=await new MaterialLibrary(this.renderer,this.save.data.settings).load();this.factory=new EntityFactory(this.scene,this.materials);
    // teams: skirmish uses the Game Setup config; classic missions run a default 2-team layout
    const setup=this.mission.type==='skirmish'?this.setup:defaultTeamSetup(2);this.matchRules=freshMatchSetup(this.mission.type==='skirmish'?this.matchSetup:undefined);
    const humanIndex=setup.findIndex(t=>t.isHuman===true);this.observerOnly=humanIndex<0;const rivals=this.league.draw(setup.length-(this.observerOnly?0:1));let rivalIndex=0;
    this.teams=setup.map((t,i)=>{const c=TEAM_COLORS[t.colorIndex%TEAM_COLORS.length],human=i===humanIndex,profile=human?{id:'you',name:t.name||'YOU',mmr:this.save.data.mmr,wins:this.save.data.rankedWins,losses:this.save.data.rankedLosses}:rivals[rivalIndex++];return{id:`t${i}`,name:human?(t.name||DEFAULT_TEAM_NAMES[i]):profile.name,profile,human,color:c.color,dark:c.dark,group:t.group,uniform:SKIN_TEXTURES[t.uniformIndex||i%SKIN_TEXTURES.length],respawnTimer:this.matchRules.reinforcementSeconds,reinforceTimer:this.matchRules.reinforcementSeconds+i*2,eliminated:false}});
    this.teamMap=Object.fromEntries(this.teams.map(t=>[t.id,t]));this.playerTeam=this.teams[humanIndex>=0?humanIndex:0].id;
    this.factory.setTeams(this.teamMap);this.hud.teamMeta=id=>this.teamMap[id];
    this.addLights();this.world=new World(this.scene,this.materials,this.factory,this.selectedMap).build(this.teams);
    this.combatants=[...Object.values(this.world.baseTurrets||{})];this.entities=[...Object.values(this.world.factories),...this.combatants,...this.world.destructibles,...this.world.interactiveStructures,...this.world.motorcycles,...this.world.cars,...this.world.wildlife];this.abilityZones=[];this.objectiveProgress=0;this.lockTarget=null;this.turretLockTarget=null;this.hoverEntity=null;
    this.healLinks=[];this.overheadIcons=[];this.debris=[];this.thrownGrenades=[];this.healAim=false;this.grappleAim=false;this.grapples=[];this.aiHealTimer=0;this.hud.setHealMode(false);this.hud.setGrappleMode(false);this.hud.setTurretMode(false);this.hud.clearSquad();
    this.teamStats={};
    for(const t of this.teams){
      this.teamStats[t.id]={kills:0,deaths:0,bulletsFired:0,bulletsHit:0,destructiblesDestroyed:0,structuresDestroyed:0,cratesConsumed:0,neutralKills:0,healing:0,destructosCreated:{}};
    }
    const squadSize=this.matchRules.squadSize,aiClasses=['scout','gunner','medic','commando','sniper','engineer'];
    const startingClasses=this.matchRules.startingClasses;
    if(!this.observerOnly){this.player=this.factory.createUnit(startingClasses[0]||'scout',this.playerTeam,this.respawnPos(this.playerTeam,0),true,{...this.teamCosmetics(),skin:this.teamMap[this.playerTeam].uniform});this.player.rearPlate=this.save.data.gear.includes('rearPlate');this.player.magneticGloves=this.save.data.gear.includes('magnet');this.player.jetpack=this.save.data.gear.includes('jetpack');this.player.ammo=this.matchRules.startingAmmo;this.combatants.push(this.player);this.entities.push(this.player);this.recordDestructoCreated(this.player);for(let i=1;i<squadSize;i++)this.addUnit(startingClasses[i]||'scout',this.playerTeam,this.respawnPos(this.playerTeam,i))}
    for(const t of this.teams.filter(t=>this.observerOnly||t.id!==this.playerTeam))for(let i=0;i<squadSize;i++)this.addUnit(aiClasses[i%aiClasses.length],t.id,this.respawnPos(t.id,i));
    if(this.observerOnly)this.player=this.livingUnits(this.playerTeam)[0];
    this.particles=new ParticleSystem(this.scene,this.world.heightAt);
    this.combat=new CombatSystem(this.scene,this.particles,()=>this.entities,this.handleDeath.bind(this),this.handleDamage.bind(this),(a,b)=>this.hostile(a,b),this.world.heightAt,this.recordStat.bind(this));
    this.combat.audio=this.audio;
    this.builders=Object.fromEntries(this.teams.map(t=>[t.id,new DBuilder(this.world,this.factory,this.handleBuild.bind(this),t.id,this.world.builderPositions[t.id])]));
    this.builder=this.builders[this.playerTeam];
    const interact={mountTurret:(u,t)=>this.mountTurret(u,t),mountBunker:(u,b)=>this.mountBunker(u,b),mountMotorcycle:(u,m)=>this.mountMotorcycle(u,m),exit:(u,forced)=>this.exitInteractive(u,forced)};
    this.aiBehaviorIndex=0;this.ai=new AIController(this.world,this.combat,this.builders,u=>this.executeActiveSkill(u),team=>!this.observerOnly&&team===this.playerTeam?AI_BEHAVIORS[this.aiBehaviorIndex].id:'attack',team=>!this.observerOnly&&team===this.playerTeam?this.player:null,(unit,crate)=>this.openCrate(crate,unit),()=>this.matchRules.aiDifficulty,interact,team=>this.livingUnits(team));this.updateDoctrineDisplay();
    this.kills=0;this.elapsed=0;this.observerBet=null;this.leagueSettled=false;
    this.suddenDeathTimer = this.matchRules.matchMinutes * 60;
    this.suddenDeathActive = false;
    const timerEl = document.getElementById('sudden-death-timer');
    if (timerEl) { timerEl.className = 'timer-card hidden'; const valEl = document.getElementById('timer-val'); if (valEl) valEl.textContent = `${String(this.matchRules.matchMinutes).padStart(2,'0')}:00`; }
    this.camera.position.copy(this.player.group.position).add(new THREE.Vector3(0,21,20));this.camera.lookAt(this.player.group.position);this.hud.el.objective.textContent=this.mission.objective;}
  addLights(){const hemi=new THREE.HemisphereLight(0xd8f0ff,0x3f5a36,.95);this.scene.add(hemi);const sun=new THREE.DirectionalLight(0xfff6d8,1.7);sun.position.set(-24,38,-18);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.left=sun.shadow.camera.bottom=-90;sun.shadow.camera.right=sun.shadow.camera.top=90;sun.shadow.bias=-.0008;this.scene.add(sun)}
  addUnit(classId,team,pos,opts={}){const cosmetics=!this.observerOnly&&team===this.playerTeam?this.teamCosmetics():{};const unit=this.factory.createUnit(classId,team,pos,false,{...cosmetics,skin:this.teamMap[team]?.uniform,...opts});unit.groundY=this.world.groundAt(unit.group.position);unit.ammo=this.matchRules?.startingAmmo??90;this.combatants.push(unit);this.entities.push(unit);this.recordDestructoCreated(unit);return unit}
  update(dt,time){
    if(this.state!=='mission' && this.state!=='observer' && this.state!=='victory_sequence')return;
    dt=Math.min(dt,.033);
    this.elapsed += dt;
    this.world.elapsed = this.elapsed;
    this.allies=this.combatants.filter(e=>!this.hostile(this.playerTeam,e.team));
    this.enemies=this.combatants.filter(e=>this.hostile(this.playerTeam,e.team));
    if(this.state==='mission'){if(this.input.consume('KeyV'))this.cycleAIBehavior(1);if(this.input.consume('KeyC'))this.cycleAIBehavior(-1);this.updatePlayer(dt);this.updateGrapples(dt)}
    const foesByTeam={};for(const t of this.teams){const list=this.combatants.filter(e=>!e.dead&&this.hostile(t.id,e.team));for(const tid of Object.keys(this.world.factories)){const f=this.world.factories[tid];if(!f.dead&&this.hostile(t.id,tid))list.push(f)}foesByTeam[t.id]=list}
    for(const e of this.combatants)this.ai.update(e,dt,foesByTeam[e.team]||[]);
    this.combat.update(dt);this.updateMotorcycles(dt);this.world.update(time,dt,this.particles);this.updateWildlife(dt);this.updateObjective(dt);this.updateAbilityZones(dt);this.updatePickups(dt);this.updateThrownGrenades(dt);this.updateBaseTurrets(dt);this.updateHealLinks(dt);this.updateOverheadIcons(dt);this.updateOverheadBars(dt);this.updateDebris(dt);this.particles.update(dt,this.camera);
    for(const e of this.combatants){for(const key of ['abilityCooldown','statusTimer','overdriveTimer','rallyTimer','barrierTimer','frenzyTimer','paceAura'])e[key]=Math.max(0,(e[key]||0)-dt);if(e.buffs)for(const key of Object.keys(e.buffs))e.buffs[key]=Math.max(0,e.buffs[key]-dt);if(e.freeze>0&&e===this.player)e.freeze=Math.max(0,e.freeze-dt);if(e.cloakTimer>0){e.cloakTimer=Math.max(0,e.cloakTimer-dt);if(e.cloakTimer===0)this.setCloak(e,false)}if(!e.dead&&e.passive?.id==='regen')e.hp=Math.min(e.maxHp,e.hp+dt*2.5);if(!e.dead&&e.passive?.id==='healeraura'){for(const f of this.friendsOf(e))if(f!==e&&f.group.position.distanceTo(e.group.position)<6)f.hp=Math.min(f.maxHp,f.hp+dt*1.5)}if(!e.dead&&e.passive?.id==='swift'){for(const f of this.friendsOf(e))if(f!==e&&f.type==='unit'&&f.group.position.distanceTo(e.group.position)<6)f.paceAura=.3}if(Number.isFinite(e.maxMp))e.mp=Math.min(e.maxMp,e.mp+dt*3.5*(e.passive?.id==='manabattery'?1.6:1));if(e.type==='unit'){this.positionCarriedCrate(e);this.factory.animateUnit(e,time,dt)}}
    this.updateAIHealers(dt);
    this.updateTeams(dt);this.updateDanger(dt);
    if(this.state==='mission'){
      const drops=this.world.updateCrateDrops(dt);for(const drop of drops)if(drop.type!=='brown')this.hud.toast(`${drop.type.toUpperCase()} CRATE INBOUND · ${drop.zone.label}`,drop.type==='red');
      const forecast=document.querySelector('#crate-forecast strong'),next=this.world.nextCrateDrop(),rare=this.world.nextCrateDrop(true);if(forecast&&next){const commonName=next.type==='brown'?'COMMON':next.type.toUpperCase();forecast.textContent=`${commonName} ${Math.ceil(next.seconds)}s${rare?` · RARE ${Math.ceil(rare.seconds)}s`:''}`;forecast.style.color=hex(CRATE_TYPES[next.type].color);forecast.title=`${next.zone.label}${rare?` · Next rare: ${rare.type.toUpperCase()} at ${rare.zone.label}`:''}`}
    }
    this.updateCamera(dt);
    if(this.state==='mission') this.updateHover();
    else if(this.state==='observer'){
      this.updateObserverUI();
      this.observerMinimap.update(this.world,this.teams,this.combatants,this.observerTarget,{camera:this.camera,focus:this.camera.position});
    }
    if(this.state==='mission' || this.state==='observer'){
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
    if(this.state==='mission' || this.state==='observer'){
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
    const bossFactory=this.nearestEnemyFactory();
    if(this.state==='mission'){
      this.hud.update(this.player.mountedTurret||this.player,bossFactory,this.livingUnits(this.playerTeam).length,this.save.data.chips,this.builder.values());
      this.hud.updateSquad(this.livingUnits(this.playerTeam),this.player,u=>this.factory.unitPortrait(u));
      this.minimap.update(this.world,this.teams,this.combatants,this.player);
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
  }
  nearestEnemyFactory(){let best=null,d=Infinity;for(const tid of Object.keys(this.world.factories)){const f=this.world.factories[tid];if(f.dead||!this.hostile(this.playerTeam,tid))continue;const dist=f.group.position.distanceToSquared(this.player.group.position);if(dist<d){d=dist;best=f}}return best}
  cycleAIBehavior(delta){this.aiBehaviorIndex=(this.aiBehaviorIndex+delta+AI_BEHAVIORS.length)%AI_BEHAVIORS.length;const behavior=AI_BEHAVIORS[this.aiBehaviorIndex];for(const ally of this.livingUnits(this.playerTeam)){if(ally===this.player)continue;ally.patrolPoint=null;ally.commandPoint=null}this.updateDoctrineDisplay();this.hud.toast(`${behavior.name} · ${behavior.description}`)}
  updateDoctrineDisplay(){const behavior=AI_BEHAVIORS[this.aiBehaviorIndex]||AI_BEHAVIORS[0],name=document.querySelector('#ai-doctrine'),desc=document.querySelector('#ai-description');if(name)name.textContent=behavior.name;if(desc)desc.textContent=behavior.description}
  scoutFromMinimap(point){if(this.state!=='mission')return;this.cameraScout={point:new THREE.Vector3(point.x,this.world.heightAt(point.x,point.z),point.z),elapsed:0,returning:false};this.hud.toast('TACTICAL SCOUT · RETURNING IN 3s')}
  // ── respawn + elimination: wiped teams get one Destructo back after 15s while
  // their base stands; base destroyed + squad wiped = eliminated for good ─────
  updateTeams(dt){
    for(const t of this.teams){
      if(t.eliminated)continue;
      const factory=this.world.factories[t.id],units=this.livingUnits(t.id),anyAlive=this.combatants.some(e=>e.team===t.id&&!e.dead),canReinforce=this.matchRules.reinforcements&&!factory.dead;
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
        if(t.respawnTimer<=0){t.respawnTimer=this.matchRules.reinforcementSeconds;const unit=this.addUnit(pick(['scout','gunner','medic']),t.id,this.respawnPos(t.id,Math.floor(Math.random()*3)));this.particles.burst(unit.group.position.clone().add(new THREE.Vector3(0,1,0)),this.teamMap[t.id].color,26,7);if(!this.observerOnly&&t.id===this.playerTeam){this.possess(unit);document.getElementById('respawn-overlay').classList.add('hidden');this.hud.toast('REINFORCEMENT DEPLOYED');this.hud.el.objective.textContent=this.mission.objective}}}
      if(!canReinforce&&!anyAlive){
        if(t.id===this.playerTeam && this.state==='mission'){
          t.eliminated=true;
          document.getElementById('respawn-overlay').classList.add('hidden');
          this.hud.toast('SQUAD ELIMINATED — ENTERING OBSERVER MODE',true);
          this.enterObserverMode();
        } else {
          t.eliminated=true;
          this.hud.toast(`${t.name.toUpperCase()} ELIMINATED`,t.id===this.playerTeam);
        }
      }
      // AI teams trickle reinforcements while their base stands
      if((this.observerOnly||t.id!==this.playerTeam)&&canReinforce){t.reinforceTimer-=dt;if(t.reinforceTimer<=0){t.reinforceTimer=this.matchRules.reinforcementSeconds+Math.random()*4;if(this.livingUnits(t.id).length<this.matchRules.squadSize+2)this.addUnit(Math.random()>.5?'scout':'gunner',t.id,this.respawnPos(t.id,Math.floor(Math.random()*3)))}}
    }}
  // ── DANGER warning: sub-20% HP allies get a bouncing red arrow (15s cooldown)
  updateDanger(dt){for(const e of this.combatants){if(e.type!=='unit')continue;e.dangerCooldown=Math.max(0,(e.dangerCooldown||0)-dt);
    if(!this.observerOnly&&!e.dead&&e.team===this.playerTeam&&e.hp<e.maxHp*.2&&e.dangerCooldown<=0){e.dangerCooldown=15;e.dangerTimer=4;this.audio.play('pickup',.5)}
    if(e.dangerTimer>0&&!e.dead){e.dangerTimer-=dt;if(!e.danger)e.danger=this.factory.createDangerIndicator();e.danger.visible=true;e.danger.position.copy(e.group.position);e.danger.position.y+=3.3+Math.abs(Math.sin(this.elapsed*7))*.5;e.danger.rotation.y=this.elapsed*2.5}
    else if(e.danger)e.danger.visible=false}}
  // carried crates ride out front, held in both hands
  positionCarriedCrate(e){
    const c=e.carriedCrate;
    if(!c)return;
    c.group.visible=true;
    const forward=new THREE.Vector3(Math.sin(e.group.rotation.y),0,Math.cos(e.group.rotation.y));
    const defaultPos=e.group.position.clone().addScaledVector(forward,1.25);
    const builder = this.builders[e.teamId || e.team];
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
  mountedRole(unit,vehicle=unit?.mountedMotorcycle){if(!unit||!vehicle)return'none';if(vehicle.driver===unit)return vehicle.vehicleKind==='tank'?'tank-driver':'driver';return vehicle.type==='motorcycle'?'motorcycle-backrider':'passenger'}
  mountedCanFire(unit,vehicle=unit?.mountedMotorcycle){const role=this.mountedRole(unit,vehicle);return role==='tank-driver'||role==='motorcycle-backrider'}
  mountedLookDirection(vehicle,yawOffset=this.mountedViewYaw||0,pitch=this.mountedViewPitch||0){const yaw=vehicle.group.rotation.y+yawOffset;return new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).normalize()}
  syncMountedView(unit,vehicle){const role=this.mountedRole(unit,vehicle);if(this.mountedControlRole===role)return role;this.mountedControlRole=role;this.mountedViewYaw=0;this.mountedViewPitch=role==='tank-driver'?(vehicle.controlPitch??Math.asin(vehicle.aim?.y||0)):0;if(role==='tank-driver'){vehicle.controlYaw=vehicle.controlYaw??Math.atan2(vehicle.aim.x,vehicle.aim.z);vehicle.controlPitch=this.mountedViewPitch}if(unit===this.player){this.hud.setTurretMode(role==='tank-driver','tank');this.hud.setVehicleRole?.(role)}return role}
  updateViewModeInput(p){const mounted=Boolean(p.mountedMotorcycle);if(!mounted&&this.fpsMode&&document.pointerLockElement!==this.renderer?.domElement){this.fpsMode=false;this.hud.toast('THIRD-PERSON MODE ENABLED');this.restoreCrateAndHandsOpacity(p)}if(this.input.consume('KeyP')){if(mounted){this.hud.toast('VEHICLE POV LOCKED · E TO EXIT');return}this.fpsMode=!this.fpsMode;this.hud.toast(this.fpsMode?'FIRST-PERSON MODE ENABLED':'THIRD-PERSON MODE ENABLED');if(this.fpsMode){this.fpsYaw=Math.atan2(p.aim.x,p.aim.z);this.fpsPitch=Math.asin(THREE.MathUtils.clamp(p.aim.y,-1,1));this.requestMouseCapture()}else{document.exitPointerLock?.();this.restoreCrateAndHandsOpacity(p)}}}
  updatePlayer(dt){if(this.input.consume('Tab')){if(this.player?.mountedTurret||this.player?.mountedBunker||this.player?.mountedMotorcycle)this.exitInteractive(this.player);else this.switchPlayer()}const p=this.player;if(p.dead)return;if(!this.input.mouse.down)this._mouseCaptureClick=false;this.updateViewModeInput(p);p.fireCooldown=Math.max(0,p.fireCooldown-dt);if(p.stun>0){p.stun-=dt;p.group.position.addScaledVector(p.velocity,dt);p.velocity.multiplyScalar(Math.pow(.15,dt));return}
    if(p.mountedTurret){this.updateMountedTurret(p,p.mountedTurret,dt);return}
    if(p.mountedBunker){this.updateMountedBunker(p,p.mountedBunker,dt);return}
    if(p.mountedMotorcycle){this.updateMountedMotorcycle(p,p.mountedMotorcycle,dt);return}
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
    const axis=this.input.axis(),speed=p.classDef.speed*(p.statusTimer>0?1.6:1)*(p.rallyTimer>0?1.25:1)*(p.buffs.speed>0?1.55:1)*(p.passive?.id==='swift'?1.15:1)*((p.paceAura||0)>0?1.08:1)*(this.world.isWater(p.group.position)?.5:1);
    let targetVelX = axis.x * speed;
    let targetVelZ = axis.z * speed;
    if (this.fpsMode) {
      const yaw = this.fpsYaw || 0;
      const forwardDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const rightDir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const moveVec = rightDir.multiplyScalar(axis.x).addScaledVector(forwardDir, -axis.z);
      targetVelX = moveVec.x * speed;
      targetVelZ = moveVec.z * speed;
    }
    p.velocity.x=THREE.MathUtils.lerp(p.velocity.x,targetVelX,Math.min(1,dt*14));p.velocity.z=THREE.MathUtils.lerp(p.velocity.z,targetVelZ,Math.min(1,dt*14));p.group.position.x+=p.velocity.x*dt;p.group.position.z+=p.velocity.z*dt;this.world.resolveCollisions(p);
    const ground=this.world.groundAt(p.group.position);p.groundY=ground;
    if (this.world.isWater(p.group.position) && p.group.position.y <= ground + 0.05) {
      if (p.velocity.lengthSq() > 0.5) {
        p.waterWalkTimer = (p.waterWalkTimer || 0) - dt;
        if (p.waterWalkTimer <= 0) {
          this.particles.waterSplash(p.group.position, 2.2, 5, 0.65);
          p.waterWalkTimer = 0.28;
          this.audio.play('pickup', 0.25);
        }
      }
    }
    // jump (Team Buddies hop) + optional jetpack sustain — all relative to the terrain
    const grounded=p.group.position.y<=ground+.001;
    const canJump=p.group.position.y<=ground+.45;
    if(this.input.consume('Space')&&canJump){
      p.verticalVelocity=12.9*(p.passive?.id==='highjumper'?1.4:1);
      this.audio.play('pickup',1.6);
      if (this.world.isWater(p.group.position)) {
        this.particles.waterSplash(p.group.position, 5.0, 12, 1.1);
      }
    }
    else if(p.jetpack&&this.input.keys.has('Space')&&!grounded&&p.mp>0){p.verticalVelocity=Math.min(6,(p.verticalVelocity||0)+dt*20);p.mp=Math.max(0,p.mp-dt*12)}
    p.verticalVelocity=(p.verticalVelocity||0)-dt*22;
    const before=p.group.position.y;p.group.position.y=THREE.MathUtils.clamp(p.group.position.y+p.verticalVelocity*dt,ground,ground+16);
    // landing on a crate: spring off it with 1.3x–1.8x force
    if(p.verticalVelocity<0){
      const under=this.world.crateTopAt(p.group.position);
      if(under&&under.top>ground+.5&&before>=under.top-.2&&p.group.position.y<=under.top+.02){
        const force=Math.max(9,-p.verticalVelocity)*(1.1+Math.random()*.2);
        p.verticalVelocity=Math.min(26,force);p.group.position.y=under.top+.02;
        this.audio.play('pickup',1.9);this.particles.impact(p.group.position.clone(),under.crate.crateType.color);
        if(under.crate.visual)gsap.fromTo(under.crate.visual.scale,{x:1.28,y:.66,z:1.28},{x:1,y:1,z:1,duration:.4,ease:'elastic.out(1.4,.42)'});
      }
    }
    if(p.group.position.y<=ground&&p.verticalVelocity<0){
      if(before>ground+.4) {
        if (this.world.isWater(p.group.position)) {
          this.particles.waterSplash(p.group.position, 6.0, 18, 1.4);
          this.audio.play('pickup', 0.85);
        } else {
          this.particles.impact(p.group.position.clone(),0xd8ccb0);
        }
      }
      p.verticalVelocity=0;p.group.position.y=ground;
    }
    if(p.group.position.y<=ground+.45&&p.verticalVelocity<=0){p.group.position.y=ground;p.verticalVelocity=0;}
    this.world.clamp(p.group.position);this.updateAim(dt);if(this.input.mouse.down&&!this._mouseCaptureClick&&p.weaponId!=='unarmed'&&!p.carriedCrate&&!this.healAim&&!this._suppressFire&&!p.healPumping){if(this.combat.shoot(p,p.aim)){if(this.save.data.settings.cameraShake)this.camera.position.add(new THREE.Vector3((Math.random()-.5)*.2,(Math.random()-.5)*.12,(Math.random()-.5)*.2))}else if(Number.isFinite(p.ammo)&&p.ammo<=0&&p.weaponId!=='pistol'&&p.fireCooldown<=0)this.hud.toast('OUT OF AMMO · FIND A WEAPON OR AMMO',true)}if(this.input.consume('KeyG'))this.dropWeapon(p);if(this.input.consume('KeyH'))this.throwGrenade(p);if(this.input.consume('KeyQ'))this.useAbility();this.handleInteraction();this.handleMaterialize();if(this.input.mouse.alt){this.commandPoint=p.group.position.clone().addScaledVector(p.aim,10);this.input.mouse.alt=false}

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
  handleMaterialize(){if(!this.input.consume('KeyF'))return;const p=this.player;
    if(this.builder.distanceTo(p.group.position)<4.2){const r=this.builder.manufacture();if(r)return;this.hud.toast('INVALID STACK — CLEAN TOWERS ONLY',true);return}
    // outside a builder: F cracks open a crate for field drops
    const crate=p.carriedCrate||this.nearestLooseCrate(3);if(crate){this.openCrate(crate);if(p.carriedCrate===crate)p.carriedCrate=null;return}
    this.hud.toast('NOTHING TO MATERIALIZE',true)}
  nearestLooseCrate(range){let best=null,dist=range;for(const c of this.world.crates){if(c.carried||c.placed||c.falling)continue;const d=c.group.position.distanceTo(this.player.group.position);if(d<dist){dist=d;best=c}}return best}
  // loose crate materialize: pops open and scatters pickups by rarity
  openCrate(crate,opener=this.player){const i=this.world.crates.indexOf(crate);if(i<0)return false;this.world.crates.splice(i,1);const type=crate.originalType||crate.crateType,pos=crate.group.position.clone();pos.y=this.world.groundAt(pos);this.audio.play('build');this.particles.burst(pos.clone().add(new THREE.Vector3(0,.8,0)),type.color,26,7);
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
  updatePickups(dt){const collectors=this.combatants.filter(e=>e.type==='unit'&&!e.dead&&!e.mountedTurret);for(let i=this.world.pickups.length-1;i>=0;i--){const item=this.world.pickups[i];item.life-=dt;item.pickupDelay=Math.max(0,(item.pickupDelay||0)-dt);if(item.pickupDelay>0)continue;let collector=null,best=Infinity;for(const unit of collectors){const range=(unit.magneticGloves?2.6:1.6)*(unit.passive?.id==='scavenger'?2:1),dist=item.group.position.distanceTo(unit.group.position);if(dist<range&&dist<best){best=dist;collector=unit}}if(collector){this.applyDrop(item.drop,collector);this.scene.remove(item.group);this.world.pickups.splice(i,1);this.audio.play('pickup',collector===this.player?1.2:.45);continue}if(item.life<=0){this.scene.remove(item.group);this.world.pickups.splice(i,1)}}}
  applyDrop(drop,unit){switch(drop.id){case 'ammo':unit.ammo=(unit.ammo||0)+40;this.showOverheadIcon(unit,'ammo');break;case 'health':unit.hp=Math.min(unit.maxHp,unit.hp+50);this.showOverheadIcon(unit,'heart');break;case 'mana':unit.mp=Math.min(unit.maxMp,unit.mp+40);this.showOverheadIcon(unit,'mana');break;case 'speed':unit.buffs.speed=drop.duration;break;case 'shield':unit.shield=Math.max(unit.shield,drop.shield);break;case 'damage':unit.buffs.damage=drop.duration;break;case 'rapid':unit.buffs.rapid=drop.duration;break;case 'chips':if(!this.observerOnly&&unit.team===this.playerTeam)this.save.earn(100);break;case 'grenades':unit.grenades=Math.min(2,(unit.grenades||0)+(drop.amount||1));this.showOverheadIcon(unit,'ammo');break;
    case 'weapon':{const weapon=drop.weapon||WEAPONS[drop.weaponId];this.factory.setWeaponModel(unit,drop.weaponId,weapon);unit.weaponTier=weapon.variant?.rank||1;unit.ammo=drop.droppedWeapon?(drop.ammo||0):(unit.ammo||0)+45;this.showOverheadIcon(unit,'weapon',{weaponId:drop.weaponId,weapon});if(unit.team===this.playerTeam&&unit!==this.player)this.hud.toast(`${unit.classDef?.name.toUpperCase()??'ALLY'} GRABBED A ${(weapon.baseName||weapon.name).toUpperCase()}`);break}}
    if(unit===this.player){this.hud.toast(drop.name.toUpperCase());this.spawnDamageNumber(unit.group.position,drop.name.toUpperCase(),'pickup')}}
  dropWeapon(unit){if(!unit||unit.weaponId==='unarmed'){this.hud.toast('NO WEAPON TO DROP',true);return false}const weaponId=unit.weaponId,weapon=unit.weapon,drop={id:'weapon',name:weapon.baseName||weapon.name,weaponId,weapon,ammo:unit.ammo||0,droppedWeapon:true,color:weapon.rarityColor||0xffd23f},pos=unit.group.position.clone().addScaledVector(unit.aim,1.3);pos.y+=1.1;const pickup=this.factory.createPickup(drop,pos);pickup.physicsActive=true;pickup.pickupDelay=.7;pickup.velocity.copy(unit.aim).multiplyScalar(7);pickup.velocity.y=4.5;pickup.angularVelocity.set(5,7,-4);this.world.pickups.push(pickup);unit.weaponGroup.clear();unit.weaponId='unarmed';unit.weapon={name:'Unarmed',damage:0,rate:1,speed:0,range:0,spread:0,knockback:0,recoil:0};unit.ammo=0;this.hud.toast(`${drop.name.toUpperCase()} THROWN`);return true}
  throwGrenade(unit){if(!unit||unit.mountedTurret)return false;if((unit.grenades||0)<=0){this.hud.toast('NO GRENADES · FIND THEM IN CRATES',true);return false}unit.grenades--;
    const group=new THREE.Group(),body=createGrenadeModel(1.55);group.add(body);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const texture=new THREE.CanvasTexture(canvas),timer=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));timer.position.y=1.15;timer.scale.set(1.8,.9,1);group.add(timer);group.position.copy(unit.group.position).addScaledVector(unit.aim,1);group.position.y+=1.1;this.scene.add(group);
    this.thrownGrenades.push({group,body,canvas,texture,life:2,velocity:unit.aim.clone().multiplyScalar(8).add(new THREE.Vector3(0,5.2,0)),source:unit});this.audio.play('pickup',1.7);this.hud.toast(`GRENADE OUT · ${unit.grenades}/2 LEFT`);return true}
  updateThrownGrenades(dt){for(let i=this.thrownGrenades.length-1;i>=0;i--){const g=this.thrownGrenades[i];g.life-=dt;g.velocity.y-=20*dt;g.group.position.addScaledVector(g.velocity,dt);g.body.rotation.x+=dt*8;g.body.rotation.z+=dt*11;const floor=this.world.groundAt(g.group.position)+.28;if(g.group.position.y<floor){g.group.position.y=floor;g.velocity.y=Math.abs(g.velocity.y)*.48;g.velocity.x*=.76;g.velocity.z*=.76}const ctx=g.canvas.getContext('2d'),n=Math.max(0,g.life);ctx.clearRect(0,0,256,128);ctx.font='900 72px Impact, sans-serif';ctx.textAlign='center';ctx.lineWidth=12;ctx.strokeStyle='#161a38';ctx.strokeText(n.toFixed(1),128,88);ctx.fillStyle=n<.7?'#ff3045':'#ffd23f';ctx.fillText(n.toFixed(1),128,88);g.texture.needsUpdate=true;g.group.scale.setScalar(1+Math.sin(g.life*18)*.08);
      if(g.life<=0){const pos=g.group.position.clone();this.scene.remove(g.group);this.combat.radial(pos,8,110,g.source,28);this.particles.burst(pos,0xff5a24,90,22);this.particles.burst(pos,0x555866,70,15);this.particles.burst(pos,0xffd23f,40,28);const s=this.toScreen(pos);if(s)this.hud.burstingText(s.x,s.y,Math.random()>.5?'KABOOM!':'BAMMM!');this.audio.play('explosion',1.8);this.thrownGrenades.splice(i,1)}}}
  nearestInteractive(unit,range=4){let best=null,d=range;const all=[...Object.values(this.world.baseTurrets||{}),...(this.world.interactiveStructures||[]),...(this.world.motorcycles||[]),...(this.world.cars||[]),...(this.world.vehicles||[])];for(const e of all){if(e.dead)continue;const available=e.type==='turret'?(!e.rider&&e.team===unit.team):e.type==='bunker'?(e.occupants.length<e.capacity):Array.isArray(e.passengers)?(!e.driver||(e.passengers.length<e.capacity-1&&e.driver.team===unit.team)):(!e.driver||(!e.passenger&&e.driver.team===unit.team));if(!available)continue;const dist=e.group.position.distanceTo(unit.group.position);if(dist<d){d=dist;best=e}}return best}
  mountTurret(unit,turret){if(!unit||!turret||turret.rider||turret.dead)return false;turret.rider=unit;unit.mountedTurret=turret;unit.velocity.set(0,0,0);unit.group.visible=false;turret.controlYaw=Math.atan2(turret.aim.x,turret.aim.z);turret.controlPitch=Math.asin(turret.aim.y);if(unit===this.player){this.turretLockTarget=null;this.lockTarget=null;this.camera.fov=54;this.camera.updateProjectionMatrix();this.hud.setTurretMode(true);this.hud.toast('ARMORED TURRET · GUNLINE VIEW · RMB LOCK · E EXIT')}return true}
  mountBunker(unit,bunker){if(!unit||!bunker||bunker.dead||bunker.occupants.length>=bunker.capacity)return false;bunker.occupants.push(unit);unit.mountedBunker=bunker;unit.velocity.set(0,0,0);unit.group.visible=false;if(unit===this.player){this.lockTarget=null;this.camera.fov=54;this.camera.updateProjectionMatrix();this.hud.setTurretMode(true,'bunker');this.hud.toast(`BUNKER FIRING PORT ${bunker.occupants.length}/3 · E EXIT`)}return true}
  mountMotorcycle(unit,bike){if(!unit||!bike||bike.dead)return false;let role='driver';if(!bike.driver)bike.driver=unit;else if(Array.isArray(bike.passengers)&&bike.passengers.length<(bike.capacity||2)-1&&bike.driver.team===unit.team){bike.passengers.push(unit);role='passenger'}else if(!bike.passenger&&bike.driver.team===unit.team){bike.passenger=unit;role='passenger'}else return false;bike.team=unit.team;unit.mountedMotorcycle=bike;unit.motorcycleRole=role;unit.velocity.set(0,0,0);if(bike.vehicleKind==='tank'&&role==='driver'){bike.controlYaw=Math.atan2(bike.aim.x,bike.aim.z);bike.controlPitch=Math.asin(bike.aim.y)}if(unit===this.player){this.preMountFpsMode=Boolean(this.fpsMode);this.fpsMode=true;this.mountedControlRole=null;this.syncMountedView(unit,bike);this.turretLockTarget=null;this.lockTarget=null;this.camera.fov=72;this.camera.updateProjectionMatrix();this.hud.setTurretMode(this.mountedRole(unit,bike)==='tank-driver','tank');this.requestMouseCapture();const mountedRole=this.mountedRole(unit,bike);this.hud.toast(mountedRole==='tank-driver'?`${bike.name.toUpperCase()} · WASD HULL · MOUSE TURRET · LMB CANNON · E EXIT`:mountedRole==='driver'?`${bike.name.toUpperCase()} · W/S THROTTLE · MOUSE + A/D STEER · E EXIT`:mountedRole==='motorcycle-backrider'?'MOTORCYCLE BACKRIDER · MOUSE LOOK · LMB WEAPON · E EXIT':`${bike.name.toUpperCase()} PASSENGER · MOUSE FREELOOK · E EXIT`)}return true}
  exitInteractive(unit,forced=false){if(!unit)return false;const carrier=unit.mountedTurret||unit.mountedBunker||unit.mountedMotorcycle;if(!carrier)return false;const wasVehicle=Boolean(unit.mountedMotorcycle);if(unit.mountedTurret)carrier.rider=null;if(unit.mountedBunker)carrier.occupants=carrier.occupants.filter(u=>u!==unit);if(unit.mountedMotorcycle){if(Array.isArray(carrier.passengers)){if(carrier.driver===unit){carrier.driver=carrier.passengers.shift()||null;if(carrier.driver)carrier.driver.motorcycleRole='driver'}else carrier.passengers=carrier.passengers.filter(u=>u!==unit)}else if(carrier.driver===unit){carrier.driver=null;if(carrier.passenger){carrier.driver=carrier.passenger;carrier.driver.motorcycleRole='driver';carrier.passenger=null}}else if(carrier.passenger===unit)carrier.passenger=null}unit.mountedTurret=null;unit.mountedBunker=null;unit.mountedMotorcycle=null;unit.motorcycleRole=null;unit.group.visible=true;const side=new THREE.Vector3(carrier.aim?.z||1,0,-(carrier.aim?.x||0));unit.group.position.copy(carrier.group.position).addScaledVector(side,(carrier.radius||1)+1.2);unit.group.position.y=this.world.groundAt(unit.group.position);if(unit===this.player){this.turretLockTarget=null;this.mountedControlRole=null;this.mountedViewYaw=0;this.mountedViewPitch=0;if(wasVehicle){this.fpsMode=Boolean(this.preMountFpsMode);this.preMountFpsMode=false;if(this.fpsMode){this.fpsYaw=Math.atan2(unit.aim.x,unit.aim.z);this.fpsPitch=Math.asin(THREE.MathUtils.clamp(unit.aim.y,-1,1));this.requestMouseCapture()}else document.exitPointerLock?.()}this.camera.fov=this.fpsMode?72:48;this.camera.updateProjectionMatrix();this.hud.setTurretMode(false);this.hud.setVehicleRole?.('none');if(!forced)this.hud.toast('EXITED')}return true}
  exitTurret(unit,forced=false){return this.exitInteractive(unit,forced)}
  updateMountedTurret(unit,turret,dt){this.hud.prompt('');if(turret.dead){this.exitInteractive(unit,true);return}unit.group.position.copy(turret.group.position).setY(turret.group.position.y+2.45);turret.fireCooldown=Math.max(0,turret.fireCooldown-dt);this.updateTurretAim(turret,60,dt);if(this.input.consume('KeyE')){this.exitInteractive(unit);return}if(turret.reloadTimer>0){turret.reloadTimer=Math.max(0,turret.reloadTimer-dt);if(turret.reloadTimer===0){turret.ammo=turret.magazineSize;this.hud.toast('TURRET RELOADED')}}else if(this.input.mouse.down&&!turret.critical){if(turret.ammo<=0){turret.reloadTimer=2;this.hud.toast('RELOADING · 2s')}else this.combat.shoot(turret,turret.aim)}if(turret.ammo<=0&&turret.reloadTimer<=0)turret.reloadTimer=2}
  updateMountedBunker(unit,bunker,dt){this.hud.prompt('');if(bunker.dead){this.exitInteractive(unit,true);return}const slot=Math.max(0,bunker.occupants.indexOf(unit));unit.group.position.copy(bunker.group.position).add(bunker.slots[slot]||bunker.slots[0]);unit.fireCooldown=Math.max(0,unit.fireCooldown-dt);this.updateTurretAim(unit,45,dt);if(this.input.consume('KeyE')){this.exitInteractive(unit);return}if(this.input.mouse.down&&unit.weaponId!=='unarmed')this.combat.shoot(unit,unit.aim)}
  updateMountedMotorcycle(unit,bike,dt){this.hud.prompt(document.pointerLockElement===this.renderer?.domElement?'':'CLICK TO CAPTURE MOUSE');if(bike.dead){this.exitInteractive(unit,true);return}if(this.input.consume('KeyE')){this.exitInteractive(unit);return}const role=this.syncMountedView(unit,bike),axis=this.input.axis(),lookSensitivity=.0022;if(role==='tank-driver'){bike.throttle=-axis.z;bike.playerSteer=axis.x;bike.fireCooldown=Math.max(0,bike.fireCooldown-dt);bike.controlYaw=(bike.controlYaw??Math.atan2(bike.aim.x,bike.aim.z))-this.input.mouse.dx*lookSensitivity;bike.controlPitch=THREE.MathUtils.clamp((bike.controlPitch??Math.asin(bike.aim.y))-this.input.mouse.dy*lookSensitivity,THREE.MathUtils.degToRad(-35),THREE.MathUtils.degToRad(55));const yaw=bike.controlYaw,pitch=bike.controlPitch;bike.aim.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).normalize();bike.aimPitch=pitch;if(bike.head)bike.head.rotation.y=yaw-bike.group.rotation.y;for(const barrel of bike.barrels||[])barrel.rotation.x=Math.PI/2-pitch;if(this.input.mouse.down&&!this._mouseCaptureClick)this.combat.shoot(bike,bike.aim);return}this.mountedViewPitch=THREE.MathUtils.clamp((this.mountedViewPitch||0)-this.input.mouse.dy*lookSensitivity,THREE.MathUtils.degToRad(-70),THREE.MathUtils.degToRad(70));if(role==='driver'){bike.throttle=-axis.z;const mouseSteer=THREE.MathUtils.clamp(this.input.mouse.dx*.075,-1,1);bike.playerSteer=THREE.MathUtils.clamp(axis.x+mouseSteer,-1,1);this.mountedViewYaw=0;unit.aim.copy(this.mountedLookDirection(bike,0,this.mountedViewPitch));return}this.mountedViewYaw=THREE.MathUtils.clamp((this.mountedViewYaw||0)-this.input.mouse.dx*lookSensitivity,THREE.MathUtils.degToRad(-150),THREE.MathUtils.degToRad(150));unit.aim.copy(this.mountedLookDirection(bike));unit.fireCooldown=Math.max(0,unit.fireCooldown-dt);if(role==='motorcycle-backrider'&&this.input.mouse.down&&!this._mouseCaptureClick&&unit.weaponId!=='unarmed')this.combat.shoot(unit,unit.aim)}
  updateTurretAim(platform,range=60,dt=.016){const originY=platform.type==='turret'?2.55:platform.type==='vehicle'?2.2:1.4,origin=platform.group.position.clone().add(new THREE.Vector3(0,originY,0)),rect=this.renderer.domElement.getBoundingClientRect(),nx=THREE.MathUtils.clamp((this.input.mouse.x-rect.left)/rect.width*2-1,-1,1),ny=THREE.MathUtils.clamp(-((this.input.mouse.y-rect.top)/rect.height)*2+1,-1,1);if(this.turretLockTarget&&(this.turretLockTarget.dead||this.turretLockTarget.group.position.distanceTo(origin)>range))this.turretLockTarget=null;if(this.input.mouse.rightPressed){this.turretLockTarget=this.turretLockTarget?null:this.enemyNearCursor();if(this.turretLockTarget)this.hud.lockPulse()}let yaw,pitch;if(this.turretLockTarget){const raw=this.turretLockTarget.group.position.clone().add(new THREE.Vector3(0,1.1,0)).sub(origin).normalize();yaw=Math.atan2(raw.x,raw.z);pitch=Math.asin(raw.y);platform.controlYaw=yaw;platform.controlPitch=pitch}else{platform.controlYaw=(platform.controlYaw??Math.atan2(platform.aim.x,platform.aim.z))-nx*dt*2.65;platform.controlPitch=THREE.MathUtils.clamp((platform.controlPitch??Math.asin(platform.aim.y))+ny*dt*1.85,THREE.MathUtils.degToRad(-35),THREE.MathUtils.degToRad(55));yaw=platform.controlYaw;pitch=platform.controlPitch}pitch=THREE.MathUtils.clamp(pitch,THREE.MathUtils.degToRad(-35),THREE.MathUtils.degToRad(55));platform.aim.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).normalize();platform.aimPitch=pitch;if(platform.head)platform.head.rotation.y=platform.type==='vehicle'?yaw-platform.group.rotation.y:yaw;for(const barrel of platform.barrels||[])barrel.rotation.x=Math.PI/2-pitch;if(platform===this.player)this.player.group.rotation.y=yaw}
  updateMotorcycles(dt){
    for(const bike of [...(this.world.motorcycles||[]),...(this.world.cars||[]),...(this.world.vehicles||[])]){
      if(bike.dead)continue;
      const forward=new THREE.Vector3(Math.sin(bike.group.rotation.y),0,Math.cos(bike.group.rotation.y));
      if(bike.aiDirection){const desired=Math.atan2(bike.aiDirection.x,bike.aiDirection.z),delta=Math.atan2(Math.sin(desired-bike.group.rotation.y),Math.cos(desired-bike.group.rotation.y));bike.group.rotation.y+=THREE.MathUtils.clamp(delta,-bike.turnSpeed*dt,bike.turnSpeed*dt)}
      else bike.group.rotation.y-=(bike.playerSteer||0)*bike.turnSpeed*dt*(bike.throttle>=0?1:-1);
      forward.set(Math.sin(bike.group.rotation.y),0,Math.cos(bike.group.rotation.y));if(bike.type!=='vehicle')bike.aim.copy(forward);
      const targetSpeed=(bike.throttle||0)*bike.speed;bike.velocity.lerp(forward.clone().multiplyScalar(targetSpeed),Math.min(1,dt*4));bike.group.position.addScaledVector(bike.velocity,dt);this.world.clamp(bike.group.position);bike.group.position.y=this.world.groundAt(bike.group.position);
      bike.wheelSpin+=bike.velocity.length()*dt/.48;for(const w of bike.wheels)w.rotation.x=bike.wheelSpin;
      const riders=Array.isArray(bike.passengers)?[[bike.driver,.62],...bike.passengers.map((u,i)=>[u,i ? .05 : -.55])]:[[bike.driver,.1],[bike.passenger,-.78]];
      for(const [u,z] of riders){if(!u)continue;u.group.visible=bike.type==='motorcycle';u.group.position.copy(bike.group.position).addScaledVector(forward,z);u.group.position.y+=1.1;u.group.rotation.y=bike.group.rotation.y}
      bike.throttle*=Math.pow(.18,dt);bike.playerSteer=0;bike.aiDirection=null;
    }
  }
  updateBaseTurrets(dt){for(const turret of Object.values(this.world.baseTurrets||{})){if(turret.dead)continue;if(!turret.critical){turret.warning.visible=false;continue}turret.explosionTimer=Math.max(0,turret.explosionTimer-dt);const ctx=turret.warningContext,c=turret.warningCanvas;ctx.clearRect(0,0,c.width,c.height);ctx.textAlign='center';ctx.font='900 72px Impact, sans-serif';ctx.lineWidth=14;ctx.strokeStyle='#151a38';ctx.strokeText('GET OUT!!!',256,72);ctx.fillStyle=Math.sin(this.elapsed*14)>0?'#ff3045':'#ffd23f';ctx.fillText('GET OUT!!!',256,72);ctx.font='900 64px Impact, sans-serif';ctx.strokeText(turret.explosionTimer.toFixed(1),256,152);ctx.fillStyle='#fff';ctx.fillText(turret.explosionTimer.toFixed(1),256,152);turret.warningTexture.needsUpdate=true;turret.warning.visible=true;turret.warning.position.y=5.7+Math.abs(Math.sin(this.elapsed*7))*.6;
      if(turret.explosionTimer<=0){const pos=turret.group.position.clone();const rider=turret.rider;if(rider){this.exitTurret(rider,true);this.combat.applyDamage(rider,180,turret,new THREE.Vector3(0,1,1).normalize(),24,true)}turret.dead=true;turret.warning.visible=false;this.combat.radial(pos,10,135,turret,32);this.particles.burst(pos.clone().add(new THREE.Vector3(0,2,0)),0xff4a24,120,26);this.particles.burst(pos.clone().add(new THREE.Vector3(0,2,0)),0x444854,80,18);this.handleDeath(turret,turret.lastDamageSource)}}}
  updateWildlife(dt){const combatants=this.combatants.filter(e=>!e.dead);for(const w of this.world.wildlife){if(w.dead)continue;w.attackCooldown=Math.max(0,w.attackCooldown-dt);w.decisionTimer-=dt;let target=null;if(w.kind==='wolf'){let best=Infinity;for(const e of combatants){const d=e.group.position.distanceToSquared(w.group.position);if(d<best){best=d;target=e}}if(target&&best<100){const dir=target.group.position.clone().sub(w.group.position).setY(0),dist=dir.length();dir.normalize();w.velocity.lerp(dir.multiplyScalar(w.speed),dt*4);w.aim.copy(dir);if(dist<1.35&&w.attackCooldown<=0){this.combat.applyDamage(target,9,w,dir,2);w.attackCooldown=.8}}else target=null}else if(w.kind==='slime'){let best=Infinity;for(const c of this.world.crates){if(c.carried||c.placed||c.falling)continue;const d=c.group.position.distanceToSquared(w.group.position);if(d<best){best=d;target=c}}if(target){const dir=target.group.position.clone().sub(w.group.position).setY(0),dist=dir.length();dir.normalize();w.velocity.lerp(dir.multiplyScalar(w.speed),dt*3);if(dist<1.1){this.scene.remove(target.group);this.world.crates.splice(this.world.crates.indexOf(target),1);target=null}}}if(!target){if(w.decisionTimer<=0){w.decisionTimer=1.5+Math.random()*2;w.wanderAngle+=(Math.random()-.5)*2.4}w.velocity.lerp(new THREE.Vector3(Math.sin(w.wanderAngle),0,Math.cos(w.wanderAngle)).multiplyScalar(w.speed*.45),dt*2)}w.group.position.addScaledVector(w.velocity,dt);this.world.clamp(w.group.position);w.group.position.y=this.world.groundAt(w.group.position);if(w.velocity.lengthSq()>.05)w.group.rotation.y=Math.atan2(w.velocity.x,w.velocity.z);if(w.kind==='slime')w.group.scale.y=.92+Math.sin(this.elapsed*7+w.wanderAngle)*.08}}
  updateObjective(dt){if(this.mission.type!=='capture')return;const near=list=>list.filter(e=>!e.dead&&e.group.position.distanceTo(this.world.cavePosition)<6).length,blue=near(this.allies),red=near(this.enemies);if(blue>red&&blue>0)this.objectiveProgress=Math.min(this.mission.duration,this.objectiveProgress+dt);else this.objectiveProgress=Math.max(0,this.objectiveProgress-dt*.35);this.world.caveRing.material.color.setHex(blue>red&&blue>0?0x4cff8a:red>blue?0xff4b55:0x5bd9ff);this.hud.el.objective.textContent=`Hold the mineral cave · ${Math.ceil(this.mission.duration-this.objectiveProgress)}s`;if(this.objectiveProgress>=this.mission.duration)this.endMission(true)}
  // aim: mouse by default, snaps to the locked target while a lock is held
  updateAim(dt){const p=this.player;
    if (this.fpsMode) {
      const sensitivity = 0.0022;
      this.fpsYaw = (this.fpsYaw || 0) - this.input.mouse.dx * sensitivity;
      this.fpsPitch = THREE.MathUtils.clamp((this.fpsPitch || 0) - this.input.mouse.dy * sensitivity, -Math.PI / 2.1, Math.PI / 2.1);
      
      const look = new THREE.Vector3(
        Math.sin(this.fpsYaw) * Math.cos(this.fpsPitch),
        Math.sin(this.fpsPitch),
        Math.cos(this.fpsYaw) * Math.cos(this.fpsPitch)
      );
      p.aim.copy(look).normalize();
      p.group.rotation.y = this.fpsYaw;
      p.headPitch = -this.fpsPitch;
      return;
    }
    p.headPitch = 0;
    if(this.lockTarget&&(this.lockTarget.dead||this.lockTarget.group.position.distanceTo(p.group.position)>45)){this.lockTarget=null;this.hud.toast('LOCK LOST',true)}
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
          this.hud.toast('NO TARGET NEAR CURSOR',true);
        }
      }
    }
    if(!this.input.mouse.right)this.rightLockDone=false;
    if(this.lockTarget){
      const targetPos=this.lockTarget.group.position.clone();
      const targetHeight=targetPos.y+(this.lockTarget.type==='unit'?1.2:1);
      const dir=new THREE.Vector3(targetPos.x,targetHeight,targetPos.z).sub(new THREE.Vector3(p.group.position.x,p.group.position.y+1.35,p.group.position.z));
      if(dir.lengthSq()>.01)p.aim.lerp(dir.normalize(),.5).normalize();
    }
    else{
      let targetPoint=this.hoverPoint;
      if(!targetPoint){
        const rect=this.renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((this.input.mouse.x-rect.left)/rect.width*2-1,-((this.input.mouse.y-rect.top)/rect.height)*2+1),ray=new THREE.Raycaster();ray.setFromCamera(mouse,this.camera);const point=new THREE.Vector3();
        if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-p.group.position.y),point)){
          targetPoint=point;
        }
      }
      if(targetPoint){
        const dir=targetPoint.clone().sub(new THREE.Vector3(p.group.position.x,p.group.position.y+1.35,p.group.position.z));
        if(dir.lengthSq()>.01)p.aim.lerp(dir.normalize(),.32).normalize();
      }
    }
    p.group.rotation.y=Math.atan2(p.aim.x,p.aim.z)}
  isLockable(e){if(!e||e.dead)return false;if(e.type==='prop'||e.type==='wildlife')return true;if(e.type==='bunker')return e.occupants?.some(u=>this.hostile(this.playerTeam,u.team));return e.team&&e.team!=='neutral'&&this.hostile(this.playerTeam,e.team)}
  lockCandidates(){const list=this.enemies.filter(e=>!e.dead);for(const tid of Object.keys(this.world.factories)){const f=this.world.factories[tid];if(!f.dead&&this.hostile(this.playerTeam,tid))list.push(f)}for(const w of this.world.wildlife)if(!w.dead)list.push(w);for(const d of this.world.destructibles)if(!d.dead)list.push(d);for(const b of this.world.interactiveStructures||[])if(this.isLockable(b))list.push(b);for(const m of [...(this.world.motorcycles||[]),...(this.world.cars||[])])if(this.isLockable(m))list.push(m);return list}
  enemyNearCursor(x=this.input.mouse.x,y=this.input.mouse.y){let best=null,bestD=170;for(const e of this.lockCandidates()){const s=this.toScreen(e.group.position);if(!s)continue;const d=Math.hypot(s.x-x,s.y-y);if(d<bestD){bestD=d;best=e}}return best}
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
    const pov=Boolean(this.fpsMode||this.player?.mountedMotorcycle),pointerX=pov?rect.left+rect.width/2:this.input.mouse.x,pointerY=pov?rect.top+rect.height/2:this.input.mouse.y;
    this._hoverMouse.set((pointerX-rect.left)/rect.width*2-1,-((pointerY-rect.top)/rect.height)*2+1);
    this._hoverRaycaster.setFromCamera(this._hoverMouse,this.camera);

    // Perform targeted raycasting only against relevant meshes
    const targets = [];
    const ground = this.scene.getObjectByName('generated-grass-ground');
    if (ground) targets.push(ground);
    if (this.world.water) targets.push(this.world.water);
    for (const c of this.combatants) { if (c.group && !c.dead) targets.push(c.group); }
    for (const f of Object.values(this.world.factories)) { if (f.group && !f.dead) targets.push(f.group); }
    for (const w of this.world.wildlife) { if (w.group && !w.dead) targets.push(w.group); }
    for (const d of this.world.destructibles) { if (d.group && !d.dead) targets.push(d.group); }
    for (const d of this.world.interactiveStructures||[]) { if (d.group && !d.dead) targets.push(d.group); }
    for (const d of this.world.motorcycles||[]) { if (d.group && !d.dead) targets.push(d.group); }
    for (const d of this.world.cars||[]) { if (d.group && !d.dead) targets.push(d.group); }
    for (const c of this.world.crates) { if (c.group && !c.carried && !c.placed) targets.push(c.group); }

    const hits=this._hoverRaycaster.intersectObjects(targets,true);
    let found=null;
    for(const h of hits){
      let obj = h.object;
      let e = null;
      while (obj) {
        if (obj.userData?.entity) { e = obj.userData.entity; break; }
        obj = obj.parent;
      }
      if(e&&!e.dead&&['unit','vehicle','turret','factory','wildlife','prop','bunker','motorcycle'].includes(e.type)){
        found=e;
        break;
      }
    }
    this.hoverEntity=found;
    let hoverPt=null;
    for(const h of hits){
      const objName=h.object.name;
      let hasEntity=false;
      let obj = h.object;
      while (obj) {
        if (obj.userData?.entity) { hasEntity = true; break; }
        obj = obj.parent;
      }
      if(objName==='generated-grass-ground'||h.object===this.world.water||hasEntity){
        hoverPt=h.point;
        break;
      }
    }
    this.hoverPoint=hoverPt;
    const platformMode=Boolean(this.player?.mountedTurret||this.player?.mountedBunker),overEnemy=this.isLockable(found)&&found.type!=='prop';
    let cx=pov?rect.left+rect.width/2:this.input.mouse.x,cy=pov?rect.top+rect.height/2:this.input.mouse.y;const activeLock=platformMode?this.turretLockTarget:this.lockTarget;
    if(activeLock){const s=this.toScreen(activeLock.group.position);if(s){cx=s.x;cy=s.y}}
    this.hud.setCrosshair(cx,cy,overEnemy,Boolean(activeLock));this.hud.showInfo(found&&found.type!=='prop'?found:null,this.input.mouse.x,this.input.mouse.y)}
  handleInteraction(){const p=this.player,interactive=this.nearestInteractive(p);if(interactive&&!p.carriedCrate){const label=interactive.type==='turret'?'ARMORED TURRET':interactive.type==='bunker'?`BUNKER (${interactive.occupants.length}/3)`:interactive.type==='vehicle'?`${interactive.name.toUpperCase()} (${interactive.occupants.length}/${interactive.capacity})`:(interactive.driver?'MOTORCYCLE GUNNER SEAT':'MOTORCYCLE');this.hud.prompt(`E · ENTER ${label}`);if(this.input.consume('KeyE')){if(interactive.type==='turret')this.mountTurret(p,interactive);else if(interactive.type==='bunker')this.mountBunker(p,interactive);else this.mountMotorcycle(p,interactive)}return}if(p.carriedCrate){const airborne=p.group.position.y>p.groundY+.35;if(airborne)this.hud.prompt(`E · THROW ${p.carriedCrate.crateType.name.toUpperCase()} · ${p.carriedCrate.mass.toFixed(1)} MASS`);else if(this.builder.distanceTo(p.group.position)<3.6)this.hud.prompt('E · STACK CRATE ON D-BUILDER');else this.hud.prompt('E · DROP CRATE  ·  F · MATERIALIZE');if(this.input.consume('KeyE')){const crate=p.carriedCrate;if(airborne){this.world.launchCrate(crate,p.group.position,p.aim,p.velocity);this.hud.toast(`${crate.crateType.name.toUpperCase()} THROWN`)}else if(this.builder.distanceTo(p.group.position)<3.6){const forward = new THREE.Vector3(Math.sin(p.group.rotation.y), 0, Math.cos(p.group.rotation.y));const defaultPos = p.group.position.clone().addScaledVector(forward, 1.25);let bestCol = 0;let bestDist = Infinity;for (let col = 0; col < 4; col++) {const colPos = this.builder.cellPosition(col, 0);const d = new THREE.Vector2(defaultPos.x - colPos.x, defaultPos.z - colPos.z).lengthSq();if (d < bestDist) {bestDist = d;bestCol = col;}}if(!this.builder.place(crate,p.group.position,'nearest',bestCol)){this.hud.toast('PAD FULL',true);return}this.audio.play('build',1.3)}else{crate.carried=false;crate.physicsActive=true;crate.velocity.copy(p.velocity).multiplyScalar(.2);crate.angularVelocity.set((Math.random()-.5)*2,0,(Math.random()-.5)*2);crate.group.position.copy(p.group.position).addScaledVector(p.aim,1.6);crate.group.position.y=p.group.position.y+.25}this.restoreCrateAndHandsOpacity(p);p.carriedCrate=null;this.audio.play('pickup',.8)}return}
    let nearest=null,dist=p.magneticGloves?3.6:2.35;for(const c of this.world.crates){if(c.carried||c.placed||c.falling)continue;const d=c.group.position.distanceTo(p.group.position);if(d<dist){dist=d;nearest=c}}
    const nearBuilder=this.builder.distanceTo(p.group.position)<4.2,recipe=nearBuilder?this.builder.recipe():null;
    // placed crates stay retrievable until the stack is actually combined
    const canTakeBack=!nearest&&nearBuilder&&this.builder.count()>0;
    this.hud.prompt(nearest?`E · CARRY ${nearest.crateType.name.toUpperCase()}${nearBuilder&&recipe?`  ·  F · ${recipe.label}`:''}`:canTakeBack?`E · TAKE CRATE BACK${recipe?`  ·  F · ${recipe.label}`:''}`:recipe?`F · MATERIALIZE ${recipe.label}`:'');
    if(nearest&&this.input.consume('KeyE')){nearest.carried=true;nearest.physicsActive=false;nearest.velocity?.set(0,0,0);nearest.angularVelocity?.set(0,0,0);nearest.visual?.rotation.set(0,0,0);p.carriedCrate=nearest;this.audio.play('pickup')}
    else if(canTakeBack&&this.input.consume('KeyE')){const crate=this.builder.takeBack(p.group.position);if(crate){crate.carried=true;crate.physicsActive=false;crate.velocity?.set(0,0,0);crate.angularVelocity?.set(0,0,0);crate.visual?.rotation.set(0,0,0);p.carriedCrate=crate;this.audio.play('pickup');this.hud.toast(`${crate.crateType.name.toUpperCase()} RETRIEVED`)}}}
  switchPlayer(){if(this.player.carriedCrate){this.hud.toast('DROP THE CRATE FIRST',true);return}const controllable=this.livingUnits(this.playerTeam);if(controllable.length<2)return;const next=controllable[(controllable.indexOf(this.player)+1)%controllable.length];this.possess(next);this.hud.toast(`${next.classDef.name.toUpperCase()} SELECTED`)}
  possess(unit){if(this.player)this.player.player=false;this.setHealAim(false);this.setGrappleAim(false);unit.player=true;unit.ammo=unit.ammo??60;this.player=unit;if(AI_BEHAVIORS[this.aiBehaviorIndex]?.id==='bodyguard'){for(const ally of this.livingUnits(this.playerTeam)){ally.patrolPoint=null;ally.commandPoint=null}this.hud.toast(`BODYGUARD PRIORITY · ${unit.classDef.name.toUpperCase()}`)}}
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
      case 'fireball':this.combat.spawn(u,u.aim,{...WEAPONS.rocket,damage:60,speed:22,color:0xff8a2c});break;
      case 'blink':this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),0x9fe8ff,16,5);u.group.position.addScaledVector(u.aim,8);this.world.clamp(u.group.position);u.group.position.y=this.world.groundAt(u.group.position);this.particles.burst(u.group.position.clone().add(new THREE.Vector3(0,1,0)),0x9fe8ff,16,5);break;
      case 'healburst':for(const f of friends)if(f.group.position.distanceTo(pos)<8&&Number.isFinite(f.maxHp)){const healed=this.healUnit(f,40,u);f.freeze=0;f.stun=0;if(healed)this.spawnDamageNumber(f.group.position,`+${Math.round(healed)}`,'heal')}this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),0x67ffc4,26,6);break;
      case 'shockwave':this.combat.radial(pos,6,30,u,14);break;
      case 'decoy':{const d=this.factory.createUnit(u.classId,u.team,pos.clone().addScaledVector(u.aim,2));d.hp=d.maxHp=60;d.weapon={...WEAPONS.pistol,range:0};d.stationary=true;d.decoy=true;this.combatants.push(d);this.entities.push(d);break}
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
    let best=null,bestD=120;
    for(const e of candidates){const s=this.toScreen(e.group.position);if(!s)continue;const d=Math.hypot(s.x-this.input.mouse.x,s.y-this.input.mouse.y);if(d<bestD){bestD=d;best=e}}
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
  handleBuild(recipe,tier=0,builder=this.builder){const team=builder.team,mine=team===this.playerTeam;this.audio.play('build');const toCenter=builder.pad.clone().multiplyScalar(-1).setY(0).normalize();const pos=builder.pad.clone().addScaledVector(toCenter,4);pos.y=this.world.groundAt(pos);const tierLabel=['','UNCOMMON ','RARE ','LEGENDARY '][tier]||'';
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
        this.factory.setWeaponModel(this.player,weaponId,weapon);
        this.player.weaponTier = profile.rank;
        this.player.ammo = (this.player.ammo || 0) + 50;
        this.showOverheadIcon(this.player,'weapon',{weaponId,weapon});
        this.hud.toast(`${weapon.name.toUpperCase()} · POWER ${profile.strength.toFixed(1)} (+50 AMMO)`);
      } else {
        const recipient = this.livingUnits(team).sort((a,b)=>(a.weaponTier||0)-(b.weaponTier||0))[0];
        if (recipient) {
          this.factory.setWeaponModel(recipient,weaponId,weapon);recipient.weaponTier=profile.rank;
          this.showOverheadIcon(recipient,'weapon',{weaponId,weapon});
        }
      }
    }
    if(mine)this.particles.burst(pos.clone().add(new THREE.Vector3(0,1,0)),TEAM.YELLOW,30,8);
    if(this.mission.type==='build'&&mine&&recipe.output==='unit'&&recipe.count>=4)setTimeout(()=>this.endMission(true),700);
    return true}
  handleDamage(target,amount,source,direction=null){if(amount<=0){if(target.passive?.id==='lucky')this.spawnDamageNumber(target.group.position,'DODGE','status');return}
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
        this.audio.play('destructo_grunt', pos);
      } else if (['factory', 'turret', 'bunker', 'vehicle', 'motorcycle', 'cars'].includes(target.type)) {
        this.audio.play('metal_hit', pos);
      } else if (target.type === 'prop') {
        const subtype = (target.subtype || '').toLowerCase();
        if (subtype.includes('wood') || subtype.includes('tree')) {
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
  // unit deaths burst apart: limbs fly, big flash, then the husk vanishes
  explodeUnit(target){const pos=target.group.position.clone().add(new THREE.Vector3(0,1,0)),color=this.teamMap[target.team]?.color??0xff8a3c;
    this.particles.burst(pos,color,34,10);this.particles.burst(pos,0xff8a3c,22,13);
    if(target.type==='unit')this.spawnDeathDebris(target);
    if(target.type==='unit'){for(const part of [target.head,target.leftHand,target.rightHand,target.leftBoot,target.rightBoot]){if(!part)continue;const dx=(Math.random()-.5)*5,dz=(Math.random()-.5)*5;gsap.to(part.position,{x:part.position.x+dx,y:part.position.y+2.5+Math.random()*2,z:part.position.z+dz,duration:.5,ease:'power2.out'});gsap.to(part.rotation,{x:Math.random()*9,z:Math.random()*9,duration:.5});gsap.to(part.scale,{x:.02,y:.02,z:.02,duration:.5,ease:'back.in(2)'})}
      gsap.to(target.body.scale,{x:1.6,y:.2,z:1.6,duration:.16,ease:'power3.out',onComplete:()=>{gsap.to(target.group.scale,{x:.02,y:.02,z:.02,duration:.3,ease:'back.in(2)',onComplete:()=>{target.group.visible=false}})}})}
    else gsap.to(target.group.scale,{x:.05,y:.05,z:.05,duration:.45,ease:'back.in(2)',onComplete:()=>{target.group.visible=false}})}
  handleDeath(target,source){
    if (target.group && target.group.position) {
      const pos = target.group.position;
      if (target.type === 'unit') {
        this.audio.play('destructo_death', pos);
        this.audio.play('destructo_bloodsplash', pos);
      } else if (['factory', 'turret', 'bunker'].includes(target.type)) {
        this.audio.play('structure_death', pos);
      } else {
        this.audio.play('explosion', pos, target.type === 'factory' ? 0.7 : 1.1);
      }
    } else {
      this.audio.play('explosion', null, target.type === 'factory' ? 0.7 : 1.1);
    }
    if(target.type==='unit')this.spawnDeathQuip(target);if(this.lockTarget===target)this.lockTarget=null;if(this.turretLockTarget===target)this.turretLockTarget=null;if(target.mountedTurret||target.mountedBunker||target.mountedMotorcycle)this.exitInteractive(target,true);if(target.rider)this.exitInteractive(target.rider,true);if(target.occupants)for(const u of [...target.occupants])this.exitInteractive(u,true);if(target.driver)this.exitInteractive(target.driver,true);if(target.passenger)this.exitInteractive(target.passenger,true);if(target.carriedCrate){target.carriedCrate.carried=false;target.carriedCrate.physicsActive=true;target.carriedCrate.velocity.copy(target.velocity||new THREE.Vector3()).multiplyScalar(.35);target.carriedCrate.angularVelocity.set(2,1,-2);target.carriedCrate=null}
    if(this.state==='observer'&&target.type==='unit'&&source?.team&&this.hostile(target.team,source.team))this.featureObserverKill(source,target);
    if(target.danger)target.danger.visible=false;
    if(['unit','vehicle','turret'].includes(target.type)){if(target.team)this.recordStat(target.team,'deaths');if(source&&source.team)this.recordStat(source.team,'kills');}
    else if(target.type==='factory'){if(source&&source.team)this.recordStat(source.team,'structuresDestroyed');}
    else if(target.type==='wildlife'){if(source&&source.team)this.recordStat(source.team,'neutralKills');}
    else if(target.type==='prop'){
      const isStructure=['brick','concrete','cobble','marble','plating','crystal'].includes(target.subtype);
      if(source&&source.team)this.recordStat(source.team,isStructure?'structuresDestroyed':'destructiblesDestroyed');
    }
    if(!this.observerOnly&&target===this.player){const next=this.livingUnits(this.playerTeam)[0];if(next){this.possess(next);this.hud.toast(`${next.classDef.name.toUpperCase()} TAKING COMMAND`)}else if(!this.world.factories[this.playerTeam].dead)this.hud.toast('SQUAD WIPED — REINFORCEMENT INCOMING',true)}
    if(target.type==='factory'){this.hud.toast(`${this.teamMap[target.team]?.name.toUpperCase()??'A'} BASE DESTROYED${target.team===this.playerTeam?' — NO MORE RESPAWNS':''}`,target.team===this.playerTeam);this.particles.burst(target.group.position.clone().add(new THREE.Vector3(0,2,0)),this.teamMap[target.team]?.color??0xff5062,90,15);
      if(target===this.world.redFactory&&this.mission.type==='assault'){setTimeout(()=>this.startVictorySequence(this.teamMap[this.playerTeam]),900);return}}
    if(target.type==='unit'&&this.hostile(this.playerTeam,target.team)){this.kills++;if(source)source.kills=(source.kills||0)+1}
    if(target.type==='wildlife'&&target.kind==='slime'){const charged=this.factory.createCrate(target.group.position.clone(),'blue');this.world.crates.push(charged)}
    this.explodeUnit(target)}
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
    if(this.player?.mountedMotorcycle){
      if(this.camera.fov!==72){this.camera.fov=72;this.camera.updateProjectionMatrix()}
      const p=this.player,bike=p.mountedMotorcycle,role=this.syncMountedView(p,bike);let eye,look;
      if(role==='tank-driver'){look=bike.aim.clone();eye=bike.group.position.clone().add(new THREE.Vector3(0,2.35,0)).addScaledVector(look,.42)}
      else{look=role==='driver'?this.mountedLookDirection(bike,0,this.mountedViewPitch):this.mountedLookDirection(bike);eye=p.group.position.clone().add(new THREE.Vector3(0,bike.type==='motorcycle'?.72:.82,0)).addScaledVector(look,.28)}
      this.camera.position.copy(eye);this.camera.lookAt(eye.clone().addScaledVector(look,40));return
    }
    if(this.fpsMode){
      if(this.camera.fov!==72){
        this.camera.fov=72;
        this.camera.updateProjectionMatrix();
      }
      const p=this.player;
      const eye=p.group.position.clone().add(new THREE.Vector3(0,1.62,0)).addScaledVector(p.aim,.42);
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().add(p.aim));
      return;
    }
    if(this.camera.fov!==48){
      this.camera.fov=48;
      this.camera.updateProjectionMatrix();
    }
    if(this.player?.mountedTurret){const turret=this.player.mountedTurret,flat=turret.aim.clone().setY(0).normalize(),desired=turret.group.position.clone().add(new THREE.Vector3(0,3.48,0)).addScaledVector(flat,.78),gunline=turret.group.position.clone().add(new THREE.Vector3(0,2.73,0)).addScaledVector(turret.aim,45);this.camera.position.copy(desired);this.camera.lookAt(gunline);return}
    if(this.player?.mountedBunker){const b=this.player.mountedBunker,flat=this.player.aim.clone().setY(0).normalize(),edgeX=Math.abs(flat.x)>.001?3.95/Math.abs(flat.x):Infinity,edgeZ=Math.abs(flat.z)>.001?3.2/Math.abs(flat.z):Infinity,edge=Math.min(edgeX,edgeZ)+.3,desired=b.group.position.clone().add(new THREE.Vector3(0,2.45,0)).addScaledVector(flat,edge),gunline=desired.clone().addScaledVector(this.player.aim,45);this.camera.position.copy(desired);this.camera.lookAt(gunline);return}
    if(this.cameraScout){const scout=this.cameraScout;if(!scout.returning){scout.elapsed+=dt;const desired=scout.point.clone().add(new THREE.Vector3(0,24,18));this.camera.position.lerp(desired,1-Math.pow(.00001,dt));this.camera.lookAt(scout.point);if(scout.elapsed>=3)scout.returning=true;return}const desired=this.player.group.position.clone().add(new THREE.Vector3(0,21,20));this.camera.position.lerp(desired,1-Math.pow(.00001,dt));this.camera.lookAt(this.player.group.position.clone().add(new THREE.Vector3(0,1.2,2)));if(this.camera.position.distanceTo(desired)<.8)this.cameraScout=null;return}
    const desired=this.player.group.position.clone().add(new THREE.Vector3(0,21,20));desired.y=21+this.player.groundY*.55+(this.player.group.position.y-this.player.groundY)*.3;this.camera.position.lerp(desired,1-Math.pow(.001,dt));const target=this.player.group.position.clone().add(new THREE.Vector3(0,1.2,2));this.camera.lookAt(target)}
  endMission(won){if(this.state!=='mission' && this.state!=='scoreboard')return;const reward=this.observerOnly?0:won?this.mission.reward+this.kills*35:Math.floor(this.kills*12);if(!this.observerOnly)this.save.recordMission(won,this.kills,reward);this.endRuntime();this.state='results';
    if (this.observerOnly) {
      this.audio.playMusic('/music/battle_win.mp3', false);
    } else if (won) {
      this.audio.playMusic('/music/battle_win.mp3', false);
    } else {
      this.audio.playMusic('/music/battle_lost.mp3', false);
    }
    this.screen.innerHTML=`<main class="menu mission-end"><span class="eyebrow">${this.mission.name.toUpperCase()}</span><h2>${this.observerOnly?'MATCH COMPLETE':won?'VICTORY':'SQUAD LOST'}</h2><div class="stat-row"><div><strong>${this.teams.find(t=>!t.eliminated)?.name?.toUpperCase()||'—'}</strong><span>WINNER</span></div><div><strong>${Math.floor(this.elapsed/60)}:${String(Math.floor(this.elapsed%60)).padStart(2,'0')}</strong><span>TIME</span></div><div><strong>${reward}</strong><span>MISSION CHIPS</span></div></div><div class="menu-actions"><button class="btn primary" data-action="hub">RETURN TO HUB</button><button class="btn" data-action="missions">MISSION BOARD</button></div></main>`}
  recordStat(teamId,statName,amount=1){if(this.teamStats&&this.teamStats[teamId]){this.teamStats[teamId][statName]=(this.teamStats[teamId][statName]||0)+amount;}}
  recordDestructoCreated(unit){const stats=this.teamStats?.[unit?.team];if(!stats||unit.type!=='unit')return;const id=unit.classId||'unknown';stats.destructosCreated[id]=(stats.destructosCreated[id]||0)+1}
  healUnit(target,amount,healer=target){if(!target||target.dead||!Number.isFinite(target.maxHp))return 0;const before=target.hp;target.hp=Math.min(target.maxHp,target.hp+amount);const healed=Math.max(0,target.hp-before);if(healed&&healer?.team)this.recordStat(healer.team,'healing',healed);return healed}
  enterObserverMode(){this.hud.show(false);this.endRuntime();this.input.enabled=true;this.state='observer';document.getElementById('observer-panel').classList.remove('hidden');document.body.classList.add('observing');this.obsZoom=1;this.obsRotation=0;this.obsPitch=.65;this.observerMode=this.observerOnly?'cinematic':'follow';this.directorTimer=0;this.freeLookPosition=this.camera.position.clone();this.freeLookYaw=0;this.freeLookPitch=-.35;this.observerTarget=this.combatants.find(u=>u.type==='unit'&&!u.dead)||null;this.directorCutDelay=0;this.pendingCutTarget=null;this.pendingCutAngle=null;this.pendingCutFeature=null;this.wasInBattle=false;this.transparentCrate=null;this.initObserverUI();this.setObserverMode(this.observerMode);this.updateObserverUI()}
  initObserverUI(){
    const teamSelect=document.getElementById('obs-team-select');const unitSelect=document.getElementById('obs-unit-select');
    this.selectedBetTeam=null;const amount=document.getElementById('obs-bet-amount'),button=document.getElementById('obs-bet-btn');amount.disabled=false;button.disabled=false;document.getElementById('obs-bet-status').textContent='SELECT A TEAM';
    teamSelect.innerHTML='';
    const teams=this.teams.filter(t=>!t.eliminated);
    for(const t of teams){const opt=document.createElement('option');opt.value=t.id;opt.textContent=t.name.toUpperCase();teamSelect.appendChild(opt);}
    teamSelect.onchange=(e)=>{this.observeTeam(e.target.value);};
    unitSelect.onchange=(e)=>{const units=this.livingUnits(teamSelect.value);const idx=parseInt(e.target.value);if(units[idx]){this.observerTarget=units[idx];if(this.observerMode==='free')this.setObserverMode('follow')}};
    document.querySelectorAll('[data-obs-mode]').forEach(button=>button.onclick=()=>this.setObserverMode(button.dataset.obsMode));
    document.getElementById('obs-bet-btn').onclick=()=>this.placeObserverBet();this.refreshObserverOdds();
  }
  observeTeam(teamId){
    const unitSelect=document.getElementById('obs-unit-select');unitSelect.innerHTML='';
    const units=this.livingUnits(teamId);
    units.forEach((u,i)=>{const opt=document.createElement('option');opt.value=i;opt.textContent=`${u.classDef.name.toUpperCase()} (HP ${Math.ceil(u.hp)})`;unitSelect.appendChild(opt);});
    if(units.length>0){this.observerTarget=units[0];unitSelect.value=0;}else{this.observerTarget=null;}
  }
  updateObserverUI(){
    const teamSelect=document.getElementById('obs-team-select');
    if(!this.observerTarget||this.observerTarget.dead){
      const t=this.teams.find(team=>!team.eliminated&&this.livingUnits(team.id).length>0);
      if(t){teamSelect.value=t.id;this.observeTeam(t.id);}else{this.observerTarget=null;}
    }
    const clock=document.getElementById('obs-clock');if(clock)clock.textContent=`${Math.floor(this.elapsed/60)}:${String(Math.floor(this.elapsed%60)).padStart(2,'0')}`;
    for(const [key,mode] of [['Digit1','follow'],['Digit2','pov'],['Digit3','free'],['Digit4','cinematic']])if(this.input.consume(key))this.setObserverMode(mode);
    if(this.input.consume('BracketLeft'))this.cycleObserverTarget(-1);if(this.input.consume('BracketRight'))this.cycleObserverTarget(1);
    this._oddsRefresh=(this._oddsRefresh||0)+.033;if(this._oddsRefresh>.8&&!this.observerBet){this._oddsRefresh=0;this.refreshObserverOdds()}
  }
  setObserverMode(mode){this.observerMode=mode;this.directorCutDelay=0;this.pendingCutTarget=null;this.pendingCutAngle=null;this.pendingCutFeature=null;this.wasInBattle=false;if(this.transparentCrate){this.restoreCrateOpacity(this.transparentCrate);this.transparentCrate=null;}if(mode==='free'){this.freeLookPosition=this.camera.position.clone();const d=new THREE.Vector3();this.camera.getWorldDirection(d);this.freeLookYaw=Math.atan2(d.x,d.z);this.freeLookPitch=Math.asin(d.y)}if(mode==='cinematic')this.directorTimer=0;const fov=mode==='pov'?72:48;if(this.camera.fov!==fov){this.camera.fov=fov;this.camera.updateProjectionMatrix()}document.querySelectorAll('[data-obs-mode]').forEach(b=>b.classList.toggle('active',b.dataset.obsMode===mode));const label=document.getElementById('obs-mode-label');if(label)label.textContent=mode==='pov'?'PLAYER POV · TARGET LOCKED':mode==='free'?'FREELOOK · WASD + Q/E':mode==='cinematic'?'AI DIRECTOR · AUTO':'FOLLOW CAM'}
  cycleObserverTarget(delta){const units=this.combatants.filter(u=>u.type==='unit'&&!u.dead);if(!units.length)return;const i=Math.max(0,units.indexOf(this.observerTarget));const next=units[(i+delta+units.length)%units.length];const team=document.getElementById('obs-team-select');team.value=next.team;this.observeTeam(next.team);this.observerTarget=next;const teamUnits=this.livingUnits(next.team);document.getElementById('obs-unit-select').value=Math.max(0,teamUnits.indexOf(next))}
  observerMapCommand(point){if(this.state!=='observer')return;const pos=new THREE.Vector3(point.x,this.world.heightAt(point.x,point.z)+24,point.z+12);if(this.observerMode==='free'){this.freeLookPosition=pos;return}let best=null,d=Infinity;for(const u of this.combatants){if(u.dead||u.type!=='unit')continue;const n=(u.group.position.x-point.x)**2+(u.group.position.z-point.z)**2;if(n<d){d=n;best=u}}if(best&&d<225){this.observerTarget=best;if(this.observerMode!=='pov')this.setObserverMode('follow')}else{this.freeLookPosition=pos;this.setObserverMode('free')}}
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
      const targetFov=THREE.MathUtils.clamp(72*this.obsZoom,10,120);
      if(this.camera.fov!==targetFov){
        this.camera.fov=targetFov;
        this.camera.updateProjectionMatrix();
      }
      const aim=target.aim?.clone()||new THREE.Vector3(Math.sin(target.group.rotation.y),0,Math.cos(target.group.rotation.y));
      if(aim.lengthSq()<.001)aim.set(Math.sin(target.group.rotation.y),0,Math.cos(target.group.rotation.y));
      aim.normalize();
      const eye=target.group.position.clone().add(new THREE.Vector3(0,1.62,0)).addScaledVector(aim,.42);
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().addScaledVector(aim,40));
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
        for(const u of this.combatants){
          if(u.dead||u.type!=='unit')continue;
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
  settleLeague(winningTeam){if(this.leagueSettled)return;this.leagueSettled=true;for(const t of this.teams)t.stats=this.teamStats[t.id];const mmrDelta=this.league.settle(winningTeam.id,this.observerOnly?null:this.playerTeam,this.teams),won=winningTeam.id===this.playerTeam;this.lastMmrDelta=mmrDelta;this.save.setLeague(this.league.profiles,mmrDelta,this.observerOnly?null:won);if(this.observerBet){const hit=this.observerBet.teamId===winningTeam.id,payout=hit?Math.floor(this.observerBet.amount*this.observerBet.odds):0;this.lastBetResult={hit,payout};if(payout)this.save.earn(payout);this.save.recordBet({...this.observerBet,winnerId:winningTeam.id,payout,at:Date.now()});this.showObserverFeature(hit?'BET WON':'BET LOST',hit?`+${payout} CHIPS`:`${winningTeam.name.toUpperCase()} WON`,`${this.observerBet.amount} wagered at ${this.observerBet.odds.toFixed(2)}×`,5)}}
  startVictorySequence(winningTeam){
    if(this.state==='victory_sequence')return;
    this.settleLeague(winningTeam);document.body.classList.remove('observing');
    this.hud.show(false);
    document.getElementById('observer-panel').classList.add('hidden');
    document.getElementById('respawn-overlay').classList.add('hidden');
    this.state='victory_sequence';
    const living=this.livingUnits(winningTeam.id);
    let hero=null;if(living.length>0){hero=living.sort((a,b)=>(b.kills||0)-(a.kills||0))[0];}
    this.victoryHero=hero;if(hero){hero.state='victory';}
    this.victoryCamAngle=0;this.audio.play('pickup',2.0);
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
      const playerWon=!this.teams.find(t=>t.id===this.playerTeam).eliminated;
      this.endMission(playerWon);
    };
  }
  applySetupPreset(id){const count=id==='duel'?2:id==='chaos'?8:4;this.setup=defaultTeamSetup(count);this.matchSetup=freshMatchSetup({squadSize:id==='duel'?2:id==='chaos'?2:3,aiDifficulty:id==='chaos'?'veteran':'regular'});this.showGameSetup()}
  randomizeSetup(){const colors=[...TEAM_COLORS.keys()].sort(()=>Math.random()-.5);this.setup.forEach((t,i)=>{t.colorIndex=colors[i%colors.length];t.uniformIndex=Math.floor(Math.random()*SKIN_TEXTURES.length);t.group=i});this.showGameSetup()}
  hasHostileSetup(){return this.setup.some((a,i)=>this.setup.some((b,j)=>i!==j&&a.group!==b.group))}
  showGameSetup(){this.endRuntime();this.state='setup';this.audio.playMusic('/music/main_theme.mp3');
    const rows=this.setup.map((t,i)=>{const c=TEAM_COLORS[t.colorIndex%TEAM_COLORS.length],uniform=SKIN_TEXTURES[t.uniformIndex||0],human=Boolean(t.isHuman);return `<div class="team-row ${human?'human-row':'cpu-row'}"><button class="role-switch ${human?'human':'cpu'}" data-action="setup:role:${i}" title="Switch between player and AI control"><span>${human?'PLAYER':'AI'}</span><small>${human?'CONTROL':'AUTOPILOT'}</small></button><input class="team-name" data-team-name="${i}" maxlength="14" value="${escapeHtml(t.name)}" aria-label="Team name"><button class="aura-btn" data-action="teamcolor:${i}" style="--aura:${hex(c.color)}" title="Change aura color"><i></i><span>${c.name.toUpperCase()}</span></button><button class="uniform-preview" data-action="teamuniform:${i}" title="Change uniform texture"><canvas width="128" height="128" data-skin="${uniform}"></canvas><span>${uniform.toUpperCase()}</span></button><button class="btn group-btn" data-action="teamgroup:${i}">TEAM ${String.fromCharCode(65+t.group)}</button></div>`}).join('');
    const option=(value,label,current)=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${label}</option>`,hostile=this.hasHostileSetup(),humanIndex=this.setup.findIndex(t=>t.isHuman),observerOnly=humanIndex<0;
    const classOptions=current=>Object.entries(CLASSES).map(([id,c])=>option(id,c.name.toUpperCase(),current)).join('');
    const startingSlots=Array.from({length:this.matchSetup.squadSize},(_,i)=>`<label>STARTING UNIT ${i+1}<select data-starting-class="${i}">${classOptions(this.matchSetup.startingClasses[i]||'scout')}</select></label>`).join('');
    this.screen.innerHTML=`<main class="menu setup-menu"><div class="screen-title"><div><span class="eyebrow">GAME SETUP</span><h2>BATTLE LAB</h2></div><strong>${this.setup.length} / ${MAX_PLAYERS} TEAMS</strong></div><div class="preset-strip"><button class="btn" data-action="setup:preset:duel">DUEL</button><button class="btn" data-action="setup:preset:classic">CLASSIC</button><button class="btn" data-action="setup:preset:chaos">CHAOS</button><button class="btn" data-action="setup:randomize">RANDOMIZE LOOKS</button></div><p class="subtitle">Select a PLAYER controller or switch every team to AI for a fully observed simulation.</p><div class="setup-layout"><section><div class="control-status ${observerOnly?'observer':'playing'}"><strong>${observerOnly?'OBSERVER-ONLY MATCH':`PLAYING AS ${escapeHtml(this.setup[humanIndex].name).toUpperCase()}`}</strong><span>${observerOnly?'All teams are AI controlled · broadcast opens at kickoff':'Click another AI badge to transfer player control · click PLAYER again to observe'}</span></div><div class="setup-list">${rows}</div><div class="roster-actions"><button class="btn" data-action="setup:remove" ${this.setup.length<=2?'disabled':''}>− TEAM</button><button class="btn" data-action="setup:add" ${this.setup.length>=MAX_PLAYERS?'disabled':''}>+ TEAM</button></div></section><aside class="rules-panel"><h3>MATCH RULES</h3><label>NUMBER OF STARTING UNITS<select data-setup-rule="squadSize">${[1,2,3,4,5].map(v=>option(v,`${v} UNIT${v>1?'S':''}`,this.matchSetup.squadSize)).join('')}</select></label>${startingSlots}<label>STARTING AMMO<select data-setup-rule="startingAmmo">${[30,60,90,150].map(v=>option(v,v,this.matchSetup.startingAmmo)).join('')}</select></label><label>CPU SKILL<select data-setup-rule="aiDifficulty">${option('rookie','ROOKIE',this.matchSetup.aiDifficulty)}${option('regular','REGULAR',this.matchSetup.aiDifficulty)}${option('veteran','VETERAN',this.matchSetup.aiDifficulty)}</select></label><label>SUDDEN DEATH<select data-setup-rule="matchMinutes">${[3,5,8].map(v=>option(v,`${v} MIN`,this.matchSetup.matchMinutes)).join('')}</select></label><label class="toggle-rule">REINFORCEMENTS<input type="checkbox" data-setup-rule="reinforcements" ${this.matchSetup.reinforcements?'checked':''}></label><label>REINFORCE EVERY<select data-setup-rule="reinforcementSeconds">${[10,15,25].map(v=>option(v,`${v} SEC`,this.matchSetup.reinforcementSeconds)).join('')}</select></label><div class="supply-plan"><strong>${this.setup.length} TEAM DEPOTS + 4 RARE RELAYS</strong><span>7 COMMON CRATES AT EVERY DROP SPOT</span><span>THEN NORMAL TIMERS AND CAPS</span></div></aside></div><div class="setup-footer"><span class="conflict-check ${hostile?'ready':'blocked'}">${hostile?(observerOnly?'AI SIMULATION READY':'HOSTILE TEAMS CONFIRMED'):'ALL TEAMS ARE ALLIED'}</span><button class="btn" data-action="menu">BACK</button><button class="btn primary" data-action="deploy" ${hostile?'':'disabled'}>${observerOnly?'WATCH AI BATTLE':'START BATTLE'}</button></div></main>`;
    const mapCards=Object.values(MAPS).map(map=>`<button class="map-card ${map.id===this.selectedMap?'selected':''}" data-action="map:${map.id}" style="--map-accent:${map.accent};--map-art:url('/assets/textures/maps/${map.texture}.webp')"><span class="map-icon">${map.icon}</span><small>${map.tag}</small><strong>${map.title}</strong><p>${map.description}</p><em>${map.weather}</em></button>`).join('');
    const layout=this.screen.querySelector('.setup-layout');if(layout)layout.insertAdjacentHTML('beforebegin',`<section class="map-select"><div class="map-select-head"><span class="eyebrow">GAME MODE · SELECT MAP</span><strong>${MAPS[this.selectedMap].title}</strong></div><div class="map-grid">${mapCards}</div></section>`);
    if(this.selectedMap==='crown'){const supply=this.screen.querySelector('.supply-plan');if(supply)supply.innerHTML='<strong>1 SUMMIT DROP ZONE · ENTIRE MAP</strong><span>3 COMMON CRATES EVERY 1–5 SECONDS</span><span>CONTROL THE CROWN OR GET BURIED IN IT</span>'}
    this.screen.querySelectorAll('canvas[data-skin]').forEach(canvas=>paintSkinPreview(canvas,canvas.dataset.skin));}
  endRuntime(){this.input.enabled=false;this.input.mouse.down=false;this.hud.show(false);this.hud.showInfo(null);this.hud.setHealMode(false);this.hud.setGrappleMode(false);this.hud.setVehicleRole?.('none');this.healAim=false;this.grappleAim=false;this.hud.clearSquad();document.body.classList.remove('observing');document.getElementById('observer-panel')?.classList.add('hidden');if(this.camera&&this.camera.fov!==48){this.camera.fov=48;this.camera.updateProjectionMatrix()}if(this.transparentCrate){this.restoreCrateOpacity(this.transparentCrate);this.transparentCrate=null;}}
  disposeScene(){if(!this.scene)return;this.scene.traverse(o=>{if(o.geometry)o.geometry.dispose?.();if(o.material&&!Array.isArray(o.material))o.material.dispose?.()});this.scene.clear();this.materials?.dispose?.();this.world?.dispose?.()}
  resize(){const w=innerWidth,h=innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h)}
  loop(){if(this.running)return;this.running=true;const frame=()=>{requestAnimationFrame(frame);const time=performance.now()/1000,dt=time-this.lastFrame;this.lastFrame=time;this.update(dt,time);this.renderer.render(this.scene,this.camera)};frame()}

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
