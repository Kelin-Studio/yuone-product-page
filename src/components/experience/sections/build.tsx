"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { EYEBROW, TITLE, sectionTimeline, vf } from "../beats";
import { embed, showAddress } from "../embed";
import { ArButton } from "./ar-button";
import {
  FEATURE_SLOTS,
  FRAMES,
  build,
  render,
  decodeBuild,
  encodeBuild,
  flowBlocked,
  sanitizeBuild,
  stage,
  type BuildState,
  type FeatureSlot,
  type FrameType,
  type ModuleType,
} from "../stage";

gsap.registerPlugin(useGSAP);

const useBuild = () => useSyncExternalStore(build.subscribe, build.get, build.get);
const useStills = () => useSyncExternalStore(render.subscribe, () => render.get().mode === "stills", () => false);

const LABEL = {
  ...vf(400, 105),
  fontSize: "0.62rem",
  letterSpacing: "0.26em",
};

const MODULE_NAME: Record<ModuleType, string> = { solo: "Solo", duo: "Duo", flex: "Flex" };
const FRAME_OPTIONS = (Object.keys(FRAMES) as FrameType[]).map((key) => ({ key, name: FRAMES[key].name }));
const FEATURE_NAME = { flow: "Flow", uv: "UV Glow" } as const;

