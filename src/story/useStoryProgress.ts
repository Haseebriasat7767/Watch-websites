import { useEffect } from "react";
import { locate, publishChapter, story } from "./storyState";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The scroll engine
 * ─────────────────────────────────────────────────────────────────────────────
 *  A single passive listener records the raw offset; a single rAF loop damps it
 *  and writes the result onto the `story` bus. React is told about the chapter
 *  change and nothing else — no state update ever happens per frame, so the
 *  3D tree is never rebuilt while scrolling.
 *
 *  A `subscribers` list lets DOM-side consumers (narrative fades, progress
 *  rail, atmosphere layers) mutate their own elements inside the same tick,
 *  which keeps HTML and WebGL frame-locked.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type FrameSubscriber = (state: typeof story, delta: number) => void;

const subscribers = new Set<FrameSubscriber>();

export function subscribeFrame(subscriber: FrameSubscriber) {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

function readProgress() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / max));
}

/** Boots the engine. Mount exactly once, at the root of the experience. */
export function useStoryProgress(reducedMotion: boolean) {
  useEffect(() => {
    story.reducedMotion = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    story.raw = readProgress();
    story.progress = story.raw;

    const onScroll = () => {
      story.raw = readProgress();
    };
    const onPointer = (event: PointerEvent) => {
      story.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      story.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const onResize = () => {
      story.raw = readProgress();
    };

    const tick = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;

      const previous = story.progress;
      // Critically damped follow: instant enough to feel direct, smooth enough
      // that a trackpad flick reads as a dolly rather than a jump cut.
      const lambda = story.reducedMotion ? 22 : 7.5;
      story.progress = previous + (story.raw - previous) * (1 - Math.exp(-lambda * delta));
      story.velocity = delta > 0 ? (story.progress - previous) / delta : 0;

      const located = locate(story.progress);
      story.chapter = located.chapter;
      story.local = located.local;
      publishChapter(located.chapter);

      subscribers.forEach((subscriber) => subscriber(story, delta));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);
}

/** Scrolls the page to the start of a chapter's readable beat. */
export function scrollToChapter(index: number, chapters: { start: number; end: number }[]) {
  const chapter = chapters[index];
  if (!chapter) return;
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  const target = (chapter.start + (chapter.end - chapter.start) * 0.16) * max;
  window.scrollTo({ top: target, behavior: story.reducedMotion ? "auto" : "smooth" });
}
