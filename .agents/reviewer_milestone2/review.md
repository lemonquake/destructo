# Review & Challenge Report — Milestone 2: Studio UI Tabs

## Review Summary

**Verdict**: APPROVE

The implementation of Milestone 2 (Studio UI Tabs, Cosmetics, PayPal simulated modal, and Custom Crate storage) is functionally complete, robust, and correctly integrated. The test coverage of 276 passing tests (including 60 comprehensive E2E tests for the marketplace) confirms correct behavior under various happy paths and boundary conditions. All specifications from the Game Design Document and `PROJECT.md` have been met.

---

## Findings

### [Minor] Finding 1: Unstyled Tab Selector Buttons

- **What**: The tab selector buttons (`.tab-btn`) are rendered with only the class `tab-btn` and no `.btn` class.
- **Where**: `src/game/Game.js` lines 143-152.
- **Why**: There are no CSS rules for `.tab-btn` or `.tab-btn.active` in `src/styles.css`. As a result, the tab buttons render as default browser gray buttons, and the active tab button lacks a visual indicator of being selected.
- **Suggestion**: Add the standard `.btn` class to the tab buttons (e.g., `<button class="btn tab-btn ...">`) or define custom styling for `.tab-btn` and `.tab-btn.active` in `src/styles.css` to align with the game's theme.

### [Minor] Finding 2: Lack of Event Delegation for Tab Switching

- **What**: Tab buttons bind click events individually on every invocation of `showDBuild()`.
- **Where**: `src/game/Game.js` lines 214-220.
- **Why**: This deviates from the rest of the UI architecture in `Game.js` which uses event delegation via `bindUI()` and the `data-action` attribute.
- **Suggestion**: Use the `data-action` system for tab switching (e.g., `data-action="tab:hats"`) and handle the tab clicks in `bindUI()`. This would simplify the code and remove manual event binding during rendering.

---

## Verified Claims

- **Claim**: The `rocket-jetpack` price is 100 tickets.
  - **Method**: Verified in `src/data/gameData.js` line 297 and tested in `tests/marketplaceE2E.test.js` (Test 25).
  - **Status**: PASS

- **Claim**: Simulated PayPal credentials are secure and validated client-side.
  - **Method**: Verified function `validatePayPalCredentials` in `src/game/SaveSystem.js` lines 55-65 and tested validation inputs in `tests/marketplaceE2E.test.js`.
  - **Status**: PASS

- **Claim**: Custom Crate properties (body color, band color, gem color, gem material) persist and serialize.
  - **Method**: Verified `save.data.customCrate` in `src/game/Game.js` lines 182-193 and in `src/game/EntityFactory.js` lines 242-260.
  - **Status**: PASS

- **Claim**: Team Base custom style swaps correctly in active matches.
  - **Method**: Verified `swapTeamBaseModel` in `src/game/Game.js` lines 227-246 and in `src/game/EntityFactory.js` lines 203-208.
  - **Status**: PASS

---

## Coverage Gaps

- **Tab Buttons visual polish** — risk level: LOW — recommendation: Accept risk for now or fix with style updates.
- **Floating point accuracy on larger deposit values** — risk level: LOW — recommendation: Keep `Math.floor(parsedAmount / 0.99)` as is since test loop shows no precision issues up to $99.

---

## Unverified Items

- None (all core claims were verified and tested successfully).

---

## Adversarial Stress Testing / Challenge Report

### [Low] Challenge 1: Custom Crate Malformed Color Inputs
- **Assumption challenged**: User input for crate colors will always be valid hex codes.
- **Attack scenario**: User enters raw strings like "invalid-color" or "not-a-color" into color/material fields.
- **Blast radius**: Three.js parser prints console warnings (`THREE.Color: Unknown color ...`) but falls back to default black/white geometries rather than crashing.
- **Mitigation**: Add client-side regex check or rely on color-picker default constraints.

### [Low] Challenge 2: PayPal Modal Interactivity Bypass
- **Assumption challenged**: Clicking tabs during active transaction check is blocked.
- **Attack scenario**: Trigger checkout modal and try clicking background buttons.
- **Blast radius**: The modal overlay has a height/width of `100vh`/`100vw` and `z-index: 99999`, which fully covers and intercepts all mouse events, preventing interaction with underlying menus.
- **Mitigation**: Handled correctly.
