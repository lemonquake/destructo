# Scope: Milestone 2: Studio UI Tabs

## Architecture
- Customization studio (showDBuild) in `src/game/Game.js` which needs to be refactored into a tabbed interface.
- Tab categories: Hats, Boots, Attachments, Projectiles, Death Effects, Kill Effects, Custom Crates, Team Base.
- Needs to display Chips balance and Tickets balance.
- Action to BUY TICKETS (triggers client PayPal dialog).
- Display cosmetics matching their categories from global COSMETICS catalog (defined in `src/game/gameData.js` or elsewhere).
- Select item to buy or equip. Update SaveSystem calls.
- Custom Crates has a "Procedurally Customize Crate" button and list of equipped custom crates.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration | Find UI bindings, PayPal calls, COSMETICS list, and SaveSystem calls. | None | DONE |
| 2 | Implementation | Implement Tabbed UI, layout, item buying/equipping logic, PayPal button, Custom Crates placeholder. | M1 | IN_PROGRESS |
| 3 | Review | Check layout and responsiveness of HTML/CSS. | M2 | PLANNED |
| 4 | Verification | Run and pass E2E tests in tests/marketplaceE2E.test.js. | M3 | PLANNED |
| 5 | Integrity Audit | Run Forensic Auditor to verify clean code implementation. | M4 | PLANNED |

## Interface Contracts
- DBuild UI functions inside `src/game/Game.js`
- Cosmetic definitions from gameData.js
- SaveSystem API for saving equipped items and balances.
