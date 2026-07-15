## 2026-07-15T09:38:34Z
<USER_REQUEST>
You are the Test Infra Architect.
Your task is to:
1. Create `a:\Python\destructo\TEST_INFRA.md` containing the E2E Test Suite infrastructure design, exactly matching the following content:

```markdown
# E2E Test Infra: Destructo Customization Marketplace

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Marketplace UI & Save State | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 2 | Cosmetics Rendering | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 3 | In-game Combat & Projectiles | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 4 | Team Base & Crate Customization | ORIGINAL_REQUEST R3, R2 | 5 | 5 | ✓ |
| 5 | Economy & PayPal Checkout | ORIGINAL_REQUEST R4 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest, invoked via `npm run test` or `npx vitest run`.
- Test case format: Vitest standard BDD (describe, it, expect).
- Directory layout:
  - `tests/marketplaceE2E.test.js` - Contains E2E tests for Tiers 1-4.
  - `tests/e2eMocks.js` - Optional helper for setting up Three.js mocks and stubs.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Complete Player Journey | F1, F2, F3, F4, F5 | High |
| 2 | Failed Transaction Recovery | F1, F2, F5 | Medium |
| 3 | Full Custom Loadout Match | F1, F2, F3, F4 | High |
| 4 | Economy Boundary Stress | F1, F2, F5 | High |
| 5 | Save State Integrity & Match Integration | F1, F2, F3, F4 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature (25 total)
- Tier 2: ≥5 per feature (25 total)
- Tier 3: pairwise coverage of major feature interactions (5 total)
- Tier 4: ≥5 realistic application scenarios (5 total)
- **Total Minimum: 60 test cases**
```

2. Run `npm run test` or `npx vitest run` to verify that existing tests run successfully.
3. Write a handoff report in your workspace stating `a:\Python\destructo\TEST_INFRA.md` has been successfully created.
Note: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-07-15T17:38:34+08:00.
</ADDITIONAL_METADATA>
