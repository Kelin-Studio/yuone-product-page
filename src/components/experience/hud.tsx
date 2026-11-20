"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { vf } from "./beats";
import { sfx } from "./sound";
import { rig, seg } from "./rig";
import { SECTIONS, STORE_URL, pageT, stage } from "./stage";

gsap.registerPlugin(useGSAP);

const TRAVEL = 118; // px the miniature rack lowers from the top of the page to the bottom

/**
 * The Buy button's closing move, in page position: as the unit powers down it
 * slides from its corner to the top of the page, is lowered on two cables like
 * the rack to the middle of the screen, and lands with its ring lit, the same
 * shape as the light ring that has just gone dark on the unit.
 */
const CTA = { slide: [4.86, 4.92], lower: [4.92, 4.985], glow: [4.97, 4.995] } as const;
const CTA_SCALE = 1.4;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Where the button is this frame, for the cables drawn behind the unit. */
const cta = { x: 0, top: 0, half: 0, shown: 0 };

function ctaPose(t: number) {
  const a = seg(t, ...CTA.slide);
  const b = seg(t, ...CTA.lower);
  // reduced motion: no flight, the button is simply in the middle at the end
  if (stage.reduced) {
    const end = t >= CTA.lower[1] ? 1 : 0;
    return { a: end, b: end, g: end };
  }
  return { a: ease(a), b: ease(b), g: seg(t, ...CTA.glow) };
}

/**
 * The two cables the Buy button hangs from while it is lowered. They sit behind
 * the 3D layer, so they seem to come down from inside the unit.
 */
export function CtaCables() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const [l, r] = Array.from(el.children) as HTMLElement[];
      const paint = () => {
        el.style.opacity = String(cta.shown);
        if (!cta.shown) return;
        for (const [line, x] of [[l, cta.x - cta.half], [r, cta.x + cta.half]] as const) {
          line.style.transform = `translateX(${x.toFixed(1)}px)`;
          line.style.height = `${Math.max(0, cta.top).toFixed(1)}px`;
        }
      };
      gsap.ticker.add(paint);
      return () => gsap.ticker.remove(paint);
    },
    { scope: root },
  );
  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed inset-0 z-[5] opacity-0">
      <span className="absolute left-0 top-0 block w-px bg-gradient-to-b from-[#efe7da]/10 to-[#efe7da]/55" />
      <span className="absolute left-0 top-0 block w-px bg-gradient-to-b from-[#efe7da]/10 to-[#efe7da]/55" />
    </div>
  );
}

/**
 * Fixed furniture: a miniature of the unit whose rack height is how far down
 * the page you are, and the sound switch.
 */
