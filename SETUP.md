# Dhatterwal Suhag Bhandar — setup

## Update an existing shop

**Already on admin v9:** upload `admin.html`, `admin.js`, `admin-workspace.js`
and the new `admin-base.css`. Keep `admin-theme.css`. No Apps Script redeployment
is needed for this cleanup; backend behavior is unchanged.

**On an older version:** back up your Spreadsheet and Apps Script source. Replace
Apps Script code with `code.gs`, keeping your existing shop settings and Script
Properties. Choose **Deploy → Manage deployments → Edit → New version → Deploy**
to retain the existing deployment URL. Then upload the website files, including
all admin JavaScript/CSS files and the `.github` folder, and wait for GitHub Actions
to finish. The admin requires backend version 9.

If the deployment URL changes, update `SHEET_API_URL` in `config.js` and the admin
connection URL. Keep the current web-app access settings so customers can order.
Use the GitHub Actions publishing workflow; it excludes backend source and guides
from the public website. Keep actual credentials out of GitHub.

## Google Sheets and payments

Keep the existing Spreadsheet, sheet names and headers. Admin tools automatically
add `archived` to Products, payment verification columns to Orders, and an
AdminActivity sheet. Existing order/transaction tracking tabs remain in use.

- **Archive/restore:** hides products without deleting stock or order history.
  Checkout rejects archived products. Static product pages/search results update
  after publishing and search-engine refreshes.
- **Bulk editing:** select up to 20 products, choose a fixed price or stock quantity,
  review and apply. Each result is independent; some can succeed while others fail.
  If a request times out, refresh and check values before retrying. Setting quantity
  to zero marks out of stock; positive quantities retain the existing stock status.
- **Conflicting edits:** refresh and reopen a product if saving reports a newer edit.
  Restored drafts retain their original revision and cannot bypass this check.
- **Drafts:** recoverable within the browser tab session, not a permanent backup.
  Closing the tab or clearing storage may remove them. Unuploaded photo files are
  not saved. Product drafts contain no admin key.
- **Payment verification:** check bank/UPI/cash records before marking Received or
  Refunded. Enter a reference or note. This records a manual check only; it cannot
  collect money, verify a bank transfer automatically or issue a refund. Delivery
  status is separate; old orders default to Unverified.
- **Activity:** records admin requests and outcomes from this update onward.
  A Started entry without completion needs checking. Direct Spreadsheet edits are
  not logged, and the history is not a tamper-proof accounting ledger.

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
| admin | Products, orders, payment verification and activity history |
| editor | Product and delivery-status changes, including bulk editing and archive/restore |
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
