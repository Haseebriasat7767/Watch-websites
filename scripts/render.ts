/**
 * Headless studio preview renderer.
 *
 *   npm run render:preview
 *
 * No browser is required: this is a small software rasterizer (z-buffered,
 * backface-flagged, with the same three-point light rig and a summed-area-free
 * sphere shadow test) that walks the *exact* geometry graph the R3F component
 * assembles. It is used to verify composition, occlusion, framing and the UV
 * seating of the dial/bezel map on every change, and to emit the reference
 * stills shipped in `preview/`.
 *
 * Output: preview/desktop.ppm, preview/mobile.ppm (+ .png via ImageMagick if
 * available). Shading is a stylised studio model, not a PBR match — it exists
 * to catch layout and mapping regressions, not to look like the final frame.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import {
  annulusGeometry,
  buildBraceletLayout,
  buildCaseBackRing,
  buildCaseGeometry,
  buildCrownGeometry,
  buildCrystalGeometry,
  buildHands,
  buildIndices,
  buildLugGeometry,
  buildRehautGeometry,
  buildReserveNeedle,
  buildRotorGeometry,
  HERO_TIME,
  LINK_GEOMETRY,
  LUG_X,
} from "../src/three/geometry";
import { WORLD_HALF } from "../src/lib/dialTexture";
import { CASINGS, FACES, SCENE } from "../src/lib/config";
import { FLOOR_DROP } from "../src/three/useStageScale";

/* ── scene description ────────────────────────────────────────────────────── */
type Surface = "metal" | "face" | "glass" | "lume" | "movement" | "floor";

type Part = {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  surface: Surface;
  /** Bounding sphere in world space — used for the shadow test. */
  centre: THREE.Vector3;
  radius: number;
  shadowCaster: boolean;
};

const HIGHLIGHT_BACKFACES = process.env.DEBUG_BACKFACES === "1";

const CASE_MAT = new THREE.Color(CASINGS[0].color);
const FACE_MAT = new THREE.Color(FACES[0].color);
const GLASS_MAT = new THREE.Color("#ffffff");
const LUME_MAT = new THREE.Color("#f4ead0");
const MOVEMENT_MAT = new THREE.Color("#14141a");
const FLOOR_MAT = new THREE.Color("#1b1b21");

const TILT = -0.36;
const ROOT_TILT = new THREE.Matrix4().makeRotationX(TILT);

function surfaceColor(surface: Surface) {
  switch (surface) {
    case "metal":
      return CASE_MAT;
    case "face":
      return FACE_MAT;
    case "glass":
      return GLASS_MAT;
    case "lume":
      return LUME_MAT;
    case "movement":
      return MOVEMENT_MAT;
    default:
      return FLOOR_MAT;
  }
}

/** Mirrors the canvas atelier: fumé falloff, minute track, bezel scale, date. */
function sampleFace(u: number, v: number) {
  const x = (u - 0.5) * 2 * WORLD_HALF;
  const y = (v - 0.5) * 2 * WORLD_HALF;
  const r = Math.hypot(x, y);

  if (r > 1.2) return { tone: 0.12, albedoScale: 1 };

  if (r > 0.95) {
    // bezel insert: printed 0–60 scale
    const angle = Math.atan2(y, x);
    const minutes = ((((angle / (Math.PI * 2)) * 60 + 15) % 60) + 60) % 60;
    const nearTick = Math.abs(minutes - Math.round(minutes / 5) * 5) < 0.32;
    const tickZone = r > 1.03 && r < 1.11;
    return { tone: 0.42 + (nearTick && tickZone ? 0.55 : 0), albedoScale: 1 };
  }

  // dial field: fumé gradient, brighter toward the upper centre
  const fumé = 0.58 + 0.42 * Math.exp(-(((r - 0.12) / 0.72) ** 2));
  let tone = fumé;

  // date aperture at 3 o'clock
  if (x > 0.42 && x < 0.58 && Math.abs(y) < 0.095) tone = 0.16;

  // printed minute track: 300 divisions, longer every fifth
  if (r > 0.763 && r < 0.815) {
    const angle = Math.atan2(y, x);
    const index = Math.round(
      (((angle + Math.PI / 2) / (Math.PI * 2)) * 300 + 300) % 300,
    );
    const major = index % 25 === 0;
    const mid = index % 5 === 0;
    const len = major ? 0.052 : mid ? 0.03 : 0.014;
    if (r > 0.815 - len) tone = major ? 0.18 : mid ? 0.32 : 0.62;
  }
  return { tone, albedoScale: 1 };
}

