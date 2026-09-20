# Maintaining the shop

## Deployment

Upload the whole project, including `.github`, `scripts`, and `src`, to the existing repository. The root HTML, JavaScript, CSS and `code.gs` are ready to deploy. Copy only root `code.gs` into the existing Apps Script project, then redeploy at the same URL. Do not also paste the backend source files into Apps Script: that would duplicate declarations.

## Source and generated files

- Edit backend features in `src/backend/`. Each file groups one responsibility.
- Edit storefront styles in `src/styles/`. `src/build-order.json` explicitly preserves their cascade order.
- Run `node scripts/build.mjs` to regenerate root `code.gs`, `style.css`, and `admin-chat.js`.
- Run `node scripts/build.mjs --check` to detect a stale generated file before deployment.
- Commit both the source and generated output. No npm install is needed for either command.
- Most root frontend JavaScript, `admin-base.css`, and `admin-theme.css` are maintained directly. `admin-chat.js` is an exception: edit `src/admin-ai/` and rebuild it.

## Frontend map

| File | Responsibility |
| --- | --- |
| `config.js` | Store configuration and endpoint |
| `utils.js` | Shared DOM, currency, request and presentation helpers |
| `seo.js` | Shared price calculations and structured product data |
| `cart.js` | Persistent cart and stock-aware mutations |
| `products-data.js` | Catalogue loading, caching and normalized products |
| `render-helpers.js` | Product cards and their actions |
| `cart-ui-core.js` | Cart state, badge animation, tracking, promo/fee helpers and drawer lifecycle |
| `cart-ui-drawer.js` | Cart rendering, order confirmation and downloadable receipt |
| `cart-ui-checkout.js` | Checkout validation/submission, retry recovery and payment QR |
| `app.js` | Home categories, sorting, search and carousels |
| `product.js` | Product gallery, sizes, reviews and page actions |
| `catalog.js` | Live catalogue page |
| `admin.js` | Admin connection, products, orders and editor wiring |
| `admin-dashboard.js` | Dashboard metrics, summaries and visualizations |
| `admin-workspace.js` | Admin drafts, archive and payment verification |
| `admin-autofill.js` | Review-first ChatGPT/JSON product detail parser and form autofill |
| `i18n.js` | English/Hindi presentation |
| `pwa-install.js` | Install prompt, including its own widget stylesheet |

Existing script loading order remains deliberate: configuration and utilities precede consumers; `seo.js` must load before any size-price calculation is invoked. `cart.js` defines functions before SEO loads but does not call pricing at definition time. Do not add `async` to these scripts.

`i18n.js` intentionally remains a single file because it is primarily translation data rather than mixed application logic; splitting it would add ordering overhead without materially improving maintenance.

## Product autofill

The Add product screen includes **Paste from ChatGPT**. It accepts JSON, simple `Label: value` text, or copied ChatGPT `Form field / Value to enter` tables, previews recognized fields, and only applies them after confirmation. Instruction placeholders such as `Enter actual stock` and `Leave blank` are ignored. It never saves automatically. Keep parsing logic in `admin-autofill.js`; do not mix it into `admin.js`. Unknown labels are ignored rather than guessed, which helps prevent accidental field corruption.

## Style map

Start with `src/styles/storefront-layout.css` for current card dimensions and responsive layout; it includes the `6/5` photo-container ratio. Home-specific buttons and hero decoration are in `home-brand-and-actions.css`. Photo zoom and catalogue layouts are in `catalog-and-photo-effects.css`. Earlier base components supply shared defaults.

`legacy-theme.css` and the other compatibility sections remain in explicit order because moving their selectors could alter specificity and mobile behaviour. They are isolated, not blindly reordered. Keep narrow-screen rules beside their existing cascade position until tested in a browser.

## Backend map

`config.gs` contains configuration; `http.gs` routes requests; `sheets.gs` contains shared helpers; `cache.gs` owns caching; `products.gs`, `reviews.gs`, `promos.gs`, and `orders.gs` handle those domains. `checkout.gs` calculates orders, `transactions.gs` handles recovery and inventory plans, `telegram.gs` handles notifications, and `admin-auth.gs` checks permissions.

Apps Script functions still share their original global scope. File separation improves navigation without changing callable names, HTTP actions, Sheet columns or transaction sequencing.

## Safe release checklist

