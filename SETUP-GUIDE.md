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
3. **Orders** — new blank sheet tab, renamed to `Orders`. Import
   `orders-template-for-google-sheets.csv` for the header row. Columns:
   `orderId, date, customerName, phone, address, paymentMethod, promoCode,
   discount, items, total, status`. Also stays empty until customers start
   ordering.
4. **Promos** — new blank sheet tab, renamed to `Promos`. Import
   `promos-template-for-google-sheets.csv` for the header row and two example
   rows. Columns: `code, type, value, active, maxUses, onePerCustomer`.
   - `type` is either `percent` (e.g. 10 = 10% off) or `flat` (e.g. 50 = ₹50 off).
   - `active` must be exactly `yes` or `no` — only `yes` rows are ever sent to
     the site, so setting a code to `no` retires it instantly without deleting
     the row (handy for re-using a seasonal code later).
   - `maxUses` is optional — leave blank for unlimited total redemptions, or
     set a number to cap how many times that code can be used across all
     customers combined.
   - `onePerCustomer` is `yes` or `no` — `yes` means each phone number can use
     that code once, ever, checked automatically against your Orders history.
   - Both limits are checked on the server when an order comes in, never
     trusted from the browser — even if someone tampers with the page, an
     already-used or maxed-out code just gets silently dropped and the order
     is saved at full price instead.
   - This tab is optional — if you never create it, the promo code box on the
     site simply won't find any valid codes; nothing breaks.
5. **OrderItems** — new blank sheet tab, renamed to `OrderItems`. Import
   `order-items-template-for-google-sheets.csv` for the header row and leave
   it empty. Columns: `orderId, date, productId, productName, category,
   subcategory, qty, unitPrice, costPrice, lineRevenue, lineCost, lineProfit`.
   - You never fill this in yourself — one row per product gets written here
     automatically every time an order is placed, snapshotting that product's
     price and cost **at that exact moment**. If you change a price next
     month, past rows here still reflect what was actually charged, so your
     profit history never silently rewrites itself.
   - This is what the Dashboard tab's "top products" and "month profit"
     figures are calculated from. It's also optional — skip this tab and
     everything else keeps working, you just won't get profit/top-product
     numbers on the Dashboard.

Tab names are case-sensitive and must match exactly, or the API will error on
that section.

**If you already had a Products, Orders, or Promos tab from before this
update:** you don't need to recreate them — just add the new columns as
headers in whatever empty cells come after your existing ones (`nameHindi`,
`costPrice`, `images` on Products; `address, paymentMethod, promoCode, discount`
on Orders; `maxUses, onePerCustomer` on Promos). The column order doesn't
matter, only that the header text matches. If you skip this, nothing
breaks — the site just won't have anywhere to save that particular piece of
information.

## Step 2 — Turn the sheet into an API (Apps Script)

1. In your Google Sheet: Extensions → Apps Script.
2. Delete anything in the editor and paste the full contents of `code.gs`.
3. Near the top, set your own secret password:
   ```
   const ADMIN_KEY = 'change-this-secret-key';
   ```
   This is the password the admin page uses to edit products and manage
   orders — anyone with it can do both, so keep it private and change it from
   the default before you go live.
4. Click **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click Deploy, authorize the permissions Google asks for, and copy the
   **Web app URL** (starts with `https://script.google.com/macros/s/...`).

**If you're updating an existing deployment** (you already have a URL from
before and just changed the code): use **Deploy → Manage deployments** →
pencil/edit icon → set Version to "New version" → Deploy. This keeps your
existing URL working, so you don't need to update `config.js` or `admin.js`
again. Only use "New deployment" the first time, or your URL will change.

## Step 2b — Silent Telegram order alerts (optional)

Get a message in Telegram the instant an order is placed, without the
customer seeing anything different. Takes about two minutes:

1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts. It
   gives you a **bot token** that looks like `123456789:AAExample...`.
2. Start a chat with your new bot (search its username, tap Start), or add
   it to a group/channel you own.
