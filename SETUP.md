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

Your existing `ADMIN_KEY` remains the Owner login. Keys are kept in browser memory,
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

Keep the existing Cloudinary cloud name and unsigned upload preset in `admin.js`.
Uploads accept JPEG, PNG and WebP up to 15 MB and resize large images. Alternatively,
paste an image URL. API, UPI and delivery settings remain in their existing locations.

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
`AI_IMAGE_DETAIL=low` is the fast default and is recommended for normal product photos. Use `auto` or `high` only when the model must read tiny packaging text. `AI_MAX_OUTPUT_TOKENS=1200` is the default; increase it only if your provider frequently truncates drafts. The admin sends lightweight Cloudinary derivatives to AI without changing storefront image quality.

### Gemini/OpenAI-compatible reliability

For Gemini through the OpenAI-compatible endpoint, use `AI_API_TYPE=chat_completions` and `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`. The backend automatically prefers Gemini JSON-Schema structured output and uses low reasoning effort by default for faster product extraction. Optional `AI_REASONING_EFFORT` values include `low`, `medium`, or `high`; `low` is recommended here. If a provider truncates long bilingual drafts, raise `AI_MAX_OUTPUT_TOKENS` to `1600`.

### Gemini compatibility note

For `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai` with `AI_API_TYPE=chat_completions`, the backend sends Gemini's documented `image_url.url` shape and omits the OpenAI-specific image `detail` hint. If a Gemini model rejects structured-output parameters with HTTP 400, DSB retries once with a minimal JSON-instruction payload and keeps server-side draft validation enabled.
