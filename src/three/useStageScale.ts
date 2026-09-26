import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import { SCENE } from "../lib/config";

/**
 * Hero framing.
 *
 * The camera matrix is locked (position [0, 0, 3.5], FOV 45) and must not be
 * touched — so the *timepiece* is scaled instead. Solving the frustum for the
 * smaller of the two axes means the composition is identical on a 430 px phone
 * and a 4K display: the case always occupies the same share of the frame, and
 * the bracelet always sweeps just out of view.
 *
 * The studio floor consumes the same value so the watch keeps its fixed height
 * above the stage — and therefore its micro-shadow — at every breakpoint.
 */
export function useStageScale() {
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;

  return useMemo(() => {
    const distance = Math.abs(SCENE.camera.position[2]);
    const fov = camera.fov || SCENE.camera.fov;
    const halfHeight = distance * Math.tan((fov / 2) * (Math.PI / 180));
    const halfWidth = halfHeight * (size.width / Math.max(size.height, 1));
    return Math.max(
      0.3,
      Math.min(1, halfHeight / SCENE.fitRadius, halfWidth / SCENE.fitRadius),
    );
  }, [size.width, size.height, camera.fov]);
}

/**
 * Distance from the case to the studio floor, before the stage scale. Sized so
 * the lowest bracelet link clears the plane with margin at every camera angle
 * inside the polar clamp, while the key spotlight still plants the casing's
 * micro-shadow directly beneath it.
 */
export const FLOOR_DROP = 2.15;
