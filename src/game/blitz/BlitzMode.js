// CRATE BLITZ — grid demolition.
//
// Destructos on foot in a destructible lattice. The only weapon is the Charge
// Crate you drop under your own feet; the blast kills anything standing in it,
// including you and your crew. Everyone has a fixed number of lives, the dead
// keep watching, and the last side breathing takes the match.

import * as THREE from 'three';
import { ParticleSystem } from '../ParticleSystem.js';
import { DESTRUCTO } from '../../data/blitzDestructo.js';
import {
  TILE, TILE_SIZE, blitzArenaById, blitzDifficultyById, blitzLivesById,
  BLITZ_TEAM_MODES, SUDDEN_DEATH, TREMOR_THRESHOLD,
} from '../../data/blitzArenas.js';
import { BlitzGrid } from './BlitzGrid.js';
import { BlitzWorld } from './BlitzWorld.js';
import { BlitzAI } from './BlitzAI.js';
import { BlitzHUD } from './BlitzHUD.js';
import { BlitzAudio, KILL_LAUGH_DELAY } from './BlitzAudio.js';
import {
  createDestructoModel, createPlayerArrow, createChargeMesh, createPowerupMesh,
  createBlastMesh, createDeathBurst, disposeTree,
} from './BlitzModels.js';
import {
  createBlitzUnit, stepBlitzUnit, materializeCharge, resetUnitForSpawn, unitSpeed,
} from './BlitzUnit.js';
import { buildBlitzRoster, createScoreboard, registerKill, resolveKiller, evaluateMatch, spawnCellFor } from './BlitzRules.js';

const RESPAWN_SECONDS = 3;
const SPAWN_GRACE = 2;
const KILL_CREDIT_WINDOW = 6;
// The whole board would fit at 1.0; the mode reads better a fifth tighter with
// the camera riding the player instead of the centre of the lattice.
const CAMERA_ZOOM = 0.8;
const CAMERA_FOLLOW = 3.6;
// "You are here" reminder: a down-arrow over the player at a random interval.
const ARROW_MIN_GAP = 60;
const ARROW_MAX_GAP = 120;
const ARROW_SHOWN_FOR = 3.5;
const DEATH_BURST_LIFE = 0.9;

const hexCss = value => `#${value.toString(16).padStart(6, '0')}`;

export class BlitzMode {
  constructor(game, config) {
    this.game = game;
    this.config = config;
    this.arena = blitzArenaById(config.arenaId);
    this.difficulty = blitzDifficultyById(config.difficulty);
    this.livesRule = blitzLivesById(config.livesId);
    this.teamMode = config.teamMode === 'coop' ? 'coop' : 'ffa';
    this.elapsed = 0;
    this.over = false;
    this.paused = false;
    this.showScores = false;
    this.shake = 0;
    this.chargeMeshes = new Map();
    this.powerupMeshes = new Map();
    this.blastMeshes = new Map();
    this.deathBursts = [];
    this.eliminationOrder = [];
    this.prevPlaceHeld = false;
    this.spectateIndex = 0;
  }

