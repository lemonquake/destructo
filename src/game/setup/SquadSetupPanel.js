// ── SQUAD SETUP PANEL ───────────────────────────────────────────────────────
// The infantry body of the centralized Game Setup screen: the alliance board
// for Deathmatch, the free-for-all contender grid for Tower Dominion, the map
// picker, and the full match-rules desk.
//
// It renders into a container the shell owns and speaks the same data-action /
// data-setup-rule vocabulary Game.js already delegates on #screen, so every
// control keeps working through one click listener instead of a hundred.

import { TEAM_COLORS, MAX_PLAYERS, CLASSES, WEAPONS, normalizeAllianceGroups, allianceSummary } from '../../data/gameData.js';
import { ALL_MAPS, mapsForMode } from '../../data/maps.js';
import { SKIN_TEXTURES, paintSkinPreview, MAP_PREVIEW_PAINTERS, paintMapPreview } from '../Materials.js';
import { CAPTURE_SECONDS } from '../DominationSystem.js';

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const hex = c => `#${c.toString(16).padStart(6, '0')}`;

// Tower Dominion locks the squad: four commandos with assault rifles, no picks.
export const DOMINATION_RULES = Object.freeze({ squadSize: 4, reinforcementSeconds: 3, classId: 'commando', weaponId: 'rifle' });

// Four one-click squad templates for the starting-unit slots.
export const SQUAD_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'balanced', title: 'BALANCED', note: 'Scout point, medic mid', classes: ['scout', 'scout', 'medic', 'gunner', 'commando'] }),
  Object.freeze({ id: 'assault', title: 'ASSAULT', note: 'Push and never stop', classes: ['commando', 'gunner', 'gunner', 'explosives', 'officer'] }),
  Object.freeze({ id: 'recon', title: 'RECON', note: 'Fast, quiet, lethal', classes: ['scout', 'sniper', 'saboteur', 'scout', 'medic'] }),
  Object.freeze({ id: 'siege', title: 'SIEGE', note: 'Dig in and grind', classes: ['heavy', 'engineer', 'medic', 'explosives', 'gunner'] }),
]);

// Chip rows read better than dropdowns and match the vehicle/lattice panels.
const chipRow = (key, values, current, label = v => v) => values.map(value => `
  <button class="arena-chip small ${String(current) === String(value) ? 'selected' : ''}" data-action="setup:rule:${key}:${value}">
    <strong>${label(value)}</strong>
  </button>`).join('');

export class SquadSetupPanel {
  constructor({ game, mode }) {
    this.game = game;
    this.mode = mode;
    this.modeId = mode.modeKey || 'deathmatch';
  }

  get domination() { return this.modeId === 'domination'; }
  get squadSize() { return this.domination ? DOMINATION_RULES.squadSize : this.game.matchSetup.squadSize; }
  get mapLimit() { return Math.min(MAX_PLAYERS, ALL_MAPS[this.game.selectedMap]?.maxTeams || MAX_PLAYERS); }
  get humanIndex() { return this.game.setup.findIndex(t => t.isHuman); }
  get shape() { return this.domination ? `${this.game.setup.length}-WAY FFA` : allianceSummary(this.game.setup); }

  mount(container) {
    this.container = container;
    this.render();
  }
  refresh() { this.render(); }

  // ── the brief the shell footer shows and gates the launch button on ───────
  brief() {
    const game = this.game;
    const withinMapLimit = game.setup.length <= this.mapLimit;
    const hostile = game.hasHostileSetup();
    const observerOnly = this.humanIndex < 0;
    const blocked = !withinMapLimit
      ? `REMOVE ${game.setup.length - this.mapLimit} TEAM${game.setup.length - this.mapLimit > 1 ? 'S' : ''} — THIS MAP SEATS ${this.mapLimit}`
      : !hostile ? 'ALL TEAMS ARE ALLIED — SPLIT THE ALLIANCES BEFORE DEPLOYING' : null;
    const rules = this.domination
      ? `FIRST TO ${game.matchSetup.maxScore} · ${ALL_MAPS[game.selectedMap].towerCount} TOWERS`
      : `${game.matchSetup.matchMinutes} MIN TO SUDDEN DEATH · ${this.squadSize} STARTING UNIT${this.squadSize > 1 ? 'S' : ''}`;
    return {
      summary: `${this.mode.title} · ${this.shape} · ${rules} · ${ALL_MAPS[game.selectedMap].title}`,
      blocked,
      ready: !blocked,
      launchLabel: observerOnly ? 'WATCH AI BATTLE' : this.mode.launchLabel,
      note: observerOnly ? 'OBSERVER-ONLY MATCH' : `PLAYING AS ${escapeHtml(game.setup[this.humanIndex]?.name || 'YOU').toUpperCase()}`,
    };
  }

