import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ProceduralWatch, type WatchPartRefs } from "./ProceduralWatch";
import { Calibre } from "./Calibre";
import { activeSample, applyFraming, clamp01, damp, sampleStory } from "./CameraWaypoints";
import { story } from "../story/storyState";
import type { WatchConfig } from "./materials";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The stage
 * ─────────────────────────────────────────────────────────────────────────────
 *  One sampler, one watch, zero re-renders.
 *
 *    scroll progress → chapter progress → camera waypoint interpolation
 *      → watch position / rotation / scale → lighting + narrative
 *
 *  `Sampler` runs first each frame and writes the shared `activeSample`; the
 *  camera rig, the lighting rig, the atmosphere and the calibre all read from
 *  it. Nothing in this subtree is rebuilt while scrolling — the materials, the
 *  geometry and the instanced bracelet are created exactly once.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Writes the frame's story sample before anything else consumes it. */
function Sampler() {
  useFrame(() => {
    sampleStory(story.progress, activeSample, story.reducedMotion);
  });
  return null;
}

/** Scroll-driven dolly with pointer parallax and optional drag orbit. */
function CameraRig() {
  const position = useRef(new THREE.Vector3(...activeSample.position));
  const target = useRef(new THREE.Vector3(...activeSample.target));
  const parallax = useRef(new THREE.Vector2());
  const settled = useRef(false);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const aim = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const s = activeSample;
    const lambda = story.reducedMotion ? 12 : 5.5;

    // The first frame adopts the opening pose outright — no dolly on load.
    if (!settled.current) {
      settled.current = true;
      position.current.set(...s.position);
      target.current.set(...s.target);
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }

    position.current.x = damp(position.current.x, s.position[0], lambda, delta);
    position.current.y = damp(position.current.y, s.position[1], lambda, delta);
    position.current.z = damp(position.current.z, s.position[2], lambda, delta);
    target.current.x = damp(target.current.x, s.target[0], lambda, delta);
    target.current.y = damp(target.current.y, s.target[1], lambda, delta);
    target.current.z = damp(target.current.z, s.target[2], lambda, delta);

    // Breath: a hand-held drift, and a parallax that answers the pointer.
    const wantX = story.reducedMotion ? 0 : story.pointerX * 0.16;
    const wantY = story.reducedMotion ? 0 : -story.pointerY * 0.1;
    parallax.current.x = damp(parallax.current.x, wantX, 2.4, delta);
    parallax.current.y = damp(parallax.current.y, wantY, 2.4, delta);

    const breath = story.reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.22) * 0.035;

    // Compose the frame: truck the rig so the timepiece lands clear of the
    // narrative column, then apply the parallax and the hand-held breath.
    scratch.copy(position.current);
    aim.copy(target.current);
    applyFraming(scratch, aim, s, state.size.width / Math.max(1, state.size.height));
    scratch.x += parallax.current.x;
    scratch.y += parallax.current.y + breath;
    camera.position.copy(scratch);
    camera.lookAt(aim);

    const fov = damp(camera.fov, s.fov, lambda, delta);
    if (Math.abs(fov - camera.fov) > 0.0005) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/** Fits the composition to the viewport — portrait phones get a smaller stage. */
function fitFactor(width: number, height: number) {
  const aspect = width / Math.max(1, height);
  return Math.min(1, Math.max(0.6, aspect / 0.78));
}

export function StoryWatchStage({ config }: { config: WatchConfig }) {
  const root = useRef<THREE.Group>(null);
  const back = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Mesh>(null);
  const bracelet = useRef<THREE.Group>(null);
  const gl = useThree((state) => state.gl);

  const parts: WatchPartRefs = useMemo(
    () => ({ back, rotor, crystal, bracelet }),
    [],
  );

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.62;
  }, [gl]);

  useFrame((state, delta) => {
    const group = root.current;
    if (!group) return;
    const s = activeSample;

    // Turntable: accumulated, so a change of speed never snaps the angle.
    if (!story.reducedMotion && !story.dragging) story.spin += delta * s.spin;

    // Drag orbit eases back to the scripted composition once released.
    if (!story.dragging) {
      story.dragYaw = damp(story.dragYaw, 0, 0.9, delta);
      story.dragPitch = damp(story.dragPitch, 0, 0.9, delta);
    }

    const fit = fitFactor(state.size.width, state.size.height);
    const lambda = story.reducedMotion ? 12 : 5.5;

    group.position.x = damp(group.position.x, s.watchPosition[0] * fit, lambda, delta);
    group.position.y = damp(group.position.y, s.watchPosition[1], lambda, delta);
    group.position.z = damp(group.position.z, s.watchPosition[2], lambda, delta);

    const targetScale = s.watchScale * fit;
    const scale = damp(group.scale.x, targetScale, lambda, delta);
    group.scale.setScalar(scale);

    group.rotation.x = damp(group.rotation.x, s.watchRotation[0] + story.dragPitch, lambda, delta);
    group.rotation.z = damp(group.rotation.z, s.watchRotation[2], lambda, delta);
    // Yaw is authored + turntable + drag, so it must not be damped against a
    // moving accumulator — it is composed directly.
    group.rotation.y = s.watchRotation[1] + story.spin + story.dragYaw;

    /* ── Sub-assemblies ──────────────────────────────────────────────────── */
    const open = clamp01(s.exhibition);
    if (back.current) {
      back.current.position.z = -0.95 * open;
      back.current.rotation.x = -0.5 * open;
      back.current.visible = open < 0.995;
    }
    if (rotor.current && !story.reducedMotion) {
      // The weight winds itself: a slow, uneven oscillation.
      const t = state.clock.elapsedTime;
      rotor.current.rotation.z = Math.sin(t * 0.55) * 1.35 + Math.sin(t * 0.21) * 0.6;
    }
    if (bracelet.current) {
      const sway = story.reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.5) * 0.012;
      bracelet.current.rotation.x = sway;
    }
    if (crystal.current) {
      // The sapphire is dissolved while the camera travels through it.
      const front = state.camera.position.z;
      crystal.current.visible = front > 0.35 || open < 0.05;
    }
  });

  return (
    <>
      <Sampler />
      <CameraRig />
      <group ref={root} name="story-watch">
        <ProceduralWatch config={config} parts={parts}>
          <Calibre />
        </ProceduralWatch>
      </group>
    </>
  );
}
