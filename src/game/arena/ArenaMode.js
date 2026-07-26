// DESTRUCT-AUTO — vehicle battle arena.
//
// A self-contained game mode: its own scene, its own arenas, its own rules and
// its own HUD. The Destructo is welded into the driver's seat and never gets
// out; there are no crates, no D-Builder and no infantry. Wreck the enemy crew
// until the clock or the kill target runs out.

import * as THREE from 'three';
import { ParticleSystem } from '../ParticleSystem.js';
import { autoById } from '../../data/destructAutos.js';
import { arenaMapById, arenaDifficultyById, winConditionById, ARENA_TEAMS, ARENA_TEAM_MODES } from '../../data/arenaMaps.js';
import { ArenaTerrain } from './ArenaTerrain.js';
import { ArenaWorld } from './ArenaWorld.js';
import { ArenaCombat } from './ArenaCombat.js';
import { ArenaAI } from './ArenaAI.js';
import { ArenaHUD } from './ArenaHUD.js';
import { createDestructAutoModel, disposeModel } from './ArenaVehicleModels.js';
import { createVehicleState, stepVehicle, collideVehicles, speedOf, VEHICLE_RADIUS } from './ArenaPhysics.js';
import { buildRoster, createScoreboard, registerKill, resolveKiller, evaluateMatch, respawnPointFor, leaderOf } from './ArenaRules.js';

