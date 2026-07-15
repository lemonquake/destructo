# Handoff Report - explorer_milestone2

## 1. Observation

### showDBuild() and UI Bindings in `src/game/Game.js`
- **Method Definition** (`src/game/Game.js`, lines 125-214):
  ```javascript
  showDBuild(){
    this.state='dbuild';
    if (!this.dbuildTab) this.dbuildTab = 'hats';
    const owned=this.save.data.cosmetics,eq=this.save.data.equipped;
    this.audio.playMusic('/music/main_theme.mp3');
    ...
  ```
- **UI Structure**: Renders a main menu screen consisting of:
  - Header: Shows the title `TEAM COSMETICS` and current chip/ticket balances (`${this.save.data.chips} CHIPS · <span id="tickets-val">${this.save.data.tickets || 0}</span> TICKETS`).
  - Tabs Row: A container (`.marketplace-tabs`) containing buttons for the tabs: `Hats`, `Boots`, `Attachments`, `Projectiles`, `Death Effects`, `Kill Effects`, `Custom Crates`, and `Team Base`.
  - Tab Content Area (`#tab-content-area`): Renders dynamically depending on `this.dbuildTab`.
    - If `this.dbuildTab === 'customCrates'`, renders the **Crate Visual Designer** (color inputs for body, band, gem, text input for gem material, and a "SAVE CRATE" button).
    - Otherwise, filters the `COSMETICS` catalog by `kind` matching the current tab and displays them as buttons showing the name, price/currency, and ownership/equip status.
  - Action Buttons: `BUY TICKETS` (`data-action="buy-tickets"`) and `BACK` (`data-action="hub"`).
- **UI Interaction & Bindings**:
  - In `bindUI()` (`src/game/Game.js`, lines 44-77), a delegation click listener is bound to `this.screen`:
    - `action === 'dbuild'` calls `this.showDBuild()`.
    - `action.startsWith('cos:')` calls `this.handleCosmetic(action.slice(4))`.
    - `action === 'buy-tickets'` calls `this.showBuyTicketsModal()`.
  - Inside `showDBuild()`, tab buttons bind individual click event listeners to update `this.dbuildTab` and call `this.showDBuild()`.

### PayPal Checkout & Ticket Purchase
- **Trigger**: Activated by clicking the `BUY TICKETS` action button in the studio/shop UI.
- **Implementation** (`src/game/Game.js`, lines 283-353):
  - Sets `this.paypalModalActive = true` and appends a modal (`#paypal-modal`) containing input fields: Amount (USD), Email Address, and Client Secret.
  - On submit: calls `validatePayPalCredentials(emailVal, secretVal, amountVal)` imported from `./SaveSystem.js`.
  - If validation is successful: calls `this.save.earnTickets(result.tickets)`, triggers a success HUD toast, removes the modal, and refreshes the screen.
- **Validation Logic** (`src/game/SaveSystem.js`, lines 55-65):
  - Enforces amount constraints: `parsedAmount >= 0.99` and `parsedAmount <= 99.00`.
  - Enforces static email check: `email === 'lemonquake@gmail.com'`.
  - Enforces static client secret check: `secret === 'EFGph4mdUaL6ROjZBbIBXiPbzqcC0D_Lzro_ED6dd_Ezg1_iWS9MDoOdhoy-nXaluZ8VZF8LJGFXulH7'`.
  - Ticket Reward Formula: `Math.floor(parsedAmount / 0.99) * 5` (each $0.99 purchases 5 tickets).

### Global COSMETICS Catalog
- **Definition** (`src/data/gameData.js`, lines 271-290):
  - Exported as a frozen array: `export const COSMETICS = Object.freeze([ ... ])`.
- **Item Structure**:
  - `id`: Unique string identifier (e.g. `'cap'`).
  - `kind`: Category classification (string, currently only `'hat'` and `'skin'` exist in the array).
  - `name`: Human-readable display name (string).
  - `price`: Cost of item (number).
  - `currency`: Optional field (either `'chips'` or `'tickets'`), default is `'chips'` if absent. (Currently, all elements in the frozen array lack this field, meaning they default to chips).

### SaveSystem Module
- **Definition** (`src/game/SaveSystem.js`):
  - Contains class `SaveSystem` containing `this.data` loaded from `localStorage.getItem('destructo-save-v1')`.
- **Save/Load Logic**:
  - `load()`: retrieves save data and fallback-merges it with `DEFAULT_SAVE` values.
  - `commit()`: persists `this.data` to `localStorage` under key `'destructo-save-v1'`.
- **Equipped Items Storage**:
  - Stored inside `this.data.equipped` (fields: `hat`, `skin`, `boots`, `attachment`, `projectile`, `deathEffect`, `killEffect`, `customCrate`, `teamBase`).
  - `equipCosmetic(kind, id)` toggles equipping/de-equipping.
- **Balance Changes**:
  - `earn(amount)` and `spend(amount)` modify chip balances.
  - `earnTickets(amount)` and `spendTickets(amount)` modify ticket balances.
  - `buyCosmetic(id, price, currency)` handles purchasing.

