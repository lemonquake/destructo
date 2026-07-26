// ── GAME SETUP ──────────────────────────────────────────────────────────────
// One screen for every mode Destructo ships. The shell owns the chrome — the
// topbar, the mode rail, the mode banner and the launch footer — and mounts a
// mode-specific panel into its body. That is the whole trick: the frame never
// changes, so the screen feels like one product, while Destruct-Auto still gets
// its garage and Crate Blitz still gets its lattice lobby.
//
// The chrome is rendered once and patched in place afterwards. That matters:
// the Destruct-Auto panel owns a WebGL context for its chassis preview, and
// blowing the shell away on every click would leak contexts until the main game
// canvas is the one the browser drops.

import { SETUP_GROUPS, SETUP_MODES, setupModeById, setupModesInGroup } from '../../data/setupModes.js';
import { SquadSetupPanel } from './SquadSetupPanel.js';
import { ArenaSelect, DEFAULT_ARENA_CONFIG } from '../arena/ArenaSelect.js';
import { BlitzSelect, DEFAULT_BLITZ_CONFIG } from '../blitz/BlitzSelect.js';
import { CAMPAIGN_MISSIONS, CAMPAIGN_DIMENSIONS } from '../../data/gameData.js';

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

// ── campaign: no setup to do, so the panel is a briefing and a doorway ──────
class CampaignPanel {
  constructor({ game, mode }) { this.game = game; this.mode = mode; }
  mount(container) { this.container = container; this.render(); }
  refresh() { this.render(); }
  dispose() {}
  brief() {
    const done = this.game.save.data.campaign.completedMissionIds.length;
    const total = Object.keys(CAMPAIGN_MISSIONS).length;
    return {
      summary: `CAMPAIGN · ${done} / ${total} OPERATIONS COMPLETE · ${CAMPAIGN_DIMENSIONS.length} DIMENSIONS`,
      ready: true, blocked: null, launchLabel: this.mode.launchLabel, note: 'SOLO + AI SQUAD',
    };
  }
  launch() { this.game.showMissions(); }
  render() {
    const save = this.game.save.data;
    const total = Object.keys(CAMPAIGN_MISSIONS).length;
    const done = save.campaign.completedMissionIds.length;
    const dimensions = CAMPAIGN_DIMENSIONS.map(dimension => {
      const missions = dimension.missionIds.map(id => CAMPAIGN_MISSIONS[id]).filter(Boolean);
      const cleared = missions.filter(m => this.game.save.campaignCompleted(m.id)).length;
      return `
        <article class="campaign-tile" style="--dim:${dimension.accent};--dim2:${dimension.secondary}">
          <b>${dimension.icon}</b>
          <div>
            <span class="eyebrow">DIMENSION ${String(dimension.order).padStart(2, '0')} · ${escapeHtml(dimension.status)}</span>
            <strong>${escapeHtml(dimension.name).toUpperCase()}</strong>
            <p>${escapeHtml(dimension.description)}</p>
          </div>
          <em>${missions.length ? `${cleared} / ${missions.length} CLEARED` : 'CALIBRATING'}</em>
        </article>`;
    }).join('');
    this.container.innerHTML = `
      <div class="setup-panel campaign-panel">
        <section class="setup-block">
          <header class="setup-block-head">
            <span class="eyebrow">PROGRESS</span>
            <strong>${done} / ${total} OPERATIONS</strong>
          </header>
          <div class="campaign-progress"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
          <div class="campaign-tiles">${dimensions}</div>
        </section>
        <aside class="setup-block rules-block">
          <header class="setup-block-head"><span class="eyebrow">HOW IT PLAYS</span><strong>SOLO RULES</strong></header>
          <div class="rule-locked column">
            <span>Authored battlefields, not generated ones</span>
            <span>Quest chain drives every objective</span>
            <span>Radio briefings from Major Rivet</span>
            <span>Chips on completion · missions stay replayable</span>
            <span>Clearing an operation unlocks the next</span>
          </div>
          <div class="supply-plan">
            <strong>${save.chips} CHIPS BANKED</strong>
            <span>SPEND THEM IN D-BUILDER AND THE CASINO</span>
            <span>${this.game.debugMode ? 'DEBUG MODE · ALL MISSIONS UNLOCKED' : 'COMPLETE OPERATIONS TO OPEN PORTALS'}</span>
          </div>
        </aside>
      </div>`;
  }
}

export class GameSetup {
  constructor({ root, game, audio, modeId = 'deathmatch' }) {
    this.root = root;
    this.game = game;
    this.audio = audio;
    this.modeId = setupModeById(modeId).id;
    this.panel = null;
    // Setup is a two-step flow: dial the match in, then pick the battlefield on
    // a screen big enough to actually look at it.
    this.step = 'setup';
  }

