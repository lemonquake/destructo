# Codebase Exploration Analysis - State & Economy

## 1. Save, Spend, and Load Logic in `src/game/SaveSystem.js`

### Load & Commit Logic
`src/game/SaveSystem.js` manages save state using the local storage key `'destructo-save-v1'`.
- **Load Logic** (Lines 9-17):
  ```javascript
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const saved = JSON.parse(raw);
      const legacy={mmr:saved.mmr||1000,wins:saved.rankedWins||0,losses:saved.rankedLosses||0},modeRecords={deathmatch:{...legacy,...saved.modeRecords?.deathmatch},domination:{...defaultModeRecord(),...saved.modeRecords?.domination}};
      return { ...structuredClone(DEFAULT_SAVE), ...saved, modeRecords, campaign: { ...DEFAULT_SAVE.campaign, ...(saved.campaign || {}), completedMissionIds: [...new Set(saved.campaign?.completedMissionIds || [])] }, equipped: { ...DEFAULT_SAVE.equipped, ...(saved.equipped || {}) }, settings: { ...SETTINGS_DEFAULTS, ...(saved.settings || {}) } };
    } catch { return structuredClone(DEFAULT_SAVE); }
  }
  ```
- **Commit/Save Logic** (Line 18):
  ```javascript
  commit() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ } }
  ```

### Currency & Spending Logic
The current system only supports `chips` as currency.
- **Earn Logic** (Line 19):
  ```javascript
  earn(amount) { this.data.chips += Math.max(0, Math.round(amount)); this.commit(); }
  ```
- **Spend Logic** (Line 20):
  ```javascript
  spend(amount) { if (this.data.chips < amount) return false; this.data.chips -= amount; this.commit(); return true; }
  ```
- **Purchasing** (Lines 21-23):
  ```javascript
  unlock(id, price) { if (this.data.blueprints.includes(id)) return false; if (!this.spend(price)) return false; this.data.blueprints.push(id); this.commit(); return true; }
  buyGear(id, price) { if (this.data.gear.includes(id)) return false; if (!this.spend(price)) return false; this.data.gear.push(id); this.commit(); return true; }
  buyCosmetic(id, price) { if (this.data.cosmetics.includes(id)) return false; if (!this.spend(price)) return false; this.data.cosmetics.push(id); this.commit(); return true; }
  ```

### Tickets and Equipped Items Structure
The interface contract requires support for `tickets` (integer balance starting at 0) and an expanded `equipped` object.
- **Current `DEFAULT_SAVE` Structure** (Line 5):
  ```javascript
  const DEFAULT_SAVE = { chips: 750, missionsWon: 0, totalKills: 0, mmr: 1000, rankedWins: 0, rankedLosses: 0, debugMode: false, modeRecords: { deathmatch: defaultModeRecord(), domination: defaultModeRecord() }, campaign: { completedMissionIds: [] }, aiProfiles: [], betHistory: [], blueprints: ['pistol', 'scout'], gear: [], upgrades: {}, cosmetics: [], equipped: { hat: null, skin: null }, settings: SETTINGS_DEFAULTS };
  ```
  - **Difference**: The current `equipped` state in `DEFAULT_SAVE` only tracks `hat` and `skin`.
  - **Required Structure**:
    - `equipped`: `{ hat: string|null, skin: string|null, boots: string|null, attachment: string|null, projectile: string|null, deathEffect: string|null, killEffect: string|null, customCrate: object|null, teamBase: string|null }`
    - `tickets`: integer balance (starts at 0)

### Custom Crate Info Serialization
According to the interface contract:
- `customCrate` structure: `{ bodyColor: string, bandColor: string, gemColor: string, gemMaterial: string }`
- **Location**: It is stored under the player's save state registry in `this.data.equipped.customCrate`. There is no dedicated property for custom crate serialization in `SaveSystem.js` yet. During milestone implementation, it must be added to the `equipped` state structure.

---

## 2. PayPal Checkout Integration in `src/game/Game.js`

### UI and Event Handling Points
`src/game/Game.js` binds actions to user clicks within `bindUI()` (Lines 44-77).
- **Current Shop Render Point** (Lines 123, 125):
  - `showShop()` displays standard gear inside the Marketplace and uses `chips`.
  - `showDBuild()` displays the customization studio.
- **Current Click Handlers** (Lines 71):
  ```javascript
  else if(action.startsWith('gear:'))this.buyGear(action.slice(5));else if(action.startsWith('cos:'))this.handleCosmetic(action.slice(4))
  ```

### PayPal Verification and Integration
No PayPal modal or purchase logic currently exists.
To integrate the client-side PayPal credentials check:
1. **Purchase Modal/Trigger**: A new data-action (e.g., `buy-tickets`) should be added to the Marketplace or Studio UI which opens a PayPal simulation modal.
2. **Form Submission Handler**: In `bindUI()`, add a listener for submission of the PayPal simulator form.
3. **Verification Logic**: Check user input against:
   - Email: `lemonquake@gmail.com`
   - Secret: `EFGph4mdUaL6ROjZBbIBXiPbzqcC0D_Lzro_ED6dd_Ezg1_iWS9MDoOdhoy-nXaluZ8VZF8LJGFXulH7`
