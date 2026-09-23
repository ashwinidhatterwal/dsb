> Current release: see AUDIT-COMPLETION.md for API 26, new shop tools, setup and outstanding live checks.

# Phase 1 update - analytics correctness

This build is based on `dsb-analytics-v3-resettable-clean.zip`. Keep that ZIP as
rollback until this phase has been checked on your store. This is Phase 1 only;
the remaining audit work is listed in MAINTENANCE.md.

## Install this phase

1. Keep a copy of the currently deployed website and Apps Script code.
2. Upload the contents of this ZIP to the existing repository, including
   `.github`, `src`, and `scripts`. Wait for the publishing workflow to pass.
3. Copy the generated root `code.gs` into the existing Apps Script project.
   Save, then edit the existing web-app deployment to use a new version at the
   SAME URL. Keep Script Properties (admin key, Telegram and AI settings).
   Do not paste the individual src/backend files as additional scripts.
4. Reload the admin page. It expects backend version 23. A version mismatch
   while only one half is updated is expected; finish both updates and reload.
5. Check home/product/cart on your phone, including a priced size, English and
   Hindi, UPI/COD quote totals and the admin Analytics range/sort controls.
   Use an approved test order if verifying the complete order flow.

No manual Sheet column edits, analytics reset, data deletion, or new trigger is
required for this phase. Existing Telegram background setup remains in use.
Analytics counts may change because their definitions are corrected. Orders
without saved tracking identities cannot be assigned to campaigns. Today is a
partial calendar day. Checkout-start measurement changed from the final order
confirmation button to the delivery form, so old/new start rates differ.

## Verification and rollback

Local verification: `node scripts/run-checks.mjs` (build consistency plus all
18 regression programs). This includes simulated report/admin/GA tests. Live
Apps Script, actual payment services and browser layout are not certified by
those tests. No production order or notification was sent during development.
Customer scripts gain about 1.1 KB of estimated gzip JavaScript/translation
content on home; no stylesheet or new third-party dependency was added.

To roll back, restore the previous website files AND previous Apps Script
version at the same URL. Do not delete order rows, analytics rows or Script
Properties. This phase does not change the stored sheet schema.

---

# Dhatterwal Suhag Bhandar — setup

## Update an existing shop

For deployment, upload the website files first
and wait for GitHub Actions to publish, then update and redeploy root `code.gs`.
The old checkout has no PIN field, so deploying the stricter backend first
would prevent customers from ordering. Preserve existing Script Properties,
private credentials and shop fee settings. Update the existing deployment to
keep its URL; do not paste the separate backend source modules alongside it.

If the deployment URL changes, update `SHEET_API_URL` in `config.js` and the admin
connection URL. Keep the current web-app access settings so customers can order.
Use the GitHub Actions publishing workflow; it excludes backend source and guides
from the public website. Keep actual credentials out of GitHub.

## Google Sheets and payments

Keep the existing Spreadsheet, sheet names and headers. Admin tools automatically
add `archived` to Products and manual payment verification columns to Orders.
Existing order/transaction tracking tabs remain in use.
Activity logging and its API are removed. The old AdminActivity sheet, if present,
is no longer read or written; you may delete it manually if you do not want the
old records. Do not delete the OrderTransactions recovery/Telegram sheet.

- **Products:** shows active products only; product ID ascending is selected by
  default. Individual price and stock editing remains available through Edit.
- **Archive:** open the separate Archive section in the top bar to search and
  restore archived products. Admin users can permanently delete them by typing
  the product ID. Editors can restore; viewers can only read. Active products
  must be archived before deletion. Existing order records are not deleted.
  Cancelled orders containing a deleted product cannot be reactivated.
- **Retired IDs:** deletion automatically creates an ID-only DeletedProductIds
  sheet to prevent reuse. It contains no product details or activity history.
  Keep it to prevent old order records from affecting replacement products.
- **Bulk price/quantity edits:** removed from the interface and backend.
- **Conflicting edits:** refresh and reopen a product if saving reports a newer edit.
  Restored drafts retain their original revision and cannot bypass this check.
- **Drafts:** recoverable within the browser tab session, not a permanent backup.
  Closing the tab or clearing storage may remove them. Unuploaded photo files are
  not saved. Product drafts contain no admin key.
- **Payment verification:** check bank/UPI/cash records before marking Received or
  Refunded. Enter a reference or note. This records a manual check only; it cannot
  collect money, verify a bank transfer automatically or issue a refund. Delivery
  status is separate; old orders default to Unverified.

Product sorting/filtering happens in Apps Script before sending 40 rows per page.
Apps Script still scans the sheet; this is not an indexed database.

## Admin access and optional staff

