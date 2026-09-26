import { useCallback, useEffect, useState } from "react";
import { CASINGS, FACES, type MaterialOption } from "../lib/config";
import type { WatchConfig } from "../three/materials";
import { StoryCanvas } from "./StoryCanvas";
import { StoryOverlay } from "./StoryOverlay";
import { StorySections } from "./StorySections";
import { StoryFallback } from "./StoryFallback";
import { STORY_CHAPTERS, TOTAL_SPAN } from "./storyConfig";
import { subscribeFrame, useStoryProgress } from "./useStoryProgress";
import { useMotionPreference } from "./useReducedMotion";
import { useAtelierAudio } from "./useAtelierAudio";
import { activeSample } from "../three/CameraWaypoints";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AURELIS · Laureate No. 01 — an interactive exhibition
 * ─────────────────────────────────────────────────────────────────────────────
 *  The root of the experience. It owns four things and nothing else:
 *
 *    · the scroll engine (one listener, one rAF loop, zero renders),
 *    · the persistent WebGL canvas,
 *    · the narrative layer above it,
 *    · the chrome at the edges.
 *
 *  The 3D scene is mounted once for the whole visit. Scroll never touches
 *  React state; only a chapter change does.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    return Boolean(context);
  } catch {
    return false;
  }
}

/**
 * The atmosphere behind the render: a champagne halo that breathes with the
 * chapter, plus a focus blur that pulls the frame soft while the camera
 * travels — a poor man's depth of field that costs no GPU passes.
 */
function AtmosphereLayer() {
  useEffect(() => {
    let lastFocus = -1;
    let lastHalo = -1;
    let lastGlow = -1;
    return subscribeFrame((state) => {
        // Written on the document element so both the atmosphere layers and the
        // canvas (which is a sibling) inherit the same values.
        const node = document.documentElement;
        const glow = Math.round(activeSample.atmosphere * 50) / 50;
        const halo = Math.round(activeSample.halo * 50) / 50;
        if (halo !== lastHalo) {
          lastHalo = halo;
          node.style.setProperty("--halo", String(halo));
        }
        if (glow !== lastGlow) {
          lastGlow = glow;
          node.style.setProperty("--glow", String(glow));
        }
        // Focus pull: the frame softens only while the camera is genuinely
        // travelling. Quantised so it is not a fresh repaint every frame.
        const raw = state.reducedMotion ? 0 : Math.max(0, Math.abs(state.velocity) - 0.06) * 9;
        const blur = Math.round(Math.min(2.4, raw) * 4) / 4;
        if (blur !== lastFocus) {
          lastFocus = blur;
          node.style.setProperty("--focus", `${blur}px`);
        }
      });
  }, []);

  return (
    <div className="story-atmosphere" aria-hidden="true">
      <span className="story-atmosphere__halo" />
      <span className="story-atmosphere__vignette" />
      <span className="story-atmosphere__grain" />
    </div>
  );
}

export default function ImmersiveStory() {
  const [supported] = useState(detectWebGL);
  const [lost, setLost] = useState(false);
  const [ready, setReady] = useState(false);
  const { reduced, toggle: toggleMotion } = useMotionPreference();
  const { enabled: sound, toggle: toggleSound } = useAtelierAudio();

  const [config, setConfig] = useState<WatchConfig>(() => ({
    casing: CASINGS[0],
    face: FACES[0],
  }));

  useStoryProgress(reduced);

  const onCasing = useCallback((casing: MaterialOption) => setConfig((c) => ({ ...c, casing })), []);
  const onFace = useCallback((face: MaterialOption) => setConfig((c) => ({ ...c, face })), []);
  const onReady = useCallback(() => setReady(true), []);
  const onFail = useCallback(() => setLost(true), []);

  /* The dark exhibition palette is owned by the document while we are mounted. */
  useEffect(() => {
    document.documentElement.classList.add("story-root");
    return () => document.documentElement.classList.remove("story-root");
  }, []);

  /* Keyboard: page through the exhibition without a mouse wheel. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (event.key !== "PageDown" && event.key !== "PageUp") return;
      // Native paging already works; this only keeps the step aligned to a beat.
      event.preventDefault();
      const step = window.innerHeight * 0.92;
      window.scrollBy({ top: event.key === "PageDown" ? step : -step, behavior: reduced ? "auto" : "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reduced]);

  if (!supported || lost) {
    return (
      <div className="story-app story-app--static">
        <StoryFallback reason={supported ? "lost" : "unsupported"} />
      </div>
    );
  }

  return (
    <div className="story-app" style={{ "--total-span": TOTAL_SPAN } as React.CSSProperties}>
      <a className="story-skip" href="#chapter-closing">
        Skip to the closing chapter
      </a>

      <AtmosphereLayer />
      <StoryCanvas config={config} onReady={onReady} onFail={onFail} />

      <div className={`story-veil ${ready ? "is-gone" : ""}`} role="status" aria-live="polite">
        <span className="story-veil__mark">AURELIS</span>
        <span className="story-veil__text">{ready ? "" : "Preparing the atelier"}</span>
      </div>

      <main className="story-main" id="exhibition">
        <h1 className="sr-only">
          Aurelis Laureate No. 01 — an interactive exhibition in {STORY_CHAPTERS.length} chapters
        </h1>
        <StorySections mode="immersive" />
      </main>

      <StoryOverlay
        config={config}
        onCasing={onCasing}
        onFace={onFace}
        sound={sound}
        onSound={toggleSound}
        reducedMotion={reduced}
        onMotion={toggleMotion}
      />
    </div>
  );
}
