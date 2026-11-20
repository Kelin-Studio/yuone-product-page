"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { BODY, EYEBROW, ON_ROOM, TITLE, sectionTimeline, vf } from "../beats";
import { RACK_DROP, RACK_Y, rig } from "../rig";
import { control, stage, type ControlState, type LightMode } from "../stage";

gsap.registerPlugin(useGSAP);

const useControl = () => useSyncExternalStore(control.subscribe, control.get, control.get);

const LABEL = {
  ...vf(400, 105),
  fontSize: "0.62rem",
  letterSpacing: "0.26em",
};

const LIGHTS: { key: LightMode; name: string }[] = [
  { key: "off", name: "Off" },
  { key: "warm", name: "Warm" },
  { key: "cool", name: "Cool" },
  { key: "daylight", name: "Daylight" },
];

type SwitchKey = "flow" | "uv" | "heat";
const SWITCHES: { key: SwitchKey; name: string; note: string }[] = [
  { key: "flow", name: "Flow", note: "Air, sweeping across the rack" },
  { key: "uv", name: "Disinfect", note: "UV light cycle, rack at the top" },
  { key: "heat", name: "Heating", note: "Warm air while it dries" },
];

function Switch({ name, note, on, disabled, onChange }: { name: string; note: string; on: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      data-track={`control_${name.toLowerCase().replace(/\W+/g, "_")}`}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-2 text-left transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:hover:bg-white/[0.06] sm:py-2.5"
    >
      <span>
        <span className="block font-brand text-[13px] text-white">{name}</span>
        <span className="hidden font-brand text-[11px] text-white/45 sm:block">{note}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-[#F0765A]" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}

function Key({ label, glyph, disabled, onClick }: { label: string; glyph: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-track={`lift_${label.toLowerCase()}`}
      className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.1] py-2 font-brand text-[11px] text-white transition hover:bg-white/[0.16] active:bg-[#F0765A] disabled:opacity-40 disabled:hover:bg-white/[0.1]"
    >
      <span aria-hidden className="font-display text-[15px] leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}

/**
 * The app, as a working panel: what you set here is what the unit on the
 * right does. The layout is this page's; the functions are the app's.
 */
function Panel({ state }: { state: ControlState }) {
  const bar = useRef<HTMLDivElement>(null);
  const depth = useRef<HTMLSpanElement>(null);
  const scheduled = state.driver === "schedule";

  // the travel readout follows the rack whatever moves it (the keys or the schedule)
  useEffect(() => {
    const sync = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${rig.height.toFixed(3)})`;
      if (depth.current) depth.current.textContent = `${(-RACK_Y + rig.height * RACK_DROP).toFixed(1)} m`;
    };
    gsap.ticker.add(sync);
    return () => gsap.ticker.remove(sync);
  }, []);

  /** Up and down run to the end of travel; stop holds the rack where it is. */
  const move = (to: number | null) => {
    stage.height = to === null ? rig.height : to;
  };

  return (
    <div className="w-[min(20rem,88vw)] rounded-[2.2rem] border border-white/15 bg-[#0c0d11]/88 p-3 text-white shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-md sm:p-4">
      <div aria-hidden className="mx-auto mb-3 h-1 w-14 rounded-full bg-white/20" />
      <div className="flex items-baseline justify-between px-1">
        <p className="font-display uppercase text-white/85" style={LABEL}>
          YU ONE
        </p>
        <p className="font-display uppercase text-[#F0765A]" style={LABEL}>
          {scheduled ? `Schedule · ${state.clock}` : "Manual"}
        </p>
      </div>

      {/* ---------- height: up, stop, down ---------- */}
      <div className="mt-3 rounded-2xl bg-white/[0.06] px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-brand text-[13px] text-white">Height</span>
          <span className="font-brand text-[11px] text-white/45">
            <span ref={depth} className="tabular-nums text-white/80">
              1.3 m
            </span>{" "}
            below the ceiling
          </span>
        </div>
        <div aria-hidden className="mt-2 h-px w-full bg-white/15">
          <div ref={bar} className="h-px w-full origin-left bg-[#F0765A]" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Key label="Up" glyph="↑" disabled={scheduled} onClick={() => move(0)} />
          <Key label="Stop" glyph="■" disabled={scheduled} onClick={() => move(null)} />
          <Key label="Down" glyph="↓" disabled={scheduled} onClick={() => move(1)} />
        </div>
      </div>

      {/* ---------- lighting ---------- */}
      <div className="mt-2 rounded-2xl bg-white/[0.06] px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-brand text-[13px] text-white">Lighting</span>
          <span className="hidden font-brand text-[11px] text-white/45 sm:block">Panel under the base</span>
        </div>
        <div role="radiogroup" aria-label="Lighting" className="mt-2 flex gap-1 rounded-full bg-white/[0.06] p-1">
          {LIGHTS.map((l) => (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={state.light === l.key}
              disabled={scheduled}
              onClick={() => control.set({ light: l.key })}
              data-track={`light_${l.key}`}
              className={`flex-1 rounded-full px-2 py-1.5 font-brand text-[12px] transition disabled:opacity-60 ${
                state.light === l.key ? "bg-[#efe7da] text-[#16171b]" : "text-white/70 hover:text-white"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {SWITCHES.map((s) => (
          <Switch
            key={s.key}
            name={s.name}
            note={s.key === "uv" && !state.rackUp && !scheduled ? "Raise the rack all the way first" : s.note}
            on={state[s.key]}
            // UV runs only with the rack all the way up, as on the product
            disabled={scheduled || (s.key === "uv" && !state.rackUp)}
            onChange={() => control.set({ [s.key]: !state[s.key] })}
          />
        ))}
      </div>

      <p className="mt-3 min-h-[2.2em] px-1 font-brand text-[11px] leading-snug text-white/55" aria-live="polite">
        {scheduled
          ? state.note
          : state.rackUp
            ? "Illustrative panel: the functions are the YU ONE app’s, the layout is this page’s."
            : "Disinfect runs only with the rack all the way up. Raise it to switch UV on."}
      </p>
    </div>
  );
}

const DAY_STEPS = [
  { at: "07:30", label: "Lowers for the morning load" },
  { at: "09:00", label: "Flow on" },
  { at: "13:00", label: "Rain. Flow and heating keep drying" },
  { at: "15:00", label: "Rises all the way up" },
  { at: "16:00", label: "Disinfect cycle, at the top" },
  { at: "20:30", label: "Evening light, warm" },
];

/**
 * 03 — Control. Here scroll stops driving and the visitor takes over: the
 * panel moves the real model. Further down, a schedule takes the panel over
 * and runs a whole day.
 */
export function ControlSection() {
  const section = useRef<HTMLElement>(null);
  const state = useControl();

  useGSAP(
    () => {
      const el = section.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add({ calm: "(prefers-reduced-motion: reduce)", lively: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
        const { show, hide } = sectionTimeline(el, !!ctx.conditions?.calm);
        show("[data-beat='hands']", 0.17);
        show("[data-beat='panel']", 0.19);
        hide("[data-beat='hands']", 0.52);
        show("[data-beat='day']", 0.56);
      });
    },
    { scope: section },
  );

  return (
    <section ref={section} id="control" className="relative h-[600svh] text-white" aria-label="Control">
      <div className="sticky top-0 h-svh overflow-hidden">
        {/* ---------- copy ---------- */}
        <div data-beat="hands" className="invisible absolute left-[6vw] top-[8svh] max-w-[30rem] opacity-0 md:top-[9svh]">
          <p className="font-display uppercase text-white/85" style={{ ...vf(400, 110), ...EYEBROW }}>
            03 — Control
          </p>
          <span aria-hidden className="mt-4 hidden h-px w-12 bg-white/60 md:block" />
          <h2 className="mt-3 font-display text-[#efe7da] md:mt-5" style={{ ...TITLE, fontSize: "clamp(1.5rem, 3vw, 3.2rem)" }}>
            Every function, <br className="hidden md:block" />
            from the app.
          </h2>
          <p className="mt-4 hidden font-brand text-white/75 md:block [@media(max-height:720px)]:hidden" style={{ ...BODY, ...ON_ROOM }}>
            This panel is live. Whatever you set, the unit does.
          </p>
        </div>

        <div data-beat="day" className="invisible absolute left-[6vw] top-[8svh] max-w-[30rem] opacity-0 md:top-[9svh]">
          <p className="font-display uppercase text-white/85" style={{ ...vf(400, 110), ...EYEBROW }}>
            Or set a schedule
          </p>
          <span aria-hidden className="mt-4 hidden h-px w-12 bg-white/60 md:block" />
          <p
            className="mt-2 font-display tabular-nums text-[#efe7da] md:mt-4"
            style={{ ...vf(200, 100), fontSize: "clamp(2.2rem, 5vw, 5.4rem)", lineHeight: 0.95 }}
          >
            {state.clock || "07:00"}
          </p>
          <p className="mt-2 font-brand text-white/75" style={{ ...BODY, ...ON_ROOM }}>
            {state.note || "A whole day, in one scroll."}
          </p>
        </div>

        {/* ---------- the panel ---------- */}
        <div
          data-beat="panel"
          className="invisible absolute bottom-[2svh] left-1/2 -translate-x-1/2 opacity-0 md:bottom-[4svh] md:left-[6vw] md:translate-x-0"
        >
          <div className="flex items-end gap-6">
            <Panel state={state} />
            <ol className="hidden pb-4 xl:block" aria-label="Schedule">
              {DAY_STEPS.map((step) => {
                const past = state.driver === "schedule" && state.clock >= step.at;
                return (
                  <li
                    key={step.at}
                    className={`flex items-baseline gap-3 py-1.5 font-brand text-[12px] transition-opacity ${past ? "opacity-100" : "opacity-35"}`}
                  >
                    <span className="font-display tabular-nums text-[#F0765A]" style={LABEL}>
                      {step.at}
                    </span>
                    {step.label}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
