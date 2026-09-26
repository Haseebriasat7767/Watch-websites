import * as THREE from "three";
import { mergeBufferGeometries, RoundedBoxGeometry } from "three-stdlib";
import { WORLD_HALF } from "../lib/dialTexture";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Parametric horology geometry
 * ─────────────────────────────────────────────────────────────────────────────
 *  Everything the watch is made of is generated here at runtime:
 *    · solids of revolution (case band, bezel with a coin edge, rehaut, crown,
 *      domed sapphire) built from cross-sections,
 *    · extruded applied indices, hands and lugs,
 *    · the tapered multi-link bracelet, laid out on a wrist curve.
 *
 *  Budget: < 90k triangles total and ~20 draw calls for the whole timepiece —
 *  the reason it holds a locked 60 FPS on iOS / Android without throttling.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ProfilePoint = { r: number; z: number };

/** Signed volume of a triangle soup (divergence theorem) — used to detect inverted winding. */
function signedVolume(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!index) return 1;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }
  return volume;
}

/**
 * Guarantees outward-facing normals. Generating mirrored left/right parts is the
 * usual source of inside-out solids; this makes every builder below foolproof.
 *
 * Note: `ExtrudeGeometry` emits *non-indexed* buffers, so a sequential index is
 * synthesised first — otherwise the flip (and any later merge) would be a no-op
 * on lugs, hands, indices and the rotor.
 */
export function fixWinding(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  if (!geometry.getIndex()) {
    const count = geometry.getAttribute("position").count;
    const sequential =
      count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) sequential[i] = i;
    geometry.setIndex(new THREE.BufferAttribute(sequential, 1));
  }

  if (signedVolume(geometry) < 0) {
    const index = geometry.getIndex()!;
    const array = index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < array.length; i += 3) {
      const swap = array[i + 1];
      array[i + 1] = array[i + 2];
      array[i + 2] = swap;
    }
    index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** Projects a geometry's XY footprint into the shared dial texture space. */
export function planarizeUV(
  geometry: THREE.BufferGeometry,
  worldHalf = WORLD_HALF,
) {
  const pos = geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / (2 * worldHalf) + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / (2 * worldHalf) + 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/* ────────────────────────────────────────────────────────────────────────────
   Solids of revolution
   ──────────────────────────────────────────────────────────────────────────── */
export type RevolveOptions = {
  segments?: number;
  /** Per-profile-point radial modulation — used for coin edges and knurling. */
  modulate?: (pointIndex: number, angle: number, point: ProfilePoint) => number;
  /** Revolve axis. `z` faces the camera; `x` is used for the crown. */
  axis?: "z" | "x";
};

export function revolveProfile(
  profile: ProfilePoint[],
  { segments = 144, modulate, axis = "z" }: RevolveOptions = {},
): THREE.BufferGeometry {
  const P = profile.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let i = 0; i < P; i++) {
      const p = profile[i];
      const m = modulate ? modulate(i, angle, p) : 1;
      const r = Math.max(p.r * m, 0.0008);
      if (axis === "z") {
        positions.push(r * cos, r * sin, p.z);
      } else {
        positions.push(p.z, r * cos, r * sin);
      }
      uvs.push(s / segments, i / (P - 1));
    }
  }

  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    for (let i = 0; i < P; i++) {
      const iNext = (i + 1) % P;
      const a = s * P + i;
      const b = sNext * P + i;
      const c = sNext * P + iNext;
      const d = s * P + iNext;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return fixWinding(geometry);
}

