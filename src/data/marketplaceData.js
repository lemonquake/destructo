export const TICKET_BUNDLES = Object.freeze([
  Object.freeze({ id: 'spark', name: 'Spark Pack', tickets: 5, price: '0.99', badge: 'TRY IT' }),
  Object.freeze({ id: 'rivet', name: 'Rivet Pouch', tickets: 30, price: '4.99', badge: '+20% VALUE' }),
  Object.freeze({ id: 'quake', name: 'Quake Cache', tickets: 75, price: '9.99', badge: '+50% VALUE' }),
  Object.freeze({ id: 'reactor', name: 'Reactor Case', tickets: 170, price: '19.99', badge: 'MOST POPULAR' }),
  Object.freeze({ id: 'war-vault', name: 'War Vault', tickets: 450, price: '49.99', badge: '+80% VALUE' }),
  Object.freeze({ id: 'creator', name: 'Creator Arsenal', tickets: 1000, price: '99.00', badge: 'MAXIMUM CHAOS' }),
]);

export const MARKET_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'featured', label: 'Drops', icon: '✦' }),
  Object.freeze({ id: 'hat', label: 'Headgear', icon: '♛' }),
  Object.freeze({ id: 'boots', label: 'Boots', icon: '⟰' }),
  Object.freeze({ id: 'attachment', label: 'Gear', icon: '⚙' }),
  Object.freeze({ id: 'skin', label: 'Skins', icon: '◈' }),
  Object.freeze({ id: 'projectile', label: 'Projectiles', icon: '☄' }),
  Object.freeze({ id: 'deathEffect', label: 'Death FX', icon: '✹' }),
  Object.freeze({ id: 'killEffect', label: 'Elimination FX', icon: '☠' }),
  Object.freeze({ id: 'teamBase', label: 'Team Bases', icon: '⌂' }),
]);

const cosmetic = (id, kind, name, price, rarity, description, visual, extra = {}) => Object.freeze({
  id, kind, name, price, currency: extra.currency || (rarity === 'legendary' || rarity === 'mythic' ? 'tickets' : 'chips'),
  rarity, description, visual: Object.freeze(visual), ...extra,
});