### Custom Crates & Crate Builder
- **Definition & References**:
  - Custom crate visual design UI is defined inline inside `showDBuild()` under the `customCrates` tab content.
  - `showCrateBuilder()` method in `src/game/Game.js` switches `this.dbuildTab` to `'customCrates'` and calls `showDBuild()`.
- **Storage & Equipped Structure**:
  - Stored in the save state under `this.data.customCrate` and `this.data.equipped.customCrate` as:
    ```json
    { "bodyColor": "#ff0000", "bandColor": "#00ff00", "gemColor": "#0000ff", "gemMaterial": "glass" }
    ```
- **In-Game Rendering**:
  - In `EntityFactory.js` (`createCrate(position, type)`), it loads `customColors` from the save state. If present, it clones the materials of the crate's `box`, `bands`, and `gem` meshes and overrides their colors with `bodyColor`, `bandColor`, and `gemColor` respectively.

### Existing Test Files
- **`tests/marketplaceE2E.test.js`**:
  - Consists of E2E tests validating tab presence (Hats, Boots, Attachments, Projectiles, Death/Kill Effects, Custom Crates, Team Base).
  - Asserts that equipped cosmetics (hat, boots, attachment, team base) properly render their respective meshes on units and factories.
  - Asserts that projectile style overrides propagate into `CombatSystem.spawn`.
  - Tests PayPal dialog integration, validation boundaries, and purchase/equipment flows.
- **`tests/economy.test.js`**:
  - Asserts `SaveSystem` initializes with tickets and equipped slots, migrates legacy saves, and enforces bounds/computations in `validatePayPalCredentials`.
- **`tests/gameData.test.js`**:
  - Verifies minimum size of the `COSMETICS` array and basic integrity (valid prices).

---

## 2. Logic Chain

1. **Observation 1** demonstrates that `showDBuild()` renders a layout containing the new tabs defined in Milestone 2. Tab changes trigger re-rendering of `showDBuild()`.
2. **Observation 2** establishes that ticket balance updates are handled by the client-side PayPal modal in `showBuyTicketsModal()`, which passes user credentials and checkout amount to `validatePayPalCredentials()` and updates the `SaveSystem` balance on success.
3. **Observation 3** links the items shown on the D-Build tabs (except `customCrates`) to the global `COSMETICS` catalog exported in `src/data/gameData.js`. Since the catalog currently only has `hat` and `skin` kinds, other tabs (like Boots or Projectiles) will filter to empty arrays, relying on fallback rendering logic or E2E test mocks.
4. **Observation 4** verifies that `SaveSystem` acts as the persistent store. It records equipped items inside `this.data.equipped` and balance variables under `this.data.chips` and `this.data.tickets`, persisting changes via `commit()` to `localStorage`.
5. **Observation 5** shows that custom crates are procedurally styled in `EntityFactory.js` by intercepting crate spawning, loading the equipped colors from `localStorage` under `equipped.customCrate`, and overriding body, band, and gem mesh material colors.
6. **Observation 6** identifies `marketplaceE2E.test.js`, `economy.test.js`, and `gameData.test.js` as the test coverage files validating economy boundaries, cosmetics rendering, tab presence, and PayPal modal logic.

---

## 3. Caveats

- **Cosmetics Catalog Gaps**: The global `COSMETICS` catalog in `src/data/gameData.js` only contains item definitions for `hat` and `skin` kinds. Cosmetic items representing the other UI categories (boots, attachments, projectiles, deathEffects, killEffects, teamBase) do not currently exist in the global static catalog, meaning their tabs will be empty in normal play unless mock data or additional static declarations are introduced.
- **Hardcoded PayPal Credentials**: The PayPal checkout simulator employs a static, hardcoded client email and secret key directly inside `SaveSystem.js`, meaning no external network handshake is performed.

---

## 4. Conclusion

- The D-Build studio is structured as a client-side single-page UI screen dynamically generated in `src/game/Game.js`.
- It saves custom loadouts and purchases into `localStorage` via `SaveSystem` under `'destructo-save-v1'`.
- Simulated ticket purchases are successfully validated locally using the helper function `validatePayPalCredentials` with hardcoded credentials and limits.
- Procedural custom crate color customization is active in `EntityFactory.js`, which clones and overrides crate meshes at spawn time using save state values.
- Existing E2E tests fully cover UI layout tabs, cosmetics rendering, economy modifications, and PayPal boundaries.

---

## 5. Verification Method

- **Tests execution**:
  To verify the marketplace integration and economy logic, run:
  ```bash
  npx vitest run tests/marketplaceE2E.test.js
  npx vitest run tests/economy.test.js
  ```
- **Files to Inspect**:
  - `src/game/Game.js` — lines 125-214 for tab layout and custom crate controls.
  - `src/game/SaveSystem.js` — lines 55-65 for credentials checking.
  - `src/game/EntityFactory.js` — lines 234-260 for custom crate color overlays.
