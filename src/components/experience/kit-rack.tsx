"use client";

import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { restyle } from "./materials";
import { drawerY, rig } from "./rig";
import { EXPLODE } from "./explode";
import { sfx } from "./sound";
import type { FrameType, ModuleType } from "./stage";

export const KIT_URL = "/models/yu-one-kit.glb";
const DRACO_PATH = "/draco/";

/** Lets the hero model know when the kit can take over the rack. */
export const kitState = { ready: false };

/** Model-space facts, metres. x runs along the poles, y is up, z is depth. */
const SLOT = 0.15;
const POLE_Y = -0.3947;
const ARM_PIVOT_Z = -0.029;
const ARM_REACH = 0.06;
const BARS_3_LENGTH = 0.515;
const MAX_SLOTS = 4;
const TYPES: ModuleType[] = ["solo", "duo", "flex"];
const NODE: Record<ModuleType, string> = { solo: "Kit_Solo", duo: "Kit_Duo", flex: "Kit_Flex" };

const GARMENT = {
  shirt: { url: "/garments/shirt.webp", aspect: 0.6476, draped: false },
  tee: { url: "/garments/tee.webp", aspect: 0.7134, draped: false },
  sweater: { url: "/garments/sweater.webp", aspect: 0.666, draped: false },
  trousers: { url: "/garments/trousers.webp", aspect: 0.4069, draped: false },
  towel: { url: "/garments/towel.webp", aspect: 0.5123, draped: true },
  sheet: { url: "/garments/sheet.webp", aspect: 1.3511, draped: true },
} as const;
type GarmentName = keyof typeof GARMENT;

/** `pole` is the depth of the pole the item hangs on, or "arm" for Flex's swing-out pole. */
type Hang = { item: GarmentName; x: number; w: number; pole: number | "arm" };

const LOAD: Record<ModuleType, Hang[]> = {
  solo: [
    { item: "shirt", x: -0.36, w: 0.4, pole: 0 },
    { item: "trousers", x: -0.03, w: 0.23, pole: 0 },
    { item: "tee", x: 0.29, w: 0.4, pole: 0 },
  ],
  duo: [
    { item: "sweater", x: -0.33, w: 0.42, pole: -0.03 },
    { item: "towel", x: 0.12, w: 0.3, pole: -0.03 },
    { item: "tee", x: -0.08, w: 0.38, pole: 0.03 },
    { item: "trousers", x: 0.38, w: 0.23, pole: 0.03 },
  ],
  flex: [
    { item: "towel", x: -0.34, w: 0.3, pole: -0.03 },
    { item: "shirt", x: 0.16, w: 0.4, pole: -0.03 },
    { item: "sheet", x: 0, w: 1.04, pole: "arm" },
  ],
};

