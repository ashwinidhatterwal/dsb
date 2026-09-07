# Reliability update — read before uploading

This is an update to your existing Google Sheets + Apps Script shop. No paid services, new database or replacement Google Sheet is required. The supplied ZIP has been patched and tested locally; it has not been deployed to your live website or Apps Script account.

## 1. Keep your existing settings

Before replacing Apps Script, keep a private copy of your current script and its settings. In Apps Script → Project Settings → Script properties, save:

| Property | Value |
| --- | --- |
| ADMIN_KEY | Your existing private admin password; choose a new strong one if you used the placeholder |
| TELEGRAM_BOT_TOKEN | Your existing Telegram bot token |
| TELEGRAM_CHAT_ID | Your existing Telegram chat ID |

Never upload these secrets to GitHub. Script properties take precedence over source constants. The distributed constants are blank. If Telegram is not used, omit its two properties.

The website's current API URL, WhatsApp number, UPI ID and domain are preserved. The supplied fee constants remain free delivery from ₹499, ₹40 delivery below that, and ₹20 COD; if your deployed script uses different fees, copy YOUR values into the new code before deploying.

## 2. Update Apps Script and the website together

1. Replace your Apps Script source with the supplied `code.gs` and save.
2. Deploy → Manage deployments → edit the EXISTING web app → Version: New version → Deploy. Keep the same deployment URL. Continue to execute as yourself with access set to Anyone, as before.
3. Upload the updated website files and the `.github` directory to your existing repository's default branch. Do not upload the ZIP as the website itself. Do not put private script settings in the repository.
4. In GitHub → Settings → Pages, select **GitHub Actions** as the source. Preserve your existing custom domain `suhagbhandar.in` and HTTPS setting.
5. Open Actions → **Update sitemap and deploy shop** → Run workflow. Wait for the entire job, including **Deploy website**, to succeed.

Do these steps during a quiet period. Old and new checkout versions intentionally refuse incompatible requests rather than silently accepting an unverified total; checkout may be briefly unavailable between the backend and frontend deployments. Open a fresh page or refresh afterward.

The required automation files are:

- `.github/workflows/update-product-sitemap.yml`
- `.github/scripts/generate-sitemap.mjs`
- `.github/scripts/prepare-public.mjs`

If your upload dialog hides `.github`, create those three paths with GitHub's Add file → Create new file and paste their exact contents. You need all three. The publishing workflow deploys the public storefront only, leaving backend source, guides, tests and sample data out of the website artifact.

A failed API/sitemap request stops deployment and keeps the existing published site. The repository workflow needs its normal write permission to save a changed sitemap. If repository policy denies that permission, the workflow will stop and report the problem.

## 3. Existing Sheets and accounting

Your Products, Orders, Reviews and OrderItems column layout remains compatible. Do not create a new spreadsheet or re-import sample rows.

- `OrderTransactions`: a hidden internal tab is created automatically for retry IDs, original order details and stock recovery. It contains customer/order data. Do not publish or delete it.
- `OrderItems`: created automatically if absent, using the existing supplied columns. Missing historical snapshots cannot be reconstructed accurately from current costs.
- `PromoCustomers` and the `Promos.uses` counter keep their existing behaviour.
- `CHECKOUT_SIGNING_KEY`: an internal Script Property is created automatically. Do not remove it during active checkouts.

Use the admin panel for inventory and status changes. Direct edits in Google Sheets bypass application locks; do not alter product IDs/stock, order rows, promo rows or the internal journal while an order or recovery is in progress. If the script reports that a product or promo needed for recovery is missing, restore that row and retry. Persistent Sheets outages can delay recovery; this system cannot make Google Sheets a transactional database.

The dashboard now counts **Delivered and Fulfilled** orders in completed order value and merchandise profit, grouped by the original order date. Pending, Confirmed, Packed and Shipped orders remain visible but are excluded from those figures. Historical figures may therefore decrease.

Merchandise profit = item selling value − recorded item cost − order discount. Delivery/COD fees and delivery/operating expenses are excluded from merchandise profit. Order value includes customer fees. These are not net-profit or bank-payment-verification figures. Missing accounting history is shown as Incomplete when detected.

## 4. Customer behaviour

- Review order → server checks prices, stock, promo and fees → Confirm order.
- Invalid prices are blocked. A changed price requires another review; an invalid promo never silently produces a full-price order.
- The confirmed order shows an English slip. For UPI, the accepted total and order reference are used in the payment link and QR code. The slip clearly does not confirm receipt of payment.
- On an interrupted connection, use Check order status or Retry same order. A saved attempt is recovered without creating another order. Allow browser storage so the retry ID survives a reload. Do not clear site storage while an order is unresolved.
- The last order slip is available from the empty cart's View last order button on the same browser.
- The shop still sends WhatsApp follow-up manually. Telegram alerts remain best-effort and separate from order acceptance; check Orders if an alert is missing.

The catalogue never substitutes sample products for a live API failure. A retry message is shown. A successful catalogue is reused in the current browser session for up to 60 seconds to speed page navigation; checkout always verifies against the server. There is no offline checkout.

## 5. Abuse prevention and accessibility

The update adds field bounds, spreadsheet-formula escaping, review/product validation, duplicate-review checks, honeypots, and best-effort throttles. Default limits are 5 new orders per phone/hour, 120 new orders/hour overall, 30 quotes per phone/10 minutes, 3 reviews per browser/hour and 60 reviews/hour overall. Duplicate successful order retries do not consume a new-order allowance. Limits use Apps Script cache and may reset on eviction; they are not verified customer identities, OTP protection or full bot protection.

The admin upload code resizes supported images to at most 1600 pixels on the longest side. Existing compatible Cloudinary URLs get smaller display variants. In your existing Cloudinary unsigned preset, restrict allowed formats and maximum upload size; client-side checks cannot enforce account-level restrictions. No Cloudinary account settings were changed by this patch.

Cart, search, tracking and size-guide overlays gain focus containment, background inertness and focus restoration. The unused service-worker precache is removed; install support is preserved.

## Verification supplied

22 automated regression scenarios passed using isolated fixtures: 15 backend checks and 7 frontend/state-machine/sitemap checks. JavaScript syntax and local asset references were checked. Tests do not place real orders, write your real Sheet, verify actual payments, send Telegram messages, or prove behaviour on every mobile browser.

For optional local verification with Node.js:

    node tests/backend-regression.cjs
    node tests/frontend-regression.cjs

After deployment, check the live catalogue, one product page, COD/UPI review totals, admin login and sitemap.xml. For UPI, simply opening the payment link is not payment verification. Check Search Console for indexing; sitemap inclusion does not guarantee a Google ranking.
