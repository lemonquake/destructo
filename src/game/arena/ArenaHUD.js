// Heads-up display for the Destruct-Auto arena. Owns its own DOM so nothing
// here collides with the infantry HUD in index.html.

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const clock = seconds => {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export class ArenaHUD {
  constructor(mount = document.querySelector('#app')) {
    this.mount = mount;
    this.root = document.createElement('div');
    this.root.id = 'arena-hud';
    this.root.className = 'arena-hud hidden';
    this.root.innerHTML = `
      <header class="arena-topbar">
        <div class="arena-score side-a"><span data-name-a>CRUSHERS</span><strong data-score-a>0</strong></div>
        <div class="arena-clock">
          <small data-rule>5 MINUTES</small>
          <strong data-timer>05:00</strong>
          <em data-arena-name></em>
        </div>
        <div class="arena-score side-b"><strong data-score-b>0</strong><span data-name-b>WRECKERS</span></div>
      </header>
      <aside class="arena-standings hidden" data-standings></aside>
      <div class="arena-killfeed" data-killfeed></div>
      <div class="arena-crosshair" data-crosshair><i></i><i></i><i></i><i></i><b></b></div>
      <section class="arena-vitals">
        <div class="arena-vehicle">
          <span class="arena-vehicle-icon" data-vehicle-icon>🛻</span>
          <div>
            <strong data-vehicle-name>CRATE CRUSHER</strong>
            <div class="arena-bar hp"><i data-hp-fill></i><span data-hp-label>210 / 210</span></div>
          </div>
        </div>
        <div class="arena-ultimate" data-ultimate>
          <span class="ult-key">Q</span>
          <div>
            <strong data-ult-name>QUAKE SLAM</strong>
            <div class="arena-bar ult"><i data-ult-fill></i><span data-ult-label>READY</span></div>
          </div>
        </div>
        <div class="arena-speedo">
          <strong data-speed>0</strong><small>KM/H</small>
          <span class="boost-pip" data-boost>NITRO · SHIFT</span>
        </div>
      </section>
      <div class="arena-respawn hidden" data-respawn>
        <span>WRECKED</span>
        <strong data-respawn-count>3</strong>
        <small data-respawn-note>ROLLING OUT A FRESH CHASSIS…</small>
      </div>
      <div class="arena-damage-numbers" data-damage-numbers aria-hidden="true"></div>
      <div class="arena-banner hidden" data-banner><strong></strong><small></small></div>
      <section class="arena-scoreboard hidden" data-scoreboard>
        <header><strong>DRIVER STANDINGS</strong><small data-scoreboard-rule></small></header>
        <table><thead><tr><th>#</th><th>DRIVER</th><th>DESTRUCT-AUTO</th><th>CREW</th><th>KILLS</th><th>WRECKS</th></tr></thead><tbody data-scoreboard-body></tbody></table>
      </section>
      <div class="arena-controls" data-controls>WASD DRIVE · MOUSE AIM · LMB SMG · Q ULTIMATE · SHIFT NITRO · SPACE HANDBRAKE · TAB SCORES · ESC PAUSE</div>`;
    mount.appendChild(this.root);
    this.el = {};
    for (const key of ['name-a', 'score-a', 'name-b', 'score-b', 'rule', 'timer', 'arena-name', 'standings', 'killfeed',
      'crosshair', 'vehicle-icon', 'vehicle-name', 'hp-fill', 'hp-label', 'ultimate', 'ult-name', 'ult-fill',
      'ult-label', 'speed', 'boost', 'respawn', 'respawn-count', 'respawn-note', 'banner', 'controls',
      'scoreboard', 'scoreboard-rule', 'scoreboard-body', 'damage-numbers']) {
      this.el[key] = this.root.querySelector(`[data-${key}]`);
    }
    this.feed = [];
  }
  show(value = true) {
    this.root.classList.toggle('hidden', !value);
    document.body.classList.toggle('arena-mode', value);
  }
  setMatch({ mapTitle, ruleTitle, teamMode, teamNames }) {
    this.el['arena-name'].textContent = mapTitle;
    this.el.rule.textContent = ruleTitle;
    this.teamMode = teamMode;
    this.root.classList.toggle('ffa', teamMode !== 'teams');
    this.el.standings.classList.toggle('hidden', teamMode === 'teams');
    if (teamNames) {
      this.el['name-a'].textContent = teamNames.A;
      this.el['name-b'].textContent = teamNames.B;
    }
  }
  setScore(a, b) {
    this.el['score-a'].textContent = a;
    this.el['score-b'].textContent = b;
  }
  setStandings(rows) {
    if (this.teamMode === 'teams') return;
    this.el.standings.innerHTML = rows.map((row, index) => `
      <div class="standing ${row.isPlayer ? 'you' : ''}">
        <i>${index + 1}</i>
        <span style="--driver:${row.color}">${escapeHtml(row.name)}</span>
        <small>${escapeHtml(row.vehicle)}</small>
        <strong>${row.score}</strong>
      </div>`).join('');
  }
  setTimer(text) { this.el.timer.textContent = text; }
  setClock(seconds) { this.setTimer(clock(seconds)); }
  setTarget(remaining) { this.setTimer(remaining === null ? '--' : `${remaining} TO GO`); }
  setVehicle(autoDef) {
    this.el['vehicle-icon'].textContent = autoDef.icon;
    this.el['vehicle-name'].textContent = autoDef.name;
    this.el['ult-name'].textContent = autoDef.ultimate.name;
  }
  setHealth(hp, maxHp) {
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    this.el['hp-fill'].style.width = `${pct}%`;
    this.el['hp-label'].textContent = `${Math.max(0, Math.ceil(hp))} / ${maxHp}`;
    this.el['hp-fill'].parentElement.classList.toggle('low', pct < 25);
  }
  setUltimate(cooldown, total) {
    const ready = cooldown <= 0;
    this.el.ultimate.classList.toggle('ready', ready);
    this.el['ult-fill'].style.width = ready ? '100%' : `${Math.max(0, (1 - cooldown / total) * 100)}%`;
    this.el['ult-label'].textContent = ready ? 'READY · Q' : `${cooldown.toFixed(1)}s`;
  }
  setSpeed(speed, boosting) {
    this.el.speed.textContent = Math.round(Math.abs(speed) * 3.6);
    this.el.boost.classList.toggle('active', Boolean(boosting));
  }
  setCrosshair(overEnemy) { this.el.crosshair.classList.toggle('enemy', Boolean(overEnemy)); }
  setRespawn(seconds) {
    const active = seconds !== null && seconds !== undefined;
    this.el.respawn.classList.toggle('hidden', !active);
    if (active) this.el['respawn-count'].textContent = Math.max(0, Math.ceil(seconds));
  }
  // Full standings table, held open while TAB is down.
  setScoreboard(rows, visible, ruleNote = '') {
    this.el.scoreboard.classList.toggle('hidden', !visible);
    if (!visible || this._scoreboardKey === JSON.stringify(rows)) return;
    this._scoreboardKey = JSON.stringify(rows);
    this.el['scoreboard-rule'].textContent = ruleNote;
    this.el['scoreboard-body'].innerHTML = rows.map((row, index) => `
      <tr class="${row.isPlayer ? 'you' : ''}">
        <td>${index + 1}</td>
        <td style="color:${row.color}">${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.vehicle)}</td>
        <td>${escapeHtml(row.crew)}</td>
        <td>${row.kills}</td>
        <td>${row.deaths}</td>
      </tr>`).join('');
  }
  // Floating combat numbers, spawned at a projected screen position — the same
  // idea as the infantry HUD, but on this mode's own layer so the two never
  // fight over one container.
  damageNumber(x, y, text, kind = 'hurt') {
    const container = this.el['damage-numbers'];
    if (!container) return;
    if (container.children.length > 40) container.firstChild.remove();
    const span = document.createElement('span');
    span.className = `dmg ${kind}`;
    span.textContent = text;
    span.style.left = `${x + (Math.random() - 0.5) * 26}px`;
    span.style.top = `${y}px`;
    container.appendChild(span);
    setTimeout(() => span.remove(), 850);
  }
  kill(killerName, victimName, weapon, killerColor = '#fff', victimColor = '#fff') {
    const row = document.createElement('div');
    row.className = 'arena-kill';
    row.innerHTML = `<span style="color:${killerColor}">${escapeHtml(killerName)}</span><i>${escapeHtml(weapon)}</i><span style="color:${victimColor}">${escapeHtml(victimName)}</span>`;
    this.el.killfeed.appendChild(row);
    this.feed.push(row);
    if (this.feed.length > 5) this.feed.shift().remove();
    setTimeout(() => { row.remove(); this.feed = this.feed.filter(item => item !== row); }, 5200);
  }
  banner(title, subtitle = '', duration = 2600) {
    const banner = this.el.banner;
    banner.querySelector('strong').textContent = title;
    banner.querySelector('small').textContent = subtitle;
    banner.classList.remove('hidden', 'pop');
    void banner.offsetWidth;
    banner.classList.add('pop');
    clearTimeout(this._bannerTimer);
    if (duration > 0) this._bannerTimer = setTimeout(() => banner.classList.add('hidden'), duration);
  }
  dispose() {
    clearTimeout(this._bannerTimer);
    document.body.classList.remove('arena-mode');
    this.root.remove();
  }
}

export const arenaHudInternals = { clock };
