import * as THREE from "three";
import type { FeatureType } from "./stage";

export const MODEL_URL = "/models/yu-one.glb";
export const DRACO_PATH = "/draco/";

/**
 * The scissor lifts are keyed in the model as one clip that runs from the rack
 * fully up to LIFT_TRAVEL metres lower, linear in rack height
 * (scripts/build-lift.py).
 */
const LIFT_CLIP = "Lift";
export const LIFT_TRAVEL = 0.9;

/**
 * The base's three smart-feature slots, front to back across its depth, metres
 * (Base_slot_1..3 in the configurator's base). The model carries Flow in the
 * middle slot and UV Glow in the back one; other slots get a copy, moved over.
 */
const FEATURE_Z = [-0.08, 0, 0.08];
const NATIVE_SLOT: Record<FeatureType, number> = { flow: 1, uv: 2 };

export type Assembly = {
  mixer: THREE.AnimationMixer;
  actions: THREE.AnimationAction[];
  duration: number;
  liftAction: THREE.AnimationAction | null;
  shell: THREE.Group;
  plate: THREE.Group;
  panel: THREE.Group;
  /** Each feature, once per base slot. */
  features: Record<FeatureType, THREE.Group[]>;
  lift: THREE.Group;
  rack: THREE.Group;
  /** Flow's louvre, in every copy. */
  vanes: THREE.Group[];
};

/**
 * Regroup the model into the parts the story moves: everything is re-parented
 * into plain groups that sit in model space, so an offset of 0.1 is 10 cm
 * whatever units the exported hierarchy used.
 *
 * Shared by the live scene (unit.tsx) and the AR export (ar.ts), so a build
 * looks the same in both.
 */
export function assemble(model: THREE.Object3D, animations: THREE.AnimationClip[]): Assembly {
  model.updateWorldMatrix(true, true);

  const group = (name: string, y = 0) => {
    const g = new THREE.Group();
    g.name = `part:${name}`;
    g.position.y = y;
    model.add(g);
    return g;
  };
  const take = (g: THREE.Group, ...names: string[]) => {
    for (const name of names) {
      const node = model.getObjectByName(name);
      if (node) g.attach(node);
    }
    return g;
  };

  const shell = take(group("shell"), "dengkuang_stp", "Logos");
  const plate = take(group("plate"), "Extrude_2", "Inner_Base");
  const panel = take(group("panel"), "deng_zhao_stp");
  const flow = take(group("flow"), "Flow");
  const uv = take(group("uv"), "UV_Glow");
  const lift = take(group("lift"), "Lift");
  const rack = take(group("rack"), "Rack");

  // Flow's outlet vane swings about its own long axis
  const vane = new THREE.Group();
  vane.name = "part:vane";
  const blade = model.getObjectByName("FanBlade");
  if (blade) {
    flow.add(vane);
    flow.updateWorldMatrix(true, false);
    flow.worldToLocal(new THREE.Box3().setFromObject(blade).getCenter(vane.position));
    vane.attach(blade);
  }

  // one of each feature per base slot: the model's own where it sits, copies elsewhere
  const perSlot = (part: THREE.Group, native: number) =>
    FEATURE_Z.map((z, k) => {
      if (k === native) return part;
      const copy = part.clone(true);
      copy.position.z = z - FEATURE_Z[native];
      model.add(copy);
      return copy;
    });
  const features = { flow: perSlot(flow, NATIVE_SLOT.flow), uv: perSlot(uv, NATIVE_SLOT.uv) };
  const vanes = features.flow.map((g) => g.getObjectByName("part:vane") as THREE.Group).filter(Boolean);

  const mixer = new THREE.AnimationMixer(model);
  const scrubbed = (clip: THREE.AnimationClip) => {
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true; // scrubbed by hand, never played
    return action;
  };
  const liftClip = animations.find((clip) => clip.name === LIFT_CLIP);
  const moduleClips = animations.filter((clip) => clip !== liftClip);
  const actions = moduleClips.map(scrubbed);
  const duration = moduleClips.reduce((m, c) => Math.max(m, c.duration), 0);
  const liftAction = liftClip ? scrubbed(liftClip) : null;

  return { mixer, actions, duration, liftAction, shell, plate, panel, features, lift, rack, vanes };
}
