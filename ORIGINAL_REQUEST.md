# Original User Request

## Initial Request — 2026-07-15T17:34:37+08:00

A marketplace-style remake of the D-Builder customization studio in the Main Menu, allowing players to purchase and equip a wide variety of premium and standard cosmetics (hats, boots, attachments, custom projectiles, death/kill effects, custom team bases, and custom crates) using both earned Chips and premium Tickets (bought via PayPal).

Working directory: a:\Python\destructo
Integrity mode: benchmark

## Requirements

### R1. Customization Categories & Studio UI
Remake the D-Builder customization studio in the Main Menu (replacing the old visual studio screen). Provide a premium visual interface categorized into: Hats, Boots, Attachments, Projectiles, Death Effects, Kill Effects, Custom Crates, and Team Base.

### R2. Cosmetic Models, Custom Projectiles & Base Models
Implement creative, high-quality 3D models for all cosmetic items (e.g. boots on unit feet, attachments on backs/shoulders, custom bases, custom projectiles) with animations and generated procedural textures. Custom projectiles must support distinct projectile geometries, trailing animations, and colored effects. Custom team bases must replace the team base 3D models in active matches.

### R3. Custom Crate Builder
Implement a customizer interface allowing players to procedurally design the visual appearance (body colors, band colors, gem materials) of supply crates, saving these as custom crates that appear in-game during matches.

### R4. Marketplace Ticket Economy & PayPal Checkout
Introduce a Tickets currency. Update the Rocket Jetpack item to cost 100 tickets (with 5 tickets costing $0.99). Payments target `lemonquake@gmail.com`; PayPal REST credentials must remain in server environment variables and never be stored in this request or browser code.

## Acceptance Criteria

### Studio UI and Customization Categories
- [ ] D-Builder Studio has interactive panels for Hats, Boots, Attachments, Projectiles, Death Effects, Kill Effects, Custom Crates, and Team Bases.
- [ ] Selected cosmetics (hats, boots, attachments, custom crates, team base styles) persist in the local save state when equipped.

### Visual Model & Combat Integration
- [ ] Equipped cosmetics (hats, boots, attachments) render dynamically on the 3D Destructo units in the menu diorama and in active game matches.
- [ ] Equipped custom projectiles fire in-game with custom 3D geometries, trail colors, and fire/impact animations.
- [ ] Equipped custom base style changes the 3D structure model of the team base in active matches.

### Custom Crate Builder
- [ ] Players can customize the body, bands, and gem colors/textures of the crate in a visual editor.
- [ ] The custom crate style appears on crates dropped and manufactured in active matches.

### Economy & PayPal Checkout
- [ ] Ticket currency balance is visible in the D-Builder Studio/Marketplace UI.
- [ ] Jetpack gear price is set to 100 tickets, checking the ticket balance for purchases.
- [ ] PayPal Checkout creates and captures orders on the server, keeps its client secret off the browser, and awards tickets only from completed, non-duplicate receipts.

### Automated Testing
- [ ] New unit and integration tests are added in the `tests/` directory verifying the save state modification for tickets, cosmetic purchase logic, and D-Builder category integrations.
- [ ] All automated tests run and pass successfully via `npm run test`.
