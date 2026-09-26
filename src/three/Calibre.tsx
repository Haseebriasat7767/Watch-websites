import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { activeSample, clamp01 } from "./CameraWaypoints";
import { story } from "../story/storyState";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Calibre A01 — the movement chapter
 * ─────────────────────────────────────────────────────────────────────────────
 *  A parametric automatic calibre built to be read from *behind* the case: a
 *  perlaged main plate, three Côtes-de-Genève bridges, the going train, a
 *  running balance at 4 Hz and 31 synthetic rubies.
 *
 *  It lives inside the case (z ∈ [−0.24, −0.05]) and is revealed by the
 *  `exhibition` channel of the story sample: the case back withdraws, the
 *  calibre fades up. Roughly 12 draw calls, all geometry built once.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Small canvas-baked Côtes de Genève stripe map — no network, ~24 KB of VRAM. */
function createStripeTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = "#8e8f95";
  ctx.fillRect(0, 0, size, size);
  for (let i = -size; i < size * 2; i += 17) {
    const gradient = ctx.createLinearGradient(i, 0, i + 17, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0.22)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.02)");
    gradient.addColorStop(1, "rgba(0,0,0,0.20)");
    ctx.fillStyle = gradient;
    ctx.fillRect(i, 0, 17, size);
  }
  // Faint perlage speckle so the plate never reads as flat plastic.
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** A toothed wheel: rim, teeth ring and crossings, merged into one buffer. */
function wheelGeometry(radius: number, teeth: number, thickness: number) {
  const shape = new THREE.Shape();
  const toothDepth = radius * 0.085;
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const inner = radius - toothDepth;
    const points: [number, number][] = [
      [Math.cos(a0) * inner, Math.sin(a0) * inner],
      [Math.cos(a0 + step * 0.26) * radius, Math.sin(a0 + step * 0.26) * radius],
      [Math.cos(a0 + step * 0.58) * radius, Math.sin(a0 + step * 0.58) * radius],
      [Math.cos(a0 + step * 0.84) * inner, Math.sin(a0 + step * 0.84) * inner],
    ];
    points.forEach(([x, y], index) => {
      if (i === 0 && index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();

  // Three crossings, cut as holes.
  const hub = radius * 0.2;
  for (let i = 0; i < 3; i++) {
    const hole = new THREE.Path();
    const a = (i / 3) * Math.PI * 2;
    const spanA = 0.78;
    const rOuter = radius - toothDepth * 2.1;
    const steps = 10;
    for (let s = 0; s <= steps; s++) {
      const angle = a - spanA / 2 + (spanA * s) / steps;
      const x = Math.cos(angle) * rOuter;
      const y = Math.sin(angle) * rOuter;
      if (s === 0) hole.moveTo(x, y);
      else hole.lineTo(x, y);
    }
    for (let s = steps; s >= 0; s--) {
      const angle = a - spanA / 2 + (spanA * s) / steps;
      hole.lineTo(Math.cos(angle) * hub * 1.6, Math.sin(angle) * hub * 1.6);
    }
    hole.closePath();
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: thickness * 0.2,
    bevelThickness: thickness * 0.2,
    bevelSegments: 1,
    curveSegments: 2,
  });
  geometry.center();
  return geometry;
}

/** Organic bridge outline — a soft triangular island with rounded corners. */
function bridgeGeometry(points: [number, number][], thickness: number) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const [cx, cy] = points[i - 1];
    const [x, y] = points[i];
    shape.quadraticCurveTo((cx + x) / 2 + (y - cy) * 0.12, (cy + y) / 2 - (x - cx) * 0.12, x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.computeVertexNormals();
  return geometry;
}

type Jewel = { x: number; y: number; z: number; r: number };

export function Calibre() {
  const group = useRef<THREE.Group>(null);
  const train = useRef<THREE.Group>(null);
  const escape = useRef<THREE.Group>(null);
  const balance = useRef<THREE.Group>(null);

  const kit = useMemo(() => {
    const stripes = createStripeTexture();

    const plate = new THREE.MeshStandardMaterial({
      color: "#9a9ba2",
      map: stripes,
      roughness: 0.42,
      metalness: 0.95,
      envMapIntensity: 1.1,
      transparent: true,
      opacity: 0,
    });
    const bridge = new THREE.MeshStandardMaterial({
      color: "#b8bac2",
      map: stripes,
      roughness: 0.3,
      metalness: 1,
      envMapIntensity: 1.35,
      transparent: true,
      opacity: 0,
    });
    const brass = new THREE.MeshStandardMaterial({
      color: "#c9a44c",
      roughness: 0.28,
      metalness: 1,
      envMapIntensity: 1.5,
      transparent: true,
      opacity: 0,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: "#1f3f7a",
      roughness: 0.14,
      metalness: 1,
      envMapIntensity: 1.8,
      transparent: true,
      opacity: 0,
    });
    const ruby = new THREE.MeshStandardMaterial({
      color: "#8d1330",
      emissive: new THREE.Color("#5d0a1c"),
      emissiveIntensity: 0.7,
      roughness: 0.12,
      metalness: 0.2,
      transparent: true,
      opacity: 0,
    });

    const geometry = {
      plate: new THREE.CylinderGeometry(0.83, 0.83, 0.03, 64),
      wheelBig: wheelGeometry(0.3, 48, 0.018),
      wheelMid: wheelGeometry(0.21, 36, 0.016),
      wheelSmall: wheelGeometry(0.14, 24, 0.014),
      escape: wheelGeometry(0.1, 15, 0.012),
      balanceRim: new THREE.TorusGeometry(0.2, 0.018, 8, 40),
      balanceSpoke: new THREE.BoxGeometry(0.38, 0.018, 0.012),
      hairspring: new THREE.TorusGeometry(0.075, 0.004, 6, 44),
      arbor: new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10),
      jewel: new THREE.CylinderGeometry(0.026, 0.026, 0.012, 12),
      screw: new THREE.CylinderGeometry(0.022, 0.022, 0.014, 10),
      barrel: new THREE.CylinderGeometry(0.33, 0.33, 0.05, 48),
      bridgeA: bridgeGeometry(
        [
          [-0.62, 0.1],
          [-0.18, 0.44],
          [0.3, 0.36],
          [0.46, 0.02],
          [0.12, -0.14],
          [-0.4, -0.12],
          [-0.62, 0.1],
        ],
        0.035,
      ),
      bridgeB: bridgeGeometry(
        [
          [-0.1, -0.24],
          [0.34, -0.3],
          [0.6, -0.56],
          [0.2, -0.72],
          [-0.28, -0.56],
          [-0.1, -0.24],
        ],
        0.035,
      ),
    };

    const materials = { plate, bridge, brass, steel, ruby };
    return { geometry, materials, stripes };
  }, []);

  useEffect(
    () => () => {
      Object.values(kit.geometry).forEach((g) => g.dispose());
      Object.values(kit.materials).forEach((m) => m.dispose());
      kit.stripes.dispose();
    },
    [kit],
  );

  /** 31 rubies, scattered on the plate in plausible train positions. */
  const jewels = useMemo<Jewel[]>(() => {
    const seeded: Jewel[] = [
      { x: 0.0, y: 0.0, z: 0, r: 1 },
      { x: -0.3, y: 0.18, z: 0, r: 1 },
      { x: 0.26, y: 0.26, z: 0, r: 1 },
      { x: 0.16, y: -0.5, z: 0, r: 1 },
      { x: -0.42, y: -0.3, z: 0, r: 1 },
    ];
    for (let i = seeded.length; i < 31; i++) {
      const angle = i * 2.399963; // golden-angle scatter
      const radius = 0.16 + 0.58 * Math.sqrt(i / 31);
      seeded.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0, r: 1 });
    }
    return seeded;
  }, []);

  useFrame((_, delta) => {
    const reveal = clamp01(activeSample.exhibition * 1.15);
    const root = group.current;
    if (!root) return;

    root.visible = reveal > 0.01;
    const materials = kit.materials;
    materials.plate.opacity = reveal;
    materials.bridge.opacity = reveal;
    materials.brass.opacity = reveal;
    materials.steel.opacity = reveal;
    materials.ruby.opacity = reveal;
    root.position.z = 0.05 * (1 - reveal);

    if (!root.visible) return;

    // A calibre only lives when it runs: the train turns, the balance beats.
    const speed = story.reducedMotion ? 0 : 1;
    if (train.current) train.current.rotation.z -= delta * 0.22 * speed;
    if (escape.current) escape.current.rotation.z += delta * 1.6 * speed;
    if (balance.current) {
      const t = performance.now() / 1000;
      balance.current.rotation.z = story.reducedMotion ? 0 : Math.sin(t * Math.PI * 2 * 2) * 0.85;
    }
  });

  const { geometry: g, materials: m } = kit;

  return (
    <group ref={group} name="calibre-a01">
      {/* main plate, perlaged */}
      <mesh geometry={g.plate} material={m.plate} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.1]} />

      {/* barrel under the upper bridge */}
      <mesh geometry={g.barrel} material={m.brass} rotation={[Math.PI / 2, 0, 0]} position={[-0.26, 0.2, -0.128]} />

      {/* going train */}
      <group ref={train} position={[0.18, 0.06, -0.142]}>
        <mesh geometry={g.wheelBig} material={m.brass} />
      </group>
      <group position={[-0.02, -0.34, -0.142]}>
        <mesh geometry={g.wheelMid} material={m.brass} rotation={[0, 0, 0.4]} />
      </group>
      <group position={[0.34, -0.4, -0.142]}>
        <mesh geometry={g.wheelSmall} material={m.brass} />
      </group>
      <group ref={escape} position={[0.44, -0.62, -0.142]}>
        <mesh geometry={g.escape} material={m.steel} />
      </group>

      {/* bridges, laid over the train */}
      <mesh geometry={g.bridgeA} material={m.bridge} position={[0, 0.06, -0.176]} />
      <mesh geometry={g.bridgeB} material={m.bridge} position={[0, 0.02, -0.176]} />

      {/* balance assembly */}
      <group position={[-0.34, -0.42, -0.192]}>
        <group ref={balance}>
          <mesh geometry={g.balanceRim} material={m.brass} />
          <mesh geometry={g.balanceSpoke} material={m.brass} />
          <mesh geometry={g.balanceSpoke} material={m.brass} rotation={[0, 0, Math.PI / 2]} />
        </group>
        <mesh geometry={g.hairspring} material={m.steel} position={[0, 0, -0.02]} />
        <mesh geometry={g.arbor} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
      </group>

      {/* 31 rubies */}
      {jewels.map((jewel, index) => (
        <mesh
          key={index}
          geometry={g.jewel}
          material={m.ruby}
          rotation={[Math.PI / 2, 0, 0]}
          position={[jewel.x, jewel.y, -0.184]}
        />
      ))}

      {/* blued screws around the rim */}
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2 + 0.3;
        return (
          <mesh
            key={`screw-${index}`}
            geometry={g.screw}
            material={m.steel}
            rotation={[Math.PI / 2, 0, 0]}
            position={[Math.cos(angle) * 0.72, Math.sin(angle) * 0.72, -0.182]}
          />
        );
      })}
    </group>
  );
}
