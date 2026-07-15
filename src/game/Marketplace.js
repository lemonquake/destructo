import {
  MARKETPLACE_COSMETICS,
  MARKET_CATEGORIES,
  getMarketplaceRotation,
  marketplacePrice,
  rarityRank,
} from "../data/marketplaceData.js";
import { MarketplacePreview } from "./MarketplacePreview.js";

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const iconFor = (item) =>
  ({
    hat: "♛",
    boots: "⟰",
    attachment: "⚙",
    skin: "◈",
    projectile: "☄",
    deathEffect: "✹",
    killEffect: "☠",
    crateTexture: "▦",
    crateModel: "⬢",
    teamBase: "⌂",
  })[item.kind] || "✦";
const labelFor = (kind) =>
  ({ crateTexture: 'Crate Texture', crateModel: 'Crate Model' })[kind] || MARKET_CATEGORIES.find((category) => category.id === kind)?.label || kind;
const marketCategoryFor = item => item.category || item.kind;
const CRATE_RARITIES = Object.freeze([
  Object.freeze({ id: 'brown', label: 'Brown', color: '#b07840' }),
  Object.freeze({ id: 'yellow', label: 'Yellow', color: '#ffd23f' }),
  Object.freeze({ id: 'blue', label: 'Blue', color: '#58c8ff' }),
  Object.freeze({ id: 'red', label: 'Red', color: '#ff4d5e' }),
]);