  get mode() { return setupModeById(this.modeId); }
  // Campaign has authored battlefields, so it skips the map step entirely.
  get maps() { return this.panel?.mapOptions?.() || []; }
  get hasMapStep() { return this.maps.length > 0; }

  open() {
    this.renderShell();
    this.mountPanel();
    this.audio?.playMusic?.(this.mode.music);
  }

  // ── chrome ───────────────────────────────────────────────────────────────
  railHtml() {
    return SETUP_GROUPS.map(group => {
      const modes = setupModesInGroup(group.id);
      if (!modes.length) return '';
      const cards = modes.map(mode => `
        <button class="rail-mode ${mode.id === this.modeId ? 'selected' : ''}" data-action="gamemode:${mode.id}"
                style="--mode:${mode.accent};--mode2:${mode.accent2}" data-rail-mode="${mode.id}">
          <b class="rail-icon">${mode.icon}</b>
          <span class="rail-copy">
            <strong>${mode.title}</strong>
            <small>${mode.kicker}</small>
          </span>
          <em class="rail-lobby">${mode.lobby}</em>
        </button>`).join('');
      return `
        <div class="rail-group">
          <header><span>${group.title}</span><small>${group.note}</small></header>
          ${cards}
        </div>`;
    }).join('');
  }

  heroHtml() {
    const mode = this.mode;
    const facts = mode.facts.map(fact => `<div class="hero-fact"><span>${fact.k}</span><strong>${fact.v}</strong></div>`).join('');
    const features = mode.features.map(feature => `<i>${feature}</i>`).join('');
    return `
      <div class="hero-mark">${mode.icon}</div>
      <div class="hero-copy">
        <span class="eyebrow">${mode.kicker}</span>
        <h2>${mode.title}</h2>
        <p>${escapeHtml(mode.tagline)}</p>
        <div class="hero-tags">${features}</div>
      </div>
      <div class="hero-facts">${facts}</div>`;
  }

  renderShell() {
    const save = this.game.save.data;
    this.root.innerHTML = `
      <div class="game-setup" style="--mode:${this.mode.accent};--mode2:${this.mode.accent2}" data-setup-root>
        <div class="setup-aurora" aria-hidden="true"></div>
        <header class="setup-topbar">
          <button class="setup-back" data-action="menu" title="Back to the main menu" aria-label="Back to the main menu">←</button>
          <div class="setup-brand">
            <span>GS</span>
            <div><small>DESTRUCTO</small><strong>GAME SETUP</strong></div>
          </div>
          <nav class="setup-crumbs" aria-label="Setup step">
            <b class="done" data-setup-crumb="mode">1 · ${this.mode.title}</b>
            <button type="button" data-action="setup:step:setup" data-setup-crumb="setup">2 · SETUP</button>
            <button type="button" data-action="setup:step:map" data-setup-crumb="map">3 · BATTLEFIELD</button>
          </nav>
          <div class="setup-wallet">
            <span class="meta-chip">🏆 ${save.missionsWon} VICTORIES</span>
            <span class="meta-chip">◈ ${save.chips} CHIPS</span>
            <span class="meta-chip">🎟 ${save.tickets || 0} TICKETS</span>
          </div>
        </header>

        <div class="setup-shell">
          <aside class="setup-rail" aria-label="Game modes">
            <div class="rail-head"><span class="eyebrow">CHOOSE A MODE</span><strong>${SETUP_MODES.length} WAYS TO PLAY</strong></div>
            <div class="rail-scroll" data-setup-rail>${this.railHtml()}</div>
            <div class="rail-foot">
              <span>Every mode keeps its own saved setup. Switch freely — nothing is lost.</span>
            </div>
          </aside>

          <main class="setup-main" data-setup-main>
            <section class="setup-hero" data-setup-hero>${this.heroHtml()}</section>
            <div class="setup-body">
              <div data-setup-panel></div>
              <div class="hidden" data-setup-map></div>
            </div>
          </main>
        </div>

        <footer class="setup-footer">
          <div class="setup-readout">
            <span class="eyebrow" data-setup-note></span>
            <strong data-setup-summary></strong>
          </div>
          <span class="setup-verdict" data-setup-verdict></span>
          <button class="btn" data-action="setup:back" data-setup-back>MAIN MENU</button>
          <button class="btn primary" data-action="setup:launch" data-setup-launch>DEPLOY</button>
        </footer>
      </div>`;
  }

