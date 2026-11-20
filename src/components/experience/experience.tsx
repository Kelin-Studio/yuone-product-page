"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Backdrop } from "./backdrop";
import { CtaCables, Hud } from "./hud";
import { BuildSection } from "./sections/build";
import { CareSection } from "./sections/care";
import { ControlSection } from "./sections/control";
import { HeroSection } from "./sections/hero";
import { ModulesSection } from "./sections/modules";
import { startEmbed } from "./embed";
import { chooseMode } from "./quality";
import { settleRig, tickRig } from "./rig";
import { SECTIONS, render, stage } from "./stage";
import { STILL_AT, STILL_SETS, Stills, StillsNote } from "./stills";
import { startTracking, trackLoad } from "./track";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const Scene = dynamic(() => import("./scene").then((m) => m.Scene), { ssr: false });

/**
 * The whole page as one continuous shot.
 *
 * Three fixed layers sit behind the scrolling copy: the backdrop, the WebGL
 * canvas with the one model that never unloads, and the HUD. The sections
 * themselves are only scroll length and words; each reports its progress to
 * the shared stage, and the rig turns that into the next frame.
 */
const useRenderMode = () => useSyncExternalStore(render.subscribe, () => render.get().mode, () => "probing" as const);

export function Experience() {
  const root = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);
  const mode = useRenderMode();

  // live 3D, or stills where the machine would draw it in software (quality.ts)
  useEffect(() => {
    render.set({ mode: chooseMode() });
  }, []);

  // embedded on the store, the store's page owns the scroll (embed.ts)
  useEffect(() => startEmbed(), []);

  // what visitors do, for the store's analytics (track.ts)
  useEffect(() => startTracking(), []);

  /** Called once the GLB is decoded and mounted in the canvas, or the first still has loaded. */
  const onSceneReady = useCallback(() => {
    if (revealed.current || !root.current) return;
    revealed.current = true;
    stage.ready = true;
    trackLoad(render.get().mode);
    const q = gsap.utils.selector(root.current);
    const tl = gsap
      .timeline({ defaults: { ease: "power2.out" } })
      .to(q("[data-canvas]"), { autoAlpha: 1, duration: 1.6 }, 0);
    // the hint belongs to the untouched first frame only: if the reader has
    // already scrolled while the model was decoding, the scroll timeline owns it
    tl.add(() => {
      if (stage.progress[0] < 0.01 && !stage.reduced) {
        gsap.fromTo(q("[data-hint]"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power2.out" });
      }
    }, 1.1);
  }, []);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;

      SECTIONS.forEach((s, i) => {
        const report = (self: ScrollTrigger) => {
          stage.progress[i] = self.progress;
        };
        ScrollTrigger.create({
          trigger: `#${s.id}`,
          // the hero starts pinned; every later section counts from the moment it enters
          start: i === 0 ? "top top" : "top bottom",
          end: "bottom bottom",
          onUpdate: report,
          onRefresh: report,
        });
      });

      if (process.env.NODE_ENV === "development") {
        // for checking a frame in a throttled tab: window.__yu.settle() after scrolling
        (window as unknown as { __yu?: unknown }).__yu = {
          /** For scripts/capture-stills.mjs. */
          stills: { at: STILL_AT, sets: STILL_SETS },
          settle() {
            ScrollTrigger.update();
            ScrollTrigger.getAll().forEach((st) => {
              const tween = st.getTween() as unknown;
              if (tween instanceof gsap.core.Tween) tween.progress(1);
            });
            settleRig();
          },
        };
      }

      let lastY = window.scrollY;
      const tick = (time: number, delta: number) => {
        const dt = Math.min(0.1, Math.max(1, delta) / 1000);
        const y = window.scrollY;
        const v = (y - lastY) / window.innerHeight / dt;
        lastY = y;
        stage.velocity += (v - stage.velocity) * 0.2;
        tickRig(time, dt);
      };
      gsap.ticker.add(tick);

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        stage.reduced = false;
        const onMove = (e: PointerEvent) => {
          stage.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
          stage.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
        };
        const onLeave = () => {
          stage.pointer.x = 0;
          stage.pointer.y = 0;
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
        return () => {
          window.removeEventListener("pointermove", onMove);
          document.documentElement.removeEventListener("pointerleave", onLeave);
        };
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        stage.reduced = true;
        stage.pointer.x = 0;
        stage.pointer.y = 0;
      });

      return () => gsap.ticker.remove(tick);
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative">
      <Backdrop />

      {/* the cables the Buy button is lowered on at the end, behind the unit */}
      <CtaCables />

      {/* ---------- 3D product (fades in once the model is decoded), or its stills ---------- */}
      <div data-canvas className="pointer-events-none invisible fixed inset-0 z-10 opacity-0">
        {mode === "live" && <Scene onReady={onSceneReady} />}
        {mode === "stills" && <Stills onReady={onSceneReady} />}
      </div>

      <div className="relative z-20">
        <HeroSection />
        <ModulesSection />
        <CareSection />
        <ControlSection />
        <BuildSection />
      </div>

      <Hud />
      {mode === "stills" && <StillsNote />}
    </div>
  );
}
