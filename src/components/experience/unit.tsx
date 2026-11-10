"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Airflow } from "./airflow";
import { Dimension } from "./dimension";
import { EXPLODE } from "./explode";
import { KitRack, kitState } from "./kit-rack";
import { Labels } from "./labels";
import { glow, HERO_FLOW_GLOW, HERO_UV_GLOW, PANEL_IDLE_GLOW, restyle } from "./materials";
import { RACK_Y, drawerY, rig, seg } from "./rig";
import type { FeatureType } from "./stage";
import { assemble, DRACO_PATH, LIFT_TRAVEL, MODEL_URL, type Assembly } from "./assembly";
import { Room } from "./room";
import { sfx } from "./sound";

useGLTF.preload(MODEL_URL, DRACO_PATH);

/** Points in the baked clip where a module seats in the frame. */
const SEATED = [54 / 120, 80 / 120, 106 / 120];

/** Parts that the configurator can take off slide away below and hide. */
function fit(part: THREE.Object3D, present: number, baseY: number) {
  part.visible = present > 0.02;
  part.position.y = baseY - (1 - present) * 0.22;
}

type Props = { onReady?: () => void };

export function Unit({ onReady }: Props) {
  const { scene, animations } = useGLTF(MODEL_URL, DRACO_PATH);

  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const offset = useRef<THREE.Group>(null);
  const uvLight = useRef<THREE.PointLight>(null);
  const sweepLight = useRef<THREE.PointLight>(null);
  const panelLight = useRef<THREE.PointLight>(null);
  /** How far each feature in each base slot is mounted, 0‥1. */
  const present = useRef<Record<FeatureType, number[]>>({ flow: [0, 1, 0], uv: [0, 0, 1] });
  const attached = useRef(0);

  // model is decoded and mounted: let the page start its entrance
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  /** Own copy of the scene (the loader's is cached and shared), restyled by material name. */
  const model = useMemo(() => restyle(scene.clone(true)), [scene]);

  // The assembly (mixer, actions, part groups) is mutated every frame, so it
  // lives in a ref and is created lazily inside the frame loop, never during render.
  const assembly = useRef<Assembly | null>(null);
  useEffect(
    () => () => {
      assembly.current?.mixer.stopAllAction();
      assembly.current = null;
    },
    [],
  );

  useFrame((_, dt) => {
    const unit = (assembly.current ??= assemble(model, animations));
    const r = rig;

    if (root.current && spin.current && offset.current) {
      root.current.position.copy(r.pos);
      root.current.scale.setScalar(r.scale);
      spin.current.rotation.copy(r.rot);
      offset.current.position.copy(r.pivot).negate();
    }

    // hero: scrub the baked clip, modules detach then click in one by one
    const kit = r.useKit && kitState.ready;
    unit.rack.visible = !kit;
    if (!kit && unit.actions.length) {
      const time = r.attach * (unit.duration - 1e-4);
      for (const action of unit.actions) action.time = time;
      if (SEATED.some((at) => attached.current < at && r.attach >= at)) sfx.click();
    }
    attached.current = r.attach;

    const e = r.explode;
    // on phones the base rises out of the way while the specimen rows are on show
    const up = r.drawerLift;
    unit.shell.position.y = EXPLODE.shell * e + up;
    unit.plate.position.y = EXPLODE.plate * e + up;
    unit.panel.position.y = EXPLODE.panel * e + up;
    unit.lift.position.y = up;

    const k = Math.min(1, dt * 5);
    for (const type of ["flow", "uv"] as const) {
      const shown = present.current[type];
      unit.features[type].forEach((part, slot) => {
        shown[slot] += ((r.features[slot] === type ? 1 : 0) - shown[slot]) * k;
        fit(part, shown[slot], EXPLODE[type] * e + up);
      });
    }

    const rackY = -r.drop + EXPLODE.rack * e;
    unit.rack.position.y = rackY;
    // the lifts open as far as the rack has come down
    if (unit.liftAction) {
      const open = THREE.MathUtils.clamp(-rackY / LIFT_TRAVEL, 0, 1);
      unit.liftAction.time = open * (unit.liftAction.getClip().duration - 1e-4);
    }
    unit.mixer.update(0);

    // the louvre sweeps the stream across the rows; the air in airflow.tsx leans with it
    for (const vane of unit.vanes) vane.rotation.x = r.swingAngle;

    // after the hero the LEDs follow what is actually running
    const w = seg(r.T, 1, 1.1);
    glow.flow().emissiveIntensity = (HERO_FLOW_GLOW * (1 - w) + (0.5 + 3 * r.fan) * w) * r.power;
    glow.uv().emissiveIntensity = (HERO_UV_GLOW * (1 - w) + (0.25 + 5 * r.uv) * w) * r.power * r.uvReady;
    glow.panel().emissiveIntensity = PANEL_IDLE_GLOW + 2.4 * r.light;
    glow.panel().emissive.copy(r.lightColor);

    // the UV light falls from wherever UV Glow is mounted
    const uvMounted = Math.max(...present.current.uv);
    if (uvLight.current) uvLight.current.intensity = 5 * r.uv * uvMounted;
    if (sweepLight.current) {
      sweepLight.current.intensity = 7 * r.uv * uvMounted;
      sweepLight.current.position.set((r.sweep * 2 - 1) * 0.7, rackY - 0.62, 0.35);
    }
    if (panelLight.current) {
      panelLight.current.intensity = 2.2 * r.light;
      panelLight.current.color.copy(r.lightColor);
    }
  });

  /** Ceiling to rail, live: counts down the full 1.3 m as the rack lowers. */
  const readDrop = useCallback(() => {
    const rail = RACK_Y - rig.drop;
    // just outside the rail: on the unit's right in the hero (the copy is on the left),
    // on its left in the control section (the panel is on the left, the HUD on the right)
    const x = rig.T <= 1.1 ? -0.68 : 0.68;
    return {
      from: [x, 0, 0] as [number, number, number],
      to: [x, rail, 0] as [number, number, number],
      opacity: rig.measure,
      value: `${(-rail).toFixed(1)} m`,
      note: "ceiling to rail",
      side: "before" as const,
    };
  }, []);

  /** The Solo pole as it comes, with how far it telescopes: drawn under the laundry, above the next specimen. */
  const readPole = useCallback(() => {
    const y = drawerY(0) - 0.3947 - 0.74;
    return {
      from: [-0.58, y, 0] as [number, number, number],
      to: [0.58, y, 0] as [number, number, number],
      opacity: rig.poleDim,
      value: "1.2 m",
      note: "extends to 1.9 m · shorter to order, from 1 m",
    };
  }, []);

  return (
    <group ref={root}>
      <group ref={spin}>
        <group ref={offset}>
          <primitive object={model} />
          <Suspense fallback={null}>
            <KitRack />
          </Suspense>
          <Airflow />
          <Labels />
          <Dimension read={readDrop} tick={[1, 0, 0]} color="#efe7da" />
          <Dimension read={readPole} tick={[0, 1, 0]} color="#222222" align="center" />
          <Room />
          <pointLight ref={uvLight} color="#7a3dff" position={[0, -0.16, 0.08]} intensity={0} distance={2.4} decay={1.6} />
          <pointLight ref={sweepLight} color="#9a6bff" intensity={0} distance={1.6} decay={1.4} />
          <pointLight ref={panelLight} color="#ffdcb4" position={[0, -0.3, 0]} intensity={0} distance={3} decay={1.5} />
        </group>
      </group>
    </group>
  );
}