  // ── setup ─────────────────────────────────────────────────────────────────
  start() {
    const game = this.game;
    this.scene = new THREE.Scene();
    this.grid = new BlitzGrid({ arenaDef: this.arena, hooks: this.gridHooks() });
    this.world = new BlitzWorld(this.scene, this.arena, this.grid);
    this.particles = new ParticleSystem(this.scene, () => 0);
    this.hud = new BlitzHUD();
    this.ai = new BlitzAI({ grid: this.grid, difficulty: this.difficulty });

    const settings = game.save?.data?.settings || {};
    this.audio = new BlitzAudio({
      volume: settings.volume ?? 0.55,
      muted: Boolean(settings.soundsMuted),
      musicMuted: Boolean(settings.musicMuted),
    });

    this.roster = buildBlitzRoster({
      seats: this.config.seats,
      teamMode: this.teamMode,
      crewCount: this.config.crewCount,
      lives: this.livesRule.lives,
    });
    this.board = createScoreboard(this.roster, this.teamMode);
    this.units = this.roster.map(entry => this.spawnUnit(entry));
    this.player = this.units.find(unit => unit.isPlayer) || this.units[0];

    this.camera = game.camera;
    this.previousFov = this.camera.fov;
    this.camera.fov = 52;
    this.camera.far = 900;
    this.camera.updateProjectionMatrix();
    this.cameraFocus = new THREE.Vector3();
    game.scene = this.scene;

    // The reminder arrow lives on the player's model and is hidden most of the
    // time; the first showing is immediate so a new player is oriented at once.
    this.arrow = createPlayerArrow(this.player.color);
    this.player.model.add(this.arrow);
    this.arrowTimer = ARROW_SHOWN_FOR;
    this.nextArrowAt = ARROW_MIN_GAP + Math.random() * (ARROW_MAX_GAP - ARROW_MIN_GAP);

    this.hud.show(true);
    this.hud.setMatch({
      arenaTitle: this.arena.title,
      modeTitle: `${BLITZ_TEAM_MODES[this.teamMode].title} · ${this.livesRule.title}`,
    });
    this.hud.setPlayer({
      name: this.player.name, colorCss: hexCss(this.player.color),
      lives: this.player.lives, livesLeft: this.player.livesLeft,
    });
    this.hud.banner(this.arena.title, `${BLITZ_TEAM_MODES[this.teamMode].title} · ${this.livesRule.title}`, 2800);
    for (const unit of this.units) this.respawn(unit, true);
    game.input.enabled = true;
    this.suddenAt = SUDDEN_DEATH.startsAt;
    this.audio.startMusic();
    this.syncVisuals(0.016, 0);
    this.updateCamera(1);
    this.refreshHud();
  }