export class Marketplace {
  constructor({ root, save, audio, onBuyTickets, onBack }) {
    this.root = root;
    this.save = save;
    this.audio = audio;
    this.onBuyTickets = onBuyTickets;
    this.onBack = onBack;
    this.category = "featured";
    this.crateRarity = 'brown';
    this.search = "";
    this.rotation = getMarketplaceRotation();
    this.selected =
      this.rotation.promos[0]?.item ||
      this.rotation.drops[0]?.item ||
      MARKETPLACE_COSMETICS[0];
    this.boundClick = (e) => this.click(e);
    this.boundInput = (e) => this.input(e);
    this.boundKey = (e) => this.key(e);
  }
  open() {
    this.root.addEventListener("click", this.boundClick);
    this.root.addEventListener("input", this.boundInput);
    this.root.addEventListener("keydown", this.boundKey);
    this.render();
    this.timer = setInterval(() => this.tick(), 1000);
  }
  collection() {
    return this.save.data.cosmetics || [];
  }
  favorites() {
    return this.save.data.favoriteCosmetics || [];
  }
  offerFor(item) {
    return [...this.rotation.promos, ...this.rotation.drops].find(
      (entry) => entry.item.id === item.id,
    );
  }
  visibleItems() {
    const activePromo = new Set(
        this.rotation.promos.map((entry) => entry.item.id),
      ),
      owned = new Set(this.collection());
    let items;
    if (this.category === "featured")
      items = [
        ...this.rotation.promos.map((entry) => entry.item),
        ...this.rotation.drops.map((entry) => entry.item),
      ];
    else
      items = MARKETPLACE_COSMETICS.filter(
        (item) =>
          marketCategoryFor(item) === this.category &&
          (!item.promoOnly || activePromo.has(item.id) || owned.has(item.id)),
      );
    if (this.search) {
      const query = this.search.toLowerCase();
      items = items.filter((item) =>
        `${item.name} ${item.description} ${item.rarity} ${labelFor(item.kind)}`
          .toLowerCase()
          .includes(query),
      );
    }
    return [...new Map(items.map((item) => [item.id, item])).values()].sort(
      (a, b) =>
        rarityRank[b.rarity] - rarityRank[a.rarity] ||
        a.name.localeCompare(b.name),
    );
  }
  card(item) {
    const owned = this.collection().includes(item.id),
      equipped = this.isEquipped(item),
      offer = this.offerFor(item),
      price = marketplacePrice(item, this.rotation),
      favorite = this.favorites().includes(item.id);
    return `<article class="market-card rarity-${item.rarity} ${this.selected?.id === item.id ? "selected" : ""}" data-market-item="${item.id}" tabindex="0" role="button" aria-label="Preview ${escapeHtml(item.name)}"><div class="market-card-art" style="--item-primary:#${item.visual.primary.toString(16).padStart(6, "0")};--item-secondary:#${item.visual.secondary.toString(16).padStart(6, "0")}"><span>${iconFor(item)}</span><i></i><b>${item.rarity}</b>${offer?.discount ? `<em>-${offer.discount}%</em>` : ""}${item.promoOnly ? "<u>VAULT DROP</u>" : ""}</div><div class="market-card-copy"><button class="market-fave ${favorite ? "active" : ""}" data-market-action="favorite" data-id="${item.id}" aria-label="${favorite ? "Remove from" : "Add to"} favorites"><u>♥</u></button><small>${labelFor(item.kind)}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div><strong>${equipped ? "EQUIPPED" : owned ? "OWNED" : item.currency === "tickets" ? `◆ ${price}` : `◈ ${price}`}</strong>${offer?.discount ? `<s>${item.price}</s>` : ""}</div></div></article>`;
  }
  isEquipped(item) {
    if (item.kind === 'crateTexture') return Object.values(this.save.data.equipped?.crateTextures || {}).includes(item.id);
    return this.save.data.equipped?.[item.kind] === item.id;
  }
  render() {
    this.preview?.dispose();
    const items = this.visibleItems();
    if (!items.some((item) => item.id === this.selected?.id) && items.length)
      this.selected = items[0];
    const item = this.selected || MARKETPLACE_COSMETICS[0],
      owned = this.collection().includes(item.id),
      equipped = item.kind === 'crateTexture' ? this.save.data.equipped?.crateTextures?.[this.crateRarity] === item.id : this.isEquipped(item),
      price = marketplacePrice(item, this.rotation),
      offer = this.offerFor(item),
      ownedCount = this.collection().length,
      cratePicker = item.kind === 'crateTexture' ? `<div class="crate-rarity-picker"><small>APPLY TEXTURE TO RARITY</small><div>${CRATE_RARITIES.map(rarity => `<button class="${this.crateRarity === rarity.id ? 'active' : ''}" data-market-action="crate-rarity" data-rarity="${rarity.id}"><i style="background:${rarity.color}"></i>${rarity.label}${this.save.data.equipped?.crateTextures?.[rarity.id] === item.id ? '<b>✓</b>' : ''}</button>`).join('')}</div><p>Rarity colors are locked. Only the surface texture changes.</p></div>` : '',
      purchaseLabel = item.kind === 'crateTexture' ? (equipped ? `✓ EQUIPPED FOR ${this.crateRarity.toUpperCase()}` : owned ? `EQUIP FOR ${this.crateRarity.toUpperCase()}` : 'GET TEXTURE') : (equipped ? '✓ EQUIPPED' : owned ? 'EQUIP NOW' : 'GET ITEM'),
      legalCopy = item.kind === 'crateTexture' || item.kind === 'crateModel' ? 'Crate rarity colors are fixed for gameplay clarity. Purchases change textures and 3D models only.' : 'Cosmetics are saved to this game profile. Gameplay gear is clearly marked.';
    this.root.innerHTML = `<main class="destructo-market"><div class="market-aurora" aria-hidden="true"></div><header class="market-topbar"><button class="market-back" data-market-action="back" aria-label="Back to hub">←</button><div class="market-brand"><span>D//M</span><div><small>DESTRUCTO</small><strong>MARKETPLACE</strong></div><i>LIVE</i></div><div class="market-wallet"><span title="Earned Chips">◈ <b>${this.save.data.chips}</b><small>CHIPS</small></span><span title="Premium Tickets">◆ <b>${this.save.data.tickets || 0}</b><small>TICKETS</small></span><button data-market-action="tickets">+ GET TICKETS</button></div></header><section class="market-shell"><aside class="market-sidebar"><label class="market-search"><span>⌕</span><input type="search" data-market-search placeholder="Search ${MARKETPLACE_COSMETICS.length} cosmetics" value="${escapeHtml(this.search)}" aria-label="Search cosmetics"></label><nav>${MARKET_CATEGORIES.map((category) => `<button class="${this.category === category.id ? "active" : ""}" data-market-category="${category.id}"><span>${category.icon}</span>${category.label}<b>${category.id === "featured" ? "LIVE" : MARKETPLACE_COSMETICS.filter((entry) => marketCategoryFor(entry) === category.id && !entry.promoOnly).length}</b></button>`).join("")}</nav><div class="market-collection"><span>${ownedCount}/${MARKETPLACE_COSMETICS.length}</span><strong>COLLECTION</strong><i><u style="width:${(ownedCount / MARKETPLACE_COSMETICS.length) * 100}%"></u></i><small>${this.favorites().length} FAVORITES</small></div></aside><section class="market-feed"><div class="drop-marquee"><div><span>3-HOUR DROP</span><strong>${this.rotation.promos.length} VAULT ITEMS HAVE BREACHED CONTAINMENT</strong></div><time data-market-countdown>--:--:--</time><i></i></div><div class="market-feed-head"><div><small>${this.category === "featured" ? "LIVE ROTATION" : labelFor(this.category)}</small><h1>${this.category === "featured" ? "THE DROP ZONE" : labelFor(this.category).toUpperCase()}</h1></div><span>${items.length} ITEMS</span></div><div class="market-grid">${items.length ? items.map((entry) => this.card(entry)).join("") : '<div class="market-empty"><span>⌕</span><h3>NO SIGNAL</h3><p>Try another search or category.</p></div>'}</div></section><aside class="fitting-room rarity-${item.rarity}"><div class="fitting-head"><span><i></i> LIVE FITTING ROOM</span><div><button data-market-action="rotate" title="Toggle auto-rotate">↻</button><button data-market-action="reset-view" title="Reset item preview">⌖</button></div></div><div class="fitting-stage"><canvas id="market-preview" aria-label="Interactive 3D preview of ${escapeHtml(item.name)}. Drag to rotate and use the mouse wheel to zoom."></canvas><span class="drag-hint">↔ DRAG TO ROTATE · SCROLL TO ZOOM</span><div class="fitting-scanline"></div></div><div class="fitting-copy"><div class="rarity-line"><span>${item.rarity}</span><small>${item.promoOnly ? "PROMO VAULT · " : ""}${labelFor(item.kind)}</small></div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.description)}</p>${cratePicker}${item.gameplay ? `<div class="gameplay-perk"><span>GAMEPLAY GEAR</span><strong>${escapeHtml(item.gameplay)}</strong></div>` : ""}${item.effect ? `<div class="effect-note">✦ ${escapeHtml(item.effect)}</div>` : ""}<div class="fitting-buy"><div>${offer?.discount ? `<s>${item.price}</s><small>-${offer.discount}% DROP PRICE</small>` : ""}<strong>${item.currency === "tickets" ? "◆" : "◈"} ${price}</strong></div><button class="${equipped ? "equipped" : ""}" data-market-action="purchase" data-id="${item.id}">${purchaseLabel}</button></div><small class="market-legal">${legalCopy}</small></div></aside></section></main>`;
    const canvas = this.root.querySelector("#market-preview");
    if (canvas) {
      this.preview = new MarketplacePreview(canvas);
      this.preview.setItem(item, this.save.data.equipped || {}, { crateRarity: this.crateRarity });
    }
    this.tick();
  }
  click(event) {
    const category = event.target.closest("[data-market-category]")?.dataset
      .marketCategory;
    if (category) {
      this.category = category;
      this.search = "";
      this.audio?.play?.("button_click");
      this.render();
      return;
    }
    const card = event.target.closest("[data-market-item]");
    const action = event.target.closest("[data-market-action]")?.dataset
      .marketAction;
    if (card && !action) {
      this.selected =
        MARKETPLACE_COSMETICS.find(
          (item) => item.id === card.dataset.marketItem,
        ) || this.selected;
      this.audio?.play?.("change_texture");
      this.render();
      return;
    }
    const id = event.target.closest("[data-id]")?.dataset.id;
    if (action === "back") {
      this.dispose();
      this.onBack?.();
      return;
    }
    if (action === "tickets") {
      this.onBuyTickets?.();
      return;
    }
    if (action === "rotate") {
      event.target
        .closest("button")
        ?.classList.toggle("active", this.preview?.toggleSpin());
      return;
    }
    if (action === "reset-view") {
      this.preview?.setItem(this.selected, this.save.data.equipped || {}, { crateRarity: this.crateRarity });
      return;
    }
    if (action === 'crate-rarity') {
      const rarity = event.target.closest('[data-rarity]')?.dataset.rarity;
      if (CRATE_RARITIES.some(entry => entry.id === rarity)) this.crateRarity = rarity;
      this.audio?.play?.('change_texture');this.render();return;
    }
    if (action === "favorite" && id) {
      event.stopPropagation();
      const values = new Set(this.favorites());
      values.has(id) ? values.delete(id) : values.add(id);
      this.save.data.favoriteCosmetics = [...values];
      this.save.commit();
      this.render();
      return;
    }
    if (action === "purchase" && id) this.purchase(id);
  }
  input(event) {
    if (!event.target.matches("[data-market-search]")) return;
    this.search = event.target.value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.render();
      this.root.querySelector("[data-market-search]")?.focus();
    }, 120);
  }
  key(event) {
    const card = event.target.closest?.("[data-market-item]");
    if (!card || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    this.selected =
      MARKETPLACE_COSMETICS.find(
        (item) => item.id === card.dataset.marketItem,
      ) || this.selected;
    this.render();
  }
  purchase(id) {
    const item = MARKETPLACE_COSMETICS.find((entry) => entry.id === id);
    if (!item) return;
    const owned = this.collection().includes(id);
    if (!owned) {
      const price = marketplacePrice(item, this.rotation);
      if (!this.save.buyCosmetic(id, price, item.currency)) {
        this.flash(
          item.currency === "tickets"
            ? "NOT ENOUGH TICKETS"
            : "NOT ENOUGH CHIPS",
        );
        if (item.currency === "tickets")
          setTimeout(() => this.onBuyTickets?.(), 420);
        return;
      }
    }
    if (item.kind === 'crateTexture') this.save.equipCrateTexture(this.crateRarity, id);
    else if (this.save.data.equipped[item.kind] !== id) this.save.equipCosmetic(item.kind, id);
    this.audio?.play?.("change_texture");
    this.flash(
      owned
        ? `${item.name.toUpperCase()} EQUIPPED`
        : `${item.name.toUpperCase()} ACQUIRED`,
    );
    this.render();
  }
  flash(message) {
    let toast = this.root.querySelector(".market-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "market-toast";
      this.root.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
  }
  tick() {
    const title = this.root.querySelector(".market-brand strong"),
      back = this.root.querySelector(".market-back");
    if (title) title.textContent = "D-BUILDER";
    if (back) back.setAttribute("aria-label", "Back to main menu");
    const remaining = Math.max(0, this.rotation.endsAt - Date.now());
    if (!remaining) {
      this.rotation = getMarketplaceRotation();
      this.render();
      return;
    }
    const h = String(Math.floor(remaining / 3600000)).padStart(2, "0"),
      m = String(Math.floor(remaining / 60000) % 60).padStart(2, "0"),
      s = String(Math.floor(remaining / 1000) % 60).padStart(2, "0");
    const el = this.root.querySelector("[data-market-countdown]");
    if (el) el.textContent = `${h}:${m}:${s}`;
  }
  dispose() {
    clearInterval(this.timer);
    clearTimeout(this.searchTimer);
    this.preview?.dispose();
    this.preview = null;
    this.root.removeEventListener("click", this.boundClick);
    this.root.removeEventListener("input", this.boundInput);
    this.root.removeEventListener("keydown", this.boundKey);
  }
}