function Choice<T extends string | number>({
  options,
  value,
  onPick,
  label,
}: {
  options: { key: T; name: string; disabled?: boolean; why?: string }[];
  value: T;
  onPick: (key: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-white/[0.07] p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={o.key === value}
          disabled={o.disabled}
          title={o.disabled ? o.why : undefined}
          onClick={() => onPick(o.key)}
          className={`flex-1 rounded-full px-3 py-1.5 font-brand text-[12px] transition disabled:cursor-not-allowed disabled:text-white/25 disabled:hover:text-white/25 ${
            o.key === value ? "bg-[#efe7da] text-[#16171b]" : "text-white/70 hover:text-white"
          }`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.2rem_1fr] items-center gap-3">
      <p className="font-display uppercase text-white/55" style={LABEL}>
        {title}
      </p>
      {children}
    </div>
  );
}

function summary(b: BuildState) {
  const count = (t: ModuleType) => b.slots.filter((s) => s === t).length;
  const lines = [
    { name: "YU ONE base", qty: 1 },
    { name: `Frame ${FRAMES[b.frame].name}, ${b.slots.length} slots`, qty: 1 },
    ...(["solo", "duo", "flex"] as const).map((t) => ({ name: `Module ${MODULE_NAME[t]}`, qty: count(t) })),
    ...(["flow", "uv"] as const).map((f) => ({ name: FEATURE_NAME[f], qty: b.features.filter((s) => s === f).length })),
  ];
  return lines.filter((l) => l.qty > 0);
}

/**
 * 04 — Build. The story hands over: drag to turn the unit, pick a frame and a
 * module for every slot, and see it in a room as wide as your own. At the end
 * the rack rises and the lights go out, which is where the page began.
 */
export function BuildSection() {
  const section = useRef<HTMLElement>(null);
  const b = useBuild();
  const stills = useStills();
  const [copied, setCopied] = useState(false);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  // a shared link opens on the configuration it was copied from
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("rack");
    const shared = code ? decodeBuild(code) : null;
    if (shared) build.set(shared);
  }, []);

  const setWidth = (n: number) => {
    const slots = b.slots.slice(0, n);
    while (slots.length < n) slots.push("duo");
    build.set({ slots });
  };
  // Max holds three modules at most, so picking it drops a fourth
  const setFrame = (frame: FrameType) => build.set(sanitizeBuild({ ...b, frame }));
  const setSlot = (i: number, type: ModuleType) => build.set({ slots: b.slots.map((s, k) => (k === i ? type : s)) });
  const setFeature = (i: number, f: FeatureSlot) => build.set({ features: b.features.map((s, k) => (k === i ? f : s)) });

  const share = async () => {
    // embedded on the store, the link is to the store's page, not to this frame
    const url = new URL(embed.hostUrl ?? window.location.href);
    if (embed.hostUrl) url.searchParams.set("rack", encodeBuild(b));
    else url.search = `?rack=${encodeBuild(b)}`;
    url.hash = "build";
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // clipboard blocked: put the link in the address bar instead
      if (embed.hosted) showAddress(url.toString());
      else window.history.replaceState(null, "", url);
    }
  };

  useGSAP(
    () => {
      const el = section.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add({ calm: "(prefers-reduced-motion: reduce)", lively: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
        const { show, hide } = sectionTimeline(el, !!ctx.conditions?.calm);
        show("[data-beat='panel']", 0.2);
        show("[data-beat='orbit']", 0.24);
        hide("[data-beat='panel']", 0.8);
        hide("[data-beat='orbit']", 0.8);
        show("[data-beat='close']", 0.88);
      });
    },
    { scope: section },
  );

  return (
    <section ref={section} id="build" className="relative h-[400svh] text-white" aria-label="Build your rack">
      <div className="sticky top-0 h-svh overflow-hidden">
        {/* ---------- drag to turn ---------- */}
        <div
          data-beat="orbit"
          className="invisible absolute inset-y-0 right-0 w-full cursor-grab touch-pan-y select-none opacity-0 active:cursor-grabbing md:w-[58vw]"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, yaw: stage.orbit.yaw, pitch: stage.orbit.pitch };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            stage.orbit.yaw = d.yaw + ((e.clientX - d.x) / window.innerWidth) * 5;
            stage.orbit.pitch = Math.max(-1, Math.min(0.75, d.pitch + ((e.clientY - d.y) / window.innerHeight) * 3));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {/* a still cannot be turned */}
          {!stills && (
            <p
              className="absolute bottom-[7svh] right-[6vw] hidden font-display uppercase text-white/60 md:block"
              style={{ ...vf(400, 105), fontSize: "clamp(0.6rem, 0.78vw, 0.82rem)", letterSpacing: "0.28em" }}
            >
              Drag to turn
            </p>
          )}
        </div>

        {/* ---------- configurator ---------- */}
        <div
          data-beat="panel"
          className="invisible absolute inset-x-[4vw] bottom-[3svh] max-h-[52svh] overflow-y-auto rounded-3xl border border-white/12 bg-[#0c0d11]/80 p-5 opacity-0 backdrop-blur-md md:inset-x-auto md:bottom-auto md:left-[6vw] md:top-1/2 md:max-h-[86svh] md:w-[min(27rem,40vw)] md:-translate-y-1/2 md:p-7"
        >
          <p className="font-display uppercase text-white/85" style={{ ...vf(400, 110), ...EYEBROW }}>
            04 — Build
          </p>
          <h2 className="mt-4 font-display text-[#efe7da]" style={{ ...TITLE, fontSize: "clamp(1.5rem, 2.4vw, 2.6rem)" }}>
            Build the rack that fits you.
          </h2>

          {stills && (
            <p className="mt-3 font-brand text-[12px] text-white/55">
              Live 3D is off on this device, so the picture shows the standard build. Your choices still go in the
              parts list and the link.
            </p>
          )}

          <div className="mt-6 space-y-3">
            <Row title="Width">
              <Choice
                label="Frame width"
                value={b.slots.length}
                onPick={setWidth}
                options={[2, 3, 4].map((n) => ({
                  key: n,
                  name: `${n} slots`,
                  disabled: n > FRAMES[b.frame].maxSlots,
                  why: `${FRAMES[b.frame].name} holds up to ${FRAMES[b.frame].maxSlots} modules`,
                }))}
              />
            </Row>
            <Row title="Frame">
              <Choice label="Frame type" value={b.frame} onPick={setFrame} options={FRAME_OPTIONS} />
            </Row>
            <p className="pl-[5.95rem] font-brand text-[11px] text-white/50">{FRAMES[b.frame].note}</p>
            {b.slots.map((slot, i) => (
              <Row key={i} title={`Slot ${i + 1}`}>
                <Choice
                  label={`Module in slot ${i + 1}`}
                  value={slot}
                  onPick={(type) => setSlot(i, type)}
                  options={(["solo", "duo", "flex"] as const).map((t) => ({ key: t, name: MODULE_NAME[t] }))}
                />
              </Row>
            ))}
            {Array.from({ length: FEATURE_SLOTS }, (_, i) => (
              <Row key={`base-${i}`} title={`Base ${i + 1}`}>
                <Choice
                  label={`Smart feature in base slot ${i + 1}`}
                  value={b.features[i] ?? "none"}
                  onPick={(f) => setFeature(i, f === "none" ? null : f)}
                  options={[
                    { key: "none" as const, name: "None" },
                    { key: "uv" as const, name: "UV Glow" },
                    {
                      key: "flow" as const,
                      name: "Flow",
                      disabled: flowBlocked(b.features, i) && b.features[i] !== "flow",
                      why: "The slot beside this one already has Flow",
                    },
                  ]}
                />
              </Row>
            ))}
            <p className="pl-[5.95rem] font-brand text-[11px] text-white/50">Three slots in the base. No two Flow side by side.</p>
            <Row title="Your space">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={b.space}
                  onClick={() => build.set({ space: !b.space })}
                  className={`shrink-0 rounded-full px-3 py-1.5 font-brand text-[12px] transition ${
                    b.space ? "bg-[#efe7da] text-[#16171b]" : "bg-white/[0.07] text-white/70 hover:text-white"
                  }`}
                >
                  {b.space ? "Showing" : "Show room"}
                </button>
                <label className="flex min-w-0 flex-1 items-center gap-2 font-brand text-[12px] text-white/70">
                  <input
                    type="range"
                    min={1.4}
                    max={4}
                    step={0.1}
                    value={b.roomWidth}
                    onChange={(e) => build.set({ roomWidth: Number(e.currentTarget.value), space: true })}
                    className="yu-range min-w-0 flex-1"
                    aria-label="Width of your room in metres"
                  />
                  <span className="w-10 shrink-0 tabular-nums">{b.roomWidth.toFixed(1)} m</span>
                </label>
              </div>
            </Row>
          </div>

          {/* the parts list, like a receipt */}
          <ul className="mt-6 border-t border-dashed border-white/20 pt-4 font-brand text-[12px] text-white/75">
            {summary(b).map((line) => (
              <li key={line.name} className="flex justify-between py-0.5">
                <span>{line.name}</span>
                <span className="tabular-nums text-white/50">× {line.qty}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={share}
              className="rounded-full bg-[#F0765A] px-5 py-2.5 font-brand text-[13px] font-semibold text-white transition hover:bg-[#ff8a6e]"
            >
              {copied ? "Link copied" : "Copy link to this build"}
            </button>
            <ArButton
              build={b}
              className="rounded-full border border-white/25 px-5 py-2.5 font-brand text-[13px] text-white transition hover:border-white/60"
            />
          </div>
        </div>

        {/* ---------- the loop closes ---------- */}
        <div data-beat="close" className="invisible absolute inset-x-0 bottom-[12svh] flex flex-col items-center text-center opacity-0">
          <p className="font-display text-[#efe7da]" style={{ ...TITLE, fontSize: "clamp(2rem, 4.4vw, 4.6rem)" }}>
            Rack up. Lights off.
          </p>
          <p className="mt-4 font-brand text-white/70" style={{ fontSize: "clamp(0.95rem, 1.1vw, 1.15rem)", fontWeight: 300 }}>
            Until the next load.
          </p>
        </div>
      </div>
    </section>
  );
}