/** Flat ring (bezel insert, power-reserve scale) with planar, dial-aligned UVs. */
export function annulusGeometry({
  inner,
  outer,
  segments = 128,
  worldHalf = WORLD_HALF,
  dome = 0,
  wall = 0,
  innerWall = 0,
}: {
  inner: number;
  outer: number;
  segments?: number;
  worldHalf?: number;
  dome?: number;
  wall?: number;
  innerWall?: number;
}): THREE.BufferGeometry {
  const rings = [
    { r: inner, z: 0 },
    { r: outer, z: -dome },
    { r: outer, z: -dome - wall },
    { r: inner, z: -innerWall },
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const R = rings.length;

  for (let s = 0; s < segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let i = 0; i < R; i++) {
      const x = rings[i].r * cos;
      const y = rings[i].r * sin;
      positions.push(x, y, rings[i].z);
      uvs.push(x / (2 * worldHalf) + 0.5, y / (2 * worldHalf) + 0.5);
    }
  }
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    for (let i = 0; i < R; i++) {
      const iNext = (i + 1) % R;
      const a = s * R + i;
      const b = sNext * R + i;
      const c = sNext * R + iNext;
      const d = s * R + iNext;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return fixWinding(geometry);
}

/* ────────────────────────────────────────────────────────────────────────────
   Case profiles  (watch plane = XY, +Z toward the viewer)
   ──────────────────────────────────────────────────────────────────────────── */
export const CASE = {
  dialRadius: 0.9,
  rehautInner: 0.9,
  rehautOuter: 0.95,
  bezelInner: 0.95,
  bezelOuter: 1.12,
  caseOuter: 1.21,
  caseBack: -0.3,
  crystalR: 0.93,
} as const;

/** Case band + bezel shoulder, with a 56-flute coin edge on the upper wall. */
export function buildCaseGeometry(): THREE.BufferGeometry {
  const profile: ProfilePoint[] = [
    { r: 0.9, z: 0.17 },
    { r: 0.95, z: 0.205 },
    { r: 1.06, z: 0.2 },
    { r: 1.12, z: 0.185 },
    { r: 1.16, z: 0.1 },
    { r: 1.21, z: -0.02 },
    { r: 1.2, z: -0.1 },
    { r: 1.13, z: -0.19 },
    { r: 1.02, z: -0.245 },
    { r: 0.86, z: -0.262 },
    { r: 0.7, z: -0.268 },
    { r: 0.56, z: -0.262 },
    { r: 0.5, z: -0.2 },
    { r: 0.62, z: -0.16 },
    { r: 0.8, z: -0.12 },
    { r: 0.88, z: -0.02 },
    { r: 0.9, z: 0.02 },
  ];
  /**
   * Coin edge belongs to the outer knurling only. Keeping the flat top face
   * (r 0.90 → 1.12) smooth means the printed bezel insert — which is seated a
   * hair proud of it — reads as one uninterrupted scale instead of an
   * interleaved moiré of flutes and numerals.
   */
  const fluted = new Set([3, 4, 5, 6, 7]);
  return revolveProfile(profile, {
    segments: 168,
    modulate: (i, angle) =>
      fluted.has(i) ? 1 - 0.022 * (0.5 - 0.5 * Math.cos(56 * angle)) : 1,
  });
}

/** Conical rehaut that seats the dial inside the case. */
export function buildRehautGeometry(): THREE.BufferGeometry {
  return revolveProfile(
    [
      { r: CASE.rehautInner, z: 0.005 },
      { r: CASE.rehautInner + 0.01, z: 0.08 },
      { r: CASE.rehautOuter, z: 0.16 },
      { r: CASE.rehautOuter - 0.02, z: 0.145 },
      { r: CASE.rehautInner, z: -0.02 },
    ],
    { segments: 128 },
  );
}

/** Domed sapphire crystal — a lens-shaped closed solid (AR coated). */
export function buildCrystalGeometry(): THREE.BufferGeometry {
  const R = CASE.crystalR;
  const steps = 16;
  const top: ProfilePoint[] = [];
  const bottom: ProfilePoint[] = [];
  // A box-domed lens: generously arched on top, nearly flat underneath so the
  // hand stack never grazes the sapphire at any sweep angle.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = 0.02 + (R - 0.02) * t;
    const dome = Math.cos((t * Math.PI) / 2) ** 2;
    top.push({ r, z: 0.225 + 0.15 * dome });
    bottom.push({ r, z: 0.185 + 0.055 * dome });
  }
  const profile: ProfilePoint[] = [...top, ...bottom.reverse()];
  return revolveProfile(profile, { segments: 112 });
}