/** Story-driven placement of the timepiece inside the exhibition space. */
export type WatchPose = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  /** 0 → sealed case · 1 → exhibition back withdrawn. */
  exhibition?: number;
};

export function buildScene(
  stageScale: number,
  pose: WatchPose = {},
  includeFloor = true,
): Part[] {
  const parts: Part[] = [];
  const [px, py, pz] = pose.position ?? [0, 0, 0];
  const [rx, ry, rz] = pose.rotation ?? [0, 0, 0];
  const poseScale = (pose.scale ?? 1) * stageScale;
  const open = pose.exhibition ?? 0;
  const root = new THREE.Matrix4()
    .makeTranslation(px, py, pz)
    .multiply(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")),
    )
    .multiply(new THREE.Matrix4().makeScale(poseScale, poseScale, poseScale))
    .multiply(ROOT_TILT);

  const add = (
    geometry: THREE.BufferGeometry,
    surface: Surface,
    local: THREE.Matrix4 = new THREE.Matrix4(),
    shadowCaster = true,
  ) => {
    const matrix = new THREE.Matrix4().multiplyMatrices(root, local);
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere!.clone().applyMatrix4(matrix);
    parts.push({
      geometry,
      matrix,
      surface,
      centre: sphere.center,
      radius: sphere.radius,
      shadowCaster,
    });
  };

  const at = (x: number, y: number, z: number, rz = 0) =>
    new THREE.Matrix4().makeRotationZ(rz).setPosition(x, y, z);

  // dial + bezel insert + rehaut + case + crystal
  add(new THREE.CircleGeometry(0.9, 96), "face", at(0, 0, 0), false);
  const reserve = annulusGeometry({
    inner: 0.168,
    outer: 0.2,
    segments: 72,
    dome: 0.004,
    wall: 0.02,
  });
  reserve.translate(0, -0.44, 0.016);
  add(reserve, "face", at(0, 0, 0), false);
  add(buildRehautGeometry(), "metal", at(0, 0, 0), false);
  add(buildCaseGeometry(), "metal", at(0, 0, 0));
  add(
    annulusGeometry({ inner: 0.95, outer: 1.12, dome: 0.018, wall: 0.06 }),
    "face",
    at(0, 0, 0.222),
    false,
  );
  add(buildCrystalGeometry(), "glass", at(0, 0, 0), false);

  // indices + hands
  const indices = buildIndices();
  add(indices.frame, "metal", at(0, 0, 0), false);
  add(indices.lume, "lume", at(0, 0, 0), false);
  const hands = buildHands();
  add(hands.hour, "metal", at(0, 0, 0, HERO_TIME.hour));
  add(hands.hourLume, "lume", at(0, 0, 0, HERO_TIME.hour), false);
  add(hands.minute, "metal", at(0, 0, 0, HERO_TIME.minute));
  add(hands.minuteLume, "lume", at(0, 0, 0, HERO_TIME.minute), false);
  add(hands.second, "metal", at(0, 0, 0, HERO_TIME.second), false);
  add(
    new THREE.CylinderGeometry(0.035, 0.042, 0.07, 24),
    "metal",
    at(0, 0, 0.13, Math.PI / 2),
  );
  add(buildReserveNeedle(), "metal", at(0, -0.44, 0.03, -0.28), false);

  // crown, guards, lugs, case back
  add(buildCrownGeometry(), "metal");
  const guard = new THREE.BoxGeometry(0.13, 0.3, 0.3);
  add(guard, "metal", at(1.13, 0.32, -0.06));
  add(guard, "metal", at(1.13, -0.32, -0.06));
  const lugTop = buildLugGeometry(1);
  const lugBottom = buildLugGeometry(-1);
  for (const x of [LUG_X, -LUG_X]) {
    add(lugTop, "metal", at(x, 0, 0));
    add(lugBottom, "metal", at(x, 0, 0));
  }
  add(buildCaseBackRing(), "metal", at(0, 0, -0.95 * open));
  add(
    new THREE.CylinderGeometry(0.5, 0.5, 0.02, 48),
    "glass",
    at(0, 0, -0.25 - 0.95 * open, Math.PI / 2),
  );
  add(buildRotorGeometry(), "movement", at(0, 0, -0.181, 0.7));

  // bracelet (instanced in the live scene, expanded here)
  const links = buildBraceletLayout();
  const centreLink = LINK_GEOMETRY.center();
  const sideLink = LINK_GEOMETRY.side();
  for (const link of links.center) {
    add(
      centreLink,
      "metal",
      new THREE.Matrix4().compose(
        link.position,
        link.quaternion,
        new THREE.Vector3(1, link.height, 1),
      ),
    );
    for (const sign of [1, -1]) {
      const position = new THREE.Vector3(sign * 0.44, 0, 0)
        .applyQuaternion(link.quaternion)
        .add(link.position);
      add(
        sideLink,
        "metal",
        new THREE.Matrix4().compose(
          position,
          link.quaternion,
          new THREE.Vector3(1, link.height, 1),
        ),
      );
    }
  }

  if (!includeFloor) return parts;

  // studio floor — sibling of the stage group, dissolved edge
  // Segmented disc: a 64-triangle fan would span the camera plane and be
  // rejected wholesale by the near-plane test above.
  const floor = new THREE.RingGeometry(0.001, 13, 96, 24);
  const floorMatrix = new THREE.Matrix4()
    .makeRotationX(-Math.PI / 2)
    .premultiply(
      new THREE.Matrix4().makeTranslation(0, -FLOOR_DROP * stageScale, 0),
    );
  floor.computeBoundingSphere();
  parts.push({
    geometry: floor,
    matrix: floorMatrix,
    surface: "floor",
    centre: new THREE.Vector3(0, -FLOOR_DROP * stageScale, 0),
    radius: 13,
    shadowCaster: false,
  });

  return parts;
}

