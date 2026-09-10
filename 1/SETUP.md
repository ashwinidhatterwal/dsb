# Dhatterwal Suhag Bhandar — setup

## Update an existing shop

**Deploy the included code.gs first**, as a new version of your existing Apps
Script deployment. Back up your Spreadsheet/source and retain existing shop
settings and Script Properties. Use **Deploy → Manage deployments → Edit → New
version → Deploy** to keep the URL.

Then upload the website files, including `admin.html`, `admin.js`,
`admin-workspace.js`, `admin-base.css` and `admin-theme.css`, and wait for GitHub
Actions to publish. This admin requires backend version 11.

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
