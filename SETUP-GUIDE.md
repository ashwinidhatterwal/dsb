> Updating an existing shop? Follow **UPDATE-INSTRUCTIONS.md** first. This version changes checkout and Pages deployment.

# Dhatterwal Suhag Bhandar — Setup Guide

## What you have

- `index.html` — the shop homepage (categories, search, product grid)
- `product.html` — each product's own page (details, related items, reviews)
- `admin.html` — add/edit/delete products, upload photos, manage orders, and
  a Dashboard tab with revenue/profit/top-products/low-stock at a glance
- `config.js` — your Sheet API URL, WhatsApp number, shop name (edit here)
- `utils.js`, `cart.js`, `products-data.js`, `render-helpers.js`, `cart-ui.js` — shared logic used by every page, you shouldn't need to touch these
- `app.js` — homepage-only logic (category rail, grid, search)
- `product.js` — product-page-only logic (details, related items, reviews)
- `admin.js` — admin page logic
- `style.css` — all styling
- `code.gs` — paste into Google Apps Script; turns your Sheet into the API
- `sample-products.json` — demo products, used only if the Sheet is unreachable
- `products-template-for-google-sheets.csv`, `reviews-template-for-google-sheets.csv`,
  `orders-template-for-google-sheets.csv`, `promos-template-for-google-sheets.csv`,
  `order-items-template-for-google-sheets.csv` —
  starter rows/headers for each sheet tab
- `about.html`, `contact.html`, `privacy.html`, `returns.html` — plain static
  pages, edit the text directly in the file, no build step needed

## Step 1 — Your Google Sheet needs five tabs

In the same spreadsheet, create five tabs named exactly:

1. **Products** — import `products-template-for-google-sheets.csv` (File → Import →
   Upload → "Replace current sheet"). Columns: `id, name, nameHindi, category,
   subcategory, price, mrp, costPrice, image, images, description, stock, stockQty, tags`.
   - `nameHindi` is optional — fill it in and it shows under the English name
     everywhere that name appears. Leave it blank to skip it for that product.
   - `costPrice` is optional — what you paid for the item. **Never sent to the
     public site** — only the admin page (with your admin key) can see it.
     It's what powers the profit numbers on the Dashboard tab; leave it blank
     on any product and it just won't count toward the profit total.
   - `images` is optional — extra photo URLs, separated by commas, shown as a
     gallery on the product page. `image` stays the main/thumbnail photo used
     everywhere else (grid, search, related items).
   - `stockQty` is optional — leave a product's cell blank to skip quantity
     tracking for it entirely (it just uses the plain `stock` in-stock/out-of-stock
     text, like before). Fill in a number to start tracking exact stock: the
     site shows "Only X left" under 6 remaining, blocks adding more than what's
     left, and automatically counts down as orders come in.
2. **Reviews** — new blank sheet tab, renamed to `Reviews`. Import
   `reviews-template-for-google-sheets.csv` for the header row. Columns:
   `id, productId, name, rating, comment, date`. Leave it empty otherwise — the
   site fills it in as customers leave feedback.
3. **Orders** — customers enter delivery details, choose COD or UPI, review the server-verified total, then confirm. Orders save with status Pending and show an English confirmation slip. UPI links and QR codes appear only after the order is accepted, for the accepted amount. UPI receipt is manually verified by the shop. The website does not automatically send a WhatsApp confirmation; the shop follows up. Retry records prevent duplicate orders after an interrupted connection.

**Stock quantities** — leave a product's `stockQty` cell blank to ignore
this entirely. Fill in a number and the site starts showing "Only X left"
under 6 remaining, disables adding more than what's in stock, and
automatically subtracts from it every time an order comes in — including a
safeguard so two customers ordering the last item at nearly the same moment
can't both succeed. Once it hits zero, the plain `stock` column is
automatically flipped to "out of stock" too, so the two stay in sync.

**Promo codes** — add a row to the **Promos** tab and set `active` to `yes`
to turn one on. Customers type it into a box in the cart drawer; valid codes
apply the discount to the total immediately and get logged with the order.
If you've set `maxUses` or `onePerCustomer`, the site re-checks eligibility
one more time on the server when the order is actually placed — if a code
has since been used up, checkout stops. The customer must remove or change
the code and review the new total before confirming.

