/* =========================================================
   Dhatterwal Suhag Bhandar — shared site configuration
   Used by index.html, product.html (and referenced by admin.html).
   Edit these values to point at your own Google Sheet / Apps
   Script API and WhatsApp number. See SETUP-GUIDE.md.
   ========================================================= */
const CONFIG = {
  // Your deployed Apps Script Web App URL (see SETUP-GUIDE.md).
  // Leave blank ('') to use the bundled sample-products.json for local testing.
  SHEET_API_URL: 'https://script.google.com/macros/s/AKfycbybavfXBC-5CNstiZx-giJcngXjHVKA1NljUQ6N55ybOu4OvunkQTVr3IFvLPp_9Ohu/exec',
  WHATSAPP_NUMBER: '918000519440', // country code + number, no + or spaces
  SHOP_NAME: 'Dhatterwal Suhag Bhandar',
  FALLBACK_FILE: 'sample-products.json',
  // Your live site's address — used to build canonical links and share-preview
  // tags. Update this the moment you move to a custom domain, or every page's
  // canonical/og:url will keep pointing at the old address.
  SITE_URL: 'https://shimmering-fox-5f2be6.netlify.app',
  // Optional: your UPI ID (e.g. 'yourname@okicici'), for the "Pay via UPI"
  // checkout option. Leave UPI_ID blank to hide that option entirely and
  // only offer Cash on Delivery.
  UPI_ID: '8000519440@ybl',
  UPI_PAYEE_NAME: 'Dhatterwal Suhag Bhandar'
};
