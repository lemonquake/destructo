// The Crate Blitz match setup screen.
//
// There is only one character now, so this screen is not a roster picker — it
// is a lobby. Pick the arena, dial the seat count from 2 to 10, paint every
// seat, put them into crews if you want co-op, choose lives and CPU skill, go.
//
// The arena preview is a plain 2D canvas render of a real generated lattice
// rather than a second WebGL context: a top-down board is exactly what the
// preview needs to show, and it keeps the page down to one GL context.

import { BLITZ_ARENAS, BLITZ_TEAM_MODES, BLITZ_DIFFICULTIES, BLITZ_LIVES, TILE, OBSTACLES, generateGrid } from '../../data/blitzArenas.js';
import { BLITZ_POWERUPS } from '../../data/blitzPowerups.js';
import { PLAYER_COLORS, playerColorById, crewById, MIN_CREWS, MAX_CREWS } from '../../data/blitzDestructo.js';
import { defaultSeats, resizeSeats, enforceUniqueColors, normalizeCrews, MIN_PLAYERS, MAX_PLAYERS } from './BlitzRules.js';

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

export const DEFAULT_BLITZ_CONFIG = Object.freeze({
  arenaId: 'foundry',
  teamMode: 'ffa',
  crewCount: 2,
  livesId: 'lives-3',
  difficulty: 'regular',
  seats: null,          // filled in on first open
});

// ── arena preview ──────────────────────────────────────────────────────────
// Paints one generated lattice so the density and the material mix of an arena
// are visible before the match starts. Spawn pads are drawn in the seat colours
// actually chosen, which doubles as the "who starts where" diagram.
const TILE_FILL = {
  [TILE.PILLAR]: '#5b626e',
  [TILE.SUDDEN]: '#2a2f3a',
  [TILE.CONVEYOR]: '#2a3550',
  [TILE.HAZARD]: '#ff5a1f',
};
for (const spec of Object.values(OBSTACLES)) TILE_FILL[spec.tile] = `#${spec.color.toString(16).padStart(6, '0')}`;

