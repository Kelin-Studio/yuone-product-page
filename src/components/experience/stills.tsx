"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { forceLive } from "./quality";
import { rig } from "./rig";
import { stage } from "./stage";

/**
 * Page positions (section index + progress) with a still of the unit, in
 * order. The resting beats of the page (ANCHORS in stage.ts) plus the points
 * between them where the unit turns or changes most. scripts/capture-stills.mjs
 * renders one image per position from the live canvas.
 */
export const STILL_AT = [
  0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.62, 0.74, 0.85, 0.97,
  1.14, 1.29, 1.5, 1.6, 1.74, 1.97,
  2.22, 2.41, 2.57, 2.71, 2.92,
  3.4, 3.62, 3.76, 3.9,
  4.25, 4.5, 4.8, 4.92, 5.0,
];

/** Captured at these viewports; phones (aspect < 0.9) get their own set, as the layout differs. */
export const STILL_SETS = {
  wide: { width: 1600, height: 840, scale: 1.25 },
  narrow: { width: 390, height: 844, scale: 2 },
} as const;
export type StillSet = keyof typeof STILL_SETS;

export const stillUrl = (set: StillSet, i: number) => `/stills/${set}/${String(i).padStart(2, "0")}.webp`;

const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * The product for machines that cannot draw it live: the still nearest the
 * reader's place on the page, dissolving into the next as they scroll. Only
 * the last third of the way between two stills is a dissolve, so most of the
 * time one clean picture shows rather than two ghosts.
 */
export function Stills({ onReady }: { onReady: () => void }) {
  const [set, setSet] = useState<StillSet | null>(null);
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  const ready = useRef(false);
  // the stills are stacked full-screen, so the browser would count every one as in
  // view: fetch only those around the reader's place, and keep what has been fetched
  const [wanted, setWanted] = useState<ReadonlySet<number>>(() => new Set());
  const asked = useRef(new Set<number>());

  useEffect(() => {
    const pick = () => setSet(window.innerWidth / Math.max(1, window.innerHeight) < 0.9 ? "narrow" : "wide");
    pick();
    window.addEventListener("resize", pick);
    return () => window.removeEventListener("resize", pick);
  }, []);

  useEffect(() => {
    if (!set) return;
    const paint = () => {
      const T = rig.T;
      let i = STILL_AT.findIndex((at) => at > T) - 1;
      if (i < 0) i = T < STILL_AT[0] ? 0 : STILL_AT.length - 1;
      const next = Math.min(i + 1, STILL_AT.length - 1);
      const u = next === i ? 0 : (T - STILL_AT[i]) / (STILL_AT[next] - STILL_AT[i]);
      const w = smooth(Math.min(1, Math.max(0, (u - 0.66) / 0.34)));
      let added = false;
      for (let k = Math.max(0, i - 1); k <= Math.min(STILL_AT.length - 1, i + 3); k++) {
        if (!asked.current.has(k)) {
          asked.current.add(k);
          added = true;
        }
      }
      if (added) setWanted(new Set(asked.current));
      imgs.current.forEach((img, k) => {
        if (!img) return;
        const o = k === i ? 1 - w : k === next ? w : 0;
        img.style.opacity = String(o);
        img.style.visibility = o > 0.001 ? "visible" : "hidden";
      });
    };
    gsap.ticker.add(paint);
    return () => gsap.ticker.remove(paint);
  }, [set]);

  const loaded = () => {
    if (ready.current) return;
    ready.current = true;
    stage.ready = true;
    onReady();
  };

  if (!set) return null;
  return (
    <>
      {STILL_AT.map((_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${set}-${i}`}
          ref={(node) => {
            imgs.current[i] = node;
          }}
          src={wanted.has(i) ? stillUrl(set, i) : undefined}
          alt=""
          decoding="async"
          onLoad={loaded}
          onError={loaded}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0, visibility: "hidden" }}
        />
      ))}
    </>
  );
}

/** Says why the picture is still, and lets the visitor try the live 3D anyway. */
export function StillsNote() {
  return (
    <div className="pointer-events-auto fixed left-4 top-[calc(1rem+var(--yu-inset-top,0px))] z-40 flex items-center gap-3 rounded-full border border-white/15 bg-[#0c0d11]/70 py-1.5 pl-4 pr-1.5 font-brand text-[12px] text-white/75">
      <span>Simplified view for this device</span>
      <button
        type="button"
        onClick={forceLive}
        data-track="show_in_3d"
        className="rounded-full bg-white/10 px-3 py-1 text-white transition hover:bg-white/20"
      >
        Show live 3D
      </button>
    </div>
  );
}
