# Execution Plan: Destructo Customization Marketplace remaking

## Objectives
Successfully design, implement, and verify the D-Builder Marketplace studio remake with simulated PayPal ticketing system, cosmetic item rendering (boots, attachments, custom projectiles, custom bases), crate customization editor, in-game match cosmetic integrations, and unit/E2E test verification.

## Orchestration Strategy: Dual Track (Implementation & E2E Testing)
We will follow the Project Pattern with a Dual Track approach:
1. **E2E Testing Track**:
   - Spawn an E2E Testing Orchestrator subagent (`e2e_testing_orch`).
   - The testing track will design a comprehensive, opaque-box test suite targeting all user requirements (Tiers 1-4).
   - Once completed, it will publish `TEST_READY.md` containing the test command and coverage summary.
2. **Implementation Track**:
   - Iterate through Milestones 1 to 7 sequentially or in parallel (depending on dependencies).
   - For each milestone, we will spawn a Sub-orchestrator subagent (`sub_orch_milestone_N`) to manage the Explorer -> Worker -> Reviewer -> Challenger -> Auditor cycle.
   - Once all implementation milestones are completed and E2E tests are available, run Phase 1: Pass 100% of E2E tests.
   - Finally, run Phase 2: Adversarial Coverage Hardening (Tier 5) using the Challenger -> Worker -> Reviewer loop.

## Milestones Summary
1. **Milestone 1: State & Economy**
   - **Scope**: SaveSystem.js update, simulated PayPal verification, tickets balance, Rocket Jetpack tickets pricing.
   - **Files**: `src/game/SaveSystem.js`, `src/game/Game.js`, `src/data/gameData.js`.
2. **Milestone 2: Studio UI & Categories**
   - **Scope**: Remake D-Builder Studio UI with tabbed layout (Hats, Boots, Attachments, Projectiles, Death Effects, Kill Effects, Custom Crates, Team Base), displays ticket/chip balances, PayPal popup, purchase/equip bindings.
   - **Files**: `src/game/Game.js`.
3. **Milestone 3: Custom Crate Builder**
   - **Scope**: Visual editor for custom crate (body, band, gem colors/materials), custom crate saving.
   - **Files**: `src/game/Game.js`.
4. **Milestone 4: Cosmetic Models (Boots, Attachments) & Unit rendering**
   - **Scope**: Create high-quality 3D models for boots and attachments (e.g. wings, cape, spikes), animate and render them dynamically on units in Menu diorama and match.
   - **Files**: `src/game/EntityFactory.js`, `src/game/MenuStage.js`, `src/game/Game.js`.
5. **Milestone 5: Custom Projectiles in Combat**
   - **Scope**: In-game player projectiles use equipped projectile geometries, trail colors, fire/impact animations.
   - **Files**: `src/game/CombatSystem.js`, `src/game/ProjectileModels.js`, `src/game/EntityFactory.js`.
6. **Milestone 6: Custom Team Bases**
   - **Scope**: Player's team base structure model replaced based on selected base cosmetic.
   - **Files**: `src/game/EntityFactory.js`, `src/game/World.js`, `src/game/Game.js`.
7. **Milestone 7: Custom Crates in Match**
   - **Scope**: Procure/manufacture/drop crates using custom crate builder colors/materials in active matches.
   - **Files**: `src/game/EntityFactory.js`, `src/game/World.js`, `src/game/DBuilder.js`.
8. **Milestone 8: Final Verification & Hardening**
   - **Scope**: Run full E2E test suite (Phase 1), then adversarial testing (Phase 2).
   - **Files**: All.

## Verification & Integrity
- **Forensic Auditor**: To be run on every milestone iteration. Violations are binary vetoes (no exceptions).
- **Liveness Timer**: 10-minute cron check on subagents, replacing hung subagents immediately.
- **Succession Protocol**: Top-level orchestrator self-succeeds at 16 spawns, spawning a successor to carry on without context bloat.