/** Screw-down crown with knurled band (revolved around X). */
export function buildCrownGeometry(): THREE.BufferGeometry {
  const profile: ProfilePoint[] = [
    { r: 0.075, z: 1.16 },
    { r: 0.1, z: 1.19 },
    { r: 0.13, z: 1.24 },
    { r: 0.175, z: 1.29 },
    { r: 0.18, z: 1.4 },
    { r: 0.16, z: 1.45 },
    { r: 0.09, z: 1.47 },
    { r: 0.01, z: 1.468 },
    { r: 0.01, z: 1.16 },
  ];
  const knurl = new Set([3, 4, 5]);
  return revolveProfile(profile, {
    axis: "x",
    segments: 96,
    modulate: (i, angle) =>
      knurl.has(i) ? 1 - 0.01 * (0.5 - 0.5 * Math.cos(24 * angle)) : 1,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Extruded horology parts
   ──────────────────────────────────────────────────────────────────────────── */
function extrude({
  shape,
  thickness,
  bevel = 0.008,
  steps = 1,
}: {
  shape: THREE.Shape;
  thickness: number;
  bevel?: number;
  steps?: number;
}): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(thickness - bevel * 2, 0.004),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 8,
    steps,
  });
  geometry.translate(0, 0, -Math.max(thickness - bevel * 2, 0.004) / 2);
  geometry.computeVertexNormals();
  return fixWinding(geometry);
}

/** Sweeping sword hand: counterweight, hub and a needle taper. */
export function buildHandShape({
  length,
  base,
  tip,
  tail,
}: {
  length: number;
  base: number;
  tip: number;
  tail: number;
}): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-base, -0.02);
  s.lineTo(-base * 0.72, -tail);
  s.quadraticCurveTo(0, -tail * 1.35, base * 0.72, -tail);
  s.lineTo(base, -0.02);
  s.lineTo(tip, length * 0.62);
  s.quadraticCurveTo(tip * 0.55, length * 0.94, 0, length);
  s.quadraticCurveTo(-tip * 0.55, length * 0.94, -tip, length * 0.62);
  s.closePath();
  return s;
}

const HAND_Z = { hour: 0.075, minute: 0.115, second: 0.16 } as const;

export type HandSet = {
  hour: THREE.BufferGeometry;
  minute: THREE.BufferGeometry;
  second: THREE.BufferGeometry;
  hourLume: THREE.BufferGeometry;
  minuteLume: THREE.BufferGeometry;
};

export function buildHands(): HandSet {
  const hourShape = buildHandShape({
    length: 0.5,
    base: 0.055,
    tip: 0.016,
    tail: 0.075,
  });
  const minuteShape = buildHandShape({
    length: 0.74,
    base: 0.042,
    tip: 0.011,
    tail: 0.075,
  });
  const secondShape = buildHandShape({
    length: 0.78,
    base: 0.014,
    tip: 0.005,
    tail: 0.1,
  });

  const hour = extrude({ shape: hourShape, thickness: 0.036, bevel: 0.007 });
  hour.translate(0, 0, HAND_Z.hour);
  const minute = extrude({
    shape: minuteShape,
    thickness: 0.032,
    bevel: 0.006,
  });
  minute.translate(0, 0, HAND_Z.minute);
  const second = extrude({ shape: secondShape, thickness: 0.02, bevel: 0.004 });
  second.translate(0, 0, HAND_Z.second);

  // Luminous inlays ride slightly proud of the metal frames.
  const hourLume = extrude({
    shape: buildHandShape({ length: 0.4, base: 0.028, tip: 0.008, tail: 0.02 }),
    thickness: 0.014,
    bevel: 0.002,
  });
  hourLume.translate(0, 0, HAND_Z.hour + 0.017);
  const minuteLume = extrude({
    shape: buildHandShape({
      length: 0.62,
      base: 0.021,
      tip: 0.006,
      tail: 0.02,
    }),
    thickness: 0.013,
    bevel: 0.002,
  });
  minuteLume.translate(0, 0, HAND_Z.minute + 0.015);

  // Kept separate so each inlay can ride its own hand's sweep angle.
  return { hour, minute, second, hourLume, minuteLume };
}

