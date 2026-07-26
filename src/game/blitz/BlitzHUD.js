// Crate Blitz HUD.
//
// The mode is elimination, so the readouts are lives-and-standing rather than
// score-and-clock: who is still breathing, how many lives they have left, what
// you are carrying, and — when you are out — who you are spectating.

import { BLITZ_POWERUPS } from '../../data/blitzPowerups.js';

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const clock = seconds => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const pips = (filled, total, max = 8) => {
  const shown = Math.min(max, Math.max(filled, total));
  let out = '';
  for (let i = 0; i < shown; i++) out += `<i class="${i < filled ? 'lit' : ''}"></i>`;
  return out;
};
const hearts = (left, total, max = 5) => {
  const shown = Math.min(max, Math.max(1, total));
  let out = '';
  for (let i = 0; i < shown; i++) out += `<i class="${i < left ? 'lit' : ''}"></i>`;
  return out;
};

export class BlitzHUD {
  constructor(mount = document.querySelector('#app')) {
    this.root = document.createElement('div');
    this.root.id = 'blitz-hud';
    this.root.className = 'arena-hud blitz-hud hidden';
    this.root.innerHTML = `
      <header class="blitz-topbar">
        <div class="blitz-arena-tag"><strong data-arena-name></strong><small data-mode-name></small></div>
        <div class="blitz-clock"><strong data-timer>00:00</strong><small data-alive>10 ALIVE</small></div>
        <div class="blitz-alert hidden" data-alert><strong>SUDDEN DEATH</strong><small>THE WALLS ARE COMING IN</small></div>
      </header>
      <aside class="blitz-roster" data-roster></aside>
      <div class="arena-killfeed" data-killfeed></div>
      <section class="blitz-vitals" data-vitals>
        <div class="blitz-identity">
          <span class="blitz-swatch" data-swatch></span>
          <div>
            <strong data-player-name>YOU</strong>
            <div class="blitz-lives" data-lives></div>
          </div>
        </div>
        <div class="blitz-loadout">
          <div class="blitz-stat"><span>CHARGES</span><div class="blitz-pips" data-charge-pips></div></div>
          <div class="blitz-stat"><span>BLAST</span><div class="blitz-pips" data-power-pips></div></div>
        </div>
        <div class="blitz-kit" data-kit></div>
      </section>
      <div class="blitz-spectate hidden" data-spectate>
        <span class="eyebrow">SPECTATING</span>
        <strong data-spectate-name></strong>
        <small>◀ ▶ / A · D TO CHANGE VIEW</small>
      </div>
      <div class="arena-respawn hidden" data-respawn>
        <span>BLOWN UP</span>
        <strong data-respawn-count>3</strong>
        <small data-respawn-note>REASSEMBLING…</small>
      </div>
      <div class="arena-banner hidden" data-banner><strong></strong><small></small></div>
      <section class="blitz-scoreboard hidden" data-scoreboard>
        <header><strong>DEMOLITION STANDINGS</strong><small data-scoreboard-rule></small></header>
        <table><thead><tr><th>#</th><th>DESTRUCTO</th><th>CREW</th><th>KILLS</th><th>DEATHS</th><th>LIVES</th></tr></thead><tbody data-scoreboard-body></tbody></table>
      </section>
      <div class="arena-controls">WASD / ARROWS MOVE · SPACE or F DROP A CHARGE · TAB STANDINGS · ESC PAUSE</div>`;
    mount.appendChild(this.root);
    this.el = {};
    for (const attribute of ['arena-name', 'mode-name', 'timer', 'alive', 'alert', 'roster', 'killfeed',
      'vitals', 'swatch', 'player-name', 'lives', 'charge-pips', 'power-pips', 'kit',
      'spectate', 'spectate-name', 'respawn', 'respawn-count', 'respawn-note', 'banner',
      'scoreboard', 'scoreboard-rule', 'scoreboard-body']) {
      this.el[attribute] = this.root.querySelector(`[data-${attribute}]`);
    }
    this.feed = [];
  }
  show(value = true) {
    this.root.classList.toggle('hidden', !value);
    document.body.classList.toggle('arena-mode', value);
  }
  setMatch({ arenaTitle, modeTitle }) {
    this.el['arena-name'].textContent = arenaTitle;
    this.el['mode-name'].textContent = modeTitle;
  }
  setPlayer({ name, colorCss, lives, livesLeft }) {
    this.el['player-name'].textContent = name;
    this.el.swatch.style.background = colorCss;
    this.el.lives.innerHTML = hearts(livesLeft, lives);
  }
  setClock(seconds) { this.el.timer.textContent = clock(seconds); }
  setAlive(count, total) { this.el.alive.textContent = `${count} / ${total} ALIVE`; }