  // ── panels ───────────────────────────────────────────────────────────────
  createPanel() {
    const game = this.game, mode = this.mode;
    if (mode.panel === 'arena') {
      game.arenaConfig = { ...DEFAULT_ARENA_CONFIG, ...game.arenaConfig };
      return new ArenaSelect({
        root: null, audio: this.audio, config: game.arenaConfig, embedded: true,
        onChange: config => { game.arenaConfig = { ...config }; this.refreshFooter(); },
        onLaunch: config => game.startArenaMatch(config),
      });
    }
    if (mode.panel === 'blitz') {
      game.blitzConfig = { ...DEFAULT_BLITZ_CONFIG, ...game.blitzConfig };
      return new BlitzSelect({
        root: null, audio: this.audio, config: game.blitzConfig, embedded: true,
        onChange: config => { game.blitzConfig = { ...config }; this.refreshFooter(); },
        onLaunch: config => game.startBlitzMatch(config),
      });
    }
    if (mode.panel === 'campaign') return new CampaignPanel({ game, mode });
    game.selectedMode = mode.modeKey;
    return new SquadSetupPanel({ game, mode });
  }

  mountPanel() {
    const body = this.root.querySelector('[data-setup-panel]');
    if (!body) return;
    this.panel = this.createPanel();
    this.panel.mount(body);
    this.step = 'setup';
    this.renderStep();
  }

  // Re-render the active panel body only. The shell, and any WebGL context
  // hanging off it, survives untouched.
  refreshBody() {
    this.panel?.refresh?.();
    if (this.step === 'map') this.renderMapStep();
    this.refreshFooter();
  }

  // ── steps ────────────────────────────────────────────────────────────────
  // Both step containers stay in the document and are toggled, never replaced.
  // The garage's chassis preview owns a WebGL context bound to a live canvas;
  // tearing that canvas out on every step change would strand the renderer.
  goToStep(step) {
    const next = step === 'map' && !this.hasMapStep ? 'setup' : step;
    if (next === this.step) return;
    if (next === 'map' && !this.panel?.brief?.()?.ready) return;
    this.step = next;
    this.renderStep();
    const main = this.root.querySelector('[data-setup-main]');
    if (main) main.scrollTop = 0;
  }

  renderStep() {
    const panelBox = this.root.querySelector('[data-setup-panel]');
    const mapBox = this.root.querySelector('[data-setup-map]');
    const onMap = this.step === 'map';
    panelBox?.classList.toggle('hidden', onMap);
    mapBox?.classList.toggle('hidden', !onMap);
    for (const crumb of this.root.querySelectorAll('[data-setup-crumb]')) {
      const which = crumb.dataset.setupCrumb;
      crumb.classList.toggle('on', which === this.step);
      crumb.classList.toggle('done', which === 'mode' || (which === 'setup' && onMap));
      if (which === 'map') crumb.disabled = !this.hasMapStep;
    }
    if (onMap) this.renderMapStep();
    this.refreshFooter();
  }

  // One battlefield screen for every mode: a full-width showcase of whatever is
  // selected, with the alternatives underneath. Deathmatch maps bring painted
  // art, Crate Blitz lattices paint themselves, arenas fall back to their icon.
  renderMapStep() {
    const mapBox = this.root.querySelector('[data-setup-map]');
    if (!mapBox) return;
    const options = this.maps;
    if (!options.length) { mapBox.innerHTML = ''; return; }
    const selectedId = this.panel?.selectedMapId;
    const active = options.find(map => map.id === selectedId) || options[0];

    const art = map => map.art
      ? `<span class="map-art" style="background-image:linear-gradient(180deg,rgba(6,11,22,.1),rgba(6,11,22,.82)),url('${map.art}')"></span>`
      : map.paint ? '<canvas class="map-art-canvas" width="300" height="220" data-map-paint></canvas>'
      : '<span class="map-art blank"></span>';

    const choices = options.map(map => `
      <button class="map-choice ${map.id === active.id ? 'selected' : ''} ${map.warning ? 'warned' : ''}"
              data-action="setupmap:${map.id}" data-map-option="${map.id}" style="--map-accent:${map.accent}">
        <span class="map-choice-art">${art(map)}<i>${map.icon}</i></span>
        <span class="map-choice-copy">
          <small>${escapeHtml(map.tag)}</small>
          <strong>${escapeHtml(map.title)}</strong>
          <em>${escapeHtml(map.meta)}</em>
          ${map.warning ? `<u>${escapeHtml(map.warning)}</u>` : ''}
        </span>
      </button>`).join('');

    mapBox.innerHTML = `
      <section class="setup-block map-step">
        <header class="setup-block-head">
          <span class="eyebrow">STEP 3 · CHOOSE THE BATTLEFIELD</span>
          <strong>${options.length} AVAILABLE</strong>
        </header>
        <article class="map-showcase" style="--map-accent:${active.accent}">
          <div class="map-showcase-art">
            ${art(active)}
            <span class="map-showcase-icon">${active.icon}</span>
          </div>
          <div class="map-showcase-copy">
            <span class="eyebrow">${escapeHtml(active.tag)}</span>
            <h3>${escapeHtml(active.title)}</h3>
            <p>${escapeHtml(active.description)}</p>
            ${active.warning ? `<div class="map-warning">${escapeHtml(active.warning)}</div>` : ''}
            <div class="map-showcase-facts">
              ${active.facts.map(f => `<div class="hero-fact"><span>${f.k}</span><strong>${f.v}</strong></div>`).join('')}
            </div>
          </div>
        </article>
        <div class="map-choices">${choices}</div>
      </section>`;

    // Lattice previews can only be painted once their canvas is in the document.
    if (active.paint) {
      const canvas = mapBox.querySelector('.map-showcase-art [data-map-paint]');
      if (canvas) active.paint(canvas);
    }
    for (const button of mapBox.querySelectorAll('[data-map-option]')) {
      const map = options.find(entry => entry.id === button.dataset.mapOption);
      const canvas = button.querySelector('[data-map-paint]');
      if (map?.paint && canvas) map.paint(canvas);
    }
  }

