## 2026-07-15T09:39:14Z
You are a teamwork_preview_worker agent.
Your working directory is a:\Python\destructo\.agents\worker_milestone1.
Your task is to implement the following changes in the codebase:

1. In src/data/gameData.js:
- Define and export a GEAR array:
  ```javascript
  export const GEAR = Object.freeze([
    { id: 'magnet', name: 'MAGNETIC GLOVES', price: 900, currency: 'chips' },
    { id: 'rearPlate', name: 'BALLISTIC REAR PLATE', price: 1100, currency: 'chips' },
    { id: 'jetpack', name: 'ROCKET JETPACK', price: 100, currency: 'tickets' }
  ]);
  ```

2. In src/game/SaveSystem.js:
- Update `DEFAULT_SAVE` on line 5 to include `tickets: 0`.
- Update `DEFAULT_SAVE.equipped` to be:
  `equipped: { hat: null, skin: null, boots: null, attachment: null, projectile: null, deathEffect: null, killEffect: null, customCrate: null, teamBase: null }`
- Verify that the `load()` function merges the new `tickets` and the expanded `equipped` fields properly for legacy saves.
- Implement the following methods in the `SaveSystem` class:
  - `earnTickets(amount)`: adds `Math.max(0, Math.round(amount))` to `this.data.tickets` and runs `this.commit()`.
  - `spendTickets(amount)`: if `(this.data.tickets || 0) < amount` returns `false`. Otherwise subtracts `amount`, runs `this.commit()`, and returns `true`.
  - `buyGearWithTickets(id, price)`: if `this.data.gear.includes(id)` returns `false`. If `!this.spendTickets(price)` returns `false`. Otherwise, pushes `id` to `this.data.gear`, runs `this.commit()`, and returns `true`.

3. In src/game/Game.js:
- Import `GEAR` from `../data/gameData.js`.
- Refactor `showShop()` to use the exported `GEAR` array.
  - Display the prices using the currency of the item (e.g. chips or tickets).
  - Update the shop balance header to show BOTH chips and tickets:
    `<strong>\${this.save.data.chips} CHIPS · \${this.save.data.tickets || 0} TICKETS</strong>`
  - Render a "BUY TICKETS" button:
    `<button class="btn primary" data-action="buy-tickets">BUY TICKETS</button>`
- Refactor `buyGear(id)` to support tickets:
  - Find the item in `GEAR`.
  - If `item.currency === 'tickets'`, call `this.save.buyGearWithTickets(id, item.price)`. If successful, play 'build' audio and call `this.showShop()`. Otherwise, show `INSUFFICIENT TICKETS` in the title strong element.
  - Otherwise, call `this.save.buyGear(id, item.price)`. If successful, play 'build' audio and call `this.showShop()`. Otherwise, show `INSUFFICIENT CHIPS`.
- Update `showDBuild()`:
  - Display the ticket balance alongside chips:
    `<strong>\${this.save.data.chips} CHIPS · \${this.save.data.tickets || 0} TICKETS</strong>`
  - Render a "BUY TICKETS" button:
    `<button class="btn primary" data-action="buy-tickets">BUY TICKETS</button>`
- In `bindUI()`, add a handler for the click event on action `buy-tickets`.
  - When triggered, show a simulated PayPal checkout modal.
  - Create the modal dynamically as a DOM element and append it to the document body or `#app`. Give it a clear checkout UI.
  - Implement form fields for:
    - Amount (USD) (default: 0.99, min: 0.99, max: 99.00)
    - Email (email)
    - Client Secret (password)
  - Validate inputs client-side when the submit/authorize button is clicked:
    - Email must be EXACTLY: `lemonquake@gmail.com`
    - Client Secret must be EXACTLY: `EFGph4mdUaL6ROjZBbIBXiPbzqcC0D_Lzro_ED6dd_Ezg1_iWS9MDoOdhoy-nXaluZ8VZF8LJGFXulH7`
    - Amount must be a valid number, between 0.99 and 99.00.
    - If any validation fails, render a helpful error message (e.g. `INVALID CREDENTIALS` or `INVALID AMOUNT`).
    - If successful, calculate the tickets to award: `Math.floor(amount / 0.99) * 5` (this represents 5 tickets per $0.99).
    - Call `this.save.earnTickets(tickets)`.
    - If `this.hud?.toast` is available, show a toast success message.
    - Remove the modal from the DOM.
    - Re-render the active screen: if `this.state === 'shop'` call `this.showShop()`; if `this.state === 'dbuild'` call `this.showDBuild()`.
  - The modal must also have a cancel/close button that simply removes the modal from the DOM.

4. Create a new test file `tests/economy.test.js`:
- Use vitest.
- Mock `localStorage`.
- Test `tickets` saving, loading, earning, spending, buying gear (both chips and tickets gear), and PayPal credential check logic helper functions if applicable.

Verification:
- Run `npm test` or `vitest run` to ensure all existing and new tests compile and pass.
- Verify the layout in Game.js and gameData.js compiles.
