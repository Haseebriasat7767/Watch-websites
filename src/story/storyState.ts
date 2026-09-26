import { useSyncExternalStore } from "react";
import { STORY_CHAPTERS } from "./storyConfig";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The scroll bus
 * ─────────────────────────────────────────────────────────────────────────────
 *  One mutable object, read by the render loop and written by a single rAF
 *  ticker. Nothing here triggers a React render: components that genuinely need
 *  to re-render (the chapter counter, the contextual material panel) subscribe
 *  to the *coarse* signals below, which only fire when the chapter changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type StoryRuntime = {
  /** Raw normalised page progress, 0 → 1. */
  raw: number;
  /** Critically-damped progress actually driving the scene. */
  progress: number;
  /** Index of the chapter currently on screen. */
  chapter: number;
  /** Progress inside the current chapter, 0 → 1. */
  local: number;
  /** Scroll velocity, used for the transition blur. */
  velocity: number;
  /** Accumulated turntable angle (seconds × speed). */
  spin: number;
  /** Pointer-drag yaw offset in radians. */
  dragYaw: number;
  /** Pointer-drag pitch offset in radians. */
  dragPitch: number;
  /** Normalised pointer position for the parallax, −1 → 1. */
  pointerX: number;
  pointerY: number;
  /** User-controlled motion preference. */
  reducedMotion: boolean;
  /** True while the visitor is dragging the timepiece. */
  dragging: boolean;
};

export const story: StoryRuntime = {
  raw: 0,
  progress: 0,
  chapter: 0,
  local: 0,
  velocity: 0,
  spin: 0,
  dragYaw: 0,
  dragPitch: 0,
  pointerX: 0,
  pointerY: 0,
  reducedMotion: false,
  dragging: false,
};

/* ── Coarse subscriptions ─────────────────────────────────────────────────── */
const chapterListeners = new Set<() => void>();
let chapterSnapshot = 0;

export function publishChapter(index: number) {
  if (index === chapterSnapshot) return;
  chapterSnapshot = index;
  chapterListeners.forEach((listener) => listener());
}

export function useActiveChapter(): number {
  return useSyncExternalStore(
    (listener) => {
      chapterListeners.add(listener);
      return () => chapterListeners.delete(listener);
    },
    () => chapterSnapshot,
    () => 0,
  );
}

/** Resolves a normalised progress value to `{ chapter, local }`. */
export function locate(progress: number) {
  const clamped = Math.min(0.999999, Math.max(0, progress));
  for (let i = 0; i < STORY_CHAPTERS.length; i++) {
    const chapter = STORY_CHAPTERS[i];
    if (clamped < chapter.end || i === STORY_CHAPTERS.length - 1) {
      const span = Math.max(1e-6, chapter.end - chapter.start);
      return { chapter: i, local: Math.min(1, Math.max(0, (clamped - chapter.start) / span)) };
    }
  }
  return { chapter: 0, local: 0 };
}
