// OWNER SETTINGS: Apps Script > Project settings > Script properties.
// Set ADMIN_KEY, TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID there.
// Save properties to apply changes without redeploying; never commit secrets.

/**
 * Dhatterwal Suhag Bhandar — Google Sheet backend
 * ------------------------------------------------
 * Paste this into Extensions > Apps Script on your product Google Sheet,
 * then deploy as a Web App. See SETUP.md for deployment instructions.
 *
 * Sheet tabs expected in this spreadsheet:
 *
 * "Products" — id | name | nameHindi | category | subcategory | price | mrp | costPrice | image | images | description | stock | stockQty | tags
 * "Reviews"  — id | productId | name | rating | comment | date | verified | verificationRef
 * "Orders"   — orderId | date | customerName | phone | address | paymentMethod | promoCode | discount | deliveryCharge | codCharge | items | total | status
 * "Promos"   — code | type | value | active | maxUses | onePerCustomer | uses
 * "PromoCustomers" — created automatically when a one-per-customer promo is used;
 *                    stores only code+phone hashes and is hidden by the script.
 * "OrderItems" — orderId | date | productId | productName | category | subcategory | qty | unitPrice | costPrice | lineRevenue | lineCost | lineProfit
 *
 * stockQty is optional — leave it blank on a product to skip quantity
 * tracking for that item entirely (it'll behave exactly as before, using
 * only the plain "stock" in-stock/out-of-stock text).
 *
 * nameHindi is optional — shown alongside the English name if filled in.
 * images is optional — extra photo URLs, comma-separated, shown as a
 * gallery on the product page. "image" is still the main/thumbnail photo.
 *
 * costPrice is optional and NEVER sent to the public storefront — only
 * included in the Products response when the request includes a valid
 * admin key. Used for the admin dashboard's profit figures.
 *
 * On Promos: maxUses is optional (blank = unlimited total redemptions). The backend
 * maintains a lightweight `uses` counter automatically; do not edit it manually.
 * onePerCustomer is "yes"/"no" — "yes" means each phone number can use that
 * code once, ever. Both are enforced here on the server when an order comes
 * in, never trusted from the browser.
 *
 * OrderItems is written automatically, one row per product per order, at
 * the moment an order is placed — it's a permanent record of that item's
 * price and cost AT THAT TIME (not looked up again later), so later price
 * changes never rewrite history. This tab is created automatically if missing.
 * OrderTransactions is an internal recovery/retry journal created automatically.
 */

const PRODUCTS_SHEET = 'Products';
const REVIEWS_SHEET = 'Reviews';
const ORDERS_SHEET = 'Orders';
const PROMOS_SHEET = 'Promos';
const ORDER_ITEMS_SHEET = 'OrderItems';
const PROMO_CUSTOMERS_SHEET = 'PromoCustomers';
const CATALOG_CACHE_KEY = 'dsb.catalog.v4';
const JOURNAL_SHEET = 'OrderTransactions';
const COMPLETED_STATUSES = ['Delivered', 'Fulfilled'];
const CATALOG_CACHE_TTL = 120; // seconds
const REVIEW_SUMMARY_CACHE_KEY = 'dsb.reviewSummary.v1';
const REVIEW_SUMMARY_CACHE_TTL = 180; // seconds
const REVIEWS_CACHE_KEY = 'dsb.reviews.v1';
const REVIEWS_CACHE_TTL = 120; // seconds
const PROMOS_CACHE_KEY = 'dsb.promos.v1';
const PROMOS_CACHE_TTL = 60; // seconds
const DASHBOARD_CACHE_KEY = 'dsb.adminDashboard.v1';
const DASHBOARD_CACHE_TTL = 20; // seconds
const ALLOWED_PAYMENT_METHODS = ['Cash on Delivery', 'UPI'];

// Checkout fee settings. Edit these three values whenever your policy changes.
// Delivery is charged only when the discounted merchandise value is BELOW
// DELIVERY_FREE_ABOVE. Set a charge to 0 to disable it.
const DELIVERY_FREE_ABOVE = 499; // ₹ — orders at/above this merchandise value get free delivery
const DELIVERY_CHARGE = 40; // ₹ — delivery fee below the threshold
const COD_CHARGE = 20; // ₹ — extra fee when Cash on Delivery is selected
// Customer-facing delivery guidance. Keep more-specific prefixes before broader ones.
// These are estimates after shop confirmation, not courier guarantees.
const DELIVERY_ESTIMATE_RULES = [
  { prefixes: ['335'], minDays: 1, maxDays: 3, label: 'Local / nearby delivery' },
  { prefixes: ['33'], minDays: 2, maxDays: 4, label: 'Regional delivery' },
  { prefixes: ['3'], minDays: 3, maxDays: 5, label: 'Extended regional delivery' },
  { prefixes: ['*'], minDays: 4, maxDays: 7, label: 'Standard delivery' }
];
const ALLOWED_ORDER_STATUSES = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Fulfilled'];

// Set the ADMIN_KEY Script Property before deploying — the admin page uses it to
// add/delete products and manage orders. Anyone who has this key can edit
// your sheet and see customer order details.
const ADMIN_KEY = ''; // Prefer the ADMIN_KEY Script Property; never publish secrets in GitHub.

// Optional — silently pings a Telegram chat/channel the instant a new order
// comes in, so you don't have to keep the Sheet or admin page open to know.
// Leave TELEGRAM_BOT_TOKEN blank to turn this off entirely; nothing else
// about order-taking changes either way. See SETUP.md for how to get
// a bot token and chat ID from @BotFather in about two minutes.
const TELEGRAM_BOT_TOKEN = ''; // e.g. '123456789:AAExampleTokenFromBotFather'
const TELEGRAM_CHAT_ID = ''; // your numeric chat ID, or '@yourchannel'