  selectMap(id) {
    this.panel?.setMap?.(id);
    this.renderMapStep();
    this.refreshFooter();
  }

  refreshFooter() {
    const brief = this.panel?.brief?.();
    if (!brief) return;
    // On the setup step the primary button advances to the battlefield picker;
    // only the last step actually starts the match.
    const advancing = this.step === 'setup' && this.hasMapStep;
    const summary = this.root.querySelector('[data-setup-summary]');
    if (summary) summary.textContent = brief.summary;
    const note = this.root.querySelector('[data-setup-note]');
    if (note) note.textContent = brief.note || 'MATCH BRIEF';
    const verdict = this.root.querySelector('[data-setup-verdict]');
    if (verdict) {
      verdict.textContent = brief.blocked || (advancing ? 'SETUP COMPLETE · PICK A BATTLEFIELD' : 'READY TO DEPLOY');
      verdict.className = `setup-verdict ${brief.ready ? 'ready' : 'blocked'}`;
    }
    const launch = this.root.querySelector('[data-setup-launch]');
    if (launch) {
      launch.textContent = advancing ? 'NEXT ▶' : (brief.launchLabel || 'DEPLOY');
      launch.disabled = !brief.ready;
    }
    const back = this.root.querySelector('[data-setup-back]');
    if (back) back.textContent = this.step === 'map' ? '◀ BACK' : 'MAIN MENU';
  }

  selectMode(id) {
    const next = setupModeById(id);
    if (next.id === this.modeId) return;
    this.panel?.dispose?.();
    this.panel = null;
    this.modeId = next.id;

    const shell = this.root.querySelector('[data-setup-root]');
    if (!shell) { this.open(); return; }
    shell.style.setProperty('--mode', next.accent);
    shell.style.setProperty('--mode2', next.accent2);
    const rail = this.root.querySelector('[data-setup-rail]');
    if (rail) for (const node of rail.querySelectorAll('[data-rail-mode]')) node.classList.toggle('selected', node.dataset.railMode === next.id);
    const crumb = this.root.querySelector('[data-setup-crumb]');
    if (crumb) crumb.textContent = `2 · ${next.title}`;
    const hero = this.root.querySelector('[data-setup-hero]');
    if (hero) { hero.innerHTML = this.heroHtml(); hero.classList.remove('swap'); void hero.offsetWidth; hero.classList.add('swap'); }
    const main = this.root.querySelector('[data-setup-main]');
    if (main) main.scrollTop = 0;

    this.mountPanel();
    this.audio?.playMusic?.(next.music);
  }

  // The primary button: advance to the battlefield picker, or start the match.
  launch() {
    const brief = this.panel?.brief?.();
    if (brief && !brief.ready) return;
    if (this.step === 'setup' && this.hasMapStep) { this.goToStep('map'); return; }
    this.panel?.launch?.();
  }
  // The secondary button: back out of the map step, or leave for the main menu.
  back() {
    if (this.step === 'map') { this.goToStep('setup'); return false; }
    return true;   // caller takes us to the main menu
  }

  dispose() {
    this.panel?.dispose?.();
    this.panel = null;
  }
}
