import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { activeSample, damp } from "./CameraWaypoints";
import { story } from "../story/storyState";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Atelier air
 * ─────────────────────────────────────────────────────────────────────────────
 *  Eight hundred motes of dust in one additive draw call. They drift upward at
 *  a few millimetres a second and wrap around a bounding box, which is enough
 *  to give the void a sense of volume and scale without any post-processing.
 *
 *  Density follows the story's `atmosphere` channel, so the room breathes as
 *  the visitor moves between chapters. Reduced motion freezes the drift and
 *  keeps the field static.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const COUNT = 800;
const BOX = { x: 16, y: 9, z: 12 };

function spriteTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,244,222,1)");
  gradient.addColorStop(0.35, "rgba(255,230,190,0.45)");
  gradient.addColorStop(1, "rgba(255,225,180,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function Atmosphere() {
  const points = useRef<THREE.Points>(null);

  const kit = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    const sizes = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * BOX.x;
      positions[i * 3 + 1] = (Math.random() - 0.5) * BOX.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
      speeds[i] = 0.012 + Math.random() * 0.055;
      sizes[i] = 0.012 + Math.random() * 0.042;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const map = spriteTexture();
    const material = new THREE.PointsMaterial({
      map,
      color: new THREE.Color("#f3dcb0"),
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry, material, speeds, positions, map };
  }, []);

  useEffect(
    () => () => {
      kit.geometry.dispose();
      kit.material.dispose();
      kit.map.dispose();
    },
    [kit],
  );

  useFrame((_, delta) => {
    const target = 0.16 + activeSample.atmosphere * 0.5;
    kit.material.opacity = damp(kit.material.opacity, target, 3, delta);

    if (story.reducedMotion) return;
    const array = kit.positions;
    const drift = delta;
    for (let i = 0; i < COUNT; i++) {
      const index = i * 3;
      array[index + 1] += kit.speeds[i] * drift;
      array[index] += Math.sin((array[index + 1] + i) * 0.35) * 0.0016;
      if (array[index + 1] > BOX.y / 2) array[index + 1] = -BOX.y / 2;
    }
    kit.geometry.attributes.position.needsUpdate = true;
    if (points.current) points.current.rotation.y += delta * 0.006;
  });

  return <points ref={points} geometry={kit.geometry} material={kit.material} frustumCulled={false} />;
}
