## Challenge Summary

**Overall risk assessment**: LOW

## Challenges

### [Low] Challenge 1: PayPal Amount Precision and Float Safety

- **Assumption challenged**: The checkout handles fractional inputs and conversion safely using standard JavaScript floating point representation.
- **Attack scenario**: A user inputs an amount like `0.99` but due to float precision errors, `parseFloat(amount) / 0.99` could evaluate slightly below `1` (e.g. `0.99999999`), causing `Math.floor` to truncate the ticket award to `0` instead of `5`.
- **Blast radius**: User loses money (simulated) but does not receive tickets.
- **Mitigation**: Use integer cent calculations (e.g., `Math.round(amount * 100)`) for currency values instead of floats to prevent precision degradation:
  ```js
  const cents = Math.round(parsedAmount * 100);
  const tickets = Math.floor(cents / 99) * 5;
  ```

### [Low] Challenge 2: Client Secret Storage

- **Assumption challenged**: The client secret is hardcoded in the client-side code (`SaveSystem.js`) for the simulation.
- **Attack scenario**: In a real production deployment, exposing credentials in frontend source files allows malicious actors to extract and use secrets to abuse the checkout endpoint.
- **Blast radius**: Leakage of client API keys.
- **Mitigation**: Since this is a simulated sandbox checkout modal, it is safe for development. However, once moving to production integrations (e.g. Stripe, real PayPal), credentials must reside strictly on the backend.

## Stress Test Results

- `amount = 0.99` -> `5 tickets` expected -> `5 tickets` awarded -> **PASS**
- `amount = 99.00` -> `500 tickets` expected -> `500 tickets` awarded -> **PASS**
- `amount = 0.98` -> `0 tickets (INVALID AMOUNT)` expected -> `0 tickets` -> **PASS**
- `amount = 100.00` -> `0 tickets (INVALID AMOUNT)` expected -> `0 tickets` -> **PASS**

## Unchallenged Areas

- Core canvas/WebGL rendering: out of scope for Milestone 1 economy checks.
