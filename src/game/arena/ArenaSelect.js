// The Destruct-Auto garage: a selection screen built only for this mode.
// Live 3D chassis preview on the left, the ten-car roster on the right, match
// rules underneath. Nothing here is shared with the Custom Match setup screen.

import * as THREE from 'three';
import { DESTRUCT_AUTOS, autoById, statBars, smgDps } from '../../data/destructAutos.js';
import { ARENA_MAPS, ARENA_TEAM_MODES, WIN_CONDITIONS, ARENA_DIFFICULTIES, ARENA_TEAMS } from '../../data/arenaMaps.js';
import { MIN_DRIVERS, MAX_DRIVERS, MAX_TEAM_SIZE } from './ArenaRules.js';
import { createDestructAutoModel, disposeModel } from './ArenaVehicleModels.js';

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const bars = value => `<i class="bar-track"><b style="width:${value * 10}%"></b></i>`;

// ── rotating chassis showcase ───────────────────────────────────────────────
export class ArenaGaragePreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1020);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    this.camera.position.set(0, 5.4, 15.5);
    this.camera.lookAt(0, 1.9, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.scene.add(new THREE.HemisphereLight(0x9eeaff, 0x141a2a, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(6, 10, 8);
    this.scene.add(key);
    const rim = new THREE.PointLight(0xff4fd8, 40, 30);
    rim.position.set(-8, 4, -6);
    this.scene.add(rim);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x14203a, metalness: 0.7, roughness: 0.35 }));
    pad.position.y = -0.25;
    this.scene.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.1, 0.14, 8, 48), new THREE.MeshBasicMaterial({ color: 0x2fb4ff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    this.scene.add(ring);
    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.rotation = 0.6; this.targetRotation = 0.6; this.dragging = false; this.autoRotate = true;
    this.bind();
    this.resize();
    if (globalThis.ResizeObserver) { this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); }
    this.animate();
  }
  bind() {
    this.down = e => { this.dragging = true; this.autoRotate = false; this.lastX = e.clientX; this.canvas.setPointerCapture?.(e.pointerId); };
    this.move = e => { if (this.dragging) { this.targetRotation += (e.clientX - this.lastX) * 0.012; this.lastX = e.clientX; } };
    this.up = () => { this.dragging = false; };
    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.up);
  }
  resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  show(autoDef, teamColor = 0x2fb4ff) {
    this.clear();
    const model = createDestructAutoModel(autoDef, teamColor);
    this.modelRoot.add(model);
    this.targetRotation += Math.PI * 0.12;
  }
  clear() {
    while (this.modelRoot.children.length) {
      const child = this.modelRoot.children.pop();
      disposeModel(child);
    }
  }
  animate() {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(() => this.animate());
    if (this.autoRotate) this.targetRotation += 0.0055;
    this.rotation = THREE.MathUtils.lerp(this.rotation, this.targetRotation, 0.085);
    this.modelRoot.rotation.y = this.rotation;
    const bob = Math.sin(performance.now() / 900) * 0.09;
    this.modelRoot.position.y = bob;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.clear();
    // dispose() frees three's caches but leaves the WebGL context alive. The
    // browser only allows a handful of live contexts and drops the OLDEST one
    // when the cap is passed — which is the main game canvas. Leak a garage
    // visit or two and the match renders nothing. Hand the context back.
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

export const DEFAULT_ARENA_CONFIG = Object.freeze({
  autoId: 'crate-crusher',
  mapId: 'crateworks',
  teamMode: 'teams',
  driverCount: 6,
  winConditionId: 'time-5',
  difficulty: 'regular',
  playerTeam: 'A',
});

export class ArenaSelect {
  constructor({ root, audio, config, onLaunch, onBack }) {
    this.root = root;
    this.audio = audio;
    this.config = { ...DEFAULT_ARENA_CONFIG, ...config };
    this.onLaunch = onLaunch;
    this.onBack = onBack;
  }
  open() { this.render(); }
  set(key, value) {
    this.config[key] = value;
    if (key === 'teamMode' && value === 'teams') this.config.driverCount = Math.max(2, Math.min(MAX_TEAM_SIZE * 2, this.config.driverCount));
    this.audio?.play('change_team');
    this.refresh();
  }
  // Rules summary line under the launch button — the whole match in one sentence.
  summary() {
    const mode = ARENA_TEAM_MODES[this.config.teamMode];
    const win = WIN_CONDITIONS.find(w => w.id === this.config.winConditionId);
    const perSide = Math.ceil(this.config.driverCount / 2);
    const shape = this.config.teamMode === 'teams'
      ? `${perSide}v${this.config.driverCount - perSide}`
      : `${this.config.driverCount}-WAY FFA`;
    return `${mode.title} · ${shape} · ${win.title} · ${ARENA_MAPS[this.config.mapId].title}`;
  }
  rosterLabel() {
    const perSide = Math.ceil(this.config.driverCount / 2);
    return this.config.teamMode === 'teams'
      ? `${perSide} v ${this.config.driverCount - perSide}`
      : `${this.config.driverCount} DRIVERS`;
  }
  specHtml() {
    const selected = autoById(this.config.autoId);
    const bar = statBars(selected);
    return `
      <span class="auto-role">${selected.role} · ${escapeHtml(selected.callsign)}</span>
      <h3>${escapeHtml(selected.name)}</h3>
      <p>${escapeHtml(selected.blurb)}</p>
      <div class="arena-stat-grid">
        <label>SPEED ${bars(bar.speed)}</label>
        <label>ACCEL ${bars(bar.accel)}</label>
        <label>HANDLING ${bars(bar.handling)}</label>
        <label>WEIGHT ${bars(bar.weight)}</label>
        <label>ARMOUR ${bars(bar.armor)}</label>
        <label>FIREPOWER ${bars(bar.firepower)}</label>
      </div>
      <div class="arena-loadout">
        <div class="loadout-row">
          <span class="loadout-tag smg">∞ SMG</span>
          <strong>${escapeHtml(selected.smg.name)}</strong>
          <small>${selected.smg.damage} DMG · ${selected.smg.rpm} RPM · ${Math.round(smgDps(selected))} DPS · ${selected.smg.range}M RANGE</small>
        </div>
        <div class="loadout-row ultimate">
          <span class="loadout-tag ult">ULTIMATE</span>
          <strong>${escapeHtml(selected.ultimate.name)}</strong>
          <small>${escapeHtml(selected.ultimate.description)}</small>
          <em>${selected.ultimate.cooldown}s COOLDOWN · ${selected.stats.maxHp} HP CHASSIS · ${selected.stats.topSpeed} TOP SPEED</em>
        </div>
      </div>`;
  }
  render() {
    const teamColor = this.config.teamMode === 'teams' ? ARENA_TEAMS[this.config.playerTeam].css : '#2fb4ff';
    const cards = DESTRUCT_AUTOS.map(item => `
      <button class="auto-card" data-arena="autoId:${item.id}" style="--auto:#${item.paint.body.toString(16).padStart(6, '0')};--auto-accent:#${item.paint.accent.toString(16).padStart(6, '0')}">
        <span class="auto-icon">${item.icon}</span>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${item.role}</small>
        <em>${escapeHtml(item.ultimate.name)}</em>
      </button>`).join('');
    const maps = Object.values(ARENA_MAPS).map(map => `
      <button class="arena-map-card" data-arena="mapId:${map.id}" style="--map-accent:${map.accent}">
        <span class="arena-map-icon">${map.icon}</span>
        <small>${map.tag}</small>
        <strong>${map.title}</strong>
        <p>${escapeHtml(map.description)}</p>
        <em>${map.weather}</em>
      </button>`).join('');
    const modeButtons = Object.values(ARENA_TEAM_MODES).map(mode => `
      <button class="arena-chip" data-arena="teamMode:${mode.id}">
        <strong>${mode.title}</strong><small>${mode.kicker}</small>
      </button>`).join('');
    const winButtons = WIN_CONDITIONS.map(win => `
      <button class="arena-chip small" data-arena="winConditionId:${win.id}">
        <strong>${win.title}</strong><small>${win.note}</small>
      </button>`).join('');
    const difficultyButtons = ARENA_DIFFICULTIES.map(diff => `
      <button class="arena-chip small" data-arena="difficulty:${diff.id}">
        <strong>${diff.title}</strong>
      </button>`).join('');

    this.root.innerHTML = `
      <main class="menu arena-select">
        <div class="arena-select-head">
          <div>
            <span class="eyebrow">DESTRUCT-AUTO · VEHICLE COMBAT</span>
            <h2>PICK YOUR DESTRUCT-AUTO</h2>
          </div>
          <span class="arena-head-note">EVERY DRIVER GETS A DIFFERENT CHASSIS — CHOOSE FIRST, THE CPUs DRAFT WHAT IS LEFT</span>
        </div>
        <div class="arena-select-body">
          <section class="arena-showroom" style="--team:${teamColor}">
            <canvas class="arena-preview-canvas" data-arena-preview></canvas>
            <div class="arena-spec" data-arena-spec></div>
          </section>
          <section class="arena-roster">
            <div class="arena-roster-head"><span class="eyebrow">THE TEN</span><strong>DESTRUCT-AUTO ROSTER</strong></div>
            <div class="auto-grid">${cards}</div>
            <div class="arena-rules">
              <div class="arena-rule-block">
                <span class="eyebrow">BATTLE TYPE</span>
                <div class="arena-chip-row">${modeButtons}</div>
              </div>
              <div class="arena-rule-block">
                <span class="eyebrow">DRIVERS · <b data-roster-label></b></span>
                <div class="arena-slider">
                  <button class="arena-step" data-arena-step="-1">−</button>
                  <input type="range" min="${MIN_DRIVERS}" max="${MAX_DRIVERS}" value="${this.config.driverCount}" data-arena-range>
                  <button class="arena-step" data-arena-step="1">+</button>
                </div>
              </div>
              <div class="arena-rule-block wide">
                <span class="eyebrow">WIN CONDITION</span>
                <div class="arena-chip-row wrap">${winButtons}</div>
              </div>
              <div class="arena-rule-block">
                <span class="eyebrow">CPU SKILL</span>
                <div class="arena-chip-row">${difficultyButtons}</div>
              </div>
            </div>
          </section>
        </div>
        <section class="arena-map-strip">
          <span class="eyebrow">ARENA</span>
          <div class="arena-map-grid">${maps}</div>
        </section>
        <div class="arena-select-footer">
          <span class="arena-summary" data-arena-summary></span>
          <button class="btn" data-arena="back">BACK</button>
          <button class="btn primary" data-arena="launch">START ENGINES</button>
        </div>
      </main>`;

    const canvas = this.root.querySelector('[data-arena-preview]');
    // The canvas owns a WebGL context, so the shell is only ever built once and
    // every later interaction patches the DOM in place.
    if (canvas && !this.preview) this.preview = new ArenaGaragePreview(canvas);
    this.bindEvents();
    this.refresh();
  }
  refresh() {
    const selected = autoById(this.config.autoId);
    for (const node of this.root.querySelectorAll('[data-arena]')) {
      const [key, value] = node.dataset.arena.split(':');
      if (key === 'back' || key === 'launch') continue;
      node.classList.toggle('selected', String(this.config[key]) === value);
    }
    const spec = this.root.querySelector('[data-arena-spec]');
    if (spec) spec.innerHTML = this.specHtml();
    const label = this.root.querySelector('[data-roster-label]');
    if (label) label.textContent = this.rosterLabel();
    const summary = this.root.querySelector('[data-arena-summary]');
    if (summary) summary.textContent = this.summary();
    const range = this.root.querySelector('[data-arena-range]');
    if (range && Number(range.value) !== this.config.driverCount) range.value = String(this.config.driverCount);
    for (const step of this.root.querySelectorAll('[data-arena-step]')) {
      const delta = Number(step.dataset.arenaStep);
      step.disabled = this.config.driverCount + delta < MIN_DRIVERS || this.config.driverCount + delta > MAX_DRIVERS;
    }
    const showroom = this.root.querySelector('.arena-showroom');
    if (showroom) showroom.style.setProperty('--team', this.config.teamMode === 'teams' ? ARENA_TEAMS[this.config.playerTeam].css : '#2fb4ff');
    if (this.previewedAutoId !== this.config.autoId || this.previewedTeamMode !== this.config.teamMode) {
      this.previewedAutoId = this.config.autoId;
      this.previewedTeamMode = this.config.teamMode;
      this.preview?.show(selected, this.config.teamMode === 'teams' ? ARENA_TEAMS[this.config.playerTeam].color : 0x2fb4ff);
    }
  }
  bindEvents() {
    this.root.querySelectorAll('[data-arena]').forEach(node => {
      node.addEventListener('click', () => {
        const [key, value] = node.dataset.arena.split(':');
        if (key === 'back') { this.audio?.play('button_click'); this.onBack?.(); return; }
        if (key === 'launch') { this.audio?.play('build'); this.launch(); return; }
        if (key === 'autoId') { this.audio?.play('change_texture'); this.config.autoId = value; this.refresh(); return; }
        this.set(key, value);
      });
    });
    this.root.querySelectorAll('[data-arena-step]').forEach(node => {
      node.addEventListener('click', () => {
        const next = this.config.driverCount + Number(node.dataset.arenaStep);
        this.set('driverCount', Math.max(MIN_DRIVERS, Math.min(MAX_DRIVERS, next)));
      });
    });
    const range = this.root.querySelector('[data-arena-range]');
    range?.addEventListener('input', event => {
      this.config.driverCount = Number(event.target.value);
      this.refresh();
    });
  }
  launch() {
    const config = { ...this.config };
    this.dispose();
    this.onLaunch?.(config);
  }
  dispose() {
    this.preview?.dispose();
    this.preview = null;
  }
}
