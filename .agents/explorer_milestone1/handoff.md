# Explorer Milestone 1 Handoff Report

## 1. Observation
- **`src/game/SaveSystem.js`**:
  - `KEY` is set to `'destructo-save-v1'` on Line 3.
  - `DEFAULT_SAVE` is defined on Line 5:
    ```javascript
    const DEFAULT_SAVE = { chips: 750, missionsWon: 0, totalKills: 0, mmr: 1000, rankedWins: 0, rankedLosses: 0, debugMode: false, modeRecords: { deathmatch: defaultModeRecord(), domination: defaultModeRecord() }, campaign: { completedMissionIds: [] }, aiProfiles: [], betHistory: [], blueprints: ['pistol', 'scout'], gear: [], upgrades: {}, cosmetics: [], equipped: { hat: null, skin: null }, settings: SETTINGS_DEFAULTS };
    ```
  - It does not contain `tickets` or the extended `equipped` cosmetic fields requested in `PROJECT.md`.
  - Save serialization is executed via `commit()` (Line 18) and load via `load()` (Lines 9-17) using `localStorage`.

- **`src/game/Game.js`**:
  - Contains no `tickets` or `paypal` references.
  - Gear array and prices are hardcoded inside `showShop()` (Line 123) and `buyGear()` (Line 127):
    ```javascript
    const gear=[['magnet','MAGNETIC GLOVES',900],['rearPlate','BALLISTIC REAR PLATE',1100],['jetpack','ROCKET JETPACK',1800]];
    ```
    ```javascript
    buyGear(id){const prices={magnet:900,rearPlate:1100,jetpack:1800};if(this.save.buyGear(id,prices[id])){this.audio.play('build');this.showShop()}else this.screen.querySelector('.screen-title strong').textContent='INSUFFICIENT CHIPS'}
    ```
  - Event listener handles menu clicks inside `bindUI()` (Lines 44-77).

- **`src/data/gameData.js`**:
  - Defines the global frozen `COSMETICS` array (Lines 271-290). It does not include gear items such as the Rocket Jetpack.

- **Unit Tests and Runner**:
  - Configured in `package.json` with `"test": "vitest run"` (Line 9).
  - All 206 tests execute and pass successfully using `cmd /c "npm test"`.
  - `tests/campaignSystem.test.js` (Lines 56-64) mocks `localStorage` and performs save/load tests.
  - `tests/gameData.test.js` (Lines 93-97) spot-checks the `COSMETICS` array.

## 2. Logic Chain
- **Tickets Currency & Save State**: Because `tickets` is absent from `DEFAULT_SAVE` in `SaveSystem.js`, it must be added to the defaults (set to `0` by default) and integrated into load/save merge logic in `load()`.
- **Cosmetics Equip Registry**: Because the `equipped` object currently only contains `{ hat: null, skin: null }`, it must be expanded to include `boots`, `attachment`, `projectile`, `deathEffect`, `killEffect`, `customCrate`, and `teamBase` to satisfy the interface contracts.
- **Custom Crate Serialization**: Because `equipped.customCrate` needs to store procedural custom crate designs (bodyColor, bandColor, gemColor, gemMaterial), we can save this as an object in `SaveSystem.js` under `equipped.customCrate`.
- **PayPal Dialog Integration**: Because there is no existing checkout dialog in `Game.js`, integration points must be placed within `Game.js` `bindUI()` to catch clicks on a `buy-tickets` action, show a modal form inputting Email and Secret, check inputs client-side, award tickets via `SaveSystem`, and re-render.
- **Rocket Jetpack Price**: Since Rocket Jetpack pricing is currently hardcoded at `1800 chips` inside `Game.js` `showShop()` and `buyGear()`, it must be modified to require `100 tickets` instead of chips.
- **Unit Testing**: Because there are no tests for currency or PayPal integration, a new test file (e.g. `tests/economy.test.js`) or additions to `tests/campaignSystem.test.js` should be created to assert ticket earnings, spending, and local storage validation.

## 3. Caveats
- No actual PayPal API integration is required; a client-side simulated credential check is sufficient.
- The Rocket Jetpack is the only item whose price must be changed to tickets in this milestone.

## 4. Conclusion
The codebase is currently set up with a simple `chips`-based economy. The implementation of Milestone 1 will require:
1. Enhancing `SaveSystem.js` to support the `tickets` field, custom crate structure in `equipped.customCrate`, and the full cosmetics registry list under `equipped`.
2. Updating `Game.js` to render a PayPal simulated checkout, validate input client-side using the secret key, and update Rocket Jetpack to cost 100 tickets.
3. Adding vitest test coverage validating the ticket transaction flow and local storage persistence.

## 5. Verification Method
1. Run `cmd /c "npm test"` to execute the existing test suite and confirm all 206 tests pass.
2. Verify code updates in `SaveSystem.js`, `Game.js`, and `gameData.js` to ensure tickets, PayPal inputs, and Jetpack prices match the specifications.
3. Run vitest on any newly added test files.
