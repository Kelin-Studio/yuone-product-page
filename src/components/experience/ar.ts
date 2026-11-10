/**
 * "See it in AR": the visitor's own build as a 3D file.
 *
 * The model is assembled from the same two files and the same rules as the
 * live scene (assembly.ts, kit-rack.tsx), at rest: rack up at the ceiling,
 * modules clicked in, Flex folded, no laundry. It does not read the live
 * scene, so it also works on machines that show stills.
 *
 *   iPhone / iPad / Vision Pro   USDZ, opened in AR Quick Look
 *   Android                      the same model, placed with WebXR (ar-viewer.ts)
 *   everything else              a download: USDZ on a Mac, GLB elsewhere
 *
 * Loaded on demand from the build section, so none of this weighs on the page.
 */
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { assemble, DRACO_PATH, MODEL_URL } from "./assembly";
import { KIT_URL, posedKit } from "./kit-rack";
import { glow, restyle } from "./materials";
import { encodeBuild, sanitizeBuild, type BuildState } from "./stage";

type Build = Pick<BuildState, "frame" | "slots" | "features">;

let loader: GLTFLoader | null = null;
const files = new Map<string, Promise<GLTF>>();

function load(url: string) {
  if (!loader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
  }
  let file = files.get(url);
  if (!file) {
    file = loader.loadAsync(url);
    file.catch(() => files.delete(url));
    files.set(url, file);
  }
  return file;
}

/**
 * The finishes as a 3D file can carry them. USD has no emissive strength and
 * three's exporter writes the emissive colour at full, so glow is set here
 * once: Flow's and UV Glow's LEDs lit as they are on the page, the light ring
 * off (white acrylic).
 */
function forExport(src: THREE.Material, cache: Map<THREE.Material, THREE.Material>) {
  let mat = cache.get(src);
  if (mat) return mat;
  const std = src as THREE.MeshStandardMaterial;
  if (std.isMeshStandardMaterial) {
    const copy = std.clone();
    // the live scene dims these per frame, so go by which material it is, not its current glow
    copy.emissiveIntensity = 1;
    if (src !== glow.flow() && src !== glow.uv()) copy.emissive.setRGB(0, 0, 0);
    copy.side = THREE.FrontSide;
    mat = copy;
  } else {
    mat = src;
  }
  cache.set(src, mat);
  return mat;
}

/** The build as one object in metres, Y up, standing on y = 0 and centred over the origin. */
export async function buildModel(input: Build) {
  const b = sanitizeBuild(input);
  const [hero, kit] = await Promise.all([load(MODEL_URL), load(KIT_URL)]);

  const model = restyle(hero.scene.clone(true));
  const unit = assemble(model, hero.animations);
  // the kit's frame replaces the hero's baked rack, as on the page after the hero
  unit.rack.visible = false;
  (["flow", "uv"] as const).forEach((type) =>
    unit.features[type].forEach((part, slot) => {
      part.visible = b.features[slot] === type;
    }),
  );
  // rack all the way up: the lifts closed
  if (unit.liftAction) unit.liftAction.time = 0;
  unit.mixer.update(0);

  const build = new THREE.Group();
  build.name = `YU ONE ${encodeBuild({ ...b, space: false, roomWidth: 0 })}`;
  build.add(model, posedKit(kit.scene, b.frame, b.slots));
  build.updateMatrixWorld(true);

  // drop everything hidden, so the file holds only what is shown
  const hidden: THREE.Object3D[] = [];
  build.traverse((o) => {
    if (!o.visible) hidden.push(o);
  });
  hidden.forEach((o) => o.removeFromParent());

  const cache = new Map<THREE.Material, THREE.Material>();
  const box = new THREE.Box3();
  build.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => forExport(m, cache)) : forExport(mesh.material, cache);
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
  });

  // stand it on the floor, centred, inside a wrapper so every part keeps its own transform
  const centre = box.getCenter(new THREE.Vector3());
  build.position.set(-centre.x, -box.min.y, -centre.z);
  const root = new THREE.Group();
  root.name = "YU_ONE";
  root.add(build);
  root.updateMatrixWorld(true);
  return root;
}

const made = new Map<string, Promise<Blob>>();

/** The build as a file, cached per build and format. */
export function exportBuild(input: Build, format: "usdz" | "glb") {
  const b = sanitizeBuild(input);
  const key = `${format}:${encodeBuild({ ...b, space: false, roomWidth: 0 })}`;
  let blob = made.get(key);
  if (!blob) {
    blob = (async () => {
      const root = await buildModel(b);
      if (format === "usdz") {
        const data = await new USDZExporter().parseAsync(root, {
          quickLookCompatible: true,
          ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "horizontal" } },
        });
        return new Blob([data], { type: "model/vnd.usdz+zip" });
      }
      const data = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })) as ArrayBuffer;
      return new Blob([data], { type: "model/gltf-binary" });
    })();
    blob.catch(() => made.delete(key));
    made.set(key, blob);
  }
  return blob;
}

/** File name for a download of this build, e.g. yu-one-max-sdf-0fu.glb */
export const fileName = (input: Build, format: "usdz" | "glb") =>
  `yu-one-${encodeBuild({ ...sanitizeBuild(input), space: false, roomWidth: 0 })}.${format}`;
