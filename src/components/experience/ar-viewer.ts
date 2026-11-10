/**
 * AR on Android: the build placed in the room with WebXR, at real size.
 *
 * AR Quick Look (iPhone) and Scene Viewer (Android) both open a file, but
 * Scene Viewer only takes a public address, never a file made in the page, so
 * on Android the page shows the build itself: find the floor, tap to place,
 * tap again to move it.
 *
 * The session has to be asked for inside the tap, so it starts first and the
 * model arrives while the camera is already up.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type XRNav = Navigator & { xr?: XRSystem };

export async function webxrSupported() {
  const xr = (navigator as XRNav).xr;
  if (!xr) return false;
  try {
    return await xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

const OVERLAY_CSS = `
position:fixed;inset:0;z-index:2147483647;pointer-events:none;
font:500 14px/1.4 system-ui,sans-serif;color:#fff;
`;

/** Start AR now (call from the tap), then show `model` once it resolves. */
export async function startWebXR(model: Promise<THREE.Object3D>) {
  const xr = (navigator as XRNav).xr!;

  const overlay = document.createElement("div");
  overlay.style.cssText = OVERLAY_CSS;
  const hint = document.createElement("p");
  hint.style.cssText =
    "position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom) + 32px);transform:translateX(-50%);margin:0;padding:10px 16px;border-radius:999px;background:rgba(0,0,0,.55);white-space:nowrap";
  hint.textContent = "Preparing your YU ONE…";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.style.cssText =
    "position:absolute;right:16px;top:calc(env(safe-area-inset-top) + 16px);pointer-events:auto;padding:8px 16px;border:0;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:inherit";
  overlay.append(hint, close);
  document.body.appendChild(overlay);

  let session: XRSession;
  try {
    session = await xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: overlay },
    });
  } catch (err) {
    overlay.remove();
    throw err;
  }
  close.onclick = () => session.end();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 3, 2);
  scene.add(sun);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.15, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const holder = new THREE.Group();
  holder.visible = false;
  scene.add(holder);
  let ready = false;

  model
    .then((m) => {
      holder.add(m);
      ready = true;
      hint.textContent = "Point at the floor, then tap to place";
    })
    .catch(() => {
      hint.textContent = "Sorry, the model could not load";
    });

  await renderer.xr.setSession(session);
  const viewer = await session.requestReferenceSpace("viewer");
  const hitSource = await session.requestHitTestSource?.({ space: viewer });
  if (!hitSource) {
    await session.end();
    pmrem.dispose();
    renderer.dispose();
    overlay.remove();
    throw new Error("no hit testing");
  }

  const at = new THREE.Vector3();
  const facing = new THREE.Vector3();
  session.addEventListener("select", () => {
    if (!ready || !reticle.visible) return;
    at.setFromMatrixPosition(reticle.matrix);
    holder.position.copy(at);
    // turn the front of the unit towards the visitor
    facing.setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
    holder.rotation.set(0, Math.atan2(facing.x - at.x, facing.z - at.z), 0);
    holder.visible = true;
    hint.textContent = "Tap again to move it";
  });

  renderer.setAnimationLoop((_, frame) => {
    if (frame) {
      const space = renderer.xr.getReferenceSpace();
      const hit = space && frame.getHitTestResults(hitSource)[0];
      const pose = hit && hit.getPose(space);
      reticle.visible = !!pose;
      if (pose) reticle.matrix.fromArray(pose.transform.matrix);
    }
    renderer.render(scene, renderer.xr.getCamera());
  });

  session.addEventListener("end", () => {
    renderer.setAnimationLoop(null);
    hitSource.cancel();
    pmrem.dispose();
    renderer.dispose();
    overlay.remove();
  });
}
