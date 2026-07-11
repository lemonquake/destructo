export class HUD {
  constructor() {
    this.root = document.querySelector('#hud');
    this.el = Object.fromEntries(['hp-fill', 'mp-fill', 'hp-title', 'hp-label', 'mp-label', 'shield-label', 'weapon-name', 'ammo-label', 'ability-label', 'boss-fill', 'squad-readout', 'chips-readout', 'interaction', 'toast', 'turret-warning', 'builder-cells', 'objective', 'crosshair', 'info-panel', 'damage-numbers', 'buff-readout', 'squad-stats'].map(id => [id, document.querySelector(`#${id}`)]));
    this.toastTimer = 0;
    this.el['builder-cells'].innerHTML = '<i></i>'.repeat(12);
    this._squadKey = ''; this._squadCards = new Map();
    this.tips = [
      "Placing a Crate on top of a Crate (2 high) will create a Normal Destructo teammate!",
      "Stacking 3 Crates vertically creates an Elite Destructo with better stats and gear!",
      "Stacking 2 columns of 3 Crates (6 Crates total) builds a Special Destructo!",
      "To build a Weapon: Place Crates in flat or step patterns on the D-Builder pad.",
      "Duo Horizontal Crates = Grenade Launcher. Duo Diagonal Crates = Uzi Submachine Gun.",
      "Trio Flat Crates = Assault Rifle. Quad Flat Crates = Heavy Machinegun.",
      "Step Adj. Crates = SMG. Step Diag. Crates = Officer Carbine. Tall Step Adj. = Proximity Mines.",
      "Pyramid Crates = Tesla Cannon. Double Step Adj. = Rocket Launcher. Double Step Diag. = Plasma Rifle.",
      "Twin Towers Crates (two 3-high columns) = Dual Shotguns.",
      "Heavy Step Adj. (3 & 2 crates adjacent) = Flamethrower. Heavy Step Diag. (3 & 2 diagonal) = Hyper Railgun.",
      "Sloped Roof (3, 2, and 1 crates) = Cryo Freeze Ray.",
      "To build a Battle Tank: Stack Crates to fill the entire 3x2x2 cube (12 Crates total)!",
      "Need health, shield, or ammo? Open a loose Crate in the field by hitting F!",
      "Press P to switch to First-Person Shooter mode! Look around and target enemies directly!",
      "Crate Magnetism: Hold a Crate and get near the D-Builder to snap it to a cell.",
      "Veteran AI will persistently build a Battle Tank after 2 minutes of play to win the match!"
    ];
    this.currentTipIndex = 0;
    this.tipTimer = null;
    this.initTips();
  }
  // heal-targeting crosshair: big green reticle with the red cross center
  setHealMode(on) { this.el.crosshair.classList.toggle('heal-mode', Boolean(on)); }
  setGrappleMode(on) { this.el.crosshair.classList.toggle('grapple-mode', Boolean(on)); }
  setTurretMode(on,kind='turret') { const c=this.el.crosshair;c.classList.toggle('turret-mode',Boolean(on));c.classList.toggle('bunker-mode',Boolean(on)&&kind==='bunker'); }
  setVehicleRole(role='none') { const c=this.el.crosshair;c.classList.toggle('passenger-mode',role==='passenger'||role==='driver');c.classList.toggle('backrider-mode',role==='motorcycle-backrider'); }
  // ── Squad stats: one always-visible card per living squad member, with a 3D
  // head portrait; the TAB-selected unit's card gets super-highlighted.
  updateSquad(units, active, portraitFor) {
    const panel = this.el['squad-stats']; if (!panel) return;
    const key = units.map(u => u.id).join('|');
    if (key !== this._squadKey) {
      this._squadKey = key; panel.innerHTML = ''; this._squadCards.clear();
      for (const u of units) {
        const card = document.createElement('div'); card.className = 'squad-card';
        const grade = u.grade && u.grade !== 'normal' ? `<i class="grade ${u.grade}">${u.grade.toUpperCase()}</i>` : '';
        const skill = u.active ? `<em class="skill">★ ${u.active.name.toUpperCase()}</em>` : u.passive ? `<em class="skill">◆ ${u.passive.name.toUpperCase()}</em>` : '';
        card.innerHTML = `<div class="squad-portrait"><img alt="${u.classDef.name} portrait"><span class="you-tag">YOU</span></div>
          <div class="squad-info"><strong>${u.classDef.name.toUpperCase()} ${grade}</strong>${skill}
          <div class="sbar hp"><i></i><span></span></div>
          <div class="sbar mp"><i></i><span></span></div></div>`;
        const img = card.querySelector('img'); const url = portraitFor?.(u); if (url) img.src = url; else img.remove();
        panel.appendChild(card);
        this._squadCards.set(u.id, { card, hp: card.querySelector('.sbar.hp i'), hpn: card.querySelector('.sbar.hp span'), mp: card.querySelector('.sbar.mp i'), mpn: card.querySelector('.sbar.mp span') });
      }
    }
    for (const u of units) {
      const c = this._squadCards.get(u.id); if (!c) continue;
      c.hp.style.width = `${Math.max(0, Math.min(100, u.hp / u.maxHp * 100))}%`;
      c.hpn.textContent = `${Math.ceil(Math.max(0, u.hp))}${u.shield > 0 ? ` +${Math.ceil(u.shield)}` : ''}`;
      c.mp.style.width = `${Math.max(0, Math.min(100, u.mp / u.maxMp * 100))}%`;
      c.mpn.textContent = Math.ceil(Math.max(0, u.mp));
      const isActive = u === active;
      if (isActive && !c.card.classList.contains('active')) { c.card.classList.add('active'); c.card.classList.remove('pop'); void c.card.offsetWidth; c.card.classList.add('pop'); }
      else if (!isActive) c.card.classList.remove('active');
      c.card.classList.toggle('low', u.hp < u.maxHp * .25);
    }
  }
  clearSquad() { if (this.el['squad-stats']) { this.el['squad-stats'].innerHTML = ''; this._squadKey = ''; this._squadCards.clear(); } }
  show(value = true) { this.root.classList.toggle('hidden', !value); document.body.classList.toggle('in-game', value); }
  update(player, factory, squadSize, chips, occupancy = []) {
    if (!player) return;
    const hp = Math.max(0, player.hp / player.maxHp * 100), mp = Math.max(0, player.mp / player.maxMp * 100);
    this.el['hp-fill'].style.width = `${hp}%`; this.el['mp-fill'].style.width = `${mp}%`;
    // sub-20% HP: bar turns red and flashes as a warning
    this.el['hp-fill'].parentElement.classList.toggle('low', hp < 20);
    const mountedTurret=Boolean(player.baseTurret);
    this.el['hp-title'].textContent=mountedTurret?'TURRET ARMOR':'HP';
    this.el['hp-label'].textContent = mountedTurret?`${Math.ceil(player.hp)} / ${player.maxHp}`:Math.ceil(player.hp); this.el['mp-label'].textContent = mountedTurret?'ARMORED':Math.ceil(player.mp);
    this.el['shield-label'].textContent = player.shield > 0 ? `+${Math.ceil(player.shield)}` : '';
    this.el['weapon-name'].textContent = player.weapon.name.toUpperCase();
    this.el['ammo-label'].textContent = player.weaponId === 'pistol' ? '∞' : Math.max(0, Math.floor(player.ammo ?? 0));
    const vehicle=player.mountedMotorcycle,isDriver=vehicle?.driver===player,isTankDriver=isDriver&&vehicle?.vehicleKind==='tank',isBackrider=!isDriver&&vehicle?.type==='motorcycle';
    this.el['ability-label'].textContent = player.baseTurret ? `${player.critical?`GET OUT! ${player.explosionTimer.toFixed(1)}s`:player.reloadTimer>0?`RELOADING ${player.reloadTimer.toFixed(1)}s`:'E · EXIT TURRET'}` : player.mountedBunker?'E · EXIT BUNKER':vehicle?(isTankDriver?'WASD HULL · MOUSE TURRET · LMB CANNON · E EXIT':isDriver?'W/S THROTTLE · MOUSE + A/D STEER · E EXIT':isBackrider?'MOUSE LOOK · LMB WEAPON · E EXIT':'MOUSE FREELOOK · WEAPONS SAFE · E EXIT'):`Q · ${(player.active ? player.active.name : player.classDef.ability).toUpperCase()} · H GRENADE ${player.grenades||0}/2`;
    const warning=this.el['turret-warning'];if(warning){const evacuate=mountedTurret&&player.critical;warning.classList.toggle('hidden',!evacuate);if(evacuate)warning.querySelector('span').textContent=`${player.explosionTimer.toFixed(1)}s`;}
    const bossPanel = document.querySelector('#boss-panel');
    if (factory) { bossPanel.classList.remove('hidden'); this.el['boss-fill'].style.width = `${Math.max(0, factory.hp / factory.maxHp * 100)}%`; }
    else bossPanel.classList.add('hidden');
    this.el['squad-readout'].textContent = `SQUAD ${squadSize}`; this.el['chips-readout'].textContent = `${chips} CHIPS`;
    const buffs = [];
    if (player.buffs?.speed > 0) buffs.push(`SPEED ${Math.ceil(player.buffs.speed)}s`);
    if (player.buffs?.damage > 0) buffs.push(`DMG ${Math.ceil(player.buffs.damage)}s`);
    if (player.buffs?.rapid > 0) buffs.push(`RAPID ${Math.ceil(player.buffs.rapid)}s`);
    if (player.shield > 0) buffs.push('SHIELD');
    this.el['buff-readout'].textContent = buffs.join(' · ');
    [...this.el['builder-cells'].children].forEach((cell, i) => { const t = occupancy[i]; cell.className = t ? `filled ${t}` : ''; });
  }
  prompt(text) { this.el.interaction.textContent = text || ''; this.el.interaction.classList.toggle('hidden', !text); }
  toast(text, bad = false) { clearTimeout(this.toastTimer); this.el.toast.textContent = text; this.el.toast.classList.remove('hidden'); this.el.toast.classList.toggle('bad', bad); this.toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), 1800); }
  damage() { const el = document.querySelector('#damage-flash'); el.style.opacity = '.72'; setTimeout(() => el.style.opacity = '0', 70); }
  // custom crosshair cursor: follows the mouse; turns red + rotates over enemies;
  // when locked it clamps onto the target with the LOCK-ON treatment
  setCrosshair(x, y, overEnemy, locked) {
    const c = this.el.crosshair;
    c.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`;
    c.classList.toggle('enemy', Boolean(overEnemy));
    c.classList.toggle('locked', Boolean(locked));
  }
  // one-shot punch animation when a lock is acquired
  lockPulse() {
    const c = this.el.crosshair;
    c.classList.remove('lock-pulse'); void c.offsetWidth; c.classList.add('lock-pulse');
    this.toast('LOCK-ON');
  }
  // floating combat numbers, spawned at a projected screen position
  damageNumber(x, y, text, kind = 'hurt') {
    const container = this.el['damage-numbers']; if (!container) return;
    if (container.children.length > 40) container.firstChild.remove();
    const span = document.createElement('span');
    span.className = `dmg ${kind}`; span.textContent = text;
    span.style.left = `${x + (Math.random() - .5) * 26}px`; span.style.top = `${y}px`;
    container.appendChild(span);
    setTimeout(() => span.remove(), 850);
  }
  burstingText(x, y, text) {
    const container = this.el['damage-numbers']; if (!container) return;
    const existing = container.querySelectorAll('.burst-text');
    if (existing.length >= 8) existing[0].remove();
    const span = document.createElement('span');
    span.className = 'burst-text'; span.textContent = text;
    span.style.left = `${x + (Math.random() - .5) * 34}px`;
    span.style.top = `${y - 18}px`;
    span.style.setProperty('--tilt', `${(Math.random() - .5) * 16}deg`);
    container.appendChild(span);
    setTimeout(() => span.remove(), 1450);
  }
  // hover tooltip with unit details
  showInfo(entity, x, y) {
    const panel = this.el['info-panel'];
    if (!entity) { panel.classList.add('hidden'); return; }
    const name = entity.classDef?.name || entity.kind || entity.type;
    const grade = entity.grade && entity.grade !== 'normal' ? ` · ${entity.grade.toUpperCase()}` : '';
    const skills = [entity.passive ? `◆ ${entity.passive.name}` : '', entity.active ? `★ ${entity.active.name}` : ''].filter(Boolean).join('<br>');
    const meta = this.teamMeta?.(entity.team);
    const teamColor = meta ? `#${meta.color.toString(16).padStart(6, '0')}` : '#fff';
    panel.innerHTML = `<strong style="color:${teamColor}">${String(name).toUpperCase()}${grade}</strong>
      <em>${(meta?.name || entity.team || 'neutral').toUpperCase()} TEAM · ${entity.type.toUpperCase()}</em>
      <span>HP ${Math.ceil(entity.hp)}/${entity.maxHp}${entity.shield > 0 ? ` (+${Math.ceil(entity.shield)})` : ''}</span>
      ${Number.isFinite(entity.mp) ? `<span>MP ${Math.ceil(entity.mp)}/${entity.maxMp}</span>` : ''}
      ${skills ? `<small>${skills}</small>` : ''}`;
    panel.style.left = `${Math.min(innerWidth - 190, x + 22)}px`; panel.style.top = `${Math.min(innerHeight - 140, y + 18)}px`;
    panel.classList.remove('hidden');
  }
  initTips() {
    const textEl = document.getElementById('tip-text');
    const prevBtn = document.getElementById('tip-prev');
    const nextBtn = document.getElementById('tip-next');
    if (!textEl || !prevBtn || !nextBtn) return;

    const showTip = (index) => {
      this.currentTipIndex = (index + this.tips.length) % this.tips.length;
      textEl.textContent = this.tips[this.currentTipIndex];
      if (this.tipTimer) clearInterval(this.tipTimer);
      this.tipTimer = setInterval(() => showTip(this.currentTipIndex + 1), 12000);
    };

    prevBtn.addEventListener('click', () => showTip(this.currentTipIndex - 1));
    nextBtn.addEventListener('click', () => showTip(this.currentTipIndex + 1));

    showTip(0);
  }
}
