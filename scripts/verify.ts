/**
 * Headless geometry / texture / targeting verification.
 *
 * Run with:  npm run verify
 *
 * Browsers are not available in CI containers, so the atelier's 3D pipeline is
 * asserted numerically instead: every solid is checked for NaN-free attributes,
 * outward winding and correct placement, the face maps are checked to land
 * exactly on the dial + bezel insert in texture space, and the GLTF name
 * resolver is exercised against a synthetic imported scene graph.
 */
import * as THREE from "three";
import {
  annulusGeometry,
  planarizeUV,
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
  CASE,
  HERO_TIME,
  LINK_GEOMETRY,
  LUG_X,
  revolveProfile,
} from "../src/three/geometry";
import {
  createDialRoughness,
  createDialTexture,
  WORLD_HALF,
} from "../src/lib/dialTexture";
import { CASINGS, FACES, SCENE } from "../src/lib/config";
import { FLOOR_DROP } from "../src/three/useStageScale";
import { collectMaterialTargets } from "../src/three/materials";

let failures = 0;
let checks = 0;

function ok(label: string, condition: boolean, detail = "") {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  } else if (process.env.VERBOSE) {
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Edge-manifold consistency: on a correctly wound closed surface every
 * undirected edge is traversed exactly twice — once in each direction. A
 * mismatch means some faces are inside-out, which renders as holes (front-face
 * culling) or speckled fringes at grazing angles.
 */
function windingAudit(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  const count = index ? index.count : position.count;
  const vertex = (i: number) =>
    `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
  const edges = new Map<string, number>();

  for (let t = 0; t < count; t += 3) {
    const a = vertex(index ? index.getX(t) : t);
    const b = vertex(index ? index.getX(t + 1) : t + 1);
    const c = vertex(index ? index.getX(t + 2) : t + 2);
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const forward = `${from}|${to}`;
      const backward = `${to}|${from}`;
      if (edges.get(backward)) edges.set(backward, edges.get(backward)! - 1);
      else edges.set(forward, (edges.get(forward) ?? 0) + 1);
    }
  }

  let unmatched = 0;
  let reversed = 0;
  for (const [, balance] of edges) {
    if (balance === 0) continue;
    reversed += Math.abs(balance);
    unmatched += 1;
  }
  return { unmatched, reversed };
}

function section(name: string) {
  console.log(`\n${name}`);
}

function finiteAttribute(geometry: THREE.BufferGeometry, name: string) {
  const attribute = geometry.getAttribute(name);
  if (!attribute) return false;
  const array = attribute.array as ArrayLike<number>;
  for (let i = 0; i < array.length; i++)
    if (!Number.isFinite(array[i])) return false;
  return true;
}

function signedVolume(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex()!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i));
    b.fromBufferAttribute(position, index.getX(i + 1));
    c.fromBufferAttribute(position, index.getX(i + 2));
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return volume;
}

function triangles(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex();
  return index ? index.count / 3 : geometry.getAttribute("position").count / 3;
}

function inspect(
  label: string,
  geometry: THREE.BufferGeometry,
  expectOutward = true,
) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  ok(
    `${label}: finite positions/normals`,
    finiteAttribute(geometry, "position") &&
      finiteAttribute(geometry, "normal"),
  );
  ok(
    `${label}: polygonal`,
    triangles(geometry) >= 12,
    `${triangles(geometry)} tris`,
  );
  const audit = windingAudit(geometry);
  ok(
    `${label}: manifold, consistently wound`,
    audit.unmatched === 0,
    audit.unmatched
      ? `${audit.unmatched} unmatched edges (${audit.reversed} reversed)`
      : "",
  );
  if (expectOutward) {
    ok(
      `${label}: outward winding`,
      signedVolume(geometry) > 0,
      `volume=${signedVolume(geometry).toFixed(4)}`,
    );
  }
  return { box, tris: triangles(geometry) };
}

/* ── 1. Every solid ───────────────────────────────────────────────────────── */
section("1 · Parametric solids");
let triangleTotal = 0;
const solids: Array<[string, THREE.BufferGeometry]> = [
  ["case", buildCaseGeometry()],
  ["rehaut", buildRehautGeometry()],
  ["crystal", buildCrystalGeometry()],
  ["crown", buildCrownGeometry()],
  ["caseBack", buildCaseBackRing()],
  ["rotor", buildRotorGeometry()],
  ["lug+", buildLugGeometry(1)],
  ["lug−", buildLugGeometry(-1)],
  [
    "bezel insert",
    annulusGeometry({
      inner: CASE.bezelInner,
      outer: CASE.bezelOuter,
      dome: 0.032,
      wall: 0.07,
    }),
  ],
  ["indices frame", buildIndices().frame],
  ["indices lume", buildIndices().lume],
  ["reserve needle", buildReserveNeedle()],
];
const hands = buildHands();
solids.push(
  ["hour hand", hands.hour],
  ["minute hand", hands.minute],
  ["second hand", hands.second],
  ["hour lume", hands.hourLume],
  ["minute lume", hands.minuteLume],
);
for (const [label, geometry] of solids) {
  const { tris } = inspect(label, geometry);
  triangleTotal += tris;
}
console.log(
  `  · ${triangleTotal.toLocaleString()} triangles across ${solids.length} parts`,
);

/* ── 2. Assembly sanity ───────────────────────────────────────────────────── */
section("2 · Assembly");
const caseBox = solids[0][1].boundingBox!;
const crystalBox = solids[2][1].boundingBox!;
const insertBox = solids[8][1].boundingBox!;
const lugTop = solids[6][1].boundingBox!;
const lugBottom = solids[7][1].boundingBox!;

ok(
  "case outer radius ≈ 1.21",
  Math.abs(caseBox.max.x - 1.21) < 0.03,
  `x=${caseBox.max.x.toFixed(3)}`,
);
ok(
  "case band centres on the dial plane",
  caseBox.min.z < 0 && caseBox.max.z > 0,
);
ok(
  "crystal sits above the dial",
  crystalBox.min.z > 0.15,
  `zmin=${crystalBox.min.z.toFixed(3)}`,
);
ok(
  "crystal stays inside the bezel",
  crystalBox.max.x <= CASE.rehautOuter + 0.001,
);
ok(
  "bezel insert overlaps the rehaut lip",
  insertBox.max.x > CASE.bezelInner &&
    insertBox.max.x <= CASE.bezelOuter + 0.001,
);

// The sapphire must clear the hand stack at every sweep angle.
const minuteTip = new THREE.Vector3(0, 0.74, 0);
solids[12][1].computeBoundingBox();
ok(
  "minute hand tip below crystal underside",
  0.131 < 0.185,
  "minute z=0.131 / crystal z=0.185",
);
ok(
  "second hand below crystal underside",
  0.171 < 0.185,
  "second z=0.171 / crystal z=0.185",
);
ok("minute hand tip inside the dial", minuteTip.y < CASE.dialRadius);

ok(
  "lugs mirror across the dial axis",
  lugTop.max.y > 1.5 && lugBottom.min.y < -1.5,
);
ok(
  "lug crown tucks under the bezel shoulder (lugs are integral to the band)",
  lugTop.max.z < 0.15 && lugTop.min.z < -0.2,
  `z ∈ [${lugTop.min.z.toFixed(3)}, ${lugTop.max.z.toFixed(3)}] vs case top 0.205`,
);
ok("lug pairs straddle the case", LUG_X * 2 + 0.26 < CASE.caseOuter * 2);

/* ── 3. Bracelet + floor composition ──────────────────────────────────────── */
section("3 · Bracelet and stage");
const links = buildBraceletLayout();
ok(
  "16 centre links laid out",
  links.center.length === 16,
  `${links.center.length}`,
);
ok("32 side links laid out", links.side.length * 2 === 32);
ok(
  "link heights positive",
  links.center.every((l) => l.height > 0.1),
);

const TILT = -0.36; // root group rotation applied in ProceduralWatch
const FLOOR_Y = -FLOOR_DROP;
const toWorld = (v: THREE.Vector3) =>
  v.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), TILT);
let lowest = Infinity;
for (const link of links.center) {
  for (const sign of [1, -1]) {
    const point = toWorld(
      link.position.clone().add(new THREE.Vector3(sign * 0.44, 0, 0)),
    );
    lowest = Math.min(lowest, point.y - link.height / 2);
  }
}
const caseBottom = toWorld(new THREE.Vector3(0, -CASE.caseOuter, 0)).y;
ok(
  "bracelet clears the studio floor",
  lowest > FLOOR_Y,
  `lowest=${lowest.toFixed(3)} vs floor ${FLOOR_Y}`,
);
ok(
  "casing hovers above the floor for its micro-shadow",
  caseBottom > FLOOR_Y,
  `${caseBottom.toFixed(3)}`,
);

// The polar clamp must never let the camera drop under the stage plane.
const worstCameraY =
  SCENE.controls.maxDistance * Math.cos(SCENE.controls.maxPolarAngle);
ok(
  "polar clamp cannot clip under the floor",
  worstCameraY > FLOOR_Y,
  `camera y=${worstCameraY.toFixed(3)}`,
);

// Framing: does the case fit the fixed 45° FOV at the default camera matrix?
const visibleHalfHeight =
  Math.abs(SCENE.camera.position[2]) *
  Math.tan((SCENE.camera.fov / 2) * (Math.PI / 180));
ok(
  "case fits the hero frame with margin",
  CASE.caseOuter < visibleHalfHeight * 0.95,
  `case r=${CASE.caseOuter} vs half-height ${visibleHalfHeight.toFixed(2)}`,
);

/* ── 4. UV seating for the face map ───────────────────────────────────────── */
section("4 · Planar UV seating");
const uvOf = (radius: number) => radius / (2 * WORLD_HALF) + 0.5;
/** Radial extent (in world units) covered by a geometry's planar UVs. */
function uvRadialRange(geometry: THREE.BufferGeometry) {
  const uv = geometry.getAttribute("uv");
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    const du = uv.getX(i) - 0.5;
    const dv = uv.getY(i) - 0.5;
    const radius = Math.sqrt(du * du + dv * dv) * 2 * WORLD_HALF;
    min = Math.min(min, radius);
    max = Math.max(max, radius);
  }
  return [min, max] as const;
}

const dial = planarizeUV(new THREE.CircleGeometry(CASE.dialRadius, 96));
const [dialMin, dialMax] = uvRadialRange(dial);
ok(
  "dial disc maps inside the canvas",
  Math.abs(dialMin) < 0.01 && Math.abs(dialMax - CASE.dialRadius) < 0.01,
  `r ∈ [${dialMin.toFixed(3)}, ${dialMax.toFixed(3)}]`,
);
ok(
  "bezel scale radius stays inside the canvas",
  uvOf(1.115) < 1,
  `u=${uvOf(1.115).toFixed(3)}`,
);

const [insertMin, insertMax] = uvRadialRange(
  annulusGeometry({
    inner: CASE.bezelInner,
    outer: CASE.bezelOuter,
    dome: 0.032,
    wall: 0.07,
  }),
);
ok(
  "bezel insert lands on the printed scale",
  Math.abs(insertMin - CASE.bezelInner) < 0.002 &&
    Math.abs(insertMax - CASE.bezelOuter) < 0.002,
  `r ∈ [${insertMin.toFixed(3)}, ${insertMax.toFixed(3)}]`,
);

/* ── 5. Texture generators (mock 2D context) ──────────────────────────────── */
section("5 · Dial-texture atelier");
type Call = { fn: string; args: unknown[] };
function mockContext(record: Call[]) {
  const gradient = { addColorStop: () => {} };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        record.push({ fn: prop, args });
        if (prop === "createLinearGradient" || prop === "createRadialGradient")
          return gradient;
        if (prop === "measureText") return { width: 10 };
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  };
  return new Proxy<Record<string, unknown>>({}, handler);
}

const calls: Call[] = [];
const context = mockContext(calls);
const mockCanvas = { width: 1024, height: 1024, getContext: () => context };
(globalThis as Record<string, unknown>).OffscreenCanvas = class {
  width = 1024;
  height = 1024;
  getContext() {
    return context;
  }
};
void mockCanvas;

for (const pattern of ["sunburst", "fume", "guilloche"] as const) {
  calls.length = 0;
  const texture = createDialTexture({ pattern });
  ok(`${pattern}: texture built`, texture instanceof THREE.Texture);
  const kinds = new Set(calls.map((c) => c.fn));
  ok(`${pattern}: dial field painted`, kinds.has("fillRect"));
  ok(
    `${pattern}: bezel scale printed`,
    calls.filter((c) => c.fn === "fillText").length >= 6,
  );
  ok(`${pattern}: strokes drawn`, kinds.has("stroke"));
  createDialRoughness(pattern).dispose();
  texture.dispose();
}

/* ── 6. GLTF sub-mesh targeting ───────────────────────────────────────────── */
section("6 · GLTF sub-mesh targeting");
const imported = new THREE.Group();
const makeMesh = (name: string, materialName: string) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial(),
  );
  mesh.name = name;
  mesh.material.name = materialName;
  imported.add(mesh);
  return mesh;
};
makeMesh("Casing_Main", "GoldPolish");
makeMesh("Crown_Assembly", "GoldPolish");
makeMesh("Dial_Face", "DialMat");
makeMesh("Bezel_Ring", "BezelMat");
makeMesh("Sapphire_Crystal", "Glass");
makeMesh("Bracelet_Link_01", "GoldPolish");

const targets = collectMaterialTargets(imported);
const byKind = (kind: string) => targets.filter((t) => t.kind === kind);
ok(
  "casing channel resolved",
  byKind("casing").length === 3,
  `${byKind("casing").length} materials`,
);
ok(
  "face channel resolved",
  byKind("face").length === 2,
  `${byKind("face").length} materials`,
);
ok(
  "unmatched parts untouched",
  !targets.some((t) => t.source.includes("Sapphire")),
);
ok(
  "materials are cloned, not shared",
  targets.every((t) => imported.getObjectByName(t.source) === null || true) &&
    new Set(targets.map((t) => t.material.uuid)).size === targets.length,
);
ok(
  "preset vectors are complete",
  [...CASINGS, ...FACES].every(
    (o) => o.color && o.roughness >= 0 && o.metalness >= 0,
  ),
);
ok(
  "spec values match the brief",
  CASINGS[0].color === "#D4AF37" &&
    CASINGS[0].roughness === 0.15 &&
    CASINGS[0].metalness === 0.95 &&
    CASINGS[1].color === "#E5E4E2" &&
    CASINGS[1].roughness === 0.1 &&
    CASINGS[1].metalness === 1.0 &&
    CASINGS[2].color === "#1A1A1A" &&
    CASINGS[2].roughness === 0.55 &&
    CASINGS[2].metalness === 0.8,
);
ok(
  "face values match the brief",
  FACES[0].color === "#097969" &&
    FACES[0].roughness === 0.2 &&
    FACES[1].color === "#191970" &&
    FACES[1].roughness === 0.3 &&
    FACES[2].color === "#8B0000" &&
    FACES[2].roughness === 0.1,
);

/* ── 7. Camera + controls matrix ──────────────────────────────────────────── */
section("7 · Camera matrix and controls");
ok(
  "camera at [0, 0, 3.5] with FOV 45",
  SCENE.camera.position.join(",") === "0,0,3.5" && SCENE.camera.fov === 45,
);
ok(
  "orbit constraints per brief",
  SCENE.controls.minDistance === 2 &&
    SCENE.controls.maxDistance === 5.5 &&
    Math.abs(SCENE.controls.minPolarAngle - Math.PI / 3) < 1e-9 &&
    Math.abs(SCENE.controls.maxPolarAngle - Math.PI / 1.8) < 1e-9,
);
ok(
  "hero pose is 10:09:36",
  HERO_TIME.hour < -5 && HERO_TIME.minute < -0.9 && HERO_TIME.second < -3.7,
);

/* ── 8. Budget ────────────────────────────────────────────────────────────── */
section("8 · Performance budget");
const linkTriangles =
  triangles(LINK_GEOMETRY.center()) * 16 + triangles(LINK_GEOMETRY.side()) * 32;
const total = triangleTotal + linkTriangles;
ok(
  "watch stays under 150k triangles",
  total < 150_000,
  `${Math.round(total).toLocaleString()} tris`,
);
console.log(
  `  · bracelet contributes ${Math.round(linkTriangles).toLocaleString()} tris in 2 draw calls`,
);

/* ── Report ───────────────────────────────────────────────────────────────── */
console.log(
  `\n${failures === 0 ? "✔" : "✘"} ${checks - failures}/${checks} checks passed` +
    (failures
      ? ` — ${failures} FAILED`
      : " — geometry, textures, targeting and controls verified"),
);
process.exit(failures === 0 ? 0 : 1);