export const MARKETPLACE_COSMETICS = Object.freeze([
  cosmetic('cap','hat','Combat Cap',300,'common','Field-tested shade for bright explosions.',{model:'cap',primary:0x2fb4ff,secondary:0xffffff}),
  cosmetic('helmet','hat','Battle Helmet',500,'rare','Classic reinforced dome with a steel brow.',{model:'helmet',primary:0x59657a,secondary:0xb8d3e8}),
  cosmetic('mohawk','hat','Neon Mohawk',750,'epic','Hot-pink reactor spikes that pulse in combat.',{model:'mohawk',primary:0xff4dd2,secondary:0x7b2cff}),
  cosmetic('horns','hat','Demon Horns',900,'epic','Twin infernal horns for maximum intimidation.',{model:'horns',primary:0xff5062,secondary:0x5a1022}),
  cosmetic('halo','hat','Golden Halo',1200,'epic','A radiant anti-gravity ring.',{model:'halo',primary:0xffe06b,secondary:0xffffff}),
  cosmetic('crown','hat','Royal Crown',2000,'epic','Rule the rubble in polished gold.',{model:'crown',primary:0xffd23f,secondary:0xff5062}),
  cosmetic('antenna','hat','Radio Antenna',400,'rare','Receives every station except good advice.',{model:'antenna',primary:0x7f8ba4,secondary:0xff5062}),
  cosmetic('tophat','hat','Fancy Top Hat',1500,'epic','Formalwear for very informal demolition.',{model:'tophat',primary:0x171c28,secondary:0xff5062}),
  cosmetic('starforge-crown','hat','Starforge Crown',480,'legendary','A miniature forge burns above the wearer.',{model:'crown',primary:0xff8a2c,secondary:0x7fe8ff},{effect:'Solar embers orbit your head.'}),
  cosmetic('void-commander','hat','Void Commander Helm',650,'legendary','Blacksite command armor cut from compressed night.',{model:'helmet',primary:0x17152f,secondary:0x9b6cff},{effect:'Animated violet visor.'}),
  cosmetic('lemonquake-idol','hat','Lemon-Quake Idol',777,'mythic','The creator sigil, humming with citrus thunder.',{model:'orbital',primary:0xffe337,secondary:0x64ff82},{promoOnly:true,effect:'Rare promo-only lightning orbit.'}),
  cosmetic('gaia-warden','hat','Gaia Warden Antlers',560,'legendary','Living alloy antlers grown beneath Gaia.',{model:'horns',primary:0x55f08a,secondary:0x29b7ff}),

  cosmetic('camo','skin','Jungle Camo',600,'rare','Gaia canopy camouflage.',{model:'skin',primary:0x3b7f45,secondary:0x182f22}),
  cosmetic('tiger','skin','Tiger Stripes',800,'epic','Orange strike stripes over charcoal plating.',{model:'skin',primary:0xff8a2c,secondary:0x161922}),
  cosmetic('digital','skin','Digital Camo',700,'rare','Pixel-cut military greens.',{model:'skin',primary:0x7e9b79,secondary:0x26352b}),
  cosmetic('hex','skin','Hex Mesh',900,'epic','Reactive cyan hex plating.',{model:'skin',primary:0x1d5e80,secondary:0x47e7ff}),
  cosmetic('circuit','skin','Circuit Board',1100,'epic','Live circuitry crawls across the chassis.',{model:'skin',primary:0x153b31,secondary:0x61ffb4}),
  cosmetic('scales','skin','Dragon Scales',1300,'epic','Overlapping emerald armor scales.',{model:'skin',primary:0x26745b,secondary:0xffc43f}),
  cosmetic('dots','skin','Pop Dots',500,'rare','Comic-book dots with loud color blocking.',{model:'skin',primary:0xff4f91,secondary:0xffed5f}),
  cosmetic('urban','skin','Urban Camo',650,'rare','Concrete-gray city combat pattern.',{model:'skin',primary:0x66717c,secondary:0x2b3139}),
  cosmetic('leopard','skin','Leopard Print',1000,'epic','Wild spots on gold composite.',{model:'skin',primary:0xd69b3c,secondary:0x2a1d18}),
  cosmetic('stripes','skin','Racing Stripes',550,'rare','Go-faster lines. Scientifically questionable.',{model:'skin',primary:0xe9edf2,secondary:0xff3045}),
  cosmetic('singularity-shell','skin','Singularity Shell',920,'legendary','Event-horizon armor bends the showroom lights.',{model:'skin',primary:0x0d1020,secondary:0xa35cff},{effect:'Void shimmer aura.'}),
  cosmetic('creator-chrome','skin','Creator Chrome',1000,'mythic','Mirror alloy reserved for creator-week drops.',{model:'skin',primary:0xdff7ff,secondary:0xffdf33},{promoOnly:true,effect:'Prismatic showroom reflections.'}),

  cosmetic('speedy','boots','Speedy Boots',600,'rare','Low-friction runners with bright heel caps.',{model:'runner',primary:0x59e065,secondary:0xffffff}),
  cosmetic('power_jumpers','boots','Power Jumpers',800,'epic','Piston-loaded soles for taller first jumps.',{model:'piston',primary:0x2fb4ff,secondary:0xffd23f}),
  cosmetic('iron_boots','boots','Iron Boots',1000,'epic','Heavy armored stompers.',{model:'armored',primary:0x66717c,secondary:0xbfd5e4}),
  cosmetic('heavy_boots','boots','Heavy Boots',1200,'epic','Industrial toe guards and stabilizers.',{model:'armored',primary:0x2b3139,secondary:0xff8a2c}),
  cosmetic('lemon-quake-boots','boots','Lemon-Quake Boots',425,'legendary','Kick the air twice. The second jump detonates a citrus boost.',{model:'quake',primary:0xffe337,secondary:0x62f577},{gameplay:'Double-jump with a boosted second jump.',effect:'Citrus shock ring on second jump.'}),
  cosmetic('comet-stompers','boots','Comet Stompers',590,'legendary','Meteor-iron boots with blue exhaust fins.',{model:'thruster',primary:0x54d9ff,secondary:0xff8a2c}),
  cosmetic('chrono-treads','boots','Chrono Treads',720,'legendary','Clockwork soles leave temporal afterimages.',{model:'piston',primary:0xb58cff,secondary:0x55eaff}),
  cosmetic('atlas-zero-g','boots','Atlas Zero-G Greaves',880,'legendary','Blacksite magnetic boots built for orbital boarding.',{model:'thruster',primary:0x273448,secondary:0x47e7ff}),
  cosmetic('worldbreaker-greaves','boots','Worldbreaker Greaves',1000,'mythic','Promo-only seismic armor from a broken dimension.',{model:'quake',primary:0xff5062,secondary:0xffd23f},{promoOnly:true,effect:'Mythic ground-crack aura.'}),

  cosmetic('rocket','attachment','Rocket Thrusters',900,'epic','Twin compact back thrusters.',{model:'jetpack',primary:0x566273,secondary:0xff8a2c}),
  cosmetic('rocket-jetpack','attachment','Rocket Jetpack',100,'legendary','Fuel-limited aerial boost with live exhaust.',{model:'jetpack',primary:0x59657a,secondary:0x55d9ff},{effect:'Hold jump for a controlled jet burst.'}),
  cosmetic('rocket_launcher','attachment','Shoulder Rocket Rack',1500,'epic','A display-grade shoulder missile pod.',{model:'shoulder',primary:0x566273,secondary:0xff5062}),
  cosmetic('seraph-wings','attachment','Seraph Reactor Wings',680,'legendary','Articulated energy wings powered by a stolen sun.',{model:'wings',primary:0xf2f7ff,secondary:0x66e9ff}),
  cosmetic('scrap-dragon','attachment','Scrap Dragon',760,'legendary','A tiny mechanical dragon guards your six.',{model:'drone',primary:0x875f42,secondary:0xff8a2c}),
  cosmetic('blacksite-reactor','attachment','Blacksite Reactor',840,'legendary','An illegal cyan reactor with too many warning lights.',{model:'reactor',primary:0x182536,secondary:0x47e7ff}),
  cosmetic('royal-banner','attachment','Rivet Royal Banner',520,'legendary','A physics-driven victory banner.',{model:'banner',primary:0x273448,secondary:0xffd23f}),
  cosmetic('storm-orbitals','attachment','Storm Orbitals',930,'legendary','Three attack satellites locked to your chassis.',{model:'orbitals',primary:0x29324d,secondary:0x8eeaff}),
  cosmetic('gaia-heartpack','attachment','Heart of Gaia Pack',1000,'mythic','A living reactor that blooms only during rare promos.',{model:'reactor',primary:0x1d5138,secondary:0x66ff9b},{promoOnly:true,effect:'Leaves and motes orbit the core.'}),

  cosmetic('laser','projectile','Laser Beam',1000,'epic','Clean cyan beam replacement.',{model:'laser',primary:0x47e7ff,secondary:0xffffff}),
  cosmetic('plasma','projectile','Plasma Bolt',1200,'epic','Volatile violet plasma rounds.',{model:'plasma',primary:0xa35cff,secondary:0xff74e8}),
  cosmetic('lemon-bolts','projectile','Lemon Bolts',360,'legendary','Electric-yellow rounds with citrus sparks.',{model:'bolt',primary:0xffe337,secondary:0x5cff8a}),
  cosmetic('void-comets','projectile','Void Comets',640,'legendary','Tiny singularities with violet tails.',{model:'comet',primary:0x17152f,secondary:0xa35cff}),
  cosmetic('love-hurts','projectile','Love Hurts Rounds',420,'legendary','Hot-pink heartbreak at ballistic speed.',{model:'heart',primary:0xff4f91,secondary:0xffffff}),
  cosmetic('creator-thunder','projectile','Creator Thunder',950,'mythic','Promo-only yellow lightning projectiles.',{model:'bolt',primary:0xffef4f,secondary:0x65f7ff},{promoOnly:true,effect:'Creator signature thunder trail.'}),

  cosmetic('implosion','deathEffect','Implosion',700,'epic','Collapse into a dark shock sphere.',{model:'implosion',primary:0x7a4cff,secondary:0x0b0d18}),
  cosmetic('fireworks','deathEffect','Fireworks',900,'epic','Go out in a squad-colored celebration.',{model:'fireworks',primary:0xff5062,secondary:0xffd23f}),
  cosmetic('supernova-exit','deathEffect','Supernova Exit',700,'legendary','A compact star blooms where you fall.',{model:'supernova',primary:0xffd23f,secondary:0xff6a35}),
  cosmetic('pixel-pop','deathEffect','Pixel Pop',460,'legendary','Break into neon voxel confetti.',{model:'pixels',primary:0x54e8ff,secondary:0xff4f91}),
  cosmetic('phantom-fold','deathEffect','Phantom Fold',825,'legendary','Your silhouette folds into the void.',{model:'implosion',primary:0x1b1735,secondary:0xb174ff}),

  cosmetic('skull','killEffect','Skull Marker',500,'rare','A bold skull stamp marks eliminations.',{model:'skull',primary:0xf3f5f7,secondary:0xff5062}),
  cosmetic('lightning','killEffect','Lightning Strike',850,'epic','Call down a bright cyan strike.',{model:'lightning',primary:0x55dcff,secondary:0xffffff}),
  cosmetic('quake-kaboom','killEffect','Quake KABOOM!',540,'legendary','Comic lettering punches through the smoke.',{model:'kaboom',primary:0xffd23f,secondary:0xff3045}),
  cosmetic('bounty-crown','killEffect','Bounty Crown',690,'legendary','A golden crown spins over the defeated.',{model:'crown',primary:0xffd23f,secondary:0xffffff}),
  cosmetic('dimension-rip','killEffect','Dimension Rip',880,'legendary','Tears open a short-lived violet portal.',{model:'portal',primary:0x913cff,secondary:0x47e7ff}),
  cosmetic('one-in-million','killEffect','One in a Million',1000,'mythic','The rarest elimination celebration in Gaia.',{model:'jackpot',primary:0xffe337,secondary:0xff4f91},{promoOnly:true,effect:'Mythic jackpot shower.'}),

  cosmetic('citadel-base','teamBase','Citadel Base',240,'legendary','A fortified command citadel with cyan rails.',{model:'citadel',primary:0x394b61,secondary:0x47e7ff}),
  cosmetic('fortress-base','teamBase','Fortress Base',360,'legendary','Layered armor and a rotating command beacon.',{model:'fortress',primary:0x30394a,secondary:0xff5062}),
  cosmetic('gaia-sanctum','teamBase','Gaia Sanctum',820,'legendary','A living command shrine wrapped in luminous roots.',{model:'sanctum',primary:0x22543c,secondary:0x66ff9b}),
  cosmetic('lemonquake-hq','teamBase','Lemon-Quake HQ',1000,'mythic','Creator headquarters crowned by a thunder lemon.',{model:'creator',primary:0xffe337,secondary:0x55f08a},{promoOnly:true,effect:'Mythic lightning mast.'}),
]);