export function drawArenaPreview(canvas, arenaDef, seats, random = Math.random) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { cols, rows } = arenaDef;
  const cell = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const offsetX = Math.floor((canvas.width - cell * cols) / 2);
  const offsetY = Math.floor((canvas.height - cell * rows) / 2);
  const tiles = generateGrid(arenaDef, random);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `#${arenaDef.floor.toString(16).padStart(6, '0')}`;
  ctx.fillRect(offsetX, offsetY, cell * cols, cell * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const fill = TILE_FILL[tiles[row][col]];
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(offsetX + col * cell, offsetY + row * cell, cell - 1, cell - 1);
    }
  }
  arenaDef.spawns.slice(0, seats.length).forEach((pad, index) => {
    const paint = playerColorById(seats[index]?.colorId);
    ctx.fillStyle = paint.css;
    ctx.beginPath();
    ctx.arc(offsetX + pad.col * cell + cell / 2, offsetY + pad.row * cell + cell / 2, Math.max(2.5, cell * 0.42), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

export class BlitzSelect {
  constructor({ root, audio, config, onLaunch, onBack }) {
    this.root = root;
    this.audio = audio;
    this.config = { ...DEFAULT_BLITZ_CONFIG, ...config };
    this.config.seats = this.config.seats?.length
      ? resizeSeats(this.config.seats, this.config.seats.length, this.config.crewCount)
      : defaultSeats(4, this.config.crewCount);
    this.onLaunch = onLaunch;
    this.onBack = onBack;
    this.openPalette = null;   // slot whose colour picker is showing
  }
  open() { this.render(); }

  // ── state ────────────────────────────────────────────────────────────────
  set(key, value) {
    this.config[key] = value;
    if (key === 'teamMode' || key === 'crewCount') {
      this.config.seats = normalizeCrews(this.config.seats, this.config.teamMode, this.config.crewCount);
    }
    this.audio?.play('change_team');
    this.refresh();
  }
  setSeatCount(count) {
    const wanted = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, count));
    if (wanted === this.config.seats.length) return;
    this.config.seats = normalizeCrews(
      enforceUniqueColors(resizeSeats(this.config.seats, wanted, this.config.crewCount)),
      this.config.teamMode, this.config.crewCount
    );
    this.audio?.play('change_team');
    this.refresh();
  }
  // Colours are exclusive: taking one that is already worn swaps the two seats
  // rather than refusing, which is what a player expects from a lobby.
  setSeatColor(slot, colorId) {
    const seats = this.config.seats.map(seat => ({ ...seat }));
    const target = seats[slot];
    if (!target) return;
    const holder = seats.find(seat => seat.colorId === colorId && seat.slot !== slot);
    if (holder) holder.colorId = target.colorId;
    target.colorId = colorId;
    this.config.seats = seats;
    this.openPalette = null;
    this.audio?.play('change_texture');
    this.refresh();
  }
  cycleSeatCrew(slot) {
    if (this.config.teamMode !== 'coop') return;
    const ids = Array.from({ length: this.crewCount() }, (_, i) => String.fromCharCode(65 + i));
    const seats = this.config.seats.map(seat => ({ ...seat }));
    const seat = seats[slot];
    if (!seat) return;
    seat.crewId = ids[(ids.indexOf(seat.crewId) + 1 + ids.length) % ids.length];
    this.config.seats = normalizeCrews(seats, this.config.teamMode, this.crewCount());
    this.audio?.play('change_team');
    this.refresh();
  }
  crewCount() {
    return Math.max(MIN_CREWS, Math.min(MAX_CREWS, Math.min(this.config.crewCount, this.config.seats.length)));
  }
  // Even split across crews, which is what most people want the button for.
  balanceCrews() {
    const count = this.crewCount();
    const seats = this.config.seats.map((seat, index) => ({
      ...seat, crewId: String.fromCharCode(65 + (index % count)),
    }));
    this.config.seats = normalizeCrews(seats, 'coop', count);
    this.audio?.play('change_team');
    this.refresh();
  }
  shuffleColors() {
    const pool = PLAYER_COLORS.map(entry => entry.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.config.seats = this.config.seats.map((seat, index) => ({ ...seat, colorId: pool[index % pool.length] }));
    this.audio?.play('change_texture');
    this.refresh();
  }

  summary() {
    const mode = BLITZ_TEAM_MODES[this.config.teamMode];
    const lives = BLITZ_LIVES.find(entry => entry.id === this.config.livesId);
    const shape = this.config.teamMode === 'coop'
      ? this.crewShape()
      : `${this.config.seats.length}-WAY FREE FOR ALL`;
    return `${mode.title} · ${shape} · ${lives.title} · ${BLITZ_ARENAS[this.config.arenaId].title}`;
  }
  crewShape() {
    const ids = Array.from({ length: this.crewCount() }, (_, i) => String.fromCharCode(65 + i));
    return ids.map(id => this.config.seats.filter(seat => seat.crewId === id).length).join(' v ');
  }

  // ── markup ───────────────────────────────────────────────────────────────
  seatHtml(seat) {
    const paint = playerColorById(seat.colorId);
    const crew = crewById(seat.crewId);
    const coop = this.config.teamMode === 'coop';
    const palette = this.openPalette === seat.slot
      ? `<div class="blitz-palette">${PLAYER_COLORS.map(entry => `
          <button class="blitz-swatch-btn ${entry.id === seat.colorId ? 'on' : ''}"
                  style="--pu:${entry.css}" title="${escapeHtml(entry.name)}"
                  data-blitz-color="${seat.slot}:${entry.id}"></button>`).join('')}</div>`
      : '';
    return `
      <div class="blitz-seat ${seat.isPlayer ? 'you' : ''}" style="--who:${paint.css}">
        <button class="blitz-seat-color" data-blitz-palette="${seat.slot}" title="Change colour">
          <span class="blitz-seat-dot"></span>
        </button>
        <div class="blitz-seat-id">
          <strong>${escapeHtml(seat.name)}</strong>
          <small>${escapeHtml(paint.name)}</small>
        </div>
        ${coop
          ? `<button class="blitz-seat-crew" style="--crew:${crew.css}" data-blitz-crew="${seat.slot}">${escapeHtml(crew.name)}</button>`
          : '<span class="blitz-seat-crew solo">SOLO</span>'}
        ${palette}
      </div>`;
  }

  render() {
    const arenas = Object.values(BLITZ_ARENAS).map(arena => `
      <button class="arena-map-card" data-blitz="arenaId:${arena.id}" style="--map-accent:${arena.accent}">
        <span class="arena-map-icon">${arena.icon}</span>
        <small>${arena.tag}</small>
        <strong>${arena.title}</strong>
        <p>${escapeHtml(arena.description)}</p>
        <em>${arena.weather} · ${arena.cols}×${arena.rows} TILES</em>
      </button>`).join('');
    const modes = Object.values(BLITZ_TEAM_MODES).map(mode => `
      <button class="arena-chip" data-blitz="teamMode:${mode.id}"><strong>${mode.title}</strong><small>${mode.kicker}</small></button>`).join('');
    const lives = BLITZ_LIVES.map(entry => `
      <button class="arena-chip small" data-blitz="livesId:${entry.id}"><strong>${entry.title}</strong><small>${entry.note}</small></button>`).join('');
    const skills = BLITZ_DIFFICULTIES.map(diff => `
      <button class="arena-chip small" data-blitz="difficulty:${diff.id}"><strong>${diff.title}</strong></button>`).join('');
    const crews = Array.from({ length: MAX_CREWS - MIN_CREWS + 1 }, (_, i) => i + MIN_CREWS).map(count => `
      <button class="arena-chip small" data-blitz="crewCount:${count}"><strong>${count} CREWS</strong></button>`).join('');
    const drops = Object.values(BLITZ_POWERUPS).map(item => `
      <span class="blitz-powerup" style="--pu:${item.css}">
        <b class="blitz-powerup-icon">${item.svg}</b>
        <span>${item.name}<small>${escapeHtml(item.description)}</small></span>
      </span>`).join('');
    const obstacles = Object.values(OBSTACLES).map(spec => `
      <span class="blitz-obstacle" style="--ob:#${spec.color.toString(16).padStart(6, '0')}">
        <i></i>${spec.name}<small>${spec.hp > 1 ? `${spec.hp} BLASTS` : 'ONE BLAST'}</small>
      </span>`).join('');

    this.root.innerHTML = `
      <main class="menu arena-select blitz-select">
        <div class="arena-select-head">
          <div>
            <span class="eyebrow">CRATE BLITZ · GRID DEMOLITION</span>
            <h2>SET UP THE MATCH</h2>
          </div>
          <span class="arena-head-note">EVERY DESTRUCTO IS IDENTICAL — WHAT YOU DIG OUT OF THE RUBBLE DECIDES IT</span>
        </div>

        <div class="blitz-setup">
          <section class="blitz-lobby">
            <div class="blitz-lobby-head">
              <span class="eyebrow">DESTRUCTOS · <b data-blitz-count></b></span>
              <div class="arena-slider">
                <button class="arena-step" data-blitz-step="-1">−</button>
                <input type="range" min="${MIN_PLAYERS}" max="${MAX_PLAYERS}" value="${this.config.seats.length}" data-blitz-range>
                <button class="arena-step" data-blitz-step="1">+</button>
              </div>
            </div>
            <div class="blitz-seats" data-blitz-seats></div>
            <div class="blitz-lobby-actions">
              <button class="btn tiny" data-blitz-action="shuffle">SHUFFLE COLOURS</button>
              <button class="btn tiny" data-blitz-action="balance" data-coop-only>BALANCE CREWS</button>
            </div>
          </section>

          <section class="blitz-rules-panel">
            <div class="arena-rule-block">
              <span class="eyebrow">BATTLE TYPE</span>
              <div class="arena-chip-row">${modes}</div>
            </div>
            <div class="arena-rule-block" data-coop-only>
              <span class="eyebrow">CREWS · <b data-blitz-shape></b></span>
              <div class="arena-chip-row">${crews}</div>
            </div>
            <div class="arena-rule-block">
              <span class="eyebrow">LIVES</span>
              <div class="arena-chip-row wrap">${lives}</div>
            </div>
            <div class="arena-rule-block">
              <span class="eyebrow">CPU SKILL</span>
              <div class="arena-chip-row wrap">${skills}</div>
            </div>
            <div class="blitz-preview-block">
              <span class="eyebrow">BOARD PREVIEW</span>
              <canvas class="blitz-preview" width="360" height="300" data-blitz-preview></canvas>
              <div class="blitz-obstacles">${obstacles}</div>
            </div>
          </section>
        </div>

        <section class="arena-map-strip">
          <span class="eyebrow">ARENA</span>
          <div class="arena-map-grid">${arenas}</div>
        </section>

        <div class="blitz-powerups">
          <span class="eyebrow">HIDDEN IN THE RUBBLE</span>
          <div>${drops}</div>
        </div>

        <div class="arena-select-footer">
          <span class="arena-summary" data-blitz-summary></span>
          <button class="btn" data-blitz="back">BACK</button>
          <button class="btn primary" data-blitz="launch">LIGHT THE FUSE</button>
        </div>
      </main>`;

    this.bindStatic();
    this.refresh();
  }

  refresh() {
    this.config.seats = normalizeCrews(enforceUniqueColors(this.config.seats), this.config.teamMode, this.crewCount());
    for (const node of this.root.querySelectorAll('[data-blitz]')) {
      const [key, value] = node.dataset.blitz.split(':');
      if (key === 'back' || key === 'launch') continue;
      node.classList.toggle('selected', String(this.config[key]) === value);
    }
    const coop = this.config.teamMode === 'coop';
    for (const node of this.root.querySelectorAll('[data-coop-only]')) node.classList.toggle('hidden', !coop);

    const seats = this.root.querySelector('[data-blitz-seats]');
    if (seats) {
      seats.innerHTML = this.config.seats.map(seat => this.seatHtml(seat)).join('');
      this.bindSeats();
    }
    const count = this.root.querySelector('[data-blitz-count]');
    if (count) count.textContent = `${this.config.seats.length} IN THE LATTICE`;
    const shape = this.root.querySelector('[data-blitz-shape]');
    if (shape) shape.textContent = this.crewShape();
    const summary = this.root.querySelector('[data-blitz-summary]');
    if (summary) summary.textContent = this.summary();
    const range = this.root.querySelector('[data-blitz-range]');
    if (range && Number(range.value) !== this.config.seats.length) range.value = String(this.config.seats.length);
    for (const step of this.root.querySelectorAll('[data-blitz-step]')) {
      const delta = Number(step.dataset.blitzStep);
      const next = this.config.seats.length + delta;
      step.disabled = next < MIN_PLAYERS || next > MAX_PLAYERS;
    }
    this.drawPreview();
  }

  drawPreview() {
    const canvas = this.root.querySelector('[data-blitz-preview]');
    if (!canvas) return;
    // Reseed only when the arena changes, so re-painting a seat does not
    // regenerate the maze under the player's eyes.
    if (this.previewArena !== this.config.arenaId) {
      this.previewArena = this.config.arenaId;
      this.previewSeed = Math.random();
    }
    let state = Math.floor(this.previewSeed * 0xffffff) || 1;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
    drawArenaPreview(canvas, BLITZ_ARENAS[this.config.arenaId], this.config.seats, random);
  }

  bindStatic() {
    this.root.querySelectorAll('[data-blitz]').forEach(node => {
      node.addEventListener('click', () => {
        const [key, value] = node.dataset.blitz.split(':');
        if (key === 'back') { this.audio?.play('button_click'); this.onBack?.(); return; }
        if (key === 'launch') { this.audio?.play('build'); this.launch(); return; }
        this.set(key, key === 'crewCount' ? Number(value) : value);
      });
    });
    this.root.querySelectorAll('[data-blitz-step]').forEach(node => {
      node.addEventListener('click', () => this.setSeatCount(this.config.seats.length + Number(node.dataset.blitzStep)));
    });
    this.root.querySelector('[data-blitz-range]')?.addEventListener('input', event => {
      this.setSeatCount(Number(event.target.value));
    });
    this.root.querySelectorAll('[data-blitz-action]').forEach(node => {
      node.addEventListener('click', () => {
        if (node.dataset.blitzAction === 'shuffle') this.shuffleColors();
        else this.balanceCrews();
      });
    });
  }
  // The seat list is re-rendered on every change, so its handlers are rebound
  // rather than delegated — the list is at most ten rows.
  bindSeats() {
    this.root.querySelectorAll('[data-blitz-palette]').forEach(node => {
      node.addEventListener('click', () => {
        const slot = Number(node.dataset.blitzPalette);
        this.openPalette = this.openPalette === slot ? null : slot;
        this.refresh();
      });
    });
    this.root.querySelectorAll('[data-blitz-color]').forEach(node => {
      node.addEventListener('click', event => {
        event.stopPropagation();
        const [slot, colorId] = node.dataset.blitzColor.split(':');
        this.setSeatColor(Number(slot), colorId);
      });
    });
    this.root.querySelectorAll('[data-blitz-crew]').forEach(node => {
      node.addEventListener('click', () => this.cycleSeatCrew(Number(node.dataset.blitzCrew)));
    });
  }

  launch() {
    const config = {
      ...this.config,
      crewCount: this.crewCount(),
      seats: normalizeCrews(enforceUniqueColors(this.config.seats), this.config.teamMode, this.crewCount()),
    };
    this.dispose();
    this.onLaunch?.(config);
  }
  dispose() { this.openPalette = null; }
}

export const blitzSelectInternals = { TILE_FILL };
