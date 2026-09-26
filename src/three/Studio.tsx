import { Component, Suspense, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { BakeShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { SCENE } from "../lib/config";
import { FLOOR_DROP, useStageScale } from "./useStageScale";
import { useWatchMaterials } from "./materials";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Studio lighting engine
 * ─────────────────────────────────────────────────────────────────────────────
 *  No default directional/ambient pair — a real three-point studio array:
 *
 *    ENVIRONMENT   preset="studio" @ 1.5 → the softbox wall that makes polished
 *                  metal read as metal (IBL is the whole ball game for gold).
 *    AMBIENT       0.3, pure base fill so unlit faces never crush to black.
 *    KEY SPOT      above and slightly front-right, the only shadow caster: it
 *                  throws the micro-shadow directly beneath the casing.
 *    RIM SPOTS     cool + warm kickers behind the case to trace the coin edge.
 *
 *  If the HDR preset cannot be fetched (offline, restricted network), the error
 *  boundary below swaps in a Lightformer softbox rig — identical lighting
 *  language, zero network dependency.
 * ─────────────────────────────────────────────────────────────────────────────
 */

class EnvironmentBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Offline-safe studio: a rig of emissive softboxes rendered into the IBL. */
function LightformerStudio() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#05050a"]} />
      <Lightformer
        form="rect"
        intensity={5}
        color="#ffffff"
        position={[0, 5, -2]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[9, 9, 1]}
      />
      <Lightformer
        form="rect"
        intensity={3.2}
        color="#fff3dd"
        position={[-5, 1.4, 1.6]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[6, 3, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2.4}
        color="#9fb6ff"
        position={[5, 1.1, 1.2]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[6, 3, 1]}
      />
      <Lightformer
        form="circle"
        intensity={4}
        color="#ffd9a0"
        position={[0, 2.4, 5]}
        scale={[4, 4, 1]}
      />
      <Lightformer
        form="circle"
        intensity={1.6}
        color="#ffffff"
        position={[0, -4, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[8, 8, 1]}
      />
    </Environment>
  );
}

/** The HDR preset, isolated in its own boundary + Suspense lane. */
function StudioHdr() {
  return (
    <EnvironmentBoundary fallback={<LightformerStudio />}>
      <Suspense fallback={null}>
        {/* drei v10 renamed this prop `intensity` → `environmentIntensity`;
            the studio-preset strength stays locked at 1.5 either way. */}
        <Environment
          preset="studio"
          environmentIntensity={SCENE.environmentIntensity}
        />
      </Suspense>
    </EnvironmentBoundary>
  );
}

export function StudioLights() {
  return (
    <>
      <StudioHdr />

      {/* base fill — locked at 0.3 */}
      <ambientLight intensity={SCENE.ambientIntensity} color="#c9d2e8" />

      {/* key: the only shadow caster in the studio */}
      <spotLight
        position={[0.9, 3.5, 2.4]}
        angle={0.52}
        penumbra={1}
        decay={2}
        distance={14}
        intensity={52}
        color="#fff6e6"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.022}
        shadow-camera-near={0.6}
        shadow-camera-far={12}
        shadow-radius={4}
      />

      {/* rim kickers — cool left, warm right; they graze the coin edge */}
      <spotLight
        position={[-3.6, 1.4, -2.1]}
        angle={0.9}
        penumbra={1}
        decay={2}
        distance={16}
        intensity={26}
        color="#7f9dff"
      />
      <spotLight
        position={[3.4, 0.6, -1.4]}
        angle={0.9}
        penumbra={1}
        decay={2}
        distance={16}
        intensity={22}
        color="#ffb46b"
      />

      {/* soft top fill that keeps the bezel's flutes from going flat */}
      <pointLight
        position={[0, 2.4, 1.2]}
        intensity={7}
        decay={2}
        distance={12}
        color="#ffffff"
      />
    </>
  );
}

/**
 * Dark polished studio floor — dissolves into the void at its rim.
 *
 * Placed 0.8 world units beneath the casing: close enough for the key
 * spotlight's micro-shadow to read as *directly* under the watch, far enough
 * that the polar clamp (max 100°) can never swing the camera beneath it.
 */
export function StudioFloor() {
  const { floor } = useWatchMaterials();
  const scale = useStageScale();
  const geometry = useMemo(() => new THREE.CircleGeometry(14, 64), []);
  const gl = useThree((state) => state.gl);

  // The stage never moves, so the shadow map is rendered once and then frozen.
  useMemo(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl]);

  return (
    <mesh
      geometry={geometry}
      material={floor}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -FLOOR_DROP * scale, 0]}
      receiveShadow
    />
  );
}

/**
 * Shadow maps are baked once (the timepiece and the stage are static — only the
 * camera orbits), which is what removes the biggest per-frame GPU cost on
 * mobile and keeps the SoC out of its thermal-throttling band.
 */
export function StaticShadowBake() {
  return <BakeShadows />;
}