Backend API 26 keeps your existing `ADMIN_KEY` as the Owner login, with no minimum length requirement. The placeholder `change-this-secret-key` is still rejected. Keys are kept in browser memory,
not saved with drafts. Manage optional staff in Apps Script **Project Settings →
Script properties**, under `ADMIN_STAFF_JSON`:

```json
[
  {"name":"Stock staff","role":"editor","key":"REPLACE_WITH_A_UNIQUE_RANDOM_SECRET","enabled":true},
  {"name":"Reporting staff","role":"viewer","key":"REPLACE_WITH_ANOTHER_RANDOM_SECRET","enabled":true}
]
```

Replace these examples with unique, unpredictable passwords of at least 24 characters,
generated using a password manager. Use unique staff names and share keys privately.
Never put credentials in website files or public sheets. Set `enabled` to false or
remove an entry to revoke access.

| Role | Access |
| --- | --- |
| admin | Products, orders, payment verification and permanent archive deletion |
| editor | Individual product and delivery-status changes, archive/restore |
| viewer | Read-only admin data, including costs and customer details |

Apps Script enforces these permissions per request. Direct Spreadsheet/Apps Script
access and the existing unsigned Cloudinary upload preset are separate. There is
no staff self-registration or password-reset service.

## Telegram and images

Keep Telegram credentials in existing Script Properties. If the background queue
has not been set up, run `setupTelegramBackground` once in Apps Script as the
owner and authorize it. Keep its timer trigger; customer confirmation does not
wait for Telegram. Retried notifications can occasionally repeat, but cannot
create another order. Do not rerun setup for every website update.

Keep the existing Cloudinary cloud name and unsigned upload preset in `admin.js` until
signed uploads are configured. JPEG, PNG and WebP uploads accept up to 15 MB input,
with the existing resize/compression behaviour and no separate 5 MB prepared-image cap. This browser check does not stop someone
from calling a public unsigned preset directly. In Cloudinary Settings → Upload →
Upload Presets, restrict allowed formats, incoming file size and overwrite behavior,
set usage alerts, and inspect account usage. These account settings must be verified
in your own Cloudinary account.

For signed uploads, create a separate **signed** Cloudinary preset and add the
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_SIGNED_UPLOAD_PRESET`, and
optionally `CLOUDINARY_CLOUD_NAME` to Apps Script Script Properties. Never place the
API secret in GitHub, the browser, or the Sheet. The backend authenticates an editor
and issues a timestamped signature; incomplete setup produces an error rather than
falling back to unsigned. Test uploading in staging, then disable/delete the old
public unsigned preset in Cloudinary. Once disabled, older admin deployments that
still use it will fail to upload. Pasting an image URL remains available. API, UPI
and delivery settings remain in their existing locations.

## Troubleshooting

- Missing controls or old styling: verify the HTML, both admin JS files, and both
  admin CSS files are uploaded. Wait for publishing, then check in a private tab.
- Backend-version error: deploy the included `code.gs` as a new deployment version.
- Uncertain save result: refresh the data before retrying; do not repeatedly click.

This package passed local regression and integration checks. Live device rendering,
production uploads and deployment permissions were not browser-tested here.

## AI product autofill (optional)

The admin product editor can generate a reviewable product draft from the main product photo, a few notes, and fields you already filled in. It never saves a generated product automatically.

1. Create an OpenAI API key for your API project.
2. In the Google Apps Script project, open **Project settings** > **Script properties** > **Edit script properties**.
3. Add `AI_API_KEY` with the provider API key as its value. (`OPENAI_API_KEY` is still accepted for backward compatibility.)
4. Add `AI_MODEL` with the model id you want to use.
5. Add `AI_BASE_URL` with the provider's OpenAI-compatible API base, for example `https://api.openai.com/v1`.
6. Add `AI_API_TYPE` as either `responses` or `chat_completions`.
5. Replace/redeploy the generated root `code.gs` so the AI backend action is available.

Never put `AI_API_KEY` (or any provider key) in `admin.html`, JavaScript, GitHub, or browser-side configuration. The browser sends only the authenticated product request to Apps Script; Apps Script calls the configured AI provider server-side.

After every update that changes `code.gs`, copy the new root `code.gs` into the Apps Script project and create a new web-app deployment/version before testing new backend actions. If the admin shows **AI backend is not deployed yet** (or an older **unknown action** message), the GitHub frontend is newer than the deployed Apps Script backend.

In **Admin > Add product**, choose/upload the main product photo, optionally add one or more **AI-only reference photos** inside the AI dialog, enter any facts you know (for example `brass, ₹240, sizes 2.4, 2.6, 2.8`), then press **Generate with AI**. AI-only reference photos help the model inspect another angle, packaging, a label, or a close-up, but they are not saved to the product gallery. Review the generated fields before choosing **Apply to product form**, then use the normal **Save product** button.