  spawnUnit(entry) {
    const cell = spawnCellFor(this.arena, entry.slot, 0);
    const unit = createBlitzUnit({
      id: entry.slot, team: entry.team, spawnCell: cell, grid: this.grid,
      isPlayer: entry.isPlayer, name: entry.name, color: entry.color,
      colorName: entry.colorName, teamName: entry.teamName, lives: entry.lives,
    });
    unit.colorCss = entry.colorCss;
    unit.teamCss = entry.teamCss;
    const model = createDestructoModel(entry.color);
    model.visible = false;
    this.scene.add(model);
    unit.model = model;
    unit.marker = this.createMarker(entry);
    model.add(unit.marker);
    return unit;
  }
  createMarker(entry) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6,10,22,.72)';
    ctx.fillRect(0, 10, 256, 44);
    ctx.fillStyle = entry.colorCss;
    ctx.fillRect(0, 10, 256, 5);
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(entry.name.slice(0, 14), 128, 45);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
    sprite.scale.set(6, 1.5, 1);
    sprite.position.y = 5.2;
    sprite.renderOrder = 30;
    return sprite;
  }

  // ── grid wiring ───────────────────────────────────────────────────────────
  gridHooks() {
    return {
      onPlaceCharge: charge => {
        const mesh = createChargeMesh(charge.color);
        const point = this.grid.centerOf(charge.col, charge.row);
        mesh.position.set(point.x, 0, point.z);
        this.scene.add(mesh);
        this.chargeMeshes.set(charge.id, mesh);
      },
      onRemoveCharge: charge => {
        const mesh = this.chargeMeshes.get(charge.id);
        if (!mesh) return;
        this.chargeMeshes.delete(charge.id);
        this.scene.remove(mesh);
        disposeTree(mesh);
      },
      onBlast: (blast, charge, brokenCount) => {
        const mesh = createBlastMesh(blast.color, blast.cells.length);
        const dummy = new THREE.Object3D();
        blast.cells.forEach((cell, index) => {
          const point = this.grid.centerOf(cell.col, cell.row);
          dummy.position.set(point.x, 2.8, point.z);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.scene.add(mesh);
        this.blastMeshes.set(blast.id, mesh);

        const origin = this.grid.centerOf(blast.origin.col, blast.origin.row);
        this.particles.burst(new THREE.Vector3(origin.x, 2, origin.z), blast.color, 24, 13);
        this.audio.explosion(blast.power);
        // A blast always jolts a little; three or more obstacles going up at
        // once is a proper tremor you feel through the floor.
        const near = this.distanceToViewpoint(origin);
        this.addShake(near < 40 ? 0.34 * (1 - near / 40) : 0.04);
        if (brokenCount >= TREMOR_THRESHOLD) this.addShake(0.24 + Math.min(0.5, brokenCount * 0.09));
        void charge;
      },
      onObstacleHit: ({ col, row, spec, hp, maxHp }) => {
        // Survived the blast (brick): crack it rather than remove it.
        this.world.showObstacleDamage(col, row, hp / maxHp);
        const point = this.grid.centerOf(col, row);
        this.particles.burst(new THREE.Vector3(point.x, 2.6, point.z), spec.debris, 8, 6);
        this.audio.obstacle(spec.material);
      },
      onObstacleBroken: ({ col, row, spec }) => {
        this.world.syncTile(col, row);
        const point = this.grid.centerOf(col, row);
        this.particles.burst(new THREE.Vector3(point.x, 2.6, point.z), spec.debris, 18, 10);
        this.audio.obstacle(spec.material);
      },
      onPowerupSpawn: powerup => {
        const mesh = createPowerupMesh(powerup.def);
        const point = this.grid.centerOf(powerup.col, powerup.row);
        mesh.position.set(point.x, 0, point.z);
        // A staggered phase so a row of drops does not pulse in lockstep.
        mesh.userData.phase = (powerup.col * 1.7 + powerup.row * 2.3) % (Math.PI * 2);
        this.scene.add(mesh);
        this.powerupMeshes.set(powerup.id, mesh);
      },
      onPowerupTaken: (powerup, taker, def) => {
        const mesh = this.powerupMeshes.get(powerup.id);
        if (mesh) { this.powerupMeshes.delete(powerup.id); this.scene.remove(mesh); disposeTree(mesh); }
        if (!taker || !def) return;
        if (taker.isPlayer) this.hud.pickupBanner(def);
        const point = this.grid.centerOf(powerup.col, powerup.row);
        this.particles.burst(new THREE.Vector3(point.x, 2, point.z), powerup.color, 12, 7);
      },
      onSuddenBlock: cell => {
        this.world.syncTile(cell.col, cell.row);
        const point = this.grid.centerOf(cell.col, cell.row);
        this.particles.burst(new THREE.Vector3(point.x, 1, point.z), 0x8695aa, 12, 8);
        this.audio.obstacle('debris');
        this.addShake(0.16);
      },
      onDamage: (unit, amount, source, kind, time) => this.onDamage(unit, amount, source, kind, time),
      onSound: (name, subject) => {
        if (name === 'blast') return;   // the blast hook already voiced it
        const point = subject ? this.grid.centerOf(subject.col, subject.row) : { x: 0, z: 0 };
        const clip = { place: 'build', pickup: 'pickup', kick: 'metal_hit' }[name];
        if (clip) this.game.audio.play(clip, { x: point.x, y: 1, z: point.z });
      },
    };
  }

  onDamage(unit, amount, source, kind, time) {
    if (kind === 'plated') {
      if (unit.isPlayer) this.hud.banner('PLATE ABSORBED', 'THE BUBBLE POPPED, YOU DID NOT', 900);
      return;
    }
    if (unit.hp > 0) {
      if (unit.isPlayer) this.game.hud.damage?.();
      return;
    }
    this.killUnit(unit, source, kind, time);
  }

  killUnit(victim, source, kind, time = this.elapsed) {
    if (victim.dead || victim.eliminated) return;
    const killer = resolveKiller(victim, source, this.units, time, KILL_CREDIT_WINDOW);
    victim.dead = true;
    victim.hp = 0;
    victim.frozen = 0;
    victim.chargesLive = 0;
    victim.model.visible = false;
    victim.livesLeft = Math.max(0, victim.livesLeft - 1);
    victim.respawnTimer = RESPAWN_SECONDS;
    this.ai.forget(victim.id);
    registerKill(this.board, killer ? killer.slot : null, victim.slot);
    if (killer) killer.kills++;
    victim.deaths++;
    if (!killer) victim.suicides++;

    // The death effect: a plume where they stood, the recorded death cry, and
    // — a beat later — whoever did it laughing about it.
    this.spawnDeathBurst(victim);
    this.audio.death();
    if (killer) this.audio.laughAfterKill(KILL_LAUGH_DELAY);
    this.addShake(this.distanceToViewpoint(victim) < 34 ? 0.42 : 0.1);

    const cause = kind === 'crushed' ? 'CRUSHED' : kind === 'hazard' ? 'MELTED' : killer ? 'BLOWN UP' : 'SELF-DESTRUCTED';
    this.hud.kill(
      killer ? killer.name : 'THE LATTICE',
      victim.name,
      // Friendly fire is a real outcome here, so it gets its own label.
      killer && killer.team === victim.team && this.teamMode === 'coop' ? 'TEAM KILLED' : cause,
      killer ? hexCss(killer.color) : '#c9d2dd',
      hexCss(victim.color)
    );

    if (victim.livesLeft <= 0) this.eliminate(victim);
    else if (victim.isPlayer) this.hud.setRespawn(RESPAWN_SECONDS, `${victim.livesLeft} ${victim.livesLeft === 1 ? 'LIFE' : 'LIVES'} LEFT`);

    this.refreshHud();
    this.checkVictory();
  }

  // Out of lives: the model stays gone, the seat keeps its stats, and the
  // player becomes a spectator rather than being kicked to a menu.
  eliminate(unit) {
    unit.eliminated = true;
    unit.respawnTimer = 0;
    const record = this.board.players[unit.slot];
    if (record) {
      record.survivedFor = this.elapsed;
      // Placement counts backwards: the last one out is 2nd, and so on.
      record.placement = this.units.length - this.eliminationOrder.length;
    }
    this.eliminationOrder.push(unit.slot);
    this.hud.setRespawn(null);
    if (unit.isPlayer) {
      this.spectateIndex = 0;
      this.hud.banner('YOU ARE OUT', 'WATCH IT BURN', 2400);
    } else if (this.player && !this.player.eliminated) {
      this.hud.banner('ELIMINATED', `${unit.name} IS OUT OF LIVES`, 1200);
    }
  }

  spawnDeathBurst(unit) {
    const burst = createDeathBurst(unit.color);
    burst.position.set(unit.x, 0, unit.z);
    this.scene.add(burst);
    this.deathBursts.push({ group: burst, life: DEATH_BURST_LIFE });
    this.particles.burst(new THREE.Vector3(unit.x, 2, unit.z), unit.color, 30, 14);
    this.particles.burst(new THREE.Vector3(unit.x, 2.4, unit.z), 0xffca4a, 18, 11);
  }

  respawn(unit, initial = false) {
    if (unit.eliminated) return;
    unit.respawnCount = initial ? 0 : (unit.respawnCount || 0) + 1;
    const cell = spawnCellFor(this.arena, unit.slot, unit.respawnCount);
    // Clear a pocket so nobody reassembles inside a wall of stock.
    for (const offset of [{ dx: 0, dz: 0 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 }]) {
      const col = cell.col + offset.dx, row = cell.row + offset.dz;
      if (!this.grid.inBounds(col, row)) continue;
      if (!this.grid.obstacleHpAt(col, row)) continue;
      this.grid.setTile(col, row, TILE.FLOOR);
      this.world.syncTile(col, row);
    }
    resetUnitForSpawn(unit, this.grid, cell, SPAWN_GRACE);
    unit.model.visible = true;
    unit.model.position.set(unit.x, 0, unit.z);
    if (unit.isPlayer) {
      this.hud.setRespawn(null);
      this.hud.banner('BACK IN', `${unit.livesLeft} ${unit.livesLeft === 1 ? 'LIFE' : 'LIVES'} LEFT`, 1000);
    }
  }

  // ── input ─────────────────────────────────────────────────────────────────
  playerInput() {
    const input = this.game.input;
    const empty = { mx: 0, mz: 0, place: false };
    if (!this.player || this.player.dead || this.player.eliminated || this.paused || this.over) {
      this.prevPlaceHeld = false;
      return empty;
    }
    const keys = input.keys;
    const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + (input.moveAxis?.x || 0);
    const mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (input.moveAxis?.y || 0);
    // Drop on the press, not the hold, so a held button is one crate.
    const held = input.mouse.down || keys.has('KeyF');
    const place = (held && !this.prevPlaceHeld) || input.consume('Space');
    this.prevPlaceHeld = held;
    return {
      mx: Math.max(-1, Math.min(1, mx)),
      mz: Math.max(-1, Math.min(1, mz)),
      place,
    };
  }

  // Once you are out, left/right walks the camera through whoever is left.
  spectatorInput() {
    const input = this.game.input;
    const living = this.livingUnits();
    if (!living.length) return;
    if (input.consume('KeyA') || input.consume('ArrowLeft')) this.spectateIndex = (this.spectateIndex - 1 + living.length) % living.length;
    if (input.consume('KeyD') || input.consume('ArrowRight')) this.spectateIndex = (this.spectateIndex + 1) % living.length;
  }

  livingUnits() { return this.units.filter(unit => !unit.eliminated); }
  // Who the camera is on: the player, or — once they are out — the spectate pick.
  viewpoint() {
    if (this.player && !this.player.eliminated) return this.player;
    const living = this.livingUnits();
    if (!living.length) return this.player;
    return living[this.spectateIndex % living.length];
  }
  distanceToViewpoint(point) {
    const target = this.viewpoint();
    if (!target) return 999;
    return Math.hypot((point.x ?? 0) - target.x, (point.z ?? 0) - target.z);
  }
  addShake(amount) {
    this.shake = Math.min(1.4, (this.shake || 0) + amount);
  }

  // ── frame ─────────────────────────────────────────────────────────────────
  update(dt, time) {
    const input = this.game.input;
    if (input.consume('Escape')) this.togglePause();
    this.showScores = input.keys.has('Tab');
    this.updateScoreboard();
    if (this.paused) { this.world.update(dt, time); return; }
    const step = Math.min(dt, 0.05);
    this.elapsed += step;

    if (!this.grid.suddenActive && this.elapsed >= this.suddenAt) {
      this.grid.beginSuddenDeath();
      this.hud.setSuddenDeath(true);
      this.hud.banner('SUDDEN DEATH', 'THE WALLS ARE COMING IN', 2600);
    }

    const spectating = Boolean(this.player?.eliminated);
    if (spectating) this.spectatorInput();
    const command = this.playerInput();

    for (const unit of this.units) {
      if (unit.eliminated) continue;
      if (unit.dead) {
        unit.respawnTimer -= step;
        if (unit.isPlayer) this.hud.setRespawn(unit.respawnTimer, `${unit.livesLeft} ${unit.livesLeft === 1 ? 'LIFE' : 'LIVES'} LEFT`);
        if (unit.respawnTimer <= 0 && !this.over) this.respawn(unit);
        continue;
      }
      const orders = unit.isPlayer ? command : this.ai.think(unit, {
        allies: this.alliesOf(unit),
        enemies: this.enemiesOf(unit),
        dt: step,
      });
      stepBlitzUnit(unit, orders, this.grid, step);
      if (orders.place) {
        const charge = materializeCharge(unit, this.grid, this.elapsed);
        if (!charge && unit.isPlayer && unit.chargesLive >= unit.charges) this.hud.banner('NO CHARGES LEFT', '', 700);
      }
    }

    this.grid.update(step, this.units, this.elapsed);
    this.updateArrow(step);
    this.syncVisuals(step, time);
    this.world.update(step, time);
    this.particles.update(step, this.camera);
    this.updateCamera(step);
    this.refreshHud();
    if (!this.over) this.checkVictory();
  }

  alliesOf(unit) {
    return this.units.filter(other => other.id !== unit.id && other.team === unit.team && !other.eliminated && !other.dead);
  }
  enemiesOf(unit) {
    return this.units.filter(other => other.team !== unit.team && !other.eliminated && !other.dead);
  }

  // The reminder arrow: hidden most of the match, dropped in for a few seconds
  // at a random interval so a player who has lost track of themselves in a
  // ten-way scrap can find their Destructo again.
  updateArrow(dt) {
    if (!this.arrow) return;
    if (this.player?.eliminated) { this.arrow.visible = false; return; }
    if (this.arrowTimer > 0) {
      this.arrowTimer -= dt;
      this.arrow.visible = !this.player.dead;
      if (this.arrowTimer <= 0) {
        this.arrow.visible = false;
        this.nextArrowAt = this.elapsed + ARROW_MIN_GAP + Math.random() * (ARROW_MAX_GAP - ARROW_MIN_GAP);
      }
      return;
    }
    if (this.elapsed >= this.nextArrowAt) this.arrowTimer = ARROW_SHOWN_FOR;
  }

  // ── visuals ───────────────────────────────────────────────────────────────
  syncVisuals(dt, time) {
    for (const unit of this.units) {
      if (unit.dead || unit.eliminated) continue;
      const model = unit.model;
      model.position.set(unit.x, 0, unit.z);
      // Face the direction of travel, turning rather than snapping.
      const delta = Math.atan2(Math.sin(unit.facing - model.rotation.y), Math.cos(unit.facing - model.rotation.y));
      model.rotation.y += delta * Math.min(1, dt * 16);
      const rig = model.userData.rig;
      const moving = unit.dir !== null;
      if (rig) {
        const stride = moving ? Math.abs(Math.sin(time * unitSpeed(unit) * 0.9)) * 0.22 : 0;
        rig.position.y = stride;
        rig.rotation.z = moving ? Math.sin(time * unitSpeed(unit) * 0.9) * 0.06 : 0;
        for (const [index, leg] of (model.userData.legs || []).entries()) {
          leg.rotation.x = moving ? Math.sin(time * unitSpeed(unit) * 1.1 + index * Math.PI) * 0.5 : 0;
        }
      }
      if (unit.marker) unit.marker.visible = !unit.isPlayer;
      const aura = model.userData.aura;
      if (aura) {
        const shielded = unit.spawnGrace > 0 || unit.plates > 0;
        aura.material.color.setHex(shielded ? 0xffffff : unit.color);
        aura.material.opacity = 0.4 + (shielded ? 0.35 : 0) + Math.sin(time * (shielded ? 12 : 3) + unit.id) * 0.08;
      }
    }

    // The arrow bobs and spins so it catches the eye immediately.
    if (this.arrow?.visible) {
      this.arrow.position.y = 6.4 + Math.abs(Math.sin(time * 4)) * 0.9;
      this.arrow.rotation.y = time * 2.2;
      const halo = this.arrow.userData.halo;
      if (halo) {
        halo.material.opacity = 0.28 + Math.abs(Math.sin(time * 4)) * 0.42;
        halo.scale.setScalar(1 + Math.abs(Math.sin(time * 4)) * 0.25);
      }
    }

    // Charges swell and flash as the fuse burns down.
    for (const charge of this.grid.charges) {
      const mesh = this.chargeMeshes.get(charge.id);
      if (!mesh) continue;
      const point = this.grid.centerOf(charge.col, charge.row);
      mesh.position.set(point.x, 0, point.z);
      const urgency = 1 - Math.max(0, Math.min(1, charge.fuse / Math.max(0.001, DESTRUCTO.stats.fuse)));
      mesh.scale.setScalar(1 + Math.abs(Math.sin(time * (5 + urgency * 24))) * (0.06 + urgency * 0.2));
      if (mesh.userData.core) mesh.userData.core.position.y = 4.7 + Math.sin(time * 7) * 0.16;
    }

    // Power-ups: bouncy, pulsing and shiny — they have to shout across a board
    // full of rubble.
    for (const powerup of this.grid.powerups) {
      const mesh = this.powerupMeshes.get(powerup.id);
      if (!mesh?.userData?.bob) continue;
      const { bob, halo, pad, body } = mesh.userData;
      const phase = time * 3.4 + (mesh.userData.phase || 0);
      // A squashed sine reads as a real bounce rather than a float.
      const hop = Math.abs(Math.sin(phase));
      bob.position.y = 1.55 + hop * 1.15;
      bob.rotation.y += dt * 2.1;
      // Squash-and-stretch at the bottom of the arc.
      const squash = 1 + (1 - hop) * 0.14;
      bob.scale.set(squash, 2 - squash, squash);
      const pulse = 0.5 + Math.abs(Math.sin(phase * 0.5)) * 0.5;
      body.emissiveIntensity = 0.75 + pulse * 0.95;
      halo.material.opacity = 0.2 + pulse * 0.45;
      halo.scale.setScalar(0.85 + pulse * 0.4);
      pad.material.opacity = 0.24 + pulse * 0.3;
    }

    // Blasts fade out over their short life.
    for (const [id, mesh] of this.blastMeshes) {
      const blast = this.grid.blasts.find(item => item.id === id);
      if (!blast) { this.scene.remove(mesh); disposeTree(mesh); this.blastMeshes.delete(id); continue; }
      const life = Math.max(0, blast.life / blast.maxLife);
      mesh.material.opacity = life * 0.9;
      mesh.scale.setScalar(0.6 + (1 - life) * 0.55);
    }

    // Death plumes expand and fade, then clean themselves up.
    for (let i = this.deathBursts.length - 1; i >= 0; i--) {
      const burst = this.deathBursts[i];
      burst.life -= dt;
      const t = Math.max(0, burst.life / DEATH_BURST_LIFE);
      const grow = 1 + (1 - t) * 2.6;
      const { core, ring, shell } = burst.group.userData;
      core.scale.setScalar(grow * 0.8);
      core.material.opacity = t * t;
      shell.scale.setScalar(grow * 1.35);
      shell.material.opacity = t * 0.7;
      ring.scale.setScalar(1 + (1 - t) * 4.5);
      ring.material.opacity = t * 0.85;
      if (burst.life > 0) continue;
      this.scene.remove(burst.group);
      disposeTree(burst.group);
      this.deathBursts.splice(i, 1);
    }
  }

  // A following camera, a fifth tighter than the framing that fits the whole
  // board. It rides whoever the player is watching and is clamped so it never
  // shows past the perimeter wall.
  updateCamera(dt) {
    const width = this.grid.cols * TILE_SIZE, depth = this.grid.rows * TILE_SIZE;
    const aspect = this.camera.aspect || 1.7;
    const fov = (this.camera.fov * Math.PI) / 180;
    const fitHeight = (depth * 0.62) / Math.tan(fov / 2);
    const fitWidth = (width * 0.62) / (Math.tan(fov / 2) * aspect);
    const distance = Math.max(fitHeight, fitWidth) * CAMERA_ZOOM;

    const target = this.viewpoint();
    // How far the focus may stray from the centre before the wall creeps in.
    const marginX = Math.max(0, width * 0.5 - distance * 0.42);
    const marginZ = Math.max(0, depth * 0.5 - distance * 0.34);
    const focusX = target ? THREE.MathUtils.clamp(target.x, -marginX, marginX) : 0;
    const focusZ = target ? THREE.MathUtils.clamp(target.z, -marginZ, marginZ) : 0;

    const follow = Math.min(1, dt * CAMERA_FOLLOW);
    this.cameraFocus.lerp(new THREE.Vector3(focusX, 0, focusZ), follow);
    this.camera.position.lerp(
      new THREE.Vector3(this.cameraFocus.x, distance * 0.86, this.cameraFocus.z + distance * 0.62),
      follow
    );
    this.camera.lookAt(this.cameraFocus);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.4);
      if (this.game.save.data.settings.cameraShake !== false) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 2.0;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 1.4;
        this.camera.position.z += (Math.random() - 0.5) * this.shake * 1.6;
      }
    }
  }

  // ── hud + rules ───────────────────────────────────────────────────────────
  rosterRows() {
    return this.units.map(unit => ({
      slot: unit.slot,
      name: unit.name,
      colorCss: hexCss(unit.color),
      crewName: this.teamMode === 'coop' ? unit.teamName : '',
      livesLeft: unit.livesLeft,
      eliminated: unit.eliminated,
      isPlayer: unit.isPlayer,
      kills: this.board.players[unit.slot].kills,
      deaths: this.board.players[unit.slot].deaths,
    }));
  }
  refreshHud() {
    const player = this.player;
    if (player && !player.eliminated) {
      this.hud.setSpectating(null);
      this.hud.setLoadout(player);
    } else {
      const watching = this.viewpoint();
      this.hud.setSpectating(watching && watching !== player ? watching.name : 'THE LATTICE');
    }
    this.hud.setClock(this.elapsed);
    const alive = this.livingUnits().length;
    this.hud.setAlive(alive, this.units.length);
    this.hud.setRoster(this.rosterRows());
  }
  updateScoreboard() {
    const rows = this.rosterRows().sort((a, b) =>
      Number(a.eliminated) - Number(b.eliminated) || b.kills - a.kills || a.deaths - b.deaths);
    this.hud.setScoreboard(rows, this.showScores, `${BLITZ_TEAM_MODES[this.teamMode].title} · ${this.arena.title}`);
  }

  checkVictory() {
    const verdict = evaluateMatch(this.units);
    if (!verdict.over || this.over) return;
    this.over = true;
    // Everybody still standing shares the top placement.
    for (const unit of this.livingUnits()) {
      const record = this.board.players[unit.slot];
      if (record) { record.placement = 1; record.survivedFor = this.elapsed; }
    }
    const winners = this.units.filter(unit => !unit.eliminated);
    const playerWon = Boolean(this.player && !this.player.eliminated);
    const winnerName = verdict.draw
      ? 'NOBODY'
      : this.teamMode === 'coop'
        ? (winners[0]?.teamName || 'NOBODY')
        : (winners[0]?.name || 'NOBODY');
    this.hud.banner(
      verdict.draw ? 'DRAW' : playerWon ? 'VICTORY' : 'MATCH OVER',
      `${winnerName} · ${verdict.reason}`, 0
    );
    this.audio.stopMusic();
    if (playerWon) this.audio.play('laugh', { gain: 1 });
    setTimeout(() => this.finish(verdict, playerWon, winnerName, winners), 3200);
  }

  finish(verdict, playerWon, winnerName, winners) {
    if (this.finished || this.disposed) return;
    this.finished = true;
    const rows = this.units.map(unit => {
      const record = this.board.players[unit.slot];
      return {
        name: unit.name,
        colorCss: hexCss(unit.color),
        colorName: unit.colorName,
        crewName: unit.teamName,
        crewCss: unit.teamCss,
        team: unit.team,
        isPlayer: unit.isPlayer,
        survived: !unit.eliminated,
        placement: record.placement || this.units.length,
        kills: record.kills,
        deaths: record.deaths,
        suicides: record.suicides,
        bombsPlaced: unit.bombsPlaced,
        obstaclesDestroyed: unit.obstaclesDestroyed,
        powerupsTaken: unit.powerupsTaken,
        livesLeft: unit.livesLeft,
        survivedFor: Math.round(record.survivedFor || this.elapsed),
      };
    }).sort((a, b) => a.placement - b.placement || b.kills - a.kills || a.deaths - b.deaths);

    this.onFinish?.({
      winner: verdict.winner,
      winnerName,
      winnerColors: winners.map(unit => hexCss(unit.color)),
      playerWon,
      draw: verdict.draw,
      reason: verdict.reason,
      teamMode: this.teamMode,
      arenaTitle: this.arena.title,
      modeTitle: BLITZ_TEAM_MODES[this.teamMode].title,
      duration: Math.round(this.elapsed),
      totals: {
        bombsPlaced: rows.reduce((sum, row) => sum + row.bombsPlaced, 0),
        obstaclesDestroyed: rows.reduce((sum, row) => sum + row.obstaclesDestroyed, 0),
        kills: rows.reduce((sum, row) => sum + row.kills, 0),
        powerupsTaken: rows.reduce((sum, row) => sum + row.powerupsTaken, 0),
      },
      rows,
    });
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.game.screen.innerHTML = `<main class="menu pause-menu arena-pause blitz-pause"><h2>FUSE HELD</h2>
        <p class="subtitle">${this.arena.title} · ${BLITZ_TEAM_MODES[this.teamMode].title}</p>
        <div class="menu-actions">
          <button class="btn primary" data-action="blitz:resume">RESUME</button>
          <button class="btn" data-action="blitz:restart">RESTART MATCH</button>
          <button class="btn" data-action="blitz:quit">QUIT TO SETUP</button>
        </div></main>`;
      document.exitPointerLock?.();
    } else {
      this.game.screen.innerHTML = '';
      this.hud.banner('RESUMED', '', 800);
    }
  }

  dispose() {
    this.disposed = true;
    this.audio?.dispose();
    this.hud?.dispose();
    this.grid?.clear();
    for (const collection of [this.chargeMeshes, this.powerupMeshes, this.blastMeshes]) {
      for (const mesh of collection.values()) { this.scene.remove(mesh); disposeTree(mesh); }
      collection.clear();
    }
    for (const burst of this.deathBursts) { this.scene.remove(burst.group); disposeTree(burst.group); }
    this.deathBursts.length = 0;
    if (this.arrow) { this.arrow.parent?.remove(this.arrow); disposeTree(this.arrow); this.arrow = null; }
    for (const unit of this.units || []) {
      unit.marker?.material?.map?.dispose?.();
      unit.marker?.material?.dispose?.();
      this.scene.remove(unit.model);
      disposeTree(unit.model);
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

export const blitzModeInternals = {
  RESPAWN_SECONDS, SPAWN_GRACE, KILL_CREDIT_WINDOW, CAMERA_ZOOM,
  ARROW_MIN_GAP, ARROW_MAX_GAP, ARROW_SHOWN_FOR, CAMERA_FOLLOW,
};
