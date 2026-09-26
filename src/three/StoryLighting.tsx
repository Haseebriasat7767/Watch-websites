import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { activeSample, damp } from "./CameraWaypoints";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Exhibition lighting
 * ─────────────────────────────────────────────────────────────────────────────
 *  A dark gallery rather than a product studio: almost no fill, one raking key,
 *  a champagne rim that draws the coin edge out of the black, and a cold kicker
 *  opposite it for separation.
 *
 *  The IBL is baked from Lightformers at 256² on the first frame — no HDR is
 *  fetched, so the room is identical offline and costs nothing per frame. Every
 *  intensity is driven from the story sample inside `useFrame`, which means the
 *  light changes with the scroll without React ever re-rendering.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function StoryLighting() {
  const key = useRef<THREE.SpotLight>(null);
  const rim = useRef<THREE.SpotLight>(null);
  const gold = useRef<THREE.SpotLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const fill = useRef<THREE.PointLight>(null);
  const gl = useThree((state) => state.gl);
  const settled = useRef(false);

  useFrame((state, delta) => {
    const s = activeSample;
    // Frame one adopts the opening mood outright: no bright flash behind the veil.
    if (!settled.current) {
      settled.current = true;
      state.scene.environmentIntensity = s.env;
      gl.toneMappingExposure = s.exposure;
      if (key.current) key.current.intensity = s.keyIntensity;
      if (rim.current) rim.current.intensity = s.rimIntensity;
      if (gold.current) gold.current.intensity = s.goldIntensity;
      if (ambient.current) ambient.current.intensity = s.ambient;
      if (fill.current) fill.current.intensity = s.ambient * 22;
      return;
    }
    // The gallery IBL is what makes polished metal read as metal — dimming it
    // is how the timepiece dissolves into the dark of the opening chapter.
    state.scene.environmentIntensity = damp(state.scene.environmentIntensity ?? 1, s.env, 3.2, delta);
    if (key.current) key.current.intensity = damp(key.current.intensity, s.keyIntensity, 4, delta);
    if (rim.current) rim.current.intensity = damp(rim.current.intensity, s.rimIntensity, 4, delta);
    if (gold.current) gold.current.intensity = damp(gold.current.intensity, s.goldIntensity, 4, delta);
    if (ambient.current) ambient.current.intensity = damp(ambient.current.intensity, s.ambient, 4, delta);
    if (fill.current) fill.current.intensity = damp(fill.current.intensity, s.ambient * 22, 4, delta);
    gl.toneMappingExposure = damp(gl.toneMappingExposure, s.exposure, 4, delta);
  });

  return (
    <>
      {/* Baked gallery IBL: two warm softboxes, one cold wall, a floor bounce. */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#050507"]} />
        <Lightformer form="rect" intensity={1.5} color="#fff1d6" position={[0, 4.2, 2.6]} rotation={[-0.6, 0, 0]} scale={[7, 4, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#ffd9a0" position={[-4.6, 1.2, 1.4]} rotation={[0, Math.PI / 2, 0]} scale={[5, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#8fa6ff" position={[4.8, 0.8, -1.2]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 3, 1]} />
        <Lightformer form="circle" intensity={1.6} color="#ffe7bd" position={[0, 0.4, 5.4]} scale={[3.4, 3.4, 1]} />
        <Lightformer form="circle" intensity={0.35} color="#5a6478" position={[0, -4, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
      </Environment>

      <ambientLight ref={ambient} intensity={0.06} color="#b9c6e4" />

      {/* Key — the only shadow caster, raking from above-front-right. */}
      <spotLight
        ref={key}
        position={[2.4, 3.6, 3.2]}
        angle={0.5}
        penumbra={1}
        decay={2}
        distance={22}
        intensity={8}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />

      {/* Champagne rim: traces the bezel flutes out of the darkness. */}
      <spotLight
        ref={gold}
        position={[-2.6, 1.4, -3.4]}
        angle={1}
        penumbra={1}
        decay={2}
        distance={24}
        intensity={14}
        color="#f0c987"
      />

      {/* Cold separation kicker. */}
      <spotLight
        ref={rim}
        position={[3.4, -1.2, -3.2]}
        angle={1}
        penumbra={1}
        decay={2}
        distance={24}
        intensity={22}
        color="#8ea6ff"
      />

      {/* Whisper of front fill so the dial never crushes to pure black. */}
      <pointLight ref={fill} position={[0, 0.6, 3.4]} intensity={2} decay={2} distance={16} color="#ffffff" />
    </>
  );
}