**Multiple photos** — add extra photo URLs to a product's `images` cell
(comma-separated), or use the "Additional photos" section in the admin page
to upload/paste them one at a time with a preview. They show as a tappable
thumbnail strip on that product's page. `image` stays the one used in the
grid, search, and related-items rail.

**Hindi product names** — fill in `nameHindi` on a product (or the matching
field in the admin form) and it appears as a subtitle under the English name
on the grid card and the product page. Leave it blank to show only English.

**About / Contact / Privacy / Returns pages** — plain static pages, linked
from every page's footer. Edit the text directly in `about.html`,
`contact.html`, `privacy.html`, or `returns.html` — no build step, just
open the file, change the text between the HTML tags, and re-upload.
The returns policy text is a starting draft — it's worth reading it over
and adjusting the timeframes/terms to match how you actually want to run
returns before treating it as final.

**Popular Picks & New Arrivals** — two horizontal-scrolling rows on the
homepage, above the category rail. New Arrivals is just the last products
added to the sheet. Popular Picks ranks by review volume × average rating
once a product has real reviews; until then it quietly shows the
biggest-discount items instead, so the row is never empty on a new store.
Both hide themselves entirely if there's nothing to show.

**Sharing** — every product card has a small share icon (top-right of the
photo), and the product page has a "Share" button next to the stock status.
Both use the phone's native share sheet where available, or copy the
product's link to the clipboard as a fallback.

**Size guide** — a "Size guide" button appears on product pages for
categories that are typically sized (Lingerie, anything with "cloth" or
"wear" in the category, bra/legging subcategories), or any product tagged
`size-guide` in its `tags` cell. It opens a general Indian sizing reference
— not per-product measurements, since none are collected — so treat it as a
starting point for customers, not an exact fit guarantee.

**Star ratings on cards** — every product card (grid, search, related,
Popular Picks) shows a star rating and review count once that product has
at least one review, pulled from the same **Reviews** tab as the product
page. Products with no reviews yet just show the price, no empty stars.

**Sort & filter** — a "Sort by" dropdown (Featured / Newest / Price)
and an "In stock only" checkbox sit above the product grid. "Newest" is
based on sheet order, so newly added products naturally show up there
without any extra tagging.

**Dashboard (admin → Dashboard tab)** — today's revenue and order count,
this month's revenue and profit, a pending-orders count, your top 5 products
this month by revenue, an order-status breakdown, and a low-stock list (any
tracked product at 5 or under). Profit and top-products need the OrderItems
tab to have data in it — they'll just show empty until some orders come in
after you've set that tab up. Tap Refresh any time to pull the latest
numbers.

**Cart** — now stored in the browser's local storage (not just memory), so
it survives navigating between the homepage and product pages. It's specific
to that device/browser. Every time the cart opens, it's also quietly
refreshed against the current product data — so a cart left sitting for a
while won't checkout at a stale price, and anything since deleted or sold
out gets removed automatically with a note.

**Floating WhatsApp button** — sits on every customer-facing page, pointed
at `WHATSAPP_NUMBER` in `config.js`. Change the number there and it updates
everywhere at once.

## Notes on the placeholder images

Products without an `image` URL show a generated placeholder (a colour block
with the product name), not real photos — no copyright concerns, but
customers won't see the actual item until you add one.


### V8 hardening notes
The current backend validates order prices, quantities, product IDs, payment method, promo eligibility and stock from the Google Sheet before accepting an order. The browser's subtotal/total fields are display hints only.

The backend also uses short-lived Apps Script cache for the public catalog, reviews and promos, so ordinary storefront traffic does not repeatedly scan whole sheets. Product/review writes invalidate the relevant caches.

Admin read operations (`products`, `orders`, `dashboard`) now use POST and the admin key is no longer placed in GET URLs. The order ID is randomized to make public order tracking harder to enumerate.

When a one-per-customer promo is used, the script automatically creates a hidden `PromoCustomers` tab containing only promo-code/phone hashes. It also maintains a lightweight `uses` column in `Promos` for max-use enforcement.
