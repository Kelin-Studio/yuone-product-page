# YU ONE on yuhome.com.sg

How the YU ONE experience is embedded in the Shopify theme, for whoever
maintains the theme.

## Why not the usual iframe height snippet

The experience is driven by scrolling. Grown to its full height (the usual
`postMessage` height snippet), the iframe would never scroll, so the animation
would never start. Its sections are also sized in screen heights, so growing
the frame would grow them again, without end.

Instead, the store page owns the scroll and the experience follows it:

- The iframe is one screen tall and pinned (`position: sticky`) inside a
  wrapper as tall as the whole experience.
- Visitors scroll the store page as normal, so the header hides on the way down
  and comes back on the way up, and the footer follows the experience.
- A small script tells the experience how far into the wrapper the visitor is,
  and the experience scrolls itself to match. The experience reports its height,
  so the wrapper always fits it.

## Setting it up

The page (`/pages/yu-one-automated-laundry-system`, template
`page.product-yu-one-new`) already holds the experience in a **Custom Liquid**
section. Only that block changes:

1. Open the page template in the theme editor and select the Custom Liquid
   section that contains the YU ONE `<iframe>`.
2. Replace its whole contents with [`yu-one-embed.liquid`](yu-one-embed.liquid).
3. Keep the section's padding at 0, as it is now.

The experience address is at the top of the snippet (`data-src`); change it
only if the experience moves.

It works in a theme preview (`?preview_theme_id=…` on yuhome.com.sg, or the
`*.myshopify.com` domain); other domains are ignored by the experience.

## Things to check

- **No clipping parents.** `position: sticky` stops working when an element
  around the section has `overflow: hidden`, `auto` or `scroll`. If the
  experience scrolls away instead of staying pinned, look for that on
  `main` or the page wrapper (`overflow-x: clip` is a safe replacement).
  The theme as of 2026-10-21 has none, so it works as it is.
- **Header on top.** The header sits over the top of the experience while it is
  showing; the experience moves its Buy button down clear of it. The snippet
  finds the header as `#header-component` (or the first `<header>`): update
  that selector if the header changes.
- **Share links.** "Copy link to this build" now copies the store page's
  address with `?rack=…#build`; opening it shows that build. The snippet passes
  both through to the experience.
- **Buy now** opens the product page in the same tab, outside the frame.

## If the snippet is not added

The experience still works in a plain iframe: it then scrolls inside the frame
as before, and the header will not react to it.

## Analytics

The experience reports what visitors do (chapters reached, the build they
settle on, AR, share links, buttons, the product loading) to this snippet,
which sends it with the store's own tags: GA4 `G-C30L2ECJ0J` through the
Google channel app's `gtag` (the same visitor and visit as the page around the
frame), GTM's `dataLayer`, and for a few key moments the Meta and TikTok
pixels as a custom `Product3D` event. Event names and parameters are listed at
the top of `src/components/experience/track.ts`.

**Buy now** carries `yu3d=buy_now` in its address, because the store's GA4
tag holds events for about five seconds and a click event would be lost with
the page. In GA4, read it from the product page's **Page location**.

An older copy of this snippet ignores the analytics messages, and the page
works as before.
