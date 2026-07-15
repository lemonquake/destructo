# Scope: Milestone 1 - State & Economy

## Architecture
- `src/game/SaveSystem.js`: manages save/load of tickets and cosmetic/gear ownership.
- `src/game/Game.js`: handles UI rendering, including purchases and simulated PayPal verification.
- `src/data/gameData.js`: holds global data, catalog, pricing.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Explore | Find save/spend/load logic and PayPal dialog integration points | None | DONE |
| 2 | Implement | Implement tickets, save registry, PayPal client verification, Jetpack price | M1 | DONE |
| 3 | Review | Review code correctness and adherence to interfaces | M2 | DONE |
| 4 | Verify | Verify unit tests and run build/tests | M3 | DONE |
| 5 | Audit | Run Forensic Auditor for integrity check | M4 | DONE |

## Interface Contracts
- `equipped`: `{ hat: string|null, skin: string|null, boots: string|null, attachment: string|null, projectile: string|null, deathEffect: string|null, killEffect: string|null, customCrate: object|null, teamBase: string|null }`
- `customCrate`: `{ bodyColor: string, bandColor: string, gemColor: string, gemMaterial: string }`
- `tickets`: integer balance (starts at 0)
- PayPal email: `lemonquake@gmail.com`
- PayPal Secret: `EFGph4mdUaL6ROjZBbIBXiPbzqcC0D_Lzro_ED6dd_Ezg1_iWS9MDoOdhoy-nXaluZ8VZF8LJGFXulH7`