  launch() {
    if (!this.brief().ready) return;
    this.game.startMission('skirmish');
  }
  dispose() {}

  // ── the map step ─────────────────────────────────────────────────────────
  // Handed to the shell, which renders every mode's battlefields with one
  // uniform showcase instead of four different map grids.
  get selectedMapId() { return this.game.selectedMap; }
  setMap(id) {
    if (mapsForMode(this.modeId).some(map => map.id === id)) this.game.selectedMap = id;
  }
  mapOptions() {
    const teams = this.game.setup.length;
    return mapsForMode(this.modeId).map(map => {
      const seats = map.maxTeams || MAX_PLAYERS;
      // Most battlefields show their signature texture asset. Candyland has no
      // raster asset — its entire surface is painted at runtime — so it paints
      // its own card instead, through the shell's existing `paint` hook.
      const painted = Boolean(MAP_PREVIEW_PAINTERS[map.id]);
      return {
        id: map.id, title: map.title, tag: map.tag, description: map.description,
        icon: map.icon, accent: map.accent,
        art: painted ? null : `/assets/textures/maps/${map.texture}.webp`,
        paint: painted ? canvas => paintMapPreview(canvas, map.id) : null,
        warning: teams > seats ? `SEATS ${seats} · YOU HAVE ${teams} TEAMS` : null,
        meta: `${map.weather}${map.towerCount ? ` · ${map.towerCount} TOWERS` : ` · ${map.sizeClass}`}`,
        facts: [
          { k: 'WEATHER', v: map.weather },
          map.towerCount ? { k: 'TOWERS', v: `${map.towerCount} PEDESTALS` } : { k: 'SCALE', v: map.sizeClass },
          { k: 'SEATS', v: `${seats} TEAMS` },
          { k: 'DEPLOYING', v: `${teams} TEAM${teams > 1 ? 'S' : ''}` },
        ],
      };
    });
  }

  // ── one card per team: controller, name, aura, uniform, alliance mover ────
  teamCard(team, index) {
    const color = TEAM_COLORS[team.colorIndex % TEAM_COLORS.length];
    const uniform = SKIN_TEXTURES[team.uniformIndex || 0];
    const human = Boolean(team.isHuman);
    return `
      <div class="team-card ${human ? 'human-card' : ''}" style="--team:${hex(color.color)}">
        <div class="team-card-top">
          <button class="role-switch ${human ? 'human' : 'cpu'}" data-action="setup:role:${index}" title="Switch between player and AI control">
            <span>${human ? 'PLAYER' : 'AI'}</span><small>${human ? 'CONTROL' : 'AUTOPILOT'}</small>
          </button>
          <input class="team-name" data-team-name="${index}" maxlength="14" value="${escapeHtml(team.name)}" aria-label="Team name">
        </div>
        <div class="team-card-looks">
          <button class="aura-btn" data-action="teamcolor:${index}" style="--aura:${hex(color.color)}" title="Change aura color">
            <i></i><span>${color.name.toUpperCase()}</span>
          </button>
          <button class="uniform-preview" data-action="teamuniform:${index}" title="Change uniform texture">
            <canvas width="128" height="128" data-skin="${uniform}"></canvas><span>${uniform.toUpperCase()}</span>
          </button>
        </div>
        ${this.domination ? '' : `
        <div class="ally-move">
          <button class="ally-arrow" data-action="setup:alliance:${index}:-1" title="Move to the previous alliance">◀</button>
          <span>ALLIANCE ${String.fromCharCode(65 + team.group)}</span>
          <button class="ally-arrow" data-action="setup:alliance:${index}:1" title="Move right — past the last column founds a new alliance">▶</button>
        </div>`}
      </div>`;
  }

  rosterHtml() {
    const game = this.game;
    if (this.domination) {
      return `
        <div class="ffa-banner">
          <strong>${game.setup.length}-WAY FREE FOR ALL</strong>
          <span>Every team fights alone in Tower Dominion — hold the pedestals to score.</span>
        </div>
        <div class="ffa-grid">${game.setup.map((t, i) => this.teamCard(t, i)).join('')}</div>`;
    }
    const groups = [...new Set(game.setup.map(t => t.group))].sort((a, b) => a - b);
    const columns = groups.map(group => {
      const members = game.setup.map((t, i) => ({ t, i })).filter(({ t }) => t.group === group);
      return `
        <div class="alliance-column">
          <header class="alliance-head">
            <strong>ALLIANCE ${String.fromCharCode(65 + group)}</strong>
            <small>${members.length} TEAM${members.length > 1 ? 'S' : ''} · ${members.length * this.squadSize} STARTING UNITS</small>
          </header>
          ${members.map(({ t, i }) => this.teamCard(t, i)).join('')}
        </div>`;
    }).join('');
    const ghost = groups.length < Math.min(game.setup.length, 5)
      ? `<div class="alliance-column ghost"><header class="alliance-head"><strong>+ NEW ALLIANCE</strong></header><p>Push a team ▶ past the last column to found its own alliance.</p></div>`
      : '';
    return `<div class="alliance-board">${columns}${ghost}</div>`;
  }

