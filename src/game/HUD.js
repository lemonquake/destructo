export class HUD {
  constructor() {
    this.root = document.querySelector('#hud');
    this.el = Object.fromEntries(['hp-fill', 'mp-fill', 'hp-label', 'mp-label', 'shield-label', 'weapon-name', 'ammo-label', 'ability-label', 'boss-fill', 'squad-readout', 'chips-readout', 'interaction', 'toast', 'builder-cells', 'objective', 'crosshair', 'info-panel', 'damage-numbers', 'buff-readout'].map(id => [id, document.querySelector(`#${id}`)]));
    this.toastTimer = 0;
    this.el['builder-cells'].innerHTML = '<i></i>'.repeat(12);
  }
  show(value = true) { this.root.classList.toggle('hidden', !value); document.body.classList.toggle('in-game', value); }
  update(player, factory, squadSize, chips, occupancy = []) {
    if (!player) return;
    const hp = Math.max(0, player.hp / player.maxHp * 100), mp = Math.max(0, player.mp / player.maxMp * 100);
    this.el['hp-fill'].style.width = `${hp}%`; this.el['mp-fill'].style.width = `${mp}%`;
    this.el['hp-label'].textContent = Math.ceil(player.hp); this.el['mp-label'].textContent = Math.ceil(player.mp);
    this.el['shield-label'].textContent = player.shield > 0 ? `+${Math.ceil(player.shield)}` : '';
    this.el['weapon-name'].textContent = player.weapon.name.toUpperCase();
    this.el['ammo-label'].textContent = player.weaponId === 'pistol' ? '∞' : Math.max(0, Math.floor(player.ammo ?? 0));
    this.el['ability-label'].textContent = `Q · ${(player.active ? player.active.name : player.classDef.ability).toUpperCase()}`;
    this.el['boss-fill'].style.width = `${Math.max(0, factory.hp / factory.maxHp * 100)}%`;
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
  // custom crosshair cursor: follows the mouse; turns red + rotates over enemies; ring when locked
  setCrosshair(x, y, overEnemy, locked) {
    const c = this.el.crosshair;
    c.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`;
    c.classList.toggle('enemy', Boolean(overEnemy));
    c.classList.toggle('locked', Boolean(locked));
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
  // hover tooltip with unit details
  showInfo(entity, x, y) {
    const panel = this.el['info-panel'];
    if (!entity) { panel.classList.add('hidden'); return; }
    const name = entity.classDef?.name || entity.kind || entity.type;
    const grade = entity.grade && entity.grade !== 'normal' ? ` · ${entity.grade.toUpperCase()}` : '';
    const skills = [entity.passive ? `◆ ${entity.passive.name}` : '', entity.active ? `★ ${entity.active.name}` : ''].filter(Boolean).join('<br>');
    panel.innerHTML = `<strong class="${entity.team}">${String(name).toUpperCase()}${grade}</strong>
      <em>${(entity.team || 'neutral').toUpperCase()} TEAM · ${entity.type.toUpperCase()}</em>
      <span>HP ${Math.ceil(entity.hp)}/${entity.maxHp}${entity.shield > 0 ? ` (+${Math.ceil(entity.shield)})` : ''}</span>
      ${Number.isFinite(entity.mp) ? `<span>MP ${Math.ceil(entity.mp)}/${entity.maxMp}</span>` : ''}
      ${skills ? `<small>${skills}</small>` : ''}`;
    panel.style.left = `${Math.min(innerWidth - 190, x + 22)}px`; panel.style.top = `${Math.min(innerHeight - 140, y + 18)}px`;
    panel.classList.remove('hidden');
  }
}