export const rarityRank = Object.freeze({ common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 });

const hash = value => {
  let h = 2166136261;
  for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const seededOrder = (items, seed) => [...items].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`));

export function getMarketplaceRotation(now = Date.now()) {
  const rotationMs = 3 * 60 * 60 * 1000;
  const slot = Math.floor(Number(now) / rotationMs);
  const startsAt = slot * rotationMs;
  const regular = MARKETPLACE_COSMETICS.filter(item => !item.promoOnly);
  const vault = MARKETPLACE_COSMETICS.filter(item => item.promoOnly);
  const drops = seededOrder(regular, `drop-${slot}`).slice(0, 10).map((item, index) => Object.freeze({ item, discount: index < 4 ? 10 + hash(`${slot}:${item.id}`) % 26 : 0 }));
  const promos = seededOrder(vault, `vault-${Math.floor(slot / 2)}`).slice(0, 3).map((item, index) => Object.freeze({ item, discount: index === 0 ? 20 : 0 }));
  return Object.freeze({ slot, startsAt, endsAt: startsAt + rotationMs, drops: Object.freeze(drops), promos: Object.freeze(promos) });
}

export function marketplacePrice(item, rotation = getMarketplaceRotation()) {
  const offer = [...rotation.drops, ...rotation.promos].find(entry => entry.item.id === item.id);
  return offer?.discount ? Math.max(1, Math.round(item.price * (1 - offer.discount / 100))) : item.price;
}

