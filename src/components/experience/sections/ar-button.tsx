"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BuildState } from "../stage";

type Build = Pick<BuildState, "frame" | "slots" | "features">;
type Mode = "quicklook" | "webxr" | "download";
type ArModule = typeof import("../ar");
type ViewerModule = typeof import("../ar-viewer");

/** Real size only: AR is for checking the unit fits, so pinch-to-scale is off. */
const QUICK_LOOK_HASH = "#allowsContentScaling=0";

function quickLookAvailable() {
  const a = document.createElement("a");
  if (a.relList?.supports?.("ar")) return true;
  // relList.supports("ar") gives false negatives on some iOS versions
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

const never = () => () => {};

const isMac = () => /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints <= 1;

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Opens the visitor's own build in AR: AR Quick Look on Apple devices, WebXR
 * on Android, and a download of the model anywhere else. The file is made in
 * the page from the build (../ar.ts), never a fixed one.
 */
export function ArButton({ build, className }: { build: Build; className: string }) {
  const quickLook = useSyncExternalStore(never, quickLookAvailable, () => false);
  const [webxr, setWebxr] = useState(false);
  const mode: Mode = quickLook ? "quicklook" : webxr ? "webxr" : "download";
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Quick Look address for the current build, made ahead so a tap opens it at once. */
  const [usdz, setUsdz] = useState<{ key: string; url: string } | null>(null);
  const ar = useRef<Promise<ArModule> | null>(null);
  const viewer = useRef<ViewerModule | null>(null);
  const self = useRef<HTMLAnchorElement>(null);

  const loadAr = () => (ar.current ??= import("../ar"));
  const key = `${build.frame}-${build.slots.join(".")}-${build.features.join(".")}`;

  useEffect(() => {
    if (quickLook) return;
    let live = true;
    import("../ar-viewer").then(async (m) => {
      if (!live) return;
      if (await m.webxrSupported()) {
        // loaded now, so the tap can ask for the AR session straight away
        viewer.current = m;
        if (live) setWebxr(true);
      }
    });
    return () => {
      live = false;
    };
  }, [quickLook]);

  // Apple: make the build's USDZ shortly after it stops changing, once the build section is on screen
  // (on phones the button itself sits low in a scrolling panel, so watch the section)
  useEffect(() => {
    if (mode !== "quicklook" || usdz?.key === key) return;
    const el = self.current;
    if (!el) return;
    let timer = 0;
    let live = true;
    const make = () => {
      timer = window.setTimeout(async () => {
        try {
          const m = await loadAr();
          const blob = await m.exportBuild(build, "usdz");
          if (!live) return;
          setUsdz((old) => {
            if (old) URL.revokeObjectURL(old.url);
            return { key, url: URL.createObjectURL(blob) };
          });
        } catch {
          // made again on tap
        }
      }, 700);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        make();
      }
    });
    io.observe(el.closest("section") ?? el);
    return () => {
      live = false;
      io.disconnect();
      window.clearTimeout(timer);
    };
    // build is captured by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, key, usdz?.key]);

  const ready = mode === "quicklook" && usdz?.key === key ? usdz.url + QUICK_LOOK_HASH : undefined;

  const onClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Quick Look with the file already made: let Safari follow the link itself
    if (ready) return;
    e.preventDefault();
    if (busy) return;
    setFailed(false);

    if (mode === "webxr" && viewer.current) {
      try {
        await viewer.current.startWebXR(loadAr().then((m) => m.buildModel(build)));
        return;
      } catch {
        // no AR session after all (camera refused, ARCore missing): fall back to the file
      }
    }

    setBusy(true);
    try {
      const m = await loadAr();
      if (mode === "quicklook") {
        const blob = await m.exportBuild(build, "usdz");
        const a = document.createElement("a");
        a.rel = "ar";
        a.href = URL.createObjectURL(blob) + QUICK_LOOK_HASH;
        a.appendChild(document.createElement("img"));
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const format = isMac() ? "usdz" : "glb";
        save(await m.exportBuild(build, format), m.fileName(build, format));
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? "Preparing…" : failed ? "Try again" : mode === "download" ? "Download 3D model" : "See it in AR";

  return (
    <a ref={self} rel={mode === "quicklook" ? "ar" : undefined} href={ready ?? "#"} onClick={onClick} className={className} aria-busy={busy}>
      {/* AR Quick Look needs an image as the link's first child */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/yu-one.png" alt="" className="hidden" />
      {label}
    </a>
  );
}