Run the build consistency check, `node scripts/check.mjs`, `node scripts/check-checkout.mjs`, and `node scripts/check-autofill.mjs`. Check the home page at phone and desktop widths, choose a priced size, add/remove cart quantities, and inspect the admin editor before publishing. Local checks do not execute live Google APIs or send orders/notifications.

When changing a deployed asset, update the version query in HTML and the static-page template. Preserve the `.github` publishing workflow, which excludes developer sources from the public website.

## Private owner settings

In Apps Script, open **Project settings** > **Script properties** > **Edit script properties**. Add `ADMIN_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`, then save. Properties override legacy code constants and survive future code updates. Property changes apply to subsequent requests without redeployment. Use your new admin key when signing in. Telegram requires both a token and chat ID. Keep real values out of GitHub.

## PIN code and order breakdown release

Upload the frontend files first, then replace and redeploy the generated `code.gs` at the existing Apps Script URL. The frontend includes the PIN in the address immediately, even while the previous backend is still active. The new backend also validates PINs. No new spreadsheet column is required. Preserve your private Apps Script constants or set `ADMIN_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID` in Script properties before copying a GitHub-safe script.

Admin and Telegram subtotals use stored total + discount − delivery − COD charges. They never use current catalogue prices. Older rows without fee values treat those missing amounts as zero; missing historical charges cannot be recovered automatically. Item unit prices are included in newly placed order summaries.

## Package cleanup

Keep `src/`, `scripts/`, and `.github/`: they are the maintained sources, checks,
and publishing workflow. Root `code.gs` and `style.css` are generated deployment
files, not obsolete duplicates. `sample-products.json` is the configured local
preview fallback. Keep `THIRD-PARTY-NOTICES.txt` for bundled software attribution.
Use `SETUP.md` for shop operations and this file for code maintenance. Release-specific update notes are intentionally not kept in the repository once merged.

The following obsolete files were removed from this ZIP. Uploading a ZIP's
contents to an existing GitHub repository does not delete old repository files;
remove these same paths there if you want the repository to match:

- `ADMIN-REVIEW.md`
- `ADMIN-SETUP.md`
- `SEO-GUIDE.md`
- `SETUP-GUIDE.md`
- `TELEGRAM-SETUP.txt`
- `TEST-RESULTS.txt`
- `UPDATE.txt`
- `UPDATE-INSTRUCTIONS.md`
- `UPDATE-STEPS.txt`
- `V8.1-HARDENED-MIGRATION.md`
- `V8.3.2-MERGE-NOTES.md`
- `generate-sitemap.mjs`
- `order-items-template-for-google-sheets.csv`
- `orders-template-for-google-sheets.csv`
- `products-template-for-google-sheets.csv`
- `promos-template-for-google-sheets.csv`
- `reviews-template-for-google-sheets.csv`

## AI product draft architecture