  // Live roster rail: every Destructo, their paint, their crew and their lives.
  setRoster(rows) {
    const markup = rows.map(row => `
      <div class="blitz-roster-row ${row.eliminated ? 'out' : ''} ${row.isPlayer ? 'you' : ''}" style="--who:${row.colorCss}">
        <i class="dot"></i>
        <span>${escapeHtml(row.name)}</span>
        ${row.crewName ? `<em>${escapeHtml(row.crewName)}</em>` : ''}
        <b>${row.eliminated ? 'OUT' : '✚'.repeat(Math.max(0, row.livesLeft))}</b>
      </div>`).join('');
    if (markup === this._rosterKey) return;
    this._rosterKey = markup;
    this.el.roster.innerHTML = markup;
  }

  setLoadout(unit) {
    this.el['charge-pips'].innerHTML = pips(Math.max(0, unit.charges - unit.chargesLive), unit.charges);
    this.el['power-pips'].innerHTML = pips(unit.power, unit.power);
    this.el.lives.innerHTML = hearts(unit.livesLeft, unit.lives);
    const kit = [];
    if (unit.plates > 0) kit.push(this.badge('shield', unit.plates));
    if (unit.kick) kit.push(this.badge('kick'));
    if (unit.speedStacks > 0) kit.push(this.badge('speed', unit.speedStacks));
    const markup = kit.join('');
    if (markup === this._kitKey) return;
    this._kitKey = markup;
    this.el.kit.innerHTML = markup || '<span class="blitz-kit-empty">NO UPGRADES YET</span>';
  }
  // The same SVG badge the setup screen and the pickup banner use.
  badge(id, count = 0) {
    const def = BLITZ_POWERUPS[id];
    if (!def) return '';
    return `<span class="blitz-badge" style="--pu:${def.css}" title="${escapeHtml(def.name)}">${def.svg}${count > 1 ? `<b>×${count}</b>` : ''}</span>`;
  }

  setSuddenDeath(active) { this.el.alert.classList.toggle('hidden', !active); }
  setRespawn(seconds, note = 'REASSEMBLING…') {
    const active = seconds !== null && seconds !== undefined;
    this.el.respawn.classList.toggle('hidden', !active);
    if (active) {
      this.el['respawn-count'].textContent = Math.max(0, Math.ceil(seconds));
      this.el['respawn-note'].textContent = note;
    }
  }
  // Spectator mode: the vitals panel is meaningless once you are out, so it is
  // swapped for who you are watching.
  setSpectating(name) {
    const active = Boolean(name);
    this.el.spectate.classList.toggle('hidden', !active);
    this.el.vitals.classList.toggle('hidden', active);
    if (active) this.el['spectate-name'].textContent = name;
  }
  setScoreboard(rows, visible, note = '') {
    this.el.scoreboard.classList.toggle('hidden', !visible);
    if (!visible) return;
    const markup = rows.map((row, index) => `
      <tr class="${row.isPlayer ? 'you' : ''} ${row.eliminated ? 'out' : ''}">
        <td>${index + 1}</td>
        <td style="color:${row.colorCss}">${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.crewName)}</td>
        <td>${row.kills}</td>
        <td>${row.deaths}</td>
        <td>${row.eliminated ? '—' : row.livesLeft}</td>
      </tr>`).join('');
    if (markup === this._scoreboardKey) return;
    this._scoreboardKey = markup;
    this.el['scoreboard-rule'].textContent = note;
    this.el['scoreboard-body'].innerHTML = markup;
  }
  kill(killerName, victimName, cause, killerColor = '#fff', victimColor = '#fff') {
    const row = document.createElement('div');
    row.className = 'arena-kill';
    row.innerHTML = `<span style="color:${killerColor}">${escapeHtml(killerName)}</span><i>${escapeHtml(cause)}</i><span style="color:${victimColor}">${escapeHtml(victimName)}</span>`;
    this.el.killfeed.appendChild(row);
    this.feed.push(row);
    if (this.feed.length > 5) this.feed.shift().remove();
    const timer = setTimeout(() => { row.remove(); this.feed = this.feed.filter(item => item !== row); }, 5200);
    this.timers = this.timers || new Set();
    this.timers.add(timer);
  }
  banner(title, subtitle = '', duration = 2400) {
    const banner = this.el.banner;
    banner.querySelector('strong').textContent = title;
    banner.querySelector('small').innerHTML = subtitle;
    banner.classList.remove('hidden', 'pop');
    void banner.offsetWidth;
    banner.classList.add('pop');
    clearTimeout(this._bannerTimer);
    if (duration > 0) this._bannerTimer = setTimeout(() => banner.classList.add('hidden'), duration);
  }
  // Pickups get the badge in the banner so the icon and the name are learned
  // together the first time you grab one.
  pickupBanner(def) {
    this.banner(def.name, `<span class="blitz-banner-badge" style="--pu:${def.css}">${def.svg}</span>${escapeHtml(def.description)}`, 1400);
  }
  dispose() {
    clearTimeout(this._bannerTimer);
    for (const timer of this.timers || []) clearTimeout(timer);
    document.body.classList.remove('arena-mode');
    this.root.remove();
  }
}

export const blitzHudInternals = { clock, pips, hearts };
