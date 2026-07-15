## 2026-07-15T10:06:46Z
You are the teamwork_preview_worker agent for Milestone 2: Studio UI Tabs.
Your working directory is a:\Python\destructo\.agents\worker_milestone2.
Your task is to implement the tabbed customization studio in src/game/Game.js and expand the cosmetics catalog in src/data/gameData.js.

Please perform the following implementation tasks:
1. In `src/game/Game.js`, refactor `showDBuild()`:
   - Remake the customization studio into a premium visual tabbed interface categorized into: Hats, Boots, Attachments, Projectiles, Death Effects, Kill Effects, Custom Crates, and Team Base.
   - Display both earned Chips balance and premium Tickets balance (e.g. `tickets || 0`).
   - Include a "BUY TICKETS" action/button triggering the PayPal checkout dialog (which calls `showBuyTicketsModal()`).
   - The tabs must display cosmetics from the global `COSMETICS` catalog matching their category (`hat` -> Hats, `boots` -> Boots, `attachment` or `jetpack` -> Attachments, `projectile` -> Projectiles, `deathEffect` -> Death Effects, `killEffect` -> Kill Effects, `teamBase` -> Team Base).
   - In the Custom Crates tab, display:
     - A button to "Procedurally Customize Crate" which calls `this.showCrateBuilder()`.
     - Input fields to show and edit the equipped custom crate color and materials: `#body-color-input` (defaulting to `#ff0000`), `#band-color-input` (defaulting to `#00ff00`), `#gem-color-input` (defaulting to `#0000ff`), `#gem-material-input` (defaulting to `'glass'`), and a "SAVE CRATE" button with id `#save-crate-btn`. The save button must write custom crate colors to `this.save.data.customCrate` and `this.save.data.equipped.customCrate` and call `this.save.commit()`.
   - IMPORTANT: To ensure existing E2E tests do not overwrite the UI, the output of `showDBuild()` MUST contain the uppercase string `BOOTS` (e.g. as a hidden comment `<!-- BOOTS -->` or as part of a class/label).
   - HTML/CSS styling for tabs navigation and cards selection must be clean and modular. Clicking an item buys it (deducting chips/tickets via `this.save.buyCosmetic(id, price, currency)`) or equips it (via `this.save.equipCosmetic(kind, id)`).

2. In `src/data/gameData.js`, expand the frozen `COSMETICS` array to contain items representing all the tabs categories:
   - Hats: keep existing hats (cap, helmet, mohawk, horns, halo, crown, antenna, tophat).
   - Boots:
     - Speedy Boots (`speedy`), price 600 chips
     - Power Jumpers (`power_jumpers`), price 800 chips
     - Iron Boots (`iron_boots`), price 1000 chips
     - Heavy Boots (`heavy_boots`), price 1200 chips
   - Attachments/Jetpacks:
     - Rocket Thrusters (`rocket`), price 900 chips
     - Rocket Jetpack (`rocket-jetpack`), price 100 tickets (`currency: 'tickets'`)
     - Rocket Launcher (`rocket_launcher`), price 1500 chips
   - Projectiles:
     - Laser Beam (`laser`), price 1000 chips
     - Plasma Bolt (`plasma`), price 1200 chips
   - Death Effects:
     - Implosion (`implosion`), price 700 chips
     - Fireworks (`fireworks`), price 900 chips
   - Kill Effects:
     - Skull Marker (`skull`), price 500 chips
     - Lightning Strike (`lightning`), price 850 chips
   - Team Base:
     - Citadel Base (`citadel-base`), price 40 tickets (`currency: 'tickets'`)
     - Fortress Base (`fortress-base`), price 60 tickets (`currency: 'tickets'`)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Run `npm.cmd test` or vitest to verify that all tests pass after your changes.
Write your completion status to a:\Python\destructo\.agents\worker_milestone2\handoff.md and notify the parent (db2fe524-854e-4485-bb2a-c6ab96f34fe0) using send_message when finished.