  // Every starting slot shows the class it will spawn AND what that class brings.
  squadHtml() {
    const game = this.game;
    if (this.domination) {
      return Array.from({ length: DOMINATION_RULES.squadSize }, (_, i) => `
        <div class="squad-slot locked">
          <span class="slot-index">${i + 1}</span>
          <select disabled><option>COMMANDO</option></select>
          <em>160 HP · ASSAULT RIFLE · LOCKED</em>
        </div>`).join('');
    }
    const options = current => Object.entries(CLASSES)
      .map(([id, c]) => `<option value="${id}" ${current === id ? 'selected' : ''}>${c.name.toUpperCase()}</option>`).join('');
    return Array.from({ length: this.squadSize }, (_, i) => {
      const id = game.matchSetup.startingClasses[i] || 'scout';
      const cls = CLASSES[id] || CLASSES.scout;
      const weapon = WEAPONS[cls.weapon];
      return `
        <div class="squad-slot">
          <span class="slot-index">${i + 1}</span>
          <select data-starting-class="${i}" aria-label="Starting unit ${i + 1}">${options(id)}</select>
          <em>${cls.hp} HP · ${escapeHtml(weapon?.name || cls.weapon).toUpperCase()} · Q ${escapeHtml(cls.ability).toUpperCase()}</em>
        </div>`;
    }).join('');
  }

  rulesHtml() {
    const rules = this.game.matchSetup;
    const templates = SQUAD_TEMPLATES.map(t => `
      <button class="arena-chip small ${this.templateMatches(t) ? 'selected' : ''}" data-action="setup:squad:${t.id}" ${this.domination ? 'disabled' : ''}>
        <strong>${t.title}</strong><small>${t.note}</small>
      </button>`).join('');
    const modeRules = this.domination ? `
      <div class="arena-rule-block wide">
        <span class="eyebrow">SCORE TO WIN · <b>${rules.maxScore} POINTS</b></span>
        <div class="arena-chip-row wrap">${chipRow('maxScore', [50, 100, 150, 250, 500], rules.maxScore)}</div>
      </div>
      <div class="arena-rule-block wide">
        <span class="eyebrow">RESPAWN DELAY · <b>${rules.dominationRespawnSeconds}s</b></span>
        <div class="arena-chip-row wrap">${chipRow('dominationRespawnSeconds', [3, 5, 8, 12], rules.dominationRespawnSeconds, v => `${v} SEC`)}</div>
      </div>
      <div class="arena-rule-block wide">
        <span class="eyebrow">LOCKED BY THE MODE</span>
        <div class="rule-locked"><span>CAPTURE ${CAPTURE_SECONDS}s</span><span>ENDLESS REINFORCEMENTS</span><span>4 COMMANDOS</span><span>NO D-BUILDER</span></div>
      </div>` : `
      <div class="arena-rule-block wide">
        <span class="eyebrow">SUDDEN DEATH AT · <b>${rules.matchMinutes} MIN</b></span>
        <div class="arena-chip-row wrap">${chipRow('matchMinutes', [3, 5, 8, 12], rules.matchMinutes, v => `${v} MIN`)}</div>
      </div>
      <div class="arena-rule-block wide">
        <span class="eyebrow">REINFORCEMENTS</span>
        <div class="arena-chip-row wrap">
          <button class="arena-chip small ${rules.reinforcements ? 'selected' : ''}" data-action="setup:rule:reinforcements:toggle">
            <strong>${rules.reinforcements ? 'ON' : 'OFF'}</strong><small>${rules.reinforcements ? 'Fallen squads come back' : 'One life per unit'}</small>
          </button>
          ${chipRow('reinforcementSeconds', [5, 10, 15, 25, 40], rules.reinforcementSeconds, v => `${v} SEC`)}
        </div>
      </div>`;

    return `
      <div class="arena-rule-block wide">
        <span class="eyebrow">STARTING UNITS PER TEAM · <b>${this.squadSize}</b></span>
        <div class="arena-chip-row wrap">${this.domination
          ? '<div class="rule-locked"><span>4 COMMANDOS · LOCKED BY TOWER DOMINION</span></div>'
          : chipRow('squadSize', [1, 2, 3, 4, 5], this.game.matchSetup.squadSize)}</div>
      </div>
      <div class="arena-rule-block wide">
        <span class="eyebrow">SQUAD TEMPLATE</span>
        <div class="arena-chip-row wrap">${templates}</div>
      </div>
      <div class="arena-rule-block wide">
        <span class="eyebrow">THE SQUAD YOU SPAWN WITH</span>
        <div class="squad-slots">${this.squadHtml()}</div>
      </div>
      <div class="arena-rule-block wide">
        <span class="eyebrow">STARTING AMMO · <b>${rules.startingAmmo}</b></span>
        <div class="arena-chip-row wrap">${chipRow('startingAmmo', [30, 60, 90, 150, 240], rules.startingAmmo)}</div>
      </div>
      <div class="arena-rule-block wide">
        <span class="eyebrow">CPU SKILL</span>
        <div class="arena-chip-row wrap">
          ${chipRow('aiDifficulty', ['rookie', 'regular', 'veteran'], rules.aiDifficulty, v => v.toUpperCase())}
        </div>
      </div>
      ${modeRules}`;
  }