const easeOutBack = (t: number) => {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
const smooth = (u: number) => u * u * (3 - 2 * u);

type GarmentUniforms = {
  uTime: { value: number };
  uSeed: { value: number };
  uWind: { value: number };
  uDamp: { value: number };
  uGlow: { value: number };
};

/** Lit cloth: ripples from the hem up, darkens when damp, fluoresces under UV. */
function garmentMaterial(map: THREE.Texture, seed: number) {
  const uniforms: GarmentUniforms = {
    uTime: { value: 0 },
    uSeed: { value: seed },
    uWind: { value: 0 },
    uDamp: { value: 0 },
    uGlow: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({
    map,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
    alphaTest: 0.5,
    alphaToCoverage: true,
    envMapIntensity: 0.6,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uSeed;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float hem = 1.0 - uv.y;
        float wave = sin(uTime * 1.7 + uSeed + position.x * 5.0) * 0.6 + sin(uTime * 2.9 + uSeed * 1.7 + hem * 6.0) * 0.4;
        transformed.z += wave * hem * hem * (0.01 + 0.03 * min(uWind, 1.6));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uDamp;\nuniform float uGlow;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.58, 0.7), uDamp);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float fabric = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        totalEmissiveRadiance += vec3(0.26, 0.15, 1.0) * fabric * fabric * uGlow;`,
      );
  };
  mat.customProgramCacheKey = () => "yu-garment";
  return { mat, uniforms };
}

type Garment = { mesh: THREE.Mesh; uniforms: GarmentUniforms; hang: Hang; h: number; seed: number };

type Slot = {
  group: THREE.Group;
  /** Moves with the click-in animation; holds the module meshes. */
  seat: THREE.Group;
  modules: Record<ModuleType, THREE.Object3D>;
  arm: THREE.Object3D | null;
  garments: Record<ModuleType, Garment[]>;
  shown: ModuleType | null;
  /** 0 = out, 1 = clicked in. */
  v: number;
  seated: boolean;
};

type Kit = {
  bars: THREE.Object3D;
  /** End poles: fixed on Plus, swing-out on Max; Core has none. */
  ends: Record<Exclude<FrameType, "core">, { a: THREE.Object3D; b: THREE.Object3D; v: number }>;
  slots: Slot[];
  n: number;
  started: boolean;
};

function buildKit(root: THREE.Group, scene: THREE.Object3D, textures: Record<GarmentName, THREE.Texture>): Kit {
  const source = restyle(scene.clone(true));
  const pick = (name: string) => {
    const node = source.getObjectByName(name);
    if (!node) throw new Error(`parts kit is missing ${name}`);
    return node;
  };

  const bars = pick("Kit_Bars_3");
  root.add(bars);
  const ends = {
    plus: { a: pick("Kit_EndsDuo_A"), b: pick("Kit_EndsDuo_B"), v: 0 },
    max: { a: pick("Kit_EndsFlex_A"), b: pick("Kit_EndsFlex_B"), v: 1 },
  };
  root.add(ends.plus.a, ends.plus.b, ends.max.a, ends.max.b);

  for (const tex of Object.values(textures)) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  }

  const plane = new THREE.PlaneGeometry(1, 1, 10, 14);
  plane.translate(0, -0.5, 0); // hangs from its top edge

  const slots: Slot[] = [];
  for (let k = 0; k < MAX_SLOTS; k++) {
    const group = new THREE.Group();
    const seat = new THREE.Group();
    group.add(seat);
    root.add(group);

    const modules = {} as Slot["modules"];
    const garments = {} as Slot["garments"];
    let arm: THREE.Object3D | null = null;
    for (const type of TYPES) {
      const part = pick(NODE[type]).clone(true);
      part.visible = false;
      seat.add(part);
      modules[type] = part;
      if (type === "flex") arm = part.getObjectByName("Kit_Flex_Arm") ?? null;

      garments[type] = LOAD[type].map((hang, i) => {
        const seed = k * 7.3 + i * 2.1 + type.length;
        const info = GARMENT[hang.item];
        const { mat, uniforms } = garmentMaterial(textures[hang.item], seed);
        const mesh = new THREE.Mesh(plane, mat);
        // the fourth slot repeats a module type: mirror its load so it does not read as a copy
        const x = k === 3 ? -hang.x : hang.x;
        mesh.position.set(x, POLE_Y + 0.018, typeof hang.pole === "number" ? hang.pole : 0);
        mesh.visible = false;
        mesh.renderOrder = 2;
        seat.add(mesh);
        return { mesh, uniforms, hang, h: hang.w / info.aspect, seed };
      });
    }
    slots.push({ group, seat, modules, arm, garments, shown: null, v: 0, seated: false });
  }
  return { bars, ends, slots, n: 3, started: false };
}

/**
 * The frame and its modules for one build, at rest: clicked in, Flex folded,
 * no laundry. The same layout KitRack eases towards, for the AR export.
 */
export function posedKit(scene: THREE.Object3D, frame: FrameType, slots: ModuleType[]) {
  const source = restyle(scene.clone(true));
  const pick = (name: string) => {
    const node = source.getObjectByName(name);
    if (!node) throw new Error(`parts kit is missing ${name}`);
    return node.clone(true);
  };
  const root = new THREE.Group();
  root.name = "part:frame";
  const n = slots.length;

  const bars = pick("Kit_Bars_3");
  bars.scale.z = (SLOT * n + 0.065) / BARS_3_LENGTH;
  root.add(bars);

  const shift = (n - 3) * (SLOT / 2);
  if (frame !== "core") {
    const ends = frame === "plus" ? ["Kit_EndsDuo_A", "Kit_EndsDuo_B"] : ["Kit_EndsFlex_A", "Kit_EndsFlex_B"];
    const a = pick(ends[0]);
    const b = pick(ends[1]);
    a.position.z = -shift;
    b.position.z = shift;
    root.add(a, b);
  }

  slots.forEach((type, k) => {
    const part = pick(NODE[type]);
    const arm = part.getObjectByName("Kit_Flex_Arm");
    if (arm) arm.rotation.x = 0;
    const slot = new THREE.Group();
    slot.position.z = ((n - 1) / 2 - k) * SLOT;
    slot.add(part);
    root.add(slot);
  });
  return root;
}

const GARMENT_URLS = Object.fromEntries(Object.entries(GARMENT).map(([k, v]) => [k, v.url])) as Record<GarmentName, string>;

/**
 * The rack after the hero, assembled from the parts kit: any frame width, any
 * module in any slot. Modules drop away and click in whenever a slot changes.
 */
export function KitRack() {
  const { scene } = useGLTF(KIT_URL, DRACO_PATH);
  const textures = useTexture(GARMENT_URLS);
  const root = useRef<THREE.Group>(null);
  const kitRef = useRef<Kit | null>(null);

  useEffect(() => {
    kitState.ready = true;
    return () => {
      kitState.ready = false;
      kitRef.current = null;
    };
  }, []);

  useFrame((state, dt) => {
    if (!root.current) return;
    const kit = (kitRef.current ??= buildKit(root.current, scene, textures));
    const r = rig;
    const t = state.clock.elapsedTime;

    root.current.visible = r.useKit;
    if (!r.useKit) {
      kit.started = false;
      return;
    }

    const e = r.explode;
    // the frame rises with the base on phones; the rows below stay put
    root.current.position.y = -r.drop + EXPLODE.rack * e + r.drawerLift;

    // frame width eases, so the bars lengthen and the modules slide along them
    const first = !kit.started;
    kit.started = true;
    kit.n = first ? r.count : kit.n + (r.count - kit.n) * Math.min(1, dt * 5);
    kit.bars.scale.z = (SLOT * kit.n + 0.065) / BARS_3_LENGTH;
    const shift = (kit.n - 3) * (SLOT / 2);

    for (const kind of ["plus", "max"] as const) {
      const end = kit.ends[kind];
      const goal = r.frame === kind ? 1 : 0;
      end.v = first ? goal : end.v + (goal - end.v) * Math.min(1, dt * 6);
      const away = (1 - end.v) * 0.18;
      end.a.visible = end.b.visible = end.v > 0.02;
      end.a.position.z = -shift - away;
      end.b.position.z = shift + away;
    }

    const d = smooth(r.drawer);
    kit.slots.forEach((slot, k) => {
      const want = k < r.count ? r.slots[k] ?? null : null;
      if (first) {
        slot.shown = want;
        slot.v = want ? 1 : 0;
        slot.seated = true;
      } else if (slot.shown !== want) {
        // unclip and drop away, then the new module takes the slot
        slot.v -= dt * 4.5;
        slot.seated = false;
        if (slot.v <= 0) {
          slot.v = 0;
          slot.shown = want;
        }
      } else if (slot.v < 1) {
        slot.v = Math.min(1, slot.v + dt * 2.4);
        if (!slot.seated && slot.v > 0.8) {
          slot.seated = true;
          sfx.click();
        }
      }

      const present = slot.shown !== null && slot.v > 0.001;
      slot.group.visible = present;
      if (!present) return;
      for (const type of TYPES) slot.modules[type].visible = slot.shown === type;

      // in the frame, or laid out below it as a specimen
      const z = ((kit.n - 1) / 2 - k) * SLOT * (1 + 0.5 * e);
      const inDrawer = k < 3 ? d : 0;
      slot.group.position.set(0, (drawerY(k) - r.drawerLift) * inDrawer + EXPLODE.modules * e, z * (1 - inDrawer));
      slot.seat.position.y = -(1 - easeOutBack(slot.v)) * 0.2;

      // Flex: the second pole swings out underneath to double the spacing
      const swing = slot.shown === "flex" ? r.swing * Math.PI : 0;
      if (slot.arm) slot.arm.rotation.x = swing;

      const amount = r.garments[k] * (slot.v > 0.95 ? 1 : 0);
      for (const type of TYPES) {
        for (const g of slot.garments[type]) {
          const on = slot.shown === type && amount > 0.002;
          g.mesh.visible = on;
          if (!on) continue;
          // unrolls from the pole down
          g.mesh.scale.set(g.hang.w, g.h * smooth(amount), 1);
          if (g.hang.pole === "arm") {
            g.mesh.position.z = ARM_PIVOT_Z + ARM_REACH * Math.cos(swing);
            g.mesh.position.y = POLE_Y + 0.018 - ARM_REACH * Math.sin(swing);
          }
          const wind = r.air * r.gust;
          g.mesh.rotation.x = r.reducedMotion ? 0 : Math.sin(t * 1.1 + g.seed) * (0.012 + 0.025 * Math.min(wind, 1.6));
          g.uniforms.uTime.value = r.reducedMotion ? 0 : t;
          g.uniforms.uWind.value = wind;
          g.uniforms.uDamp.value = r.damp;
          g.uniforms.uGlow.value = r.uv * 0.9;
        }
      }
    });
  });

  return <group ref={root} visible={false} />;
}