### Switching AI providers or models without editing code

After this version is deployed, change only Apps Script **Script properties**:

- `AI_API_KEY` — provider API key
- `AI_BASE_URL` — OpenAI-compatible API base URL (the code appends `/responses` or `/chat/completions` unless the full endpoint is already supplied)
- `AI_MODEL` — exact model id from that provider
- `AI_API_TYPE` — `responses` or `chat_completions`

Changing only `AI_MODEL` is enough to switch between compatible models on the same provider. Changing provider normally means updating all four properties. The configured model must support image/vision input if you want product-photo analysis. Chat-completions providers that do not support JSON Schema are retried once with prompt-enforced JSON.

Example for the native OpenAI setup:

```text
AI_BASE_URL=https://api.openai.com/v1
AI_API_TYPE=responses
AI_MODEL=gpt-5.6-luna
AI_API_KEY=your-secret-key
```

For another OpenAI-compatible provider, use that provider's base URL and exact model id instead.


### AI speed tuning (optional)
`AI_IMAGE_DETAIL=low` is the fast default and is recommended for normal product photos. Use `auto` or `high` only when the model must read tiny packaging text. `AI_MAX_OUTPUT_TOKENS=5000` is the default; increase it only if your provider frequently truncates drafts. The admin sends lightweight Cloudinary derivatives to AI without changing storefront image quality.

### Gemini/OpenAI-compatible reliability

For Gemini through the OpenAI-compatible endpoint, use `AI_API_TYPE=chat_completions` and `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`. The backend automatically prefers Gemini JSON-Schema structured output and uses low reasoning effort by default for faster product extraction. Optional `AI_REASONING_EFFORT` values include `low`, `medium`, or `high`; `low` is recommended here. If a provider truncates long bilingual drafts, raise `AI_MAX_OUTPUT_TOKENS` to `1600`.

### Gemini compatibility note

For `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai` with `AI_API_TYPE=chat_completions`, the backend sends Gemini's documented `image_url.url` shape and omits the OpenAI-specific image `detail` hint. If a Gemini model rejects structured-output parameters with HTTP 400, DSB retries once with a minimal JSON-instruction payload and keeps server-side draft validation enabled.

### Gemini image compatibility

When `AI_BASE_URL` points to `generativelanguage.googleapis.com`, the backend fetches the already-compressed AI image and sends it to Gemini as an inline base64 image. This follows Gemini's OpenAI-compatible vision request format and does not change the product image stored on the storefront.

### Per-product AI quality

The admin AI dialog now has **Fast / Better / Best** quality controls. These override `AI_REASONING_EFFORT` only for that one Generate request:

- **Fast** → `low` (recommended for normal product entry)
- **Better** → `medium`
- **Best** → `high` (slowest; use for difficult/ambiguous products)

`AI_REASONING_EFFORT` in Script Properties remains the backend fallback for clients that do not send a per-request selection. No redeploy is needed just to change the Script Property.

## Admin AI chat

The admin panel includes a compact floating **DSB AI** assistant. It uses the same server-side AI provider settings as product AI, so the API key remains in Apps Script Script Properties and is never exposed to the browser.

Chat memory is session-only: recent user/assistant messages are kept in the current browser tab with `sessionStorage` and are not written to Google Sheets. The assistant can read live catalog/order summaries and can prepare product creates/edits, order-status changes, and archive/restore actions. Any write appears as a review card and requires a two-click **Apply → Confirm apply** action before the existing admin backend is called.

After installing this update, replace Apps Script with the generated `code.gs` and deploy a new web-app version. This build uses admin API version 14, so the updated frontend intentionally requires the updated backend.


### Copilot target and enrichment fix

Deploy the generated root `code.gs` as a new version of your existing Apps Script web-app deployment, then upload the website files. Keep the existing deployment URL and Script Properties. Reload the admin page after uploading. Frontend and backend must both be version 13.

- A product name or ID in the current request takes priority over earlier chat. Multiple matches prompt for an ID. Unknown names never fall back to the old product. For unusual wording, use the exact product ID.
- “Enrich details for DSB-…” improves existing descriptive copy. “Fill missing details for DSB-…” preserves existing fields. Enrichment never changes price, MRP, cost, stock, or size pricing; request those changes explicitly.
- Photo analysis uses the main listing photo plus up to five references, prioritizing current chat attachments before gallery photos. Model vision support is required. Unknown numeric fields stay blank rather than becoming zero.
- Task shortcuts: enrichment, Hindi translation, SEO description/tags, Instagram caption drafts, catalog audit, and restock report. Captions are drafts only. Use Copy reply to reuse text.
- Catalog audit checks missing images/descriptions/category, invalid prices, MRP/cost inconsistencies, stock mismatches and possible duplicate names. Restock reports use a five-unit threshold, flag untracked quantities, and do not guess reorder quantities. These reports use live catalog rules without an AI generation call.
- Uncheck individual proposed fields before Apply → Confirm apply. New chat clears pending photos; failed chat requests retain photos for retry.

