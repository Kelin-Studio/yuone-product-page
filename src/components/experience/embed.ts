/**
 * Embedded on yuhome.com.sg, the Shopify page owns the scroll.
 *
 * The page sits in an iframe one screen tall, pinned inside a section as tall
 * as this whole page (shopify/yu-one-embed.liquid). The visitor
 * scrolls the Shopify page, so its nav bar hides and its footer follows as on
 * any other page; the host sends how far into the section they are, and this
 * page scrolls itself to the same place. Because the frame is exactly one
 * screen tall, the two match one to one and the choreography runs unchanged.
 *
 * Messages, all plain objects posted to one checked origin:
 *   host  → frame  { source: "yu-one-host", type: "hello", url }   the host is ready; its address, for share links
 *   host  → frame  { source: "yu-one-host", type: "scroll", y, inset }  px scrolled into the section;
 *                                                                   px of the host's header over the frame's top
 *   frame → host   { source: "yu-one", type: "ready" }
 *   frame → host   { source: "yu-one", type: "height", height }   px, the section's height
 *   frame → host   { source: "yu-one", type: "scroll-to", y, smooth }  an in-page link, as px into the section
 *   frame → host   { source: "yu-one", type: "address", url }    a share link for the host's address bar
 *   frame → host   { source: "yu-one", type: "track", event, params, ads }  an analytics event for the
 *                                                                   store's own tags (track.ts)
 *
 * Until a host says hello the page scrolls itself as before, so it works in
 * any iframe, and on its own.
 */

/** Pages allowed to drive the scroll. */
const HOSTS = [
  /^https:\/\/(www\.)?yuhome\.com\.sg$/,
  // theme previews and the store's own domain
  /^https:\/\/[a-z0-9-]+\.myshopify\.com$/,
  ...(process.env.NODE_ENV === "development" ? [/^http:\/\/localhost(:\d+)?$/] : []),
];

export const embed = {
  /** A host page is driving the scroll. */
  hosted: false,
  /** The host page's address when hosted: share links point there, not at this frame. */
  hostUrl: null as string | null,
};

let origin: string | null = null;

const post = (message: Record<string, unknown>) => {
  if (origin) window.parent.postMessage({ source: "yu-one", ...message }, origin);
};

/** Analytics sent before the host said hello, held until it does. */
const held: Record<string, unknown>[] = [];

/**
 * Pass an analytics event to the host page, which sends it with the store's
 * own tags (track.ts). On its own, outside a host, the page reports nothing.
 */
export function report(message: Record<string, unknown>) {
  if (origin) post(message);
  else if (window.self !== window.top && held.length < 60) held.push(message);
}

/** Where an element starts, in px from the top of this page (= into the host's section). */
const topOf = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

/**
 * Scroll to an in-page target. Hosted, the host has to do it, or its own
 * scroll would put the page straight back. Returns false when not hosted.
 */
export function jumpTo(hash: string, smooth = true) {
  if (!embed.hosted) return false;
  const el = document.getElementById(decodeURIComponent(hash.replace(/^#/, "")));
  if (el) post({ type: "scroll-to", y: topOf(el), smooth });
  return true;
}

/** Put a share link in the host's address bar, where the clipboard is blocked. */
export function showAddress(url: string) {
  post({ type: "address", url });
}

/** Listen for a host page. Returns the cleanup. */
export function startEmbed() {
  if (window.self === window.top) return () => {};

  let observer: ResizeObserver | null = null;
  let lastHeight = 0;
  const sendHeight = () => {
    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) return;
    lastHeight = height;
    post({ type: "height", height });
  };

  const onMessage = (e: MessageEvent) => {
    if (e.source !== window.parent || !HOSTS.some((h) => h.test(e.origin))) return;
    const data = e.data as { source?: string; type?: string; url?: unknown; y?: unknown; inset?: unknown } | null;
    if (!data || data.source !== "yu-one-host") return;

    if (data.type === "hello") {
      if (!embed.hosted) {
        embed.hosted = true;
        origin = e.origin;
        // the visitor's wheel and swipes pass through to the host; only the host moves this page now
        document.documentElement.classList.add("yu-hosted");
        if ("scrollRestoration" in history) history.scrollRestoration = "manual";
        // html is h-full, so the body is what grows with the sections
        observer = new ResizeObserver(sendHeight);
        observer.observe(document.body);
        post({ type: "ready" });
        sendHeight();
        held.splice(0).forEach(post);
        // a shared link that opens on a section (#build)
        if (window.location.hash) jumpTo(window.location.hash, false);
      }
      if (typeof data.url === "string") embed.hostUrl = data.url;
    } else if (data.type === "scroll" && embed.hosted && typeof data.y === "number") {
      window.scrollTo(0, data.y);
      // the store's header, while it slides in over the top: the buttons up there move clear of it
      if (typeof data.inset === "number") {
        document.documentElement.style.setProperty("--yu-inset-top", `${Math.max(0, Math.min(data.inset, 200))}px`);
      }
    }
  };

  // in-page links (the hero's "Build yours") go through the host
  const onClick = (e: MouseEvent) => {
    if (!embed.hosted || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const link = (e.target as Element | null)?.closest?.("a[href^='#']");
    if (!link) return;
    if (jumpTo(link.getAttribute("href")!)) e.preventDefault();
  };

  window.addEventListener("message", onMessage);
  document.addEventListener("click", onClick);
  return () => {
    window.removeEventListener("message", onMessage);
    document.removeEventListener("click", onClick);
    observer?.disconnect();
  };
}