`admin-ai.js` owns only the AI generation UI and sends an authenticated `aiProductDraft` request to Apps Script. It reuses `admin-autofill.js` for preview/apply so there is one review path for pasted and generated data. The dialog can also accept AI-only reference photos, which help analysis but are not saved to the product gallery. Keep that temporary reference-photo state inside `admin-ai.js` rather than spreading it through `admin.js`. `src/backend/ai-product.gs` owns the provider adapter, Responses/Chat-Completions request formats, structured-output schema, reference-photo sanitization, and response parsing. Runtime provider/model selection comes from `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, and `AI_API_TYPE` Script Properties; legacy `OPENAI_API_KEY`/`OPENAI_MODEL` remain supported. Keep secrets out of repository files.

AI generation is deliberately non-destructive: it does not write Sheets, save products, or overwrite the editor until the user reviews the draft and presses Apply. Commercial facts such as price, stock, MRP and cost price are instructed to remain blank unless supported by user-provided/existing facts.


AI generation uses an elapsed-time/indeterminate progress indicator because third-party AI APIs do not expose reliable percentage completion. Do not replace it with a fake percentage. AI-only Cloudinary URLs are transformed to a lightweight 1280px derivative before analysis; original product URLs stay unchanged. Chat-completions uses compact JSON-object mode to reduce payload and compatibility overhead.

### Admin AI copilot

- UI: `admin-chat.js` is generated from `src/admin-ai/`: `core.js` (session/drawer), `proposal.js` (review/apply), `attachments.js` (photos), `transport.js` (API requests), and `events.js` (wiring). Edit those source fragments, not generated `admin-chat.js`. Drawer markup remains in `admin.html`; styling is in `admin-theme.css`.
- Backend: the copilot is split by responsibility: `ai-admin-context.gs` (intent routing, compact DTOs, task-scoped context, session/history limits), `ai-admin-actions.gs` (allowlist validation and target resolution), `ai-admin-media.gs` (reference images), `ai-admin-enrichment.gs` (single/batch/new-product generation), and `ai-admin-chat.gs` (orchestration/provider call). Never edit generated `code.gs` directly.
- Session memory is browser-only and capped; no chat transcript is persisted to Sheets.
- AI write suggestions are proposals only. Product add/update, archive/restore and order-status changes are executed through the existing validated admin actions after explicit confirmation.
- Token/context rule: send only the data profile required by the detected task. Product/content requests receive matched products; inventory receives compact stock rows; order requests receive matched/recent orders; analytics receives dashboard summaries. Do not restore the old all-in-one shop snapshot.
- Browser chat stores up to 16 messages for UX but sends only the 6 most recent; the backend caps accepted history at 8 turns and 1,200 characters per turn. Durable UI facts (open product/editor mode) travel as compact `sessionState` rather than depending on old prose.
- Do not add payment verification/refunds, permanent deletes, credentials, or security-setting mutations to the AI action allowlist without a separate higher-assurance approval design.

### Admin AI catalog batch enrichment
The admin AI recognizes catalog-wide requests such as “batch fix every product that is missing details”. It scans active listings, prepares up to 8 image-aware descriptive enrichment proposals per review batch, and requires explicit review/apply. Batch mode never proposes price, MRP, cost, stock, quantity, product ID, GTIN, sizes or size prices. Use “continue catalog batch” after applying a batch to move to remaining listings recorded in the current chat context.

### AI product navigation and auto-close (2026-09-20)
- Successful `Fill or edit this product` generation force-closes its dialog after the form is populated, then leaves the form unsaved for human review.
- Product IDs in DSB AI assistant replies are rendered as editor links. Link handling lives in `src/admin-ai/core.js`; it resolves the exact active product through the existing admin read service and reuses `fillForm()` rather than creating a second editor path.
- Keep product navigation deterministic in the client; prompts only need to include the exact product name and ID.

## Level 1 storefront commerce modules

The first commerce-maturity upgrade deliberately keeps customer-facing logic isolated:

- `storefront-commerce.js` owns recently viewed products, similarity ranking, richer product detail rows and shopping-assurance copy.
- `storefront-analytics.js` is the only analytics API storefront code should call. It does **not** load a third-party tracker; it forwards to `window.plausible` or `window.gtag` only if one is configured later.
- `src/styles/level1-commerce.css` owns Level 1 storefront styles and is compiled into `style.css` by `scripts/build.mjs`.
- `app.js` owns catalogue filter state (category, subcategory, price, stock and sorting) and URL persistence.

Do not duplicate recently-viewed storage, recommendation scoring, policy/assurance copy, or analytics-provider calls inside page scripts. Extend these modules instead.

Regression command for this layer: `node scripts/check-level1.mjs`.


## Level 2 commerce modules

- `storefront-commerce.js` owns recently viewed, similar-product ranking, product detail rows and the customer delivery-estimate widget.
- `src/backend/delivery.gs` owns PIN-code delivery estimate rules. Edit `DELIVERY_ESTIMATE_RULES` in `src/backend/config.gs`; estimates are guidance after shop confirmation, not courier guarantees.
- `src/backend/reviews.gs` owns verified-purchase review validation. A review is marked verified only when order ID + phone match a Delivered/Fulfilled order containing that exact product.
- `src/styles/level2-commerce.css` owns Level 2 customer-facing styles.
- Keep review verification identifiers private: the public reviews endpoint exposes only `verified: true/false`, never order ID, phone or the internal verification hash.

## Level 3 order lifecycle
- Customer tracking uses POST for order ID + phone so phone numbers are not placed in the URL.
- `src/backend/order-requests.gs` owns cancellation/support requests and auto-creates the private `OrderRequests` sheet.
- Customer cancellation is a request, never a direct status or stock mutation. Admin remains the authority.
- `ORDER_STATUS_TRANSITIONS` in `src/backend/config.gs` is the single backend lifecycle definition. Keep client options in `admin.js` aligned and covered by `scripts/check-level3.mjs`.
- Order request rows contain a phone hash only; raw customer phone is not duplicated into the requests sheet.
- Do not bypass `updateOrderStatus()` when changing status because cancellation/reactivation also adjusts tracked inventory transactionally.
