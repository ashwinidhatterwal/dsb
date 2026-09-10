# Admin workspace v9 — setup and daily use

This update uses the existing GitHub Pages site, Apps Script deployment and Google
Spreadsheet. It does not require a paid database or a payment gateway.

## Deploy in this order

1. Back up your Spreadsheet and currently deployed Apps Script source.
2. Replace Apps Script code with this ZIP's **code.gs**. Preserve your existing
   Script Properties, sheet names, Telegram configuration and other shop settings.
   Check that the settings at the top still match your shop.
3. In Apps Script, choose **Deploy → Manage deployments → Edit → New version → Deploy**.
   Updating the existing deployment keeps the URL. Keep its existing web-app access
   settings so the public storefront can still order.
4. Upload the website files to GitHub, including **admin.html**, **admin.js** and
   the new **admin-workspace.js**. Let GitHub Actions finish publishing.
5. Open admin.html and sign in with your existing admin key. The new admin checks
   backend version 9 before loading. If you get a deployment message, complete
   step 3 and refresh. If you changed deployment URLs, update the admin URL field
   and the shop's existing API configuration as appropriate.

The backend creates these additions when first used:

| Location | Additions | Purpose |
| --- | --- | --- |
| Products | archived | Reversible hiding of products |
| Orders | paymentstatus, paymentreference, paymentverifiedby, paymentverifiedat | Manual payment verification, independent of fulfilment |
| New AdminActivity tab | date, actor, role, action, target, outcome, detail | Admin operation history |

Existing rows and column values are retained. You do not need a new spreadsheet
or to create these additions by hand. Existing add-request and transaction-recovery
tabs continue to work as before. No customer payment or Telegram logic is replaced.

## Inventory

Product ID sorting supports ascending and descending natural numeric order
(for example DSB-2 before DSB-10). Page controls appear above and below products
as a narrow swipeable strip, with Previous/Next arrows at either end.


- Search includes product IDs, English/Hindi names, category, subcategory and tags.
- Filter by category, stock or low stock (1–5 units), and sort by name or price.
- Top and bottom page controls request 40 matching products from Apps Script.
  Only the current product page is sent to the browser. Apps Script still reads
  the Products sheet to filter it; this is not a database index.
- Select individual products, or use **Select first 20**. Choose a fixed new price
  or stock quantity and review the old/new values before applying.
- Bulk edits are independent updates, not an all-or-nothing transaction. Each
  result is shown, including conflicts. A timeout can mean some changes already
  saved: refresh and check values before retrying. No automatic write retries occur.
- Setting stock to zero marks it out of stock. A positive quantity preserves the
  product's current stock status; use its editor if you also want to change that status.
- Archive replaces permanent deletion. Archived products leave the public catalogue
  and checkout rejects them, even if a shopper has an old cart or cached page.
  Enable **Archived** to find and restore them. Restore preserves stock settings.
- Static Google product pages and sitemap update on the next successful publishing
  run. Old search results can remain temporarily; checkout always checks current data.
- New admin edits check the original product revision, including stock, before
  saving. A conflicting edit is rejected: refresh, reopen and review the product.
  For consistent protection, staff should all use the new admin version.

## Drafts

Unsaved edits prompt before opening another product, clearing the form or leaving
the page. Product drafts autosave in session storage and can be restored from
**Add product** after a refresh. Drafts include the original edit revision, so
restoring one does not bypass conflict checks.

Drafts are scoped to the deployment URL and staff name. They contain product
information, not admin keys. They last for the browser tab's session, not forever;
closing the tab or clearing browser storage may remove them. Browser exit prompts
are best-effort, particularly on mobile. Saving successfully or explicitly
clearing the form removes that draft. Photo files not yet uploaded are not stored.

## Payment verification

The Orders section shows **Unverified**, **Received** or **Refunded** independently
of order status. Filter orders by payment verification state.

An admin checks bank/UPI/cash records, selects the appropriate state and enters a
transaction reference or verification note. The server records the staff name and
time, and rejects an update if someone else changed verification in the meantime.

This feature records a manual check. It does not contact the bank, prove a UPI
payment, initiate a charge or issue a refund. Mark Refunded only after completing
and checking the refund yourself. Existing orders start Unverified; delivery status
is never used to infer that money was received.

## Optional individual staff keys

Your existing ADMIN_KEY remains the Owner account with full access. You can use
only that key if you run the shop alone.

For multiple staff, add a Script Property named **ADMIN_STAFF_JSON** under Apps
Script **Project Settings → Script properties**. Its value is a JSON array:

```json
[
  {"name":"Inventory staff","role":"editor","key":"REPLACE_WITH_A_UNIQUE_RANDOM_SECRET","enabled":true},
  {"name":"Reporting staff","role":"viewer","key":"REPLACE_WITH_ANOTHER_RANDOM_SECRET","enabled":true}
]
```

Replace the example values; they are not usable credential recommendations.
Generate a different unpredictable password of at least 24 characters for each
person using a password manager. Use unique staff names. Give each person only
their own key, through a private channel. Never put these keys in GitHub, website
JavaScript or public sheets. The UI accepts their key in the existing login box.

| Role | Access |
| --- | --- |
| admin | Product and order management, manual payment verification and activity history |
| editor | Product changes, archive/restore, bulk inventory edits and delivery-status updates; no payment verification or activity history |
| viewer | Read admin product, order and dashboard information, including costs/customer details; no changes |

Permissions are checked by Apps Script for each action, not just by hidden buttons.
Set enabled to false or remove a staff entry to revoke its access. Staff entries
are optional; there is no self-registration, password-reset email or staff-management
screen. Manage them in Script Properties. Anyone with direct Spreadsheet/Apps Script
access can still edit the underlying system, independent of these website roles.
Cloudinary's existing unsigned upload configuration remains separate from these roles.

## Activity and limitations

The Activity tab shows authenticated staff identities, action targets, submitted
key field changes and Started/Completed/Failed outcomes. It records activity from
this backend update onward. It does not reconstruct earlier history or log direct
Spreadsheet edits. It is an operational log, not a tamper-proof accounting ledger.
A Started record without completion needs checking against the actual data.
Payment references remain on the order; credentials are never put in the log.

The existing public checkout, receipts, stock transaction recovery and Telegram
queue remain in place. Production device rendering, live uploads and deployed
Apps Script permissions still require checking after deployment; this package
was verified with local DOM/backend fixtures, not live shop writes.