3. Get your **chat ID**:
   - Send any message to the bot (or in the group), then open
     `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and
     look for `"chat":{"id": ...}` in the response.
4. Back in `code.gs`, near the top, fill in:
   ```
   const TELEGRAM_BOT_TOKEN = '123456789:AAExample...';
   const TELEGRAM_CHAT_ID = '987654321'; // or '@yourchannel'
   ```
5. Redeploy (**Deploy → Manage deployments** → edit → New version → Deploy)
   so the change takes effect.

That's it — every order placed from the site now also pings that chat, in
addition to saving to the Orders sheet as before. Leaving both values blank
keeps this off entirely; nothing about checkout or the WhatsApp order
message changes either way, and a Telegram outage never blocks an order
from saving.

## Step 3 — Point the site at your sheet

Open `config.js` and set:
```js
SHEET_API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
WHATSAPP_NUMBER: '918000519440', // country code + number, no + or spaces
UPI_ID: '', // e.g. 'yourname@okicici' — leave blank to hide the UPI option
UPI_PAYEE_NAME: 'Dhatterwal Suhag Bhandar'
```
This one file feeds the homepage, product pages, and (for the URL) the admin
page's pre-filled field. If the URL is ever wrong or unreachable, the site
automatically falls back to sample products so it never shows a broken page.

Leaving `UPI_ID` blank hides the "Pay via UPI" checkout option entirely and
only offers Cash on Delivery — nothing breaks either way, it's purely opt-in.

## Step 4 — Use the admin page

1. Open `admin.html` (also linked from every page's footer).
2. The Apps Script URL is pre-filled from `config.js` — enter your admin key
   and click **Connect & load products**. This also loads the Orders panel.
3. **Products panel** — fill the form and click Save (leave Product ID blank
   to auto-generate one), or click Edit/Delete on an existing row.
4. **Orders panel** — every order placed on the site appears here automatically
   with the customer's name, phone, delivery address, payment method, items,
   any promo code used, and total. Change the status dropdown
   (Pending / Fulfilled / Cancelled) and click Update to save it back
   to the sheet. Sort by newest, oldest, or customer name, or search by name/
   phone/order ID.
5. The URL and admin key are only kept in that browser tab — you'll re-enter
   the key each time you reopen `admin.html`. Don't share this page's key with
   customers.

## Step 5 — Upload real photos straight from the admin page (optional)

The admin page can upload a photo directly via Cloudinary's free "unsigned
upload" — no server needed:

1. Go to cloudinary.com → sign up free → note your **Cloud name**.
2. Settings (gear icon) → Upload → Upload presets → **Add upload preset** →
   Signing Mode: **Unsigned** → Save, and note the preset name.
3. In `admin.js`, fill in:
   ```js
   const CLOUDINARY_CLOUD_NAME = '';
   const CLOUDINARY_UPLOAD_PRESET = '';
   ```
4. Reload `admin.html` — the "Upload photo" button now works.

If you skip this, the "Image URL" field still works by pasting a link
directly (e.g. from Google Drive set to "Anyone with the link", Imgur, etc.).

## Step 6 — Put it online

Any static hosting works since there's no server to run:

- **GitHub Pages** — create a repo, upload every file except `code.gs`
  (that one lives only in Apps Script), enable Pages in repo settings.
- **Netlify Drop** (netlify.com/drop) — drag the folder in, get a live link
  in seconds, no account required.

Product links look like `yoursite.com/product.html?id=DSB-0001` — these work
automatically once the site is hosted; no extra setup needed.

## How the new features work

**Product pages** — every product card's image/name links to its own page
(`product.html?id=...`) with the full description, a "You may also like"
row of related products (same category first, backfilled from others if
there aren't enough), and the reviews section below.

**Reviews** — anyone can leave a name, star rating, and comment on a
product's page. They appear immediately (no approval step). They're stored
in the **Reviews** tab of your sheet.

**Orders** — when a customer checks out, they enter their name, phone, and
delivery address in the cart drawer, and choose Cash on Delivery or (if
you've set a UPI ID) Pay via UPI. The order (items, total, discount if a
promo was used, timestamp) is saved to the **Orders** tab with status
"Pending" *before* WhatsApp opens, so it's logged even if they don't end up
sending the WhatsApp message. After it saves, the site shows an on-screen
"Order placed!" confirmation with the Order ID, and the same ID is included
in the WhatsApp message so you can match the two up.

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
has since been used up, the order still goes through, just at full price,
and the customer sees a note that the code no longer applied.

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
