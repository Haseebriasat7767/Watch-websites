import * as THREE from "three";
import { CAMERA_HOLD, STORY_CHAPTERS } from "../story/storyConfig";
import { locate } from "../story/storyState";
import type { LightingWaypoint, Vec3, WatchWaypoint } from "../story/storyTypes";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Waypoint interpolation
 * ─────────────────────────────────────────────────────────────────────────────
 *  scroll progress → chapter progress → camera / watch / lighting pose.
 *
 *  Each chapter holds on its own pose for the first `CAMERA_HOLD` of its span
 *  (the beat during which its narrative is legible) and then travels to the
 *  next pose with an eased ramp. The result is a camera that breathes between
 *  rooms instead of tracking the scrollbar one-to-one.
 *
 *  The sampler writes into a single pre-allocated record — it runs 60×/second
 *  and must not allocate.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, lambda: number, delta: number) {
  return lerp(current, target, 1 - Math.exp(-lambda * Math.min(delta, 0.1)));
}

export type StorySample = {
  chapter: number;
  local: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  bias: [number, number];
  biasMobile: [number, number];
  watchPosition: [number, number, number];
  watchRotation: [number, number, number];
  watchScale: number;
  exhibition: number;
  spin: number;
  exposure: number;
  env: number;
  ambient: number;
  keyIntensity: number;
  rimIntensity: number;
  goldIntensity: number;
  atmosphere: number;
  halo: number;
};

export function createSample(): StorySample {
  return {
    chapter: 0,
    local: 0,
    position: [0, 0, 8],
    target: [0, 0, 0],
    fov: 34,
    bias: [0, 0],
    biasMobile: [0, 0],
    watchPosition: [0, 0, 0],
    watchRotation: [0, 0, 0],
    watchScale: 1,
    exhibition: 0,
    spin: 0,
    exposure: 1,
    env: 1,
    ambient: 0.1,
    keyIntensity: 24,
    rimIntensity: 24,
    goldIntensity: 18,
    atmosphere: 0.1,
    halo: 1,
  };
}

const DEFAULT_WATCH: Required<Pick<WatchWaypoint, "position" | "rotation" | "scale" | "exhibition" | "spin">> = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  exhibition: 0,
  spin: 0,
};

const DEFAULT_LIGHT: Required<LightingWaypoint> = {
  exposure: 0.95,
  env: 1,
  ambient: 0.12,
  keyIntensity: 28,
  rimIntensity: 26,
  goldIntensity: 20,
  atmosphere: 0.2,
  halo: 1,
};

const ZERO_BIAS: [number, number] = [0, 0];
/** Portrait default: lift the subject above the bottom-anchored narrative. */
const DEFAULT_MOBILE_BIAS: [number, number] = [0, 0.26];

/** Lighting is resolved once at module load so the sampler never allocates. */
const RESOLVED_LIGHTING: Required<LightingWaypoint>[] = STORY_CHAPTERS.map((chapter) => ({
  ...DEFAULT_LIGHT,
  ...(chapter.lighting ?? {}),
}));

function vec(source: Vec3 | undefined, fallback: Vec3): Vec3 {
  return source ?? fallback;
}

function mixVec(out: [number, number, number], a: Vec3, b: Vec3, t: number) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

/**
 * Samples the whole journey at `progress` (0 → 1) into `out`.
 * `holdScale` shortens the travel ramp for reduced-motion visitors.
 */