export function Hud() {
  const root = useRef<HTMLDivElement>(null);
  const [sound, setSound] = useState(false);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const rack = q("[data-mini-rack]")[0] as HTMLElement | undefined;
      const lift = q("[data-mini-lift]")[0] as HTMLElement | undefined;
      const marks = q("[data-mark]") as HTMLElement[];
      const fade = q("[data-fade]")[0] as HTMLElement | undefined;
      const buy = q("[data-buy]")[0] as HTMLElement | undefined;
      const ring = q("[data-buy-ring]") as HTMLElement[];
      let landed = false;

      const paint = () => {
        const t = pageT();
        const y = (t / SECTIONS.length) * TRAVEL;
        if (rack) rack.style.transform = `translateY(${y.toFixed(1)}px)`;
        if (lift) lift.style.height = `${(y + 6).toFixed(1)}px`;
        const current = Math.min(SECTIONS.length - 1, Math.floor(t));
        marks.forEach((m, i) => m.toggleAttribute("data-current", i === current));
        // dark ink on the drawing board, light everywhere else
        el.style.color = rig.backdrop.paper > 0.5 ? "#222222" : "#efe7da";
        // the furniture stays out of the way of the hero until the reader starts moving; the cart never hides
        if (fade) fade.style.opacity = String(Math.min(1, t * 6));

        // the closing move: corner → top of the page → lowered to the middle, ring lit
        if (buy) {
          const { a, b, g } = ctaPose(t);
          const w = buy.offsetWidth;
          const h = buy.offsetHeight;
          const rx = buy.offsetLeft + w / 2;
          const ry = buy.offsetTop + h / 2;
          const dx = (window.innerWidth / 2 - rx) * a;
          const dy = (window.innerHeight / 2 - ry) * b;
          const s = 1 + (CTA_SCALE - 1) * b;
          buy.style.transform = a || b ? `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${s.toFixed(3)})` : "";
          for (const r of ring) r.style.opacity = g.toFixed(3);
          cta.x = rx + dx;
          cta.top = ry + dy - (h * s) / 2;
          cta.half = (w * s) / 2 - 16 * s;
          cta.shown = a >= 0.999 ? Math.min(1, b * 5) : 0;
          if (g > 0.5 && !landed) sfx.click();
          landed = g > 0.5;
        }
      };
      gsap.ticker.add(paint);
      return () => gsap.ticker.remove(paint);
    },
    { scope: root },
  );

  const toggle = () => {
    const on = !sound;
    setSound(on);
    void sfx.enable(on);
  };

  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-40 transition-colors duration-500">
      {/* ---------- buy: always within reach, and the last thing on the page ---------- */}
      {/* embedded on the store, it moves down clear of the store's header while that shows (embed.ts) */}
      <div
        data-buy
        className="absolute right-4 top-[calc(1rem+var(--yu-inset-top,0px))] will-change-transform md:right-[6vw] md:top-[calc(1.5rem+var(--yu-inset-top,0px))]"
      >
        {/* the lit ring and the light it throws, once the button has landed */}
        <span
          data-buy-ring
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[420%] w-[320%] -translate-x-1/2 -translate-y-[38%] opacity-0"
          style={{ background: "radial-gradient(closest-side, rgba(255,214,170,0.2), rgba(255,214,170,0))" }}
        />
        <span
          data-buy-ring
          aria-hidden
          className="pointer-events-none absolute -inset-[9px] rounded-full border border-[#ffe2bf]/70 opacity-0 shadow-[0_0_26px_rgba(255,226,191,0.5),inset_0_0_12px_rgba(255,226,191,0.3)]"
        />
        <a
          href={STORE_URL}
          // the page is embedded in an iframe on yuhome.com.sg: open the store in the parent tab, not the frame
          target="_top"
          data-track="buy_now"
          className="pointer-events-auto relative inline-flex items-center gap-2 rounded-full bg-[#F0765A] px-4 py-2 font-brand text-[13px] font-semibold text-white shadow-[0_12px_32px_rgba(240,118,90,0.35)] transition hover:bg-[#ff8a6e] md:px-5 md:py-2.5"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4">
            <path d="M4.5 7.5h15l-1.2 12.2a1.4 1.4 0 0 1-1.4 1.3H7.1a1.4 1.4 0 0 1-1.4-1.3L4.5 7.5Z" strokeLinejoin="round" />
            <path d="M8.7 9.6V6.4a3.3 3.3 0 0 1 6.6 0v3.2" strokeLinecap="round" />
          </svg>
          Buy now
        </a>
      </div>

      <div data-fade className="absolute inset-0 opacity-0">
      {/* ---------- miniature rack: page progress ---------- */}
      <nav
        aria-label="Sections"
        className="pointer-events-auto absolute right-[1.6vw] top-1/2 hidden -translate-y-1/2 flex-col items-center md:flex"
      >
        <span aria-hidden className="block h-2 w-9 rounded-full border border-current opacity-80" />
        <div className="relative w-9" style={{ height: TRAVEL + 14 }}>
          <span data-mini-lift aria-hidden className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-current opacity-40" />
          <span data-mini-rack aria-hidden className="absolute inset-x-0 top-1.5 block will-change-transform">
            <span className="block h-0.5 w-full rounded-full bg-[#F0765A]" />
            <span className="mt-1 block h-px w-full bg-current opacity-60" />
          </span>
          <ol className="absolute inset-0">
            {SECTIONS.map((s, i) => (
              <li key={s.id} className="absolute right-full" style={{ top: (i / SECTIONS.length) * TRAVEL + 3 }}>
                <a
                  data-mark
                  href={`#${s.id}`}
                  className="group flex items-center gap-2 pr-2 font-display uppercase opacity-40 transition-opacity hover:opacity-100 data-[current]:opacity-100"
                  style={{ ...vf(400, 105), fontSize: "0.56rem", letterSpacing: "0.26em" }}
                >
                  <span className="hidden whitespace-nowrap group-hover:inline group-data-[current]:inline">{s.label}</span>
                  <span aria-hidden className="block h-px w-2 bg-current" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      {/* ---------- sound ---------- */}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={sound}
        data-track={sound ? "sound_off" : "sound_on"}
        className="pointer-events-auto absolute bottom-[3svh] right-4 flex items-center gap-2 font-display uppercase opacity-70 transition-opacity hover:opacity-100 md:right-[1.6vw]"
        style={{ ...vf(400, 105), fontSize: "0.6rem", letterSpacing: "0.26em" }}
      >
        <span aria-hidden className="flex h-3 items-end gap-[2px]">
          {[0.5, 1, 0.7, 0.35].map((h, i) => (
            <span
              key={i}
              className={`block w-[2px] origin-bottom rounded-full bg-current ${sound ? "yu-wave" : ""}`}
              style={{ height: `${h * 100}%`, animationDelay: `${-i * 0.17}s` }}
            />
          ))}
        </span>
        Sound {sound ? "on" : "off"}
      </button>
      </div>
    </div>
  );
}
