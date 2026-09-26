import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Preload } from "@react-three/drei";
import * as THREE from "three";
import { WatchMaterialsProvider, useWatchMaterialSet, type WatchConfig } from "../three/materials";
import { StoryWatchStage } from "../three/StoryWatchStage";
import { StoryLighting } from "../three/StoryLighting";
import { Atmosphere } from "../three/Atmosphere";
import { publishTelemetry } from "../lib/telemetry";
import { SCENE } from "../lib/config";
import { STORY_CHAPTERS } from "./storyConfig";
import { story } from "./storyState";
import { activeSample } from "../three/CameraWaypoints";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The persistent canvas
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fixed behind the narrative for the whole journey: mounted once, never
 *  unmounted, never rebuilt. The alpha buffer lets the CSS atmosphere layers
 *  (halo, grain, vignette) sit underneath the render, which is how the void
 *  gets depth without a post-processing pass.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Rolling FPS window → render scale, so mid-range phones stay at 60. */
function AdaptiveQuality() {
  const gl = useThree((state) => state.gl);
  const setDpr = useThree((state) => state.setDpr);
  const frames = useRef(0);
  const last = useRef(performance.now());
  const tier = useRef(1);

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    const elapsed = now - last.current;
    if (elapsed < 1000) return;

    const fps = (frames.current * 1000) / elapsed;
    frames.current = 0;
    last.current = now;

    const ceiling = Math.min(window.devicePixelRatio || 1, SCENE.dpr[1]);
    const ladder = [0.85, 1.2, ceiling];
    if (fps < 46 && tier.current > 0) tier.current -= 1;
    else if (fps > 57 && tier.current < ladder.length - 1) tier.current += 1;

    const next = Math.min(ladder[tier.current], ceiling);
    if (Math.abs(next - gl.getPixelRatio()) > 0.01) setDpr(next);
    publishTelemetry({ fps: Math.round(fps), dpr: gl.getPixelRatio() });
  });

  return null;
}

/** Fog dissolves the bracelet's far links into the gallery's darkness. */
function Void() {
  const fog = useRef<THREE.Fog>(null);
  useFrame(() => {
    // Only the far links of the bracelet and the dust should dissolve — the
    // timepiece itself must never be fogged, at any camera distance.
    if (fog.current) fog.current.far = 24 + activeSample.atmosphere * 10;
  });
  return <fog ref={fog} attach="fog" args={["#050506", 9, 26]} />;
}

/** Signals the first genuinely painted frame. */
function FirstFrame({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    let raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        onReady();
        raf = 0;
      }),
    );
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [onReady]);
  return null;
}

function Scene({ config, onReady }: { config: WatchConfig; onReady: () => void }) {
  const materials = useWatchMaterialSet();
  return (
    <WatchMaterialsProvider value={materials}>
      <Void />
      <StoryLighting />
      <Suspense fallback={null}>
        <StoryWatchStage config={config} />
      </Suspense>
      <Atmosphere />
      <AdaptiveQuality />
      <FirstFrame onReady={onReady} />
      <Preload all />
    </WatchMaterialsProvider>
  );
}

/** Any WebGL failure hands over to the static exhibition. */
class GLBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function StoryCanvas({
  config,
  onReady,
  onFail,
}: {
  config: WatchConfig;
  onReady: () => void;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  /**
   * Drag-to-orbit, wired at the DOM level so it costs nothing per frame and so
   * `touch-action: pan-y` can hand vertical gestures back to the page: on a
   * phone you scroll the story and turn the watch with the same finger.
   */
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let pointer = -1;
    let lastX = 0;
    let lastY = 0;

    const draggable = () => STORY_CHAPTERS[story.chapter]?.draggable === true;

    const down = (event: PointerEvent) => {
      if (!draggable() || story.reducedMotion) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      story.dragging = true;
      node.setPointerCapture?.(event.pointerId);
      node.classList.add("is-grabbing");
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      story.dragYaw += dx * 0.006;
      story.dragPitch = Math.max(-0.5, Math.min(0.5, story.dragPitch + dy * 0.003));
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = -1;
      story.dragging = false;
      node.classList.remove("is-grabbing");
    };

    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div className="story-canvas" ref={host} aria-hidden="true">
      <GLBoundary onFail={onFail}>
        <Canvas
          dpr={[0.85, SCENE.dpr[1]]}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false,
          }}
          shadows
          camera={{ position: [0, 0.5, 9.4], fov: 34, near: 0.05, far: 60 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.62;
            gl.domElement.addEventListener("webglcontextlost", onFail, { once: true });
          }}
          fallback={null}
        >
          <Scene config={config} onReady={onReady} />
        </Canvas>
      </GLBoundary>
    </div>
  );
}
