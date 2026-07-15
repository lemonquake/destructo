# Project: Destructo Customization Marketplace

## Architecture
- **SaveState & Economy**: SaveSystem.js manages Tickets, owned/equipped cosmetics, favorites, and idempotent PayPal receipt crediting. Prices are verified by the server.
- **Marketplace & Fitting Room**: The Marketplace has live three-hour drops, promo-vault items, search/categories, collection progress, and an interactive 3D Destructo preview with drag rotation and zoom.
- **Custom Crate Builder**: Game.js showCrateBuilder() implements a color/material customizer. Saves custom crate designs to local state and applies them to standard/charged/manufactured crates in active matches.
- **Cosmetics Rendering**: EntityFactory.js createUnit() dynamically renders equipped hats, boots, and attachments on units (including MenuStage runners/shooters and in active matches).
- **Combat & Projectiles Integration**: CombatSystem.js maps equipped projectiles to custom 3D geometries, custom trail colors, and fire/impact particle effects for the player's units.
- **Team Base Customization**: EntityFactory.js createFactory() inspects the player's team's equipped base style to render custom structure models.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | State & Economy | Server-verified PayPal Orders capture, ticket receipts, premium catalog | None | DONE |
| 2 | Marketplace | 3D fitting room, rotating drops/promos, search, favorites, buy/equip flows | M1 | DONE |
| 3 | Custom Crate Builder | Procedural crate customizer UI, serialization to SaveSystem | M1, M2 | PLANNED |
| 4 | Cosmetic Models & Units | Boots and attachments models, dynamic 3D rendering on Destructo units | M2 | PLANNED |
| 5 | In-Game Projectiles | Custom projectile geometries, trail animations, and effects | M2, M4 | PLANNED |
| 6 | Custom Team Bases | Replacing 3D models for team bases in matches based on selection | M2, M4 | PLANNED |
| 7 | Custom Crates Match | Render procedural crate colors/materials on in-game crates | M3 | PLANNED |
| 8 | Verification & Hardening | Complete E2E testing validation (Tiers 1-4) and adversarial coverage (Tier 5) | All | PLANNED |

## Interface Contracts
### SaveState Cosmetics Registry
- `equipped`: `{ hat: string|null, skin: string|null, boots: string|null, attachment: string|null, projectile: string|null, deathEffect: string|null, killEffect: string|null, customCrate: object|null, teamBase: string|null }`
- `customCrate`: `{ bodyColor: string, bandColor: string, gemColor: string, gemMaterial: string }`
- `tickets`: integer balance (starts at 0)

### PayPal REST Configuration
- Email: `lemonquake@gmail.com`
- Secret: server-only `PAYPAL_CLIENT_SECRET` environment variable (never commit the value)
- Validation logic: client-side text check before awarding tickets.

## Code Layout
- `src/data/gameData.js` - Global cosmetic catalog
- `src/game/SaveSystem.js` - Save state properties and economy checks
- `src/game/Game.js` - Marketplace tab rendering, checkout, customizer screens
- `src/game/EntityFactory.js` - 3D models for boots, attachments, bases
- `src/game/CombatSystem.js` - Bullet styling overrides
- `src/game/ProjectileModels.js` - Custom projectile shapes
- `src/game/World.js` - Custom base/crate scene injections