  templateMatches(template) {
    if (this.domination) return false;
    const current = this.game.matchSetup.startingClasses;
    return template.classes.every((id, i) => current[i] === id);
  }

  supplyHtml() {
    const game = this.game;
    if (game.selectedMap === 'crown') {
      return `<strong>1 SUMMIT DROP ZONE · ENTIRE MAP</strong><span>3 COMMON CRATES EVERY 1–5 SECONDS</span><span>CONTROL THE CROWN OR GET BURIED IN IT</span>`;
    }
    return this.domination
      ? `<strong>3 NEUTRAL CRATE RELAYS</strong><span>NO D-BUILDERS · FIELD DROPS ONLY</span><span>${ALL_MAPS[game.selectedMap].towerCount} TOWERS · FIRST TO ${game.matchSetup.maxScore}</span>`
      : `<strong>${game.setup.length} TEAM DEPOTS + 4 RARE RELAYS</strong><span>7 COMMON CRATES AT EVERY DROP SPOT</span><span>THEN NORMAL TIMERS AND CAPS</span>`;
  }

  render() {
    const game = this.game;
    if (this.domination) game.setup.forEach((team, index) => { team.group = index; });
    else normalizeAllianceGroups(game.setup);

    const view = game.captureSetupView();
    const brief = this.brief();
    const observerOnly = this.humanIndex < 0;

    this.container.innerHTML = `
      <div class="setup-panel squad-panel">
        <section class="setup-block">
          <header class="setup-block-head">
            <span class="eyebrow">ROSTER · <b>${game.setup.length} / ${this.mapLimit} TEAMS</b></span>
            <strong>${this.shape}</strong>
          </header>
          <div class="preset-strip">
            <button class="btn" data-action="setup:preset:duel">DUEL 1v1</button>
            <button class="btn" data-action="setup:preset:pairs">2v2 SQUADS</button>
            <button class="btn" data-action="setup:preset:classic">CLASSIC FFA</button>
            <button class="btn" data-action="setup:preset:chaos">CHAOS ×8</button>
            <button class="btn" data-action="setup:randomize">RANDOMIZE LOOKS</button>
          </div>
          <div class="control-status ${observerOnly ? 'observer' : 'playing'}">
            <strong>${brief.note}</strong>
            <span>${observerOnly
              ? 'All teams are AI controlled · broadcast opens at kickoff'
              : 'Click another AI badge to transfer player control · click PLAYER again to observe'}</span>
          </div>
          <div class="setup-list">${this.rosterHtml()}</div>
          <div class="roster-actions">
            <button class="btn" data-action="setup:remove" ${game.setup.length <= 2 ? 'disabled' : ''}>− TEAM</button>
            <button class="btn" data-action="setup:add" ${game.setup.length >= this.mapLimit ? 'disabled' : ''}>+ TEAM</button>
          </div>
        </section>

        <aside class="setup-block rules-block">
          <header class="setup-block-head">
            <span class="eyebrow">MATCH RULES</span>
            <strong>${this.domination ? 'DOMINION LAW' : 'BATTLE LAW'}</strong>
          </header>
          <div class="arena-rules stacked">${this.rulesHtml()}</div>
          <div class="supply-plan">${this.supplyHtml()}</div>
        </aside>
      </div>`;

    this.container.querySelectorAll('canvas[data-skin]').forEach(canvas => paintSkinPreview(canvas, canvas.dataset.skin));
    game.restoreSetupView(view);
  }
}
