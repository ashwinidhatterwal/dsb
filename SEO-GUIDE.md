# SEO — What Was Added and What You Still Need To Do

## What's now in place

- **Page titles & descriptions** — rewritten to be specific and keyword-rich
  (shop name, categories, "Hanumangarh, Rajasthan") instead of generic text.
- **Canonical URLs** on every page, pointing at your live Netlify address.
- **Open Graph + Twitter Card tags** — this is what controls how your link
  looks when shared in WhatsApp, Facebook, or Instagram (a title, description,
  and preview image instead of a bare grey link).
- **Structured data (JSON-LD)** — machine-readable markup search engines use
  for rich results:
  - `Store` schema on the homepage (name, phone, address, description)
  - `Product` schema on every product page (name, price, stock status)
  - `BreadcrumbList` schema (Shop → Category → Subcategory → Product)
  - `AggregateRating` — **added automatically, only once a product has at
    least one real review.** This was deliberate: Google explicitly
    penalizes rating markup with no genuine reviews behind it, so this only
    appears when it's backed by real customer feedback already in your
    Reviews sheet.
- **`robots.txt` and `sitemap.xml`** — tells search engines what to crawl,
  explicitly keeps `admin.html` out of search results (also has its own
  `noindex` tag as a second layer of protection).
- **Semantic headings** — section titles ("Shop the bazaar," etc.) are now
  real `<h2>` headings, not styled `<div>`s, which is what search engines
  use to understand page structure.
- **`manifest.json`** — branding metadata (name, colors, icons) used by
  search engines and mobile "add to home screen" prompts.

Per-product pages now generate their own unique title, description, and
share-preview image dynamically from that product's actual data — a
lipstick and a notebook now produce genuinely different search/share
listings instead of both showing the site's generic homepage info.

## Address — now filled in

Your shop's real address and PIN code (from the Google Maps link you shared)
are now in place in `index.html`'s structured data, and on the new
`contact.html` page along with an embedded map pointing directly at the
shop. Nothing left to fill in here — if the shop ever moves, update the
address in both `index.html` (inside the `<script type="application/ld+json">`
block) and `contact.html`.

## One honest limitation, worth knowing

Everything above is genuinely real and working SEO. But there's one thing
it *cannot* fully solve, given the site has no server: **link previews for
individual product pages, when shared directly via WhatsApp/Facebook before
anyone has opened them, will show the shop's generic banner and title — not
that specific product's photo and name.**

Why: WhatsApp and Facebook's preview generators fetch the raw HTML file and
read it as-is — they don't run JavaScript. The per-product title/image *is*
correctly set, but only after the page's JavaScript runs in an actual
browser. A crawler that grabs the file before that happens sees the generic
placeholder tags that were in the file to begin with.

This does **not** affect Google search rankings or listings — Google's
crawler does run JavaScript and sees the real per-product content fine, so
individual products can genuinely show up in search results with the right
title, price, and (once you have reviews) star ratings. It's specifically
share-preview cards for direct WhatsApp/Facebook links to a product that
stay generic. If that ever becomes worth fixing properly, it needs a small
server-side or prerendering step — a real but bounded next project if you
want it later.

## The image placeholder

The `og:image` currently used for social share previews is a plain
generated banner (`placehold.co`) with your shop name on a brand-colored
background — functional, but generic. Swapping in a real photo (your shop
front, a nice product flat-lay, or a simple designed banner) at 1200×630px,
uploaded anywhere with a direct image link (Cloudinary, which you already
use for products, works fine), will make shared links look noticeably more
credible. Update the `og:image` / `twitter:image` lines in `index.html`'s
`<head>` with that URL once you have one.

## How to verify all of this is actually working

1. **Rich Results Test** — search.google.com/test/rich-results — paste your
   homepage and a product page URL. This shows exactly what structured data
   Google can see, and flags any errors.
2. **Facebook Sharing Debugger** — developers.facebook.com/tools/debug —
   paste your homepage URL to preview exactly how it'll look when shared.
3. **Google Search Console** (search.google.com/search-console, free) —
   verify your site, submit `sitemap.xml`, and you'll start seeing which
   searches actually bring people to your site over the following weeks.
   This is also where you'd request indexing for a specific new product page
   if you want it discovered faster than waiting for the next crawl.

None of this produces results overnight — search engines re-crawl on their
own schedule, typically days to a couple of weeks for a small site. Google
Search Console is how you'll actually see it taking effect.