/** Needle of the 72-hour power-reserve subdial. */
export function buildReserveNeedle(): THREE.BufferGeometry {
  return extrude({
    shape: buildHandShape({
      length: 0.168,
      base: 0.011,
      tip: 0.005,
      tail: 0.028,
    }),
    thickness: 0.012,
    bevel: 0.002,
  });
}

/** Classic 10:09:36 display pose, in radians (clockwise from twelve). */
export const HERO_TIME = {
  hour: -((10 + 9 / 60) / 12) * Math.PI * 2,
  minute: -(9 / 60) * Math.PI * 2,
  second: -(36 / 60) * Math.PI * 2,
} as const;

/** Applied indices: polished metal frames with luminous inlays, 12 o'clock doubled. */
export function buildIndices(): {
  frame: THREE.BufferGeometry;
  lume: THREE.BufferGeometry;
} {
  const frames: THREE.BufferGeometry[] = [];
  const lumes: THREE.BufferGeometry[] = [];

  const baton = (
    w: number,
    inner: number,
    outer: number,
    thickness: number,
  ) => {
    const s = new THREE.Shape();
    s.moveTo(-w, inner);
    s.lineTo(w, inner);
    s.lineTo(w * 0.68, outer);
    s.lineTo(-w * 0.68, outer);
    s.closePath();
    return extrude({ shape: s, thickness, bevel: 0.006 });
  };

  for (let h = 0; h < 12; h++) {
    const angle = -(h * Math.PI) / 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const inner = 0.6;
    const outer = h % 3 === 0 ? 0.78 : 0.75;
    const offsets = h === 0 ? [-0.075, 0.075] : [0];
    const widths = h === 0 ? [0.055, 0.055] : h % 3 === 0 ? [0.062] : [0.042];

    for (let k = 0; k < offsets.length; k++) {
      // The baton is modelled along +Y (twelve), then rotated into its hour slot.
      // `(cos, sin)` is the tangential axis there, used to split the doubled twelve.
      const frame = baton(widths[k], inner, outer, 0.05);
      frame.rotateZ(angle);
      frame.translate(cos * offsets[k], sin * offsets[k], 0.055);
      frames.push(frame);

      const lumeBaton = baton(
        widths[k] * 0.42,
        inner + (outer - inner) * 0.14,
        outer - (outer - inner) * 0.2,
        0.02,
      );
      lumeBaton.rotateZ(angle);
      lumeBaton.translate(cos * offsets[k], sin * offsets[k], 0.085);
      lumes.push(lumeBaton);
    }
  }

  // 12 o'clock orientation triangle
  const tri = new THREE.Shape();
  tri.moveTo(-0.075, 0);
  tri.lineTo(0.075, 0);
  tri.lineTo(0, -0.12);
  tri.closePath();
  const triangle = extrude({ shape: tri, thickness: 0.03, bevel: 0.005 });
  triangle.translate(0, 0.44, 0.055);
  frames.push(triangle);

  return {
    frame: fixWinding(mergeBufferGeometries(frames) ?? frames[0]),
    lume: fixWinding(mergeBufferGeometries(lumes) ?? lumes[0]),
  };
}

/** Lug, extruded in the ZY plane; `dir` flips it for the 6 o'clock side. */
export function buildLugGeometry(dir: 1 | -1): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // local x = "down" (becomes world −Z), local y = outward span (world Y)
  const p = (down: number, out: number): [number, number] => [down, out * dir];
  // A tapering horn: broad where it meets the band, slender at the spring bar.
  s.moveTo(...p(0.03, 0.84));
  s.lineTo(...p(0.09, 1.26));
  s.quadraticCurveTo(...p(0.16, 1.46), ...p(0.26, 1.5));
  s.quadraticCurveTo(...p(0.36, 1.5), ...p(0.37, 1.4));
  s.lineTo(...p(0.3, 1.02));
  s.lineTo(...p(0.24, 0.84));
  s.closePath();
  const geometry = extrude({ shape: s, thickness: 0.22, bevel: 0.026 });
  // The extrusion runs along +Z; rotate so it becomes the case's X axis.
  geometry.rotateY(Math.PI / 2);
  geometry.center();
  // span [0.84 … 1.50] → y, and drop the lug so its crown sits under the bezel
  geometry.translate(0, dir * 1.17, -0.13);
  return geometry;
}