/* ── rasterizer ───────────────────────────────────────────────────────────── */
type LightRig = {
  key: { position: THREE.Vector3; color: THREE.Color; intensity: number };
  rimA: { position: THREE.Vector3; color: THREE.Color; intensity: number };
  rimB: { position: THREE.Vector3; color: THREE.Color; intensity: number };
  ambient: THREE.Color;
};

function lightRig(stageScale: number): LightRig {
  const s = stageScale;
  return {
    key: {
      position: new THREE.Vector3(0.9, 3.5, 2.4).multiplyScalar(1),
      color: new THREE.Color("#fff6e6"),
      intensity: 52 / s ** 0,
    },
    rimA: {
      position: new THREE.Vector3(-3.6, 1.4, -2.1),
      color: new THREE.Color("#7f9dff"),
      intensity: 26,
    },
    rimB: {
      position: new THREE.Vector3(3.4, 0.6, -1.4),
      color: new THREE.Color("#ffb46b"),
      intensity: 22,
    },
    ambient: new THREE.Color("#c9d2e8"),
  };
}

export function render({
  width,
  height,
  stageScale,
  label,
  pose,
  view,
  floor = true,
}: {
  width: number;
  height: number;
  stageScale: number;
  label: string;
  pose?: WatchPose;
  view?: {
    position: [number, number, number];
    target: [number, number, number];
    fov?: number;
  };
  floor?: boolean;
}) {
  const parts = buildScene(stageScale, pose, floor);
  const rig = lightRig(1);
  const camera = new THREE.PerspectiveCamera(
    view?.fov ?? SCENE.camera.fov,
    width / height,
    0.05,
    SCENE.camera.far,
  );
  camera.position.set(...(view?.position ?? SCENE.camera.position));
  camera.lookAt(...(view?.target ?? ([0, 0, 0] as [number, number, number])));
  camera.updateMatrixWorld();

  const colour = new Float32Array(width * height * 3);
  const depth = new Float32Array(width * height).fill(Infinity);
  const owner = new Int16Array(width * height).fill(-1);
  const normalBuffer = new Float32Array(width * height * 3);

  // background: the page's CSS gradient, so the render reads like the real page
  for (let y = 0; y < height; y++) {
    const t = y / height;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const vignette = 1 - 0.55 * Math.hypot(x / width - 0.5, y / height - 0.5);
      colour[i] = 0.02 * vignette + 0.012;
      colour[i + 1] = 0.021 * vignette + 0.013;
      colour[i + 2] = 0.04 * vignette + 0.028 * (1 - t);
    }
  }

  const viewProjection = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  // Perspective-correct projection. `clipped` flags triangles that cross the
  // near plane — projecting those without clipping produces the classic
  // wrap-around streaks, so they are dropped instead.
  const projected = new THREE.Vector4();
  const toScreen = (vertex: THREE.Vector3) => {
    projected.set(vertex.x, vertex.y, vertex.z, 1).applyMatrix4(viewProjection);
    const w = projected.w;
    return {
      x: ((projected.x / w + 1) / 2) * width,
      y: ((1 - projected.y / w) / 2) * height,
      z: projected.z / w,
      clipped: w <= 0.05,
    };
  };

  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const normalMatrix = new THREE.Matrix3();
  const normals = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  parts.forEach((part, partIndex) => {
    const geometry = part.geometry;
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    normalMatrix.getNormalMatrix(part.matrix);
    const count = index ? index.count : position.count;

    for (let t = 0; t < count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const vertexIndex = index ? index.getX(t + k) : t + k;
        v[k]
          .fromBufferAttribute(position, vertexIndex)
          .applyMatrix4(part.matrix);
        normals[k]
          .fromBufferAttribute(
            normal ?? position,
            index ? vertexIndex : vertexIndex,
          )
          .applyMatrix3(normalMatrix)
          .normalize();
      }
      const screen = v.map((vertex) => toScreen(vertex));
      if (screen.some((point) => point.clipped)) continue;
      const [a, b, c] = screen;
      const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
      if (area === 0) continue;
      // WebGL culls back faces by default (`side: FrontSide`), so a correct
      // model never shows them. Set DEBUG_BACKFACES=1 to highlight instead.
      const backface = area > 0;
      if (backface && !HIGHLIGHT_BACKFACES) continue;

      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
      if (minX > maxX || minY > maxY) continue;

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const cx = px + 0.5;
          const cy = py + 0.5;
          const w0 =
            ((b.x - a.x) * (cy - a.y) - (cx - a.x) * (b.y - a.y)) / area;
          const w1 =
            ((cx - a.x) * (c.y - a.y) - (c.x - a.x) * (cy - a.y)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          // barycentrics: w1 → a, w2 → b, w0 → c
          const z = w1 * a.z + w2 * b.z + w0 * c.z;
          const pixel = py * width + px;
          if (z >= depth[pixel]) continue;

          const n = normals[0]
            .clone()
            .multiplyScalar(w1)
            .add(normals[1].clone().multiplyScalar(w2))
            .add(normals[2].clone().multiplyScalar(w0))
            .normalize();
          if (backface) n.negate();

          const p = v[0]
            .clone()
            .multiplyScalar(w1)
            .add(v[1].clone().multiplyScalar(w2))
            .add(v[2].clone().multiplyScalar(w0));

          let u = 0.5;
          let vv = 0.5;
          if (uv && !backface) {
            const vertexIndex = index ? index.getX(t) : t;
            u =
              w1 * uv.getX(vertexIndex) +
              w2 * uv.getX(index ? index.getX(t + 1) : t + 1) +
              w0 * uv.getX(index ? index.getX(t + 2) : t + 2);
            vv =
              w1 * uv.getY(vertexIndex) +
              w2 * uv.getY(index ? index.getX(t + 1) : t + 1) +
              w0 * uv.getY(index ? index.getX(t + 2) : t + 2);
          }

          const alpha = part.surface === "glass" ? 0.2 : 1;
          if (part.surface === "glass") {
            // sapphire reads as a specular sheen over whatever is behind it
            const sheen =
              0.18 + 0.5 * Math.max(0, n.dot(new THREE.Vector3(0, 0, 1))) ** 6;
            const i = pixel * 3;
            colour[i] = colour[i] * (1 - alpha) + sheen * alpha;
            colour[i + 1] = colour[i + 1] * (1 - alpha) + sheen * alpha;
            colour[i + 2] = colour[i + 2] * (1 - alpha) + sheen * alpha;
            continue;
          }

          depth[pixel] = z;
          owner[pixel] = partIndex;
          normalBuffer[pixel * 3] = n.x;
          normalBuffer[pixel * 3 + 1] = n.y;
          normalBuffer[pixel * 3 + 2] = n.z;

          const view = camera.position.clone().sub(p).normalize();
          const shading = shade({
            part,
            backface,
            p,
            n,
            view,
            rig,
            u,
            vv,
            parts,
          });
          const i = pixel * 3;
          colour[i] = shading.r;
          colour[i + 1] = shading.g;
          colour[i + 2] = shading.b;
          void normalBuffer;
        }
      }
    }
  });

  // write PPM
  const header = `P6\n${width} ${height}\n255\n`;
  const bytes = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height * 3; i++) {
    bytes[i] = Math.max(
      0,
      Math.min(255, Math.round(colour[i] ** (1 / 2.2) * 255)),
    );
  }
  mkdirSync("preview", { recursive: true });
  writeFileSync(
    `preview/${label}.ppm`,
    Buffer.concat([Buffer.from(header), bytes]),
  );
  console.log(
    `  · preview/${label}.ppm  ${width}×${height}  stageScale=${stageScale.toFixed(3)}`,
  );
}