export function sampleStory(progress: number, out: StorySample, reducedMotion = false): StorySample {
  const { chapter, local } = locate(progress);
  const current = STORY_CHAPTERS[chapter];
  const next = STORY_CHAPTERS[Math.min(chapter + 1, STORY_CHAPTERS.length - 1)];

  // Hold on the pose while the chapter reads, then ease across to the next.
  const travel = smoothstep(CAMERA_HOLD, 1, local);
  const t = reducedMotion ? smoothstep(0.55, 1, local) : travel;

  out.chapter = chapter;
  out.local = local;

  mixVec(out.position, current.camera.position, next.camera.position, t);
  mixVec(out.target, current.camera.target, next.camera.target, t);
  out.fov = lerp(current.camera.fov ?? 34, next.camera.fov ?? 34, t);

  const biasA = current.camera.bias ?? ZERO_BIAS;
  const biasB = next.camera.bias ?? ZERO_BIAS;
  out.bias[0] = lerp(biasA[0], biasB[0], t);
  out.bias[1] = lerp(biasA[1], biasB[1], t);
  const mobileA = current.camera.biasMobile ?? DEFAULT_MOBILE_BIAS;
  const mobileB = next.camera.biasMobile ?? DEFAULT_MOBILE_BIAS;
  out.biasMobile[0] = lerp(mobileA[0], mobileB[0], t);
  out.biasMobile[1] = lerp(mobileA[1], mobileB[1], t);

  const a = current.watch;
  const b = next.watch;
  mixVec(out.watchPosition, vec(a.position, DEFAULT_WATCH.position), vec(b.position, DEFAULT_WATCH.position), t);
  mixVec(out.watchRotation, vec(a.rotation, DEFAULT_WATCH.rotation), vec(b.rotation, DEFAULT_WATCH.rotation), t);
  out.watchScale = lerp(a.scale ?? DEFAULT_WATCH.scale, b.scale ?? DEFAULT_WATCH.scale, t);
  out.exhibition = lerp(a.exhibition ?? 0, b.exhibition ?? 0, t);
  out.spin = lerp(a.spin ?? 0, b.spin ?? 0, t);

  const la = RESOLVED_LIGHTING[chapter];
  const lb = RESOLVED_LIGHTING[Math.min(chapter + 1, RESOLVED_LIGHTING.length - 1)];
  out.exposure = lerp(la.exposure, lb.exposure, t);
  out.env = lerp(la.env, lb.env, t);
  out.ambient = lerp(la.ambient, lb.ambient, t);
  out.keyIntensity = lerp(la.keyIntensity, lb.keyIntensity, t);
  out.rimIntensity = lerp(la.rimIntensity, lb.rimIntensity, t);
  out.goldIntensity = lerp(la.goldIntensity, lb.goldIntensity, t);
  out.atmosphere = lerp(la.atmosphere, lb.atmosphere, t);
  out.halo = lerp(la.halo, lb.halo, t);

  return out;
}

/**
 * The single sample for the current frame. `StoryWatchStage` writes it once per
 * frame (render priority 0) and every other scene component reads from it, so
 * the whole rig shares one interpolation pass and zero allocations.
 */
export const activeSample = createSample();
// Seeded with the opening chapter so the very first frame — camera pose, light
// levels, exposure — is already the composition the visitor should see.
sampleStory(0, activeSample);

/**
 * Trucks the camera so the subject lands where the composition wants it.
 * Camera and target move together, so the viewing angle — and therefore the
 * modelling of the light on the case — is untouched.
 *
 * Mutates `position` and `target` in place.
 */
export function applyFraming(
  position: THREE.Vector3,
  target: THREE.Vector3,
  sample: StorySample,
  aspect: number,
) {
  // Portrait viewports blend toward the mobile bias.
  const portrait = smoothstep(1, 0.72, aspect);
  const bx = lerp(sample.bias[0], sample.biasMobile[0], portrait);
  const by = lerp(sample.bias[1], sample.biasMobile[1], portrait);
  if (bx === 0 && by === 0) return;

  FORWARD.copy(target).sub(position);
  const distance = FORWARD.length() || 1;
  FORWARD.divideScalar(distance);
  RIGHT.crossVectors(FORWARD, WORLD_UP).normalize();
  UP.crossVectors(RIGHT, FORWARD).normalize();

  const halfHeight = distance * Math.tan(((sample.fov * Math.PI) / 180) / 2);
  const halfWidth = halfHeight * aspect;

  SHIFT.copy(RIGHT).multiplyScalar(-bx * halfWidth).addScaledVector(UP, -by * halfHeight);
  position.add(SHIFT);
  target.add(SHIFT);
}

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const UP = new THREE.Vector3();
const SHIFT = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
