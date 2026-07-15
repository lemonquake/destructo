# PayPal activation

The checkout code is complete, but PayPal requires a REST app client ID and client secret in addition to the merchant email.

1. Sign in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications) with the account that owns `lemonquake@gmail.com`.
2. Create a REST app and copy its sandbox client ID and secret into a local `.env` file using `.env.example` as the template.
3. Keep `PAYPAL_MODE=sandbox`, start the game, and complete purchases with PayPal sandbox buyer accounts.
4. When sandbox testing is approved, replace the credentials with the REST app's live credentials and set `PAYPAL_MODE=live`.
5. Configure the same three values as secret runtime environment variables on the production host. Never put the client secret in browser code or commit `.env`.

The server calculates prices from its own six-pack catalog, creates PayPal Orders v2 orders, captures approved orders, verifies amount/status, recovers already-captured orders, and returns a minimal ticket receipt. The game credits each PayPal order ID only once.