/** Brim of the sapphire exhibition case back. */
export function buildCaseBackRing(): THREE.BufferGeometry {
  return revolveProfile(
    [
      { r: 0.4, z: -0.205 },
      { r: 0.56, z: -0.235 },
      { r: 0.66, z: -0.29 },
      { r: 0.58, z: -0.31 },
      { r: 0.44, z: -0.3 },
      { r: 0.38, z: -0.25 },
    ],
    { segments: 96 },
  );
}

/** Skeleton rotor glimpsed through the exhibition back. */
export function buildRotorGeometry(): THREE.BufferGeometry {
  const half = new THREE.Shape();
  half.moveTo(0, 0);
  half.absarc(0, 0, 0.42, 0.18, Math.PI - 0.18, false);
  half.lineTo(0, 0);
  return extrude({ shape: half, thickness: 0.028, bevel: 0.008 });
}

/* ────────────────────────────────────────────────────────────────────────────
   Bracelet
   ──────────────────────────────────────────────────────────────────────────── */
export type BraceletLink = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Link length along the wrist curve (world units). */
  height: number;
};

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Lays out a five-link bracelet along a wrist curve: the centre link is wide and
 * polished, the flanking links are narrower — then instanced into 2 draw calls.
 */
export function buildBraceletLayout(): {
  center: BraceletLink[];
  side: BraceletLink[];
} {
  const center: BraceletLink[] = [];
  const side: BraceletLink[] = [];
  const LINKS_PER_SIDE = 8;

  /**
   * The two halves of the bracelet are deliberately *not* mirror images: the
   * twelve o'clock side lifts and sweeps deep into the void, while the six
   * o'clock side rises as it recedes — the silhouette of a watch resting on a
   * display roll.
   *
   * The 6 o'clock sweep is also what keeps the composition legal: the root
   * group is tilted −0.36 rad, so any link that recedes in −Z drops by
   * 0.35 × |z| in world Y. Climbing as it goes back keeps every link clear of
   * the studio floor, which in turn lets the polar clamp (max 100°) never
   * reveal the plane's underside.
   */
  const CURVES: Record<1 | -1, THREE.Vector3[]> = {
    1: [
      new THREE.Vector3(0, 1.26, -0.1),
      new THREE.Vector3(0, 1.62, -0.3),
      new THREE.Vector3(0, 1.92, -0.72),
      new THREE.Vector3(0, 1.98, -1.24),
      new THREE.Vector3(0, 1.78, -1.62),
    ],
    "-1": [
      new THREE.Vector3(0, -1.26, -0.1),
      new THREE.Vector3(0, -1.6, -0.26),
      new THREE.Vector3(0, -1.82, -0.5),
      new THREE.Vector3(0, -1.5, -0.78),
      new THREE.Vector3(0, -1.02, -0.9),
    ],
  };

  for (const dir of [1, -1] as const) {
    const curve = new THREE.CatmullRomCurve3(CURVES[dir]);

    const length = curve.getLength();
    for (let i = 0; i < LINKS_PER_SIDE; i++) {
      const t = (i + 0.5) / LINKS_PER_SIDE;
      const position = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, tangent);
      // Bracelets taper toward the clasp: 12 % narrower at the far end.
      const height = (length / LINKS_PER_SIDE) * (0.9 - 0.1 * t);
      const link: BraceletLink = { position, quaternion, height };
      center.push(link);
      side.push(link);
    }
  }
  return { center, side };
}

/** Fillet radii kept sub-centimetre so bevels stay razor sharp on mobile. */
export const LINK_GEOMETRY = {
  /** 20 mm lug width on a 40.5 mm case → 1.2 world units of bracelet. */
  center: () => new RoundedBoxGeometry(0.6, 1, 0.2, 3, 0.055),
  side: () => new RoundedBoxGeometry(0.28, 1, 0.18, 3, 0.045),
} as const;

/** Side links sit either side of the polished centre link. */
export const SIDE_LINK_OFFSET = 0.44;
export const LUG_X = 0.73;
