/**
 * What visitors do in the experience, for the store's analytics.
 *
 * Embedded on yuhome.com.sg, every event goes to the host page (embed.ts,
 * "track" message), and the store's snippet sends it with the store's own
 * tags: GA4 (G-C30L2ECJ0J, the same visit and visitor as the page around the
 * frame), GTM's dataLayer, and for a few key moments the Meta and TikTok
 * pixels. On its own (the vercel.app address) nothing is sent.
 *
 * Every event carries `content_type` (the product) and `content_id` (what it
 * was about): both are GA4's built-in dimensions, so the reports read them
 * without any custom definitions.
 *
 *   product_3d_load      content_id = "live" | "stills", load_ms   the product appeared
 *   product_3d_section   content_id = section id, section_index    reached a chapter (once each)
 *   product_3d_click     content_id = what was clicked, link_url   a button or link
 *                                     (ar_quicklook / ar_webxr / ar_download: the AR button, by what it does here)
 *   product_3d_build     content_id = build code, e.g. "max-sdf-0fu"  the visitor settled on a build
 *   product_3d_share     content_id = build code                   copied the link to a build
 *
 * `ads` names the moments the Meta and TikTok pixels also get, as a custom
 * "Product3D" event with { product, action }: they make audiences such as
 * "watched the whole page".
 *
 * Links that take the whole tab to another store page (Buy now) also get
 * `yu3d=<what was clicked>` in their address. The store's GA4 tag holds events
 * for about five seconds before it sends them, so a click event is lost when
 * the page unloads first; the next page's page_view keeps the marker in its
 * page location instead.
 */

import { report } from "./embed";
import { SECTIONS, STORE_URL, build, encodeBuild } from "./stage";

const PRODUCT = "yu_one";

type Params = Record<string, string | number>;

export function track(event: string, params: Params = {}, ads?: string) {
  report({ type: "track", event, params: { content_type: PRODUCT, ...params }, ads });
}

/** The product is on screen, live or as stills. Once per visit. */
let loaded = false;
export function trackLoad(mode: string) {
  if (loaded) return;
  loaded = true;
  track("product_3d_load", { content_id: mode, load_ms: Math.round(performance.now()) });
}

/** A name for a link from where it goes, when it carries no data-track of its own. */
function linkName(a: HTMLAnchorElement) {
  const href = a.getAttribute("href") ?? "";
  if (href.startsWith("#")) return `nav_${href.slice(1)}`;
  if (href.startsWith("mailto:")) return "email";
  if (/wa\.me|whatsapp/.test(href)) return "whatsapp";
  if (href.includes("/cart/add")) return "add_to_cart";
  if (href.startsWith(STORE_URL)) return "store";
  return "link";
}

/** Moments worth an ads-pixel event too. */
const adsFor = (name: string) =>
  name === "buy_now" || name === "add_to_cart" || name === "whatsapp" ? name : name.startsWith("ar_") ? "ar" : undefined;

/** Put the marker on a link to another page of the store, for the next page's page_view. */
function mark(a: HTMLAnchorElement, name: string) {
  let url: URL;
  try {
    url = new URL(a.href);
  } catch {
    return;
  }
  if (!/(^|\.)yuhome\.com\.sg$/.test(url.hostname) || a.target !== "_top") return;
  if (url.pathname === "/cart/add") {
    // Shopify sends the visitor on to the cart and drops the rest: return_to carries it through
    url.searchParams.set("return_to", `/cart?yu3d=${name}`);
  } else {
    url.searchParams.set("yu3d", name);
  }
  a.href = url.href;
}

/** Sections reached, clicks and builds, for the whole page. Returns the cleanup. */
export function startTracking() {
  const seen = new Set<string>();
  const last = SECTIONS[SECTIONS.length - 1].id;
  // a section counts once it crosses the middle of the screen
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = e.target.id;
        if (!e.isIntersecting || seen.has(id)) continue;
        seen.add(id);
        const index = SECTIONS.findIndex((s) => s.id === id) + 1;
        track("product_3d_section", { content_id: id, section_index: index }, id === last ? "finished" : undefined);
      }
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  for (const s of SECTIONS) {
    const el = document.getElementById(s.id);
    if (el) io.observe(el);
  }

  const onClick = (e: MouseEvent) => {
    // only the visitor's own clicks, not the links the page clicks itself (the AR download)
    if (!e.isTrusted) return;
    const el = (e.target as Element | null)?.closest?.("[data-track], a[href]");
    if (!el) return;
    const name = el.getAttribute("data-track") ?? (el instanceof HTMLAnchorElement ? linkName(el) : null);
    if (!name) return;
    const params: Params = { content_id: name };
    const href = el instanceof HTMLAnchorElement ? el.getAttribute("href") ?? "" : "";
    if (el instanceof HTMLAnchorElement && href && !href.startsWith("#") && !href.startsWith("blob:")) {
      mark(el, name);
      params.link_url = el.href;
    }
    track("product_3d_click", params, adsFor(name));
  };
  // capture: before a link's own handler, so the marker is on the link before it is followed
  document.addEventListener("click", onClick, true);

  // the build the visitor settles on: once it has stood for three seconds, a few times at most
  // (a shared ?rack= link is already in place by now, so it does not count)
  let sent = encodeBuild(build.get());
  let builds = 0;
  let timer = 0;
  const unsubscribe = build.subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const code = encodeBuild(build.get());
      if (code === sent || builds >= 15) return;
      sent = code;
      builds++;
      track("product_3d_build", { content_id: code });
    }, 3000);
  });

  return () => {
    io.disconnect();
    document.removeEventListener("click", onClick, true);
    unsubscribe();
    window.clearTimeout(timer);
  };
}