4. **Outcome**: If valid, call a new tickets-funding method in `SaveSystem.js` (e.g. `earnTickets(amount)`) and update the UI with the new balance.

---

## 3. Cosmetics Catalog & Pricing in `src/data/gameData.js`

### Cosmetics Catalog
The cosmetics are defined in `src/data/gameData.js` inside the `COSMETICS` array (Lines 271-290):
```javascript
export const COSMETICS = Object.freeze([
  { id: 'cap',     kind: 'hat',  name: 'Combat Cap',     price: 300 },
  { id: 'helmet',  kind: 'hat',  name: 'Battle Helmet',  price: 500 },
  { id: 'mohawk',  kind: 'hat',  name: 'Neon Mohawk',    price: 750 },
  { id: 'horns',   kind: 'hat',  name: 'Demon Horns',    price: 900 },
  { id: 'halo',    kind: 'hat',  name: 'Golden Halo',    price: 1200 },
  { id: 'crown',   kind: 'hat',  name: 'Royal Crown',    price: 2000 },
  { id: 'antenna', kind: 'hat',  name: 'Radio Antenna',  price: 400 },
  { id: 'tophat',  kind: 'hat',  name: 'Fancy Top Hat',  price: 1500 },
  { id: 'camo',    kind: 'skin', name: 'Jungle Camo',    price: 600 },
  { id: 'tiger',   kind: 'skin', name: 'Tiger Stripes',  price: 800 },
  { id: 'digital', kind: 'skin', name: 'Digital Camo',   price: 700 },
  { id: 'hex',     kind: 'skin', name: 'Hex Mesh',       price: 900 },
  { id: 'circuit', kind: 'skin', name: 'Circuit Board',  price: 1100 },
  { id: 'scales',  kind: 'skin', name: 'Dragon Scales',  price: 1300 },
  { id: 'dots',    kind: 'skin', name: 'Pop Dots',       price: 500 },
  { id: 'urban',   kind: 'skin', name: 'Urban Camo',     price: 650 },
  { id: 'leopard', kind: 'skin', name: 'Leopard Print',  price: 1000 },
  { id: 'stripes', kind: 'skin', name: 'Racing Stripes', price: 550 },
]);
```
- **Note**: This catalog uses `chips` for its prices. It does not define gear or tickets pricing.

### Rocket Jetpack Pricing Location
The Rocket Jetpack is a gear item.
- Gear items are currently defined directly inside `src/game/Game.js`:
  - `showShop()` (Line 123):
    ```javascript
    const gear=[['magnet','MAGNETIC GLOVES',900],['rearPlate','BALLISTIC REAR PLATE',1100],['jetpack','ROCKET JETPACK',1800]];
    ```
  - `buyGear(id)` (Line 127):
    ```javascript
    buyGear(id){const prices={magnet:900,rearPlate:1100,jetpack:1800};if(this.save.buyGear(id,prices[id])){this.audio.play('build');this.showShop()}else this.screen.querySelector('.screen-title strong').textContent='INSUFFICIENT CHIPS'}
    ```
  - **Proposed Change**: Change Rocket Jetpack price to `100 tickets` instead of `1800 chips`. This requires updating the `buyGear` method to check the `tickets` balance using `SaveSystem`.

---

## 4. Unit Test Files and Test Runner Setup

### Test Runner
The test runner is configured in `package.json` to use `vitest`:
- **Command**: `vitest run`
- **Execution CLI**: `cmd /c "npm test"` (used to execute all tests)

### Relevant Tests
- **Save State Persistence**:
  `tests/campaignSystem.test.js` (Lines 56-64) contains campaign persistence tests using a mocked `localStorage`:
  ```javascript
  describe('campaign persistence',()=>{
    beforeEach(()=>{const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),clear:()=>memory.clear()}});
    it('starts with Mission 1 available and records unique completions',()=>{
      const save=new SaveSystem();expect(save.campaignCompleted('four-of-a-kind')).toBe(false);save.completeCampaignMission('four-of-a-kind');save.completeCampaignMission('four-of-a-kind');expect(save.data.campaign.completedMissionIds).toEqual(['four-of-a-kind']);expect(CAMPAIGN_MISSIONS['gold-rush'].requires).toBe('four-of-a-kind');
    });
    it('migrates legacy saves without changing their currencies or records',()=>{
      localStorage.setItem('destructo-save-v1',JSON.stringify({chips:4321,missionsWon:9,mmr:1200,rankedWins:3,rankedLosses:2}));const save=new SaveSystem();expect(save.data.chips).toBe(4321);expect(save.data.missionsWon).toBe(9);expect(save.data.campaign.completedMissionIds).toEqual([]);expect(save.modeRecord('deathmatch')).toMatchObject({mmr:1200,wins:3,losses:2});
    });
  });
  ```
- **Cosmetics Catalog**:
  `tests/gameData.test.js` (Lines 93-97) validates that cosmetics exist and have positive prices:
  ```javascript
  it('stocks the D-Build studio with hats and skins', () => {
    expect(COSMETICS.filter(c => c.kind === 'hat').length).toBeGreaterThanOrEqual(6);
    expect(COSMETICS.filter(c => c.kind === 'skin').length).toBeGreaterThanOrEqual(8);
    for (const c of COSMETICS) expect(c.price).toBeGreaterThan(0);
  });
  ```