/**
 * Stylised studio shading — enough to judge composition and material response,
 * not a PBR match. Plain component maths (three's Color has no addScaledVector).
 */
type RGB = { r: number; g: number; b: number };
const rgb = (c: THREE.Color): RGB => ({ r: c.r, g: c.g, b: c.b });
const scale = (c: RGB, k: number): RGB => ({
  r: c.r * k,
  g: c.g * k,
  b: c.b * k,
});
const add = (a: RGB, b: RGB): RGB => ({
  r: a.r + b.r,
  g: a.g + b.g,
  b: a.b + b.b,
});
const mul = (a: RGB, b: RGB): RGB => ({
  r: a.r * b.r,
  g: a.g * b.g,
  b: a.b * b.b,
});
const mix = (a: RGB, b: RGB, t: number): RGB => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

function shade({
  part,
  backface,
  p,
  n,
  view,
  rig,
  u,
  vv,
  parts,
}: {
  part: Part;
  backface: boolean;
  p: THREE.Vector3;
  n: THREE.Vector3;
  view: THREE.Vector3;
  rig: LightRig;
  u: number;
  vv: number;
  parts: Part[];
}): RGB {
  const albedo = rgb(surfaceColor(part.surface));
  let roughness = 0.25;
  let metalness = 0.95;
  let tone = 1;

  if (part.surface === "face") {
    tone = sampleFace(u, vv).tone;
    roughness = 0.22;
    metalness = 0.7;
  } else if (part.surface === "lume") {
    roughness = 0.55;
    metalness = 0.05;
  } else if (part.surface === "movement") {
    roughness = 0.34;
    metalness = 0.9;
  } else if (part.surface === "floor") {
    roughness = 0.85;
    metalness = 0.1;
    const r = Math.hypot(p.x, p.z);
    tone = Math.max(0, 1 - (r / 11) ** 1.6);
  }

  let result: RGB = scale(
    mul(albedo, { r: 1 - metalness, g: 1 - metalness, b: 1 - metalness }),
    0.27,
  );

  const lights = [rig.key, rig.rimA, rig.rimB];
  let shadow = 1;
  lights.forEach((light, index) => {
    const toLight = light.position.clone().sub(p);
    const distance = toLight.length();
    const L = toLight.clone().normalize();
    const lambert = Math.max(0, n.dot(L));
    if (lambert <= 0) return;
    const falloff = light.intensity / (distance * distance);
    if (index === 0) {
      // sphere-based shadow ray: this is what plants the case's micro-shadow
      for (const other of parts) {
        if (!other.shadowCaster) continue;
        const toCentre = other.centre.clone().sub(p);
        const along = toCentre.dot(L);
        if (along <= 0 || along > distance) continue;
        const perpendicular = toCentre
          .clone()
          .addScaledVector(L, -along)
          .length();
        if (perpendicular < other.radius * 0.92) {
          shadow = 0.1;
          break;
        }
      }
    }
    const diffuse = mul(albedo, {
      r: 1 - metalness,
      g: 1 - metalness,
      b: 1 - metalness,
    });
    result = add(
      result,
      scale(
        mul(mul(diffuse, rgb(light.color)), {
          r: lambert,
          g: lambert,
          b: lambert,
        }),
        falloff * shadow,
      ),
    );
    const half = L.add(view).normalize();
    const spec =
      Math.max(0, n.dot(half)) **
      Math.min(2 / Math.max(roughness * roughness, 0.002), 512);
    result = add(
      result,
      scale(
        rgb(light.color),
        spec * (0.55 + metalness) * falloff * 0.55 * shadow,
      ),
    );
  });

  // cheap IBL: a studio gradient reflecting in the polished metal
  const reflected = n
    .clone()
    .multiplyScalar(2 * n.dot(view))
    .sub(view);
  const sky = Math.max(0, reflected.y) ** 2.0;
  const env = mix(
    rgb(new THREE.Color("#151822")),
    rgb(new THREE.Color("#f6f8ff")),
    sky,
  );
  result = add(
    result,
    scale(mul(albedo, env), metalness * (0.45 + 0.55 * (1 - roughness))),
  );

  result = scale(result, tone);
  if (part.surface === "lume")
    result = add(result, { r: 0.1, g: 0.09, b: 0.06 });
  if (backface) result = mix(result, { r: 1, g: 0, b: 0.27 }, 0.6); // winding alarm
  return result;
}

/* ── run ──────────────────────────────────────────────────────────────────── */
const isEntry = process.argv[1]?.endsWith("render.ts") === true;
if (isEntry) runPreviewShots();

function runPreviewShots() {
console.log("Software studio render");
const FIT_RADIUS = SCENE.fitRadius;
const fit = (width: number, height: number) => {
  const halfHeight =
    Math.abs(SCENE.camera.position[2]) *
    Math.tan((SCENE.camera.fov / 2) * (Math.PI / 180));
  const halfWidth = halfHeight * (width / height);
  return Math.max(
    0.34,
    Math.min(1, halfHeight / FIT_RADIUS, halfWidth / FIT_RADIUS),
  );
};

for (const shot of [
  { width: 1400, height: 900, label: "desktop" },
  { width: 430, height: 900, label: "mobile" },
] as const) {
  render({ ...shot, stageScale: fit(shot.width, shot.height) });
}
console.log("done");
}