Validation: `node scripts/build.mjs --check`, `node scripts/check-admin-chat.mjs`, `node scripts/check-ai.mjs`, `node scripts/check-chat-client.mjs`, and `node scripts/check.mjs`. Regression fixtures cover switching from shampoo to nail clippers, ambiguous/unknown targets, null numbers, photo references, Hindi-only edits and catalog reports. Live provider response quality still depends on the configured model and evidence in the photos.


### Chat reset and interface update

The prominent **New chat** header button and **Clear chat** context-row button both start fresh: they remove the conversation from this tab's session memory, clear draft text, attached photos and pending proposals, and send no previous history on the next request. Earlier conversations are not archived. Model and quality preferences remain selected. Replies or image uploads already in progress are ignored after reset; an already-running provider request may still finish on the server. Reset is temporarily disabled while an approved product/order change is being saved.

The chat now has one scrolling conversation/review area, clearer Current/Suggested values, larger field-selection controls, a context indicator, safer keyboard focus and mobile safe-area spacing. Hindi IME composition no longer triggers Enter-to-send. Regression tests include resetting during generation and photo uploads.

For this UI update, upload the website files and reload the admin page. If the previous copilot fix is already installed, no new Apps Script deployment is needed (API version remains 13). Otherwise also deploy this archive's `code.gs`.


### Photo creation and editable chat drafts (API 14)

Deploy this archive's generated `code.gs` as a new version of the existing Apps Script web app, then upload the website files and reload admin. This update requires both frontend and backend version 14; older UI-only installation notes above apply only to those older updates.

New-product requests run through the full photo-based product draft generator. They request English/Hindi descriptions, category, specifications and tags as supported by available evidence. The first supplied photo becomes the listing image and further photos become gallery images; original upload URLs are assigned by the backend. Ask to omit photos if they are reference-only, or clear the image fields in review. Photo references travel with recent chat history, allowing instructions such as “create a product from this photo” on a follow-up. Fresh chat clears them. Uploaded images used for a completed create are not silently reused for another product.

Review cards now contain editable fields. New-product cards expose all supported fields, including fields AI could not fill. Existing-product edits retain selection checkboxes and editable suggestions. Correct details before Apply → Confirm apply. Missing price is allowed in a draft, but saving requires a name and positive selling price. Numeric values and HTTPS image URLs are checked before submission. Changing an editor field resets confirmation. You can also send a follow-up about the visible new-product draft; its current edited values are sent as context.

The chat opens as a centered dialog with a dimmed, blurred backdrop, distinct purple/navy colours, keyboard focus cycling and a mobile layout. Clicking outside or pressing Escape closes it without clearing the conversation.

Automated tests cover original photo URL assignment, full generated fields, photo follow-ups, reset isolation, unknown price, and manual edits reaching the save request. Live provider quality and browser visual appearance still require deployment verification.


## Level 3 order requests
No manual sheet creation is required. The first customer support/cancellation request creates an `OrderRequests` tab automatically. Keep it private with the rest of the backend spreadsheet. Customer tracking verifies Order ID + checkout phone and public requests never directly change order status or stock.


## Analytics

Deploy the current `code.gs` to enable the Admin Analytics view. No extra provider account is required. The backend creates a hidden `AnalyticsEvents` sheet automatically after the first storefront event batch. Analytics starts from deployment time; it cannot reconstruct historical visitor behaviour from before tracking was enabled.

Collection is lightweight and anonymous: events are batched in the browser and include storefront behaviour such as page/product views, cart adds, checkout starts, delivery checks and completed orders. Customer names, phone numbers, addresses and order IDs are not sent to analytics.

## AI configuration

The admin panel now includes **⋮ → AI configuration**. This is the preferred way to manage AI providers.

- Add any number of OpenAI-compatible API connections.
- Each connection stores its own HTTPS base URL, API type (`chat_completions` or `responses`) and API key.
- Add one or more models under each connection and choose which effort levels and vision support each model exposes.
- Use **Test connection** before saving or after changing a provider/model.
- DSB AI and Product AI automatically use the enabled models from this page; each remembers its own last model and effort selection.
- API keys are stored only in Apps Script Script Properties under internal `AI_CONN_KEY_*` properties. The browser receives only a `hasApiKey` flag, never the stored key.

Existing `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` and `AI_API_TYPE` Script Properties remain supported as a legacy fallback until at least one enabled connection is configured.