const RESPAWN_SECONDS = 4;
const SPAWN_GRACE = 1.6;
const KILL_CREDIT_WINDOW = 6;
const AIM_TURN_RATE = 5.2;
const AIM_ARC = Math.PI * 0.62;   // how far the gun can swing off the chassis
const CAMERA_DISTANCE = 17;
const CAMERA_HEIGHT = 6.4;
const CAMERA_AIM_DIP = 0.14;
const hexCss = value => `#${value.toString(16).padStart(6, '0')}`;
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class ArenaMode {
  constructor(game, config) {
    this.game = game;
    this.config = config;
    this.map = arenaMapById(config.mapId);
    this.rule = winConditionById(config.winConditionId);
    this.difficulty = arenaDifficultyById(config.difficulty);
    this.teamMode = config.teamMode === 'ffa' ? 'ffa' : 'teams';
    this.elapsed = 0;
    this.over = false;
    this.paused = false;
    this.overtime = false;
    this.showScores = false;
    this.bulletPool = [];
    this.projectileMeshes = new Map();
    this.effectMeshes = new Map();
  }

  // ── setup ────────────────────────────────────────────────────────────────
  start() {
    const game = this.game;
    this.scene = new THREE.Scene();
    this.terrain = new ArenaTerrain(this.map);
    this.world = new ArenaWorld(this.scene, this.map, this.terrain);
    this.particles = new ParticleSystem(this.scene, (x, z) => this.terrain.groundAt(x, z));
    this.hud = new ArenaHUD();
    this.combat = new ArenaCombat({ terrain: this.terrain, hooks: this.combatHooks() });
    this.ai = new ArenaAI({ terrain: this.terrain, difficulty: this.difficulty });

    this.roster = buildRoster({
      teamMode: this.teamMode,
      driverCount: this.config.driverCount,
      playerAutoId: this.config.autoId,
      playerTeam: this.config.playerTeam || 'A',
      playerName: 'YOU',
    });
    this.board = createScoreboard(this.roster, this.teamMode);
    this.vehicles = this.roster.map(driver => this.spawnVehicle(driver));
    this.player = this.vehicles.find(v => v.isPlayer) || this.vehicles[0];

    this.camera = game.camera;
    this.previousFov = this.camera.fov;
    this.camera.fov = 64;
    this.camera.far = 900;
    this.camera.updateProjectionMatrix();
    this.cameraTarget = new THREE.Vector3();
    this.cameraGoal = new THREE.Vector3();
    this.structureHealth = new Map();

    game.scene = this.scene;
    if (game.renderer?.shadowMap) {
      game.renderer.shadowMap.autoUpdate = true;
      game.renderer.shadowMap.needsUpdate = true;
    }
    this.hud.show(true);
    this.hud.setMatch({
      mapTitle: this.map.title,
      ruleTitle: this.rule.title,
      teamMode: this.teamMode,
      teamNames: { A: ARENA_TEAMS.A.name, B: ARENA_TEAMS.B.name },
    });
    this.hud.setVehicle(this.player.autoDef);
    this.hud.banner(this.map.title, `${ARENA_TEAM_MODES[this.teamMode].title} · ${this.rule.title}`, 3200);
    for (const vehicle of this.vehicles) this.respawn(vehicle, true);
    game.input.enabled = true;
    this.syncVisuals(0.016, 0);
    this.updateCamera(1);      // snap rather than sweep in from the menu camera
    this.refreshHud();
  }

  spawnVehicle(driver) {
    const autoDef = autoById(driver.autoId);
    const spawn = respawnPointFor(this.map, this.teamMode, driver.team, driver.slot, 0);
    const state = createVehicleState({
      id: driver.slot, autoDef, team: driver.team, spawn, isPlayer: driver.isPlayer, name: driver.name,
    });
    state.slot = driver.slot;
    state.teamColor = driver.teamColor;
    state.teamName = driver.teamName;
    const model = createDestructAutoModel(autoDef, driver.teamColor);
    model.visible = false;
    this.scene.add(model);
    state.model = model;
    state.turret = model.userData.turret;
    state.muzzle = model.userData.muzzle;
    state.wheels = model.userData.wheels;
    // Nameplate so allies and hostiles are identifiable at arena distances.
    state.marker = this.createMarker(driver);
    model.add(state.marker);
    return state;
  }

  createMarker(driver) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6,10,22,.72)';
    ctx.fillRect(0, 8, 256, 48);
    ctx.fillStyle = hexCss(driver.teamColor);
    ctx.fillRect(0, 8, 256, 5);
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(driver.name.slice(0, 14), 128, 46);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.scale.set(7.5, 1.9, 1);
    sprite.position.y = 7.2;
    sprite.renderOrder = 30;
    return sprite;
  }

  // ── combat wiring ────────────────────────────────────────────────────────
  combatHooks() {
    return {
      onSpawnProjectile: projectile => this.attachProjectileMesh(projectile),
      onRemoveProjectile: projectile => this.releaseProjectileMesh(projectile),
      onExplosion: (point, radius, color) => {
        this.particles.burst(new THREE.Vector3(point.x, point.y, point.z), color, Math.min(40, 16 + radius), 8 + radius * 0.6);
        this.game.audio.play('explosion', point);
        if (this.player && !this.player.dead) {
          const distance = Math.hypot(point.x - this.player.x, point.z - this.player.z);
          if (distance < radius + 22) this.shake = Math.min(1.2, (this.shake || 0) + (1 - distance / (radius + 22)) * 0.7);
        }
      },
      onImpact: (point, color) => {
        this.particles.impact(new THREE.Vector3(point.x, point.y, point.z), color, { surface: 'metal' });
      },
      onWorldHit: (piece, amount, point, source, kind) => this.damageStructure(piece, amount, point, source, kind),
      onDamage: (target, amount, source, kind) => this.onDamage(target, amount, source, kind),
      onEffect: effect => this.attachEffectMesh(effect),
      onRemoveEffect: effect => this.releaseEffectMesh(effect),
      onUltimate: (vehicle, ult) => {
        this.game.audio.play('build', { x: vehicle.x, y: vehicle.y, z: vehicle.z });
        if (vehicle.isPlayer) this.hud.banner(ult.name, 'ULTIMATE DEPLOYED', 1500);
      },
      onSound: (name, vehicle) => {
        const pos = { x: vehicle.x, y: vehicle.y + 1.5, z: vehicle.z };
        const clip = { smg: 'uzi', missile: 'grenade_launcher', mine: 'build', mortar: 'grenade_launcher', flak: 'shotgun', slam: 'explosion', airstrike: 'explosion' }[name];
        if (clip) this.game.audio.play(clip, pos, name === 'smg' ? 1.1 : 1);
      },
    };
  }

  onDamage(target, amount, source, kind) {
    this.showDamageNumber(target, amount, source, kind);
    if (target.hp > 0) {
      if (target.isPlayer) this.game.hud.damage?.();
      return;
    }
    this.killVehicle(target, source, kind);
  }

  // Project a world point onto the screen. Returns null behind the camera.
  projectToScreen(x, y, z) {
    if (!this.camera) return null;
    if (!this._projectVec) this._projectVec = new THREE.Vector3();
    const v = this._projectVec.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  // Floating damage numbers, exactly as the infantry modes do them: one per
  // hit, coloured by who is on the receiving end. Everything that is not the
  // infinite SMG is an Ultimate, and gets its own louder styling — a 130-point
  // Orbital Ping should never read like a 7-point rifle tick.
  showDamageNumber(target, amount, source, kind) {
    if (!this.hud || !(amount > 0)) return;
    const screen = this.projectToScreen(target.x, target.y + 2.6, target.z);
    if (!screen) return;
    const ultimate = kind !== 'bullet';
    const style = target.isPlayer ? 'hurt-player'
      : source?.isPlayer ? (ultimate ? 'hurt-ult' : 'hurt-enemy')
      : this.friendlyToPlayer(target) ? 'hurt-ally' : 'hurt';
    this.hud.damageNumber(screen.x, screen.y, String(Math.max(1, Math.round(amount))), ultimate ? `${style} ult` : style);
  }

  friendlyToPlayer(vehicle) {
    return Boolean(this.player && vehicle.team !== null && vehicle.team === this.player.team);
  }

  damageStructure(piece, amount, point, source, kind) {
    if (!piece?.destructible || amount <= 0 || !this.terrain.pieces.includes(piece)) return false;
    const maxHp = piece.hp || 160;
    const hp = (this.structureHealth.get(piece) ?? maxHp) - amount;
    this.structureHealth.set(piece, hp);
    this.world.showPieceDamage(piece, Math.max(0, hp) / maxHp);
    if (hp > 0) return false;

    this.world.removePiece(piece);
    this.terrain.removePiece(piece);
    this.structureHealth.delete(piece);
    const center = new THREE.Vector3(piece.x, piece.base + Math.min(piece.h * 0.55, 12), piece.z);
    const scale = Math.min(30, Math.max(piece.w, piece.d, piece.h));
    this.particles.burst(center, 0xaeb7c2, 42, scale * 0.8);
    this.particles.burst(center, 0xff9f43, 18, scale * 0.55);
    this.game.audio.play('structure_death', point, 1.05);
    if (source?.isPlayer) this.hud.banner('BUILDING DOWN', 'NEW ROUTE OPEN', 950);
    return true;
  }

  killVehicle(victim, source, kind) {
    if (victim.dead) return;
    // Work out who gets the point BEFORE the victim is flagged dead — a dead
    // vehicle is no longer "hostile", so asking afterwards loses every credit.
    const killer = resolveKiller(victim, source, this.vehicles, this.elapsed, KILL_CREDIT_WINDOW);
    victim.dead = true;
    victim.hp = 0;
    victim.respawnTimer = RESPAWN_SECONDS;
    victim.model.visible = false;
    victim.ultimateActive = null;
    victim.dashTimer = 0;
    victim.slowTimer = 0; victim.slowFactor = 1; victim.vulnerability = 1; victim.stunTimer = 0;
    this.ai.forget(victim.id);
    registerKill(this.board, killer ? killer.slot : null, victim.slot);
    if (killer) killer.kills++;
    victim.deaths++;

    const point = new THREE.Vector3(victim.x, victim.y + 1.6, victim.z);
    this.particles.burst(point, victim.autoDef.paint.body, 34, 15);
    this.particles.burst(point, 0xffca4a, 18, 11);
    this.game.audio.play('destructo_explosion_death', point);
    this.game.audio.play('explosion', point);
    this.hud.kill(
      killer ? killer.name : 'THE ARENA',
      victim.name,
      kind === 'ram' ? 'RAMMED' : kind === 'hazard' ? 'MELTED' : kind === 'chain' ? 'FRIED' : kind === 'burn' ? 'TORCHED' : kind === 'cryo' ? 'FROZEN' : kind === 'shockwave' ? 'FLATTENED' : kind === 'explosion' ? 'BLASTED' : 'SHREDDED',
      killer ? hexCss(killer.teamColor) : '#c9d2dd',
      hexCss(victim.teamColor)
    );
    if (victim.isPlayer) this.hud.setRespawn(RESPAWN_SECONDS);
    else if (killer?.isPlayer) this.hud.banner('WRECKED', `${victim.name} · ${victim.autoDef.name}`, 1400);
    this.refreshHud();
    this.checkVictory();
  }

  respawn(vehicle, initial = false) {
    // Per-vehicle counter, not a global one: at kickoff everybody is on
    // sequence 0, which is what guarantees ten distinct pads.
    vehicle.respawnCount = initial ? 0 : (vehicle.respawnCount || 0) + 1;
    const spawn = respawnPointFor(this.map, this.teamMode, vehicle.team, vehicle.slot, vehicle.respawnCount);
    vehicle.spawnGrace = SPAWN_GRACE;
    vehicle.x = spawn.x; vehicle.z = spawn.z;
    vehicle.y = (spawn.y ?? 0) + (initial ? 1.5 : 6);
    vehicle.yaw = spawn.yaw ?? 0;
    vehicle.aimYaw = vehicle.yaw;
    vehicle.aimPitch = 0;
    vehicle.vx = vehicle.vy = vehicle.vz = 0;
    vehicle.hp = vehicle.maxHp;
    vehicle.dead = false;
    vehicle.respawnTimer = 0;
    vehicle.grounded = false;
    vehicle.lastAttacker = null;
    vehicle.model.visible = true;
    vehicle.model.position.set(vehicle.x, vehicle.y, vehicle.z);
    if (vehicle.isPlayer) {
      this.hud.setRespawn(null);
      this.hud.banner('ROLL OUT', vehicle.autoDef.name, 1200);
    }
  }

  // ── input ────────────────────────────────────────────────────────────────
  playerInput(dt) {
    const input = this.game.input;
    const empty = { throttle: 0, steer: 0, brake: false, boost: false, fire: false, ultimate: false };
    if (!this.player || this.player.dead || this.paused || this.over) return empty;
    const keys = input.keys;
    const forwardKey = keys.has('KeyW') || keys.has('ArrowUp');
    const backKey = keys.has('KeyS') || keys.has('ArrowDown');
    const throttle = (forwardKey ? 1 : 0) - (backKey ? 1 : 0) + (input.moveAxis?.y || 0);
    // The chase camera faces the arena's +Z basis, whose visual screen-right is
    // negative world yaw. Translate keys and the move stick into that basis.
    const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (input.moveAxis?.x || 0);

    // Mouse turns the gun and the camera together; the chassis is steered separately.
    const sensitivity = (this.game.save.data.settings.mouseSensitivity ?? 1) * 0.0022;
    this.player.aimYaw = angleDelta(this.player.aimYaw - input.mouse.dx * sensitivity, 0);
    this.player.aimPitch = THREE.MathUtils.clamp(this.player.aimPitch - input.mouse.dy * sensitivity, -0.5, 0.42);
    // Touch: the right stick sweeps the same aim, at a rate rather than a delta.
    if (input.aimAxis && (input.aimAxis.x || input.aimAxis.y)) {
      this.player.aimYaw = angleDelta(this.player.aimYaw - input.aimAxis.x * dt * 2.4, 0);
      this.player.aimPitch = THREE.MathUtils.clamp(this.player.aimPitch + input.aimAxis.y * dt * 1.2, -0.5, 0.42);
    }

    return {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
      brake: keys.has('Space'),
      boost: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      fire: input.mouse.down,
      ultimate: input.consume('KeyQ'),
      aimPoint: null,
    };
  }

  // Keeps a vehicle's gun swinging toward where its driver is looking, clamped
  // to a forward arc so nobody snipes directly out of their own boot.
  steerAim(vehicle, desiredYaw, desiredPitch, dt) {
    const relative = angleDelta(desiredYaw, vehicle.yaw);
    const clamped = vehicle.yaw + Math.max(-AIM_ARC, Math.min(AIM_ARC, relative));
    const delta = angleDelta(clamped, vehicle.aimYaw);
    const step = AIM_TURN_RATE * dt;
    vehicle.aimYaw += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
    vehicle.aimPitch += (desiredPitch - vehicle.aimPitch) * Math.min(1, dt * 6);
  }

  aimVector(vehicle) {
    const cos = Math.cos(vehicle.aimPitch);
    return { x: Math.sin(vehicle.aimYaw) * cos, y: Math.sin(vehicle.aimPitch), z: Math.cos(vehicle.aimYaw) * cos };
  }

  viewAimVector(vehicle) {
    const aim = this.aimVector(vehicle);
    const length = Math.hypot(aim.x, aim.y - CAMERA_AIM_DIP, aim.z) || 1;
    return { x: aim.x / length, y: (aim.y - CAMERA_AIM_DIP) / length, z: aim.z / length };
  }

  crosshairTrace(vehicle, range) {
    const view = vehicle.isPlayer ? this.viewAimVector(vehicle) : this.aimVector(vehicle);
    const origin = vehicle.isPlayer && this.camera
      ? { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }
      : { x: vehicle.x, y: vehicle.y + 2, z: vehicle.z };
    const end = {
      x: origin.x + view.x * range,
      y: origin.y + view.y * range,
      z: origin.z + view.z * range,
    };
    const worldHit = this.terrain.raycast(origin.x, origin.y, origin.z, end.x, end.y, end.z, 40);
    let nearest = worldHit ? range * worldHit.t : range;
    let enemy = null;
    for (const candidate of this.enemiesOf(vehicle)) {
      const dx = candidate.x - origin.x;
      const dy = candidate.y + 1.5 - origin.y;
      const dz = candidate.z - origin.z;
      const along = dx * view.x + dy * view.y + dz * view.z;
      if (along <= 0 || along >= nearest) continue;
      const perpendicularSq = dx * dx + dy * dy + dz * dz - along * along;
      if (perpendicularSq > (VEHICLE_RADIUS * 1.55) ** 2) continue;
      nearest = along;
      enemy = candidate;
    }
    if (enemy) return { point: { x: enemy.x, y: enemy.y + 1.5, z: enemy.z }, enemy };
    if (worldHit) return { point: { x: worldHit.x, y: worldHit.y, z: worldHit.z }, enemy: null };
    return { point: end, enemy: null };
  }

  weaponAimVector(vehicle) {
    if (!vehicle.isPlayer) return this.aimVector(vehicle);
    const target = this.crosshairTrace(vehicle, vehicle.autoDef.smg.range).point;
    const dx = target.x - vehicle.x;
    const dy = target.y - (vehicle.y + 1.9);
    const dz = target.z - vehicle.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / length, y: dy / length, z: dz / length };
  }

  // ── frame ────────────────────────────────────────────────────────────────
  update(dt, time) {
    const input = this.game.input;
    if (input.consume('Escape')) this.togglePause();
    this.showScores = input.keys.has('Tab');
    this.updateScoreboard();
    if (this.paused) { this.world.update(dt, time); return; }
    const step = Math.min(dt, 0.05);
    this.elapsed += step;

    const playerInput = this.playerInput(step);
    for (const vehicle of this.vehicles) {
      if (vehicle.dead) {
        vehicle.respawnTimer -= step;
        if (vehicle.isPlayer) this.hud.setRespawn(vehicle.respawnTimer);
        if (vehicle.respawnTimer <= 0 && !this.over) this.respawn(vehicle);
        continue;
      }
      const command = vehicle.isPlayer ? playerInput : this.ai.think(vehicle, {
        allies: this.alliesOf(vehicle),
        enemies: this.enemiesOf(vehicle),
        dt: step,
      });
      if (vehicle.isPlayer) {
        // the player's aim was already integrated from raw mouse deltas
      } else {
        this.steerAim(vehicle, command.aimYaw ?? vehicle.yaw, command.aimPitch ?? 0, step);
      }
      const report = stepVehicle(vehicle, command, this.terrain, step);
      this.applyReport(vehicle, report, step);

      if (command.fire) this.fire(vehicle);
      if (command.ultimate) this.combat.activateUltimate(vehicle, this.aimVector(vehicle), command.aimPoint || this.playerAimPoint(vehicle), this.vehicles, this.elapsed);
    }

    // vehicle-vs-vehicle
    for (let i = 0; i < this.vehicles.length; i++) {
      const a = this.vehicles[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const b = this.vehicles[j];
        if (b.dead) continue;
        const hit = collideVehicles(a, b);
        if (!hit) continue;
        // Allies bump; hostiles bleed.
        if (this.combat.hostile(a, b)) {
          this.combat.applyDamage(a, hit.aDamage, b, 'ram', this.elapsed);
          this.combat.applyDamage(b, hit.bDamage, a, 'ram', this.elapsed);
          this.particles.impact(new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z), 0xffd23f, { surface: 'metal' });
          this.game.audio.play('metal_hit', hit.point);
        }
      }
    }

    this.combat.update(step, this.vehicles, this.elapsed);
    this.syncVisuals(step, time);
    this.syncCombatVisuals(step);
    this.world.update(step, time);
    this.particles.update(step, this.camera);
    this.updateCamera(step);
    this.refreshHud();
    if (!this.over) this.checkVictory();
  }

  applyReport(vehicle, report, dt) {
    if (report.impact > 0) {
      const damage = (report.impact - 14) * 0.55 * vehicle.autoDef.stats.weight * 0.6;
      if (damage > 0) this.combat.applyDamage(vehicle, damage, null, 'crash', this.elapsed);
      this.particles.impact(new THREE.Vector3(vehicle.x, vehicle.y + 1.2, vehicle.z), 0xc9d2dd, { surface: 'metal' });
      this.game.audio.play('metal_hit', { x: vehicle.x, y: vehicle.y, z: vehicle.z });
      if (vehicle.isPlayer) this.shake = Math.min(1.1, (this.shake || 0) + report.impact / 60);
    }
    if (report.landed > 0) {
      const damage = (report.landed - 42) * 0.9;
      if (damage > 0) this.combat.applyDamage(vehicle, damage, null, 'crash', this.elapsed);
      this.particles.impact(new THREE.Vector3(vehicle.x, vehicle.y + 0.2, vehicle.z), 0xaeb8c5, { surface: 'rock' });
      if (vehicle.isPlayer) this.shake = Math.min(1.1, (this.shake || 0) + report.landed / 120);
    }
    if (report.launched && vehicle.isPlayer) this.hud.banner('AIRBORNE', '', 900);
    if (report.hazardDps > 0) {
      this.combat.applyDamage(vehicle, report.hazardDps * dt, null, 'hazard', this.elapsed);
      if (Math.random() < dt * 6) {
        this.particles.burst(new THREE.Vector3(vehicle.x, vehicle.y + 0.5, vehicle.z), 0xff6a2b, 4, 5);
      }
    }
  }

  fire(vehicle) {
    if (!this.combat.canFire(vehicle)) return;
    const aim = this.weaponAimVector(vehicle);
    const projectile = this.combat.fireSmg(vehicle, aim, this.elapsed);
    if (!projectile) return;
    const muzzle = vehicle.muzzle ? vehicle.muzzle.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(vehicle.x, vehicle.y + 2, vehicle.z);
    projectile.x = muzzle.x; projectile.y = muzzle.y; projectile.z = muzzle.z;
    this.particles.muzzleFlash(muzzle, new THREE.Vector3(aim.x, aim.y, aim.z), { color: vehicle.autoDef.smg.color, projectileStyle: 'bullet', shotPower: vehicle.autoDef.smg.damage });
    if (vehicle.isPlayer) this.shake = Math.min(0.5, (this.shake || 0) + 0.035);
  }

  // Where the player's crosshair meets the world — used to aim Ultimates that
  // land on a point rather than travelling in a straight line.
  playerAimPoint(vehicle) {
    if (!vehicle.isPlayer) return null;
    const range = vehicle.autoDef.ultimate.range || vehicle.autoDef.ultimate.markRange || 80;
    return this.crosshairTrace(vehicle, range).point;
  }

  alliesOf(vehicle) { return this.vehicles.filter(other => other.id !== vehicle.id && other.team === vehicle.team); }
  enemiesOf(vehicle) { return this.vehicles.filter(other => this.combat.hostile(vehicle, other)); }

  // ── visuals ──────────────────────────────────────────────────────────────
  syncVisuals(dt, time) {
    for (const vehicle of this.vehicles) {
      if (vehicle.dead) {
        if (vehicle.model) vehicle.model.visible = false;
        continue;
      }
      const model = vehicle.model;
      if (model) model.visible = true;
      model.position.set(vehicle.x, vehicle.y, vehicle.z);
      model.rotation.set(vehicle.pitch, vehicle.yaw, vehicle.roll, 'YXZ');
      if (vehicle.turret) {
        vehicle.turret.rotation.y = angleDelta(vehicle.aimYaw, vehicle.yaw);
        vehicle.turret.rotation.x = -vehicle.aimPitch;
      }
      const spin = speedOf(vehicle) * dt * 1.35;
      for (const wheel of vehicle.wheels || []) wheel.rotation.x -= spin;
      if (model.userData.hoverPods) model.position.y += Math.sin(time * 3 + vehicle.id) * 0.12;
      if (vehicle.marker) vehicle.marker.visible = !vehicle.isPlayer;
      // status tinting: frozen and burning drivers should be obvious at a glance
      const aura = model.userData.aura;
      if (aura) {
        const shielded = vehicle.spawnGrace > 0, frozen = vehicle.slowTimer > 0;
        aura.material.opacity = 0.34 + (frozen || shielded ? 0.4 : 0) + Math.sin(time * (shielded ? 14 : 4) + vehicle.id) * (shielded ? 0.22 : 0.05);
        aura.material.color.setHex(shielded ? 0xffffff : frozen ? 0x8fe3ff : vehicle.teamColor);
      }
    }
  }

  attachProjectileMesh(projectile) {
    let mesh = this.bulletPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
      );
      this.scene.add(mesh);
    }
    mesh.visible = true;
    mesh.material.color.setHex(projectile.color);
    const scale = projectile.kind === 'missile' ? 1.9 : projectile.kind === 'mortar' ? 2.4 : projectile.kind === 'flak' ? 0.9 : 1;
    mesh.scale.setScalar(scale);
    mesh.position.set(projectile.x, projectile.y, projectile.z);
    this.projectileMeshes.set(projectile.id, mesh);
  }
  releaseProjectileMesh(projectile, lastPoint) {
    const mesh = this.projectileMeshes.get(projectile.id);
    if (!mesh) return;
    this.projectileMeshes.delete(projectile.id);
    mesh.visible = false;
    this.bulletPool.push(mesh);
  }
  attachEffectMesh(effect) {
    let mesh = null;
    if (effect.kind === 'mine') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: effect.color, emissive: effect.color, emissiveIntensity: 0.6, flatShading: true }));
      mesh.position.set(effect.x, effect.y, effect.z);
    } else if (effect.kind === 'lava') {
      mesh = new THREE.Mesh(new THREE.CircleGeometry(effect.radius, 12), new THREE.MeshBasicMaterial({ color: effect.color, transparent: true, opacity: 0.8, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(effect.x, effect.y, effect.z);
    } else if (effect.kind === 'cryo') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(effect.radius, effect.radius, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: effect.color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
      mesh.position.set(effect.x, effect.y + 4.5, effect.z);
    } else if (effect.kind === 'airstrike') {
      mesh = new THREE.Mesh(new THREE.RingGeometry(effect.radius * 0.72, effect.radius, 24), new THREE.MeshBasicMaterial({ color: effect.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(effect.x, effect.y + 0.2, effect.z);
    } else if (effect.kind === 'shockwave') {
      mesh = new THREE.Mesh(new THREE.RingGeometry(1, 2.4, 28), new THREE.MeshBasicMaterial({ color: effect.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(effect.x, effect.y + 0.3, effect.z);
    } else if (effect.kind === 'arc') {
      const points = [];
      for (const arc of effect.arcs) {
        points.push(new THREE.Vector3(arc.from.x, arc.from.y, arc.from.z), new THREE.Vector3(arc.to.x, arc.to.y, arc.to.z));
      }
      mesh = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: effect.color, transparent: true, toneMapped: false })
      );
    }
    if (!mesh) return;
    this.scene.add(mesh);
    this.effectMeshes.set(effect.id, mesh);
  }
  releaseEffectMesh(effect) {
    const mesh = this.effectMeshes.get(effect.id);
    if (!mesh) return;
    this.effectMeshes.delete(effect.id);
    this.scene.remove(mesh);
    disposeModel(mesh);
  }
  syncCombatVisuals(dt) {
    for (const projectile of this.combat.projectiles) {
      const mesh = this.projectileMeshes.get(projectile.id);
      if (!mesh) continue;
      this.particles.bulletTrail(
        new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z),
        new THREE.Vector3(projectile.x, projectile.y, projectile.z),
        projectile.color
      );
      mesh.position.set(projectile.x, projectile.y, projectile.z);
    }
    for (const effect of this.combat.effects) {
      const mesh = this.effectMeshes.get(effect.id);
      if (!mesh) continue;
      const life = effect.maxLife > 0 ? effect.life / effect.maxLife : 0;
      if (effect.kind === 'shockwave') {
        const grow = (1 - life) * effect.radius;
        mesh.scale.setScalar(0.4 + grow);
        mesh.material.opacity = life * 0.9;
      } else if (effect.kind === 'airstrike') {
        mesh.material.opacity = 0.45 + Math.abs(Math.sin((1 - life) * 14)) * 0.5;
        mesh.scale.setScalar(0.6 + life * 0.5);
      } else if (effect.kind === 'lava' || effect.kind === 'cryo') {
        mesh.material.opacity = Math.min(0.85, life * 1.4) * (effect.kind === 'cryo' ? 0.35 : 1);
      } else if (effect.kind === 'arc') {
        mesh.material.opacity = life;
      } else if (effect.kind === 'mine') {
        mesh.rotation.y += dt * 2.2;
        mesh.material.emissiveIntensity = effect.arm > 0 ? 0.25 : 0.5 + Math.abs(Math.sin(effect.life * 6)) * 0.6;
      }
    }
  }

  updateCamera(dt) {
    const player = this.player;
    if (!player) return;
    const target = player.dead ? this.spectateTarget() : player;
    const aimYaw = target.aimYaw;
    const aim = this.viewAimVector(target);
    const back = CAMERA_DISTANCE * (1 + Math.min(0.45, speedOf(target) / 90));
    const desiredX = target.x - Math.sin(aimYaw) * back;
    const desiredZ = target.z - Math.cos(aimYaw) * back;
    const desiredY = target.y + CAMERA_HEIGHT;
    this.cameraGoal.set(desiredX, desiredY, desiredZ);
    // Never let the camera clip through the arena geometry behind the car.
    const blocked = this.terrain.raycast(target.x, target.y + 3, target.z, desiredX, desiredY, desiredZ, 10);
    if (blocked) this.cameraGoal.set(blocked.x, Math.max(blocked.y + 1.5, target.y + 3), blocked.z);
    const follow = Math.min(1, dt * 8.5);
    this.camera.position.lerp(this.cameraGoal, follow);
    // Keep the view direction independent of the lagging chase position. Weapon
    // fire converges on this ray in crosshairTrace(), so chassis motion cannot
    // make the reticle drift away from the actual shot.
    this.cameraTarget.copy(this.camera.position).addScaledVector(
      new THREE.Vector3(aim.x, aim.y, aim.z), 100
    );
    this.camera.lookAt(this.cameraTarget);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.6);
      if (this.game.save.data.settings.cameraShake !== false) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 1.4;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 1.0;
        this.camera.position.z += (Math.random() - 0.5) * this.shake * 1.4;
      }
    }
  }
  spectateTarget() {
    const ally = this.alliesOf(this.player).find(v => !v.dead);
    return ally || this.vehicles.find(v => !v.dead) || this.player;
  }

  // ── hud + rules ──────────────────────────────────────────────────────────
  refreshHud() {
    const player = this.player;
    if (player) {
      this.hud.setHealth(Math.max(0, player.hp), player.maxHp);
      this.hud.setUltimate(Math.max(0, player.ultimateCooldown), player.autoDef.ultimate.cooldown);
      this.hud.setSpeed(speedOf(player), this.game.input.keys.has('ShiftLeft'));
    }
    if (this.teamMode === 'teams') this.hud.setScore(this.board.score.A || 0, this.board.score.B || 0);
    else {
      const rows = this.roster
        .map(driver => ({
          name: driver.name,
          vehicle: driver.autoDef.name,
          color: hexCss(driver.teamColor),
          score: this.board.score[driver.team] || 0,
          isPlayer: driver.isPlayer,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      this.hud.setStandings(rows);
      const leader = leaderOf(this.board);
      this.hud.setScore(this.board.score[this.player?.team] || 0, leader.score);
    }
    if (this.rule.kind === 'time') this.hud.setClock(Math.max(0, this.rule.seconds - this.elapsed));
    else {
      const leader = leaderOf(this.board);
      this.hud.setTimer(`${Math.max(0, this.rule.target - leader.score)} TO GO`);
    }
    this.hud.setCrosshair(player && !player.dead ? Boolean(this.enemyUnderCrosshair(player)) : false);
  }

  // Flags the reticle red when the gun is genuinely lined up on a hostile with
  // a clear shot — the same test the AI has to pass before it pulls a trigger.
  enemyUnderCrosshair(vehicle) {
    return this.crosshairTrace(vehicle, vehicle.autoDef.smg.range).enemy;
  }

  checkVictory() {
    const verdict = evaluateMatch(this.board, this.rule.id, this.elapsed);
    if (verdict.overtime && !this.overtime) {
      this.overtime = true;
      this.hud.banner('OVERTIME', 'SUDDEN DEATH — NEXT LEAD WINS', 3000);
      this.hud.setTimer('OVERTIME');
    }
    if (!verdict.over || this.over) return;
    this.over = true;
    const playerWon = this.teamMode === 'teams'
      ? verdict.winner === this.player.team
      : verdict.winner === this.player.team;
    const winnerName = this.teamMode === 'teams'
      ? ARENA_TEAMS[verdict.winner]?.name || 'NOBODY'
      : this.roster.find(driver => driver.team === verdict.winner)?.name || 'NOBODY';
    this.hud.banner(playerWon ? 'VICTORY' : 'DEFEAT', `${winnerName} · ${verdict.reason}`, 0);
    this.game.audio.play(playerWon ? 'build' : 'defeat');
    setTimeout(() => this.finish(verdict, playerWon, winnerName), 3600);
  }

  finish(verdict, playerWon, winnerName) {
    // The debrief is scheduled on a timer; if the match was restarted or
    // abandoned in the meantime, that timer must not touch anything.
    if (this.finished || this.disposed) return;
    this.finished = true;
    const results = {
      winner: verdict.winner,
      winnerName,
      playerWon,
      reason: verdict.reason,
      teamMode: this.teamMode,
      mapTitle: this.map.title,
      ruleTitle: this.rule.title,
      rows: this.roster.map(driver => {
        const vehicle = this.vehicles.find(v => v.slot === driver.slot);
        const record = this.board.drivers[driver.slot];
        return {
          name: driver.name,
          vehicle: driver.autoDef.name,
          team: driver.team,
          teamName: driver.teamName,
          color: hexCss(driver.teamColor),
          kills: record.kills,
          deaths: record.deaths,
          damage: Math.round(vehicle?.damageDealt || 0),
          accuracy: vehicle?.shotsFired ? Math.round((vehicle.shotsHit / vehicle.shotsFired) * 100) : 0,
          isPlayer: driver.isPlayer,
        };
      }).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths),
      score: { ...this.board.score },
    };
    this.onFinish?.(results);
  }

  updateScoreboard() {
    const rows = this.roster.map(driver => {
      const record = this.board.drivers[driver.slot];
      return {
        name: driver.name,
        vehicle: driver.autoDef.name,
        crew: this.teamMode === 'teams' ? driver.teamName : 'SOLO',
        color: hexCss(driver.teamColor),
        kills: record.kills,
        deaths: record.deaths,
        isPlayer: driver.isPlayer,
      };
    }).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const note = this.rule.kind === 'time'
      ? `${this.rule.title} · ${this.map.title}`
      : `${this.rule.title} · ${this.map.title}`;
    this.hud.setScoreboard(rows, this.showScores, note);
  }

  togglePause() {
    this.paused = !this.paused;
    this.hud.banner(this.paused ? '' : 'RESUMED', this.paused ? '' : '', this.paused ? 0 : 900);
    if (this.paused) {
      // The HUD is pointer-transparent, so the pause menu lives on the shared
      // screen layer where it can actually be clicked.
      this.game.screen.innerHTML = `<main class="menu pause-menu arena-pause"><h2>PIT STOP</h2>
        <p class="subtitle">${this.map.title} · ${this.rule.title}</p>
        <div class="menu-actions">
          <button class="btn primary" data-action="arena:resume">RESUME</button>
          <button class="btn" data-action="arena:restart">RESTART MATCH</button>
          <button class="btn" data-action="arena:quit">QUIT TO GARAGE</button>
        </div></main>`;
      document.exitPointerLock?.();
    } else {
      this.game.screen.innerHTML = '';
      this.game.requestMouseCapture?.();
    }
  }

  dispose() {
    this.disposed = true;
    this.hud?.dispose();
    this.combat?.clear();
    for (const mesh of this.projectileMeshes.values()) { this.scene.remove(mesh); disposeModel(mesh); }
    for (const mesh of this.bulletPool) { this.scene.remove(mesh); disposeModel(mesh); }
    for (const mesh of this.effectMeshes.values()) { this.scene.remove(mesh); disposeModel(mesh); }
    this.projectileMeshes.clear(); this.effectMeshes.clear(); this.bulletPool.length = 0;
    for (const vehicle of this.vehicles || []) {
      vehicle.marker?.material?.map?.dispose?.();
      vehicle.marker?.material?.dispose?.();
      this.scene.remove(vehicle.model);
      disposeModel(vehicle.model);
    }
    this.world?.dispose();
    this.scene?.clear();
    if (this.camera && this.previousFov) {
      this.camera.fov = this.previousFov;
      this.camera.far = 700;
      this.camera.updateProjectionMatrix();
    }
  }
}

export const arenaModeInternals = { RESPAWN_SECONDS, SPAWN_GRACE, KILL_CREDIT_WINDOW, AIM_ARC, CAMERA_AIM_DIP, angleDelta };
