import { useEffect, useRef } from "react";
import { STORY_CHAPTERS } from "./storyConfig";
import { subscribeFrame, scrollToChapter } from "./useStoryProgress";
import { useActiveChapter } from "./storyState";

/**
 * The rail: a hairline of gold that fills as the visitor walks the exhibition,
 * with one keyboard-reachable marker per chapter. The fill is written straight
 * to the element's transform — no state, no renders.
 */
export function StoryProgress() {
  const fill = useRef<HTMLSpanElement>(null);
  const active = useActiveChapter();

  useEffect(
    () =>
      subscribeFrame((state) => {
        if (fill.current) fill.current.style.transform = `scaleX(${state.progress.toFixed(4)})`;
      }),
    [],
  );

  return (
    <nav className="story-rail" aria-label="Exhibition chapters">
      <span className="story-rail__track" aria-hidden="true">
        <span className="story-rail__fill" ref={fill} />
      </span>
      <ol className="story-rail__marks">
        {STORY_CHAPTERS.map((chapter, index) => (
          <li key={chapter.id} style={{ left: `${chapter.start * 100}%` }}>
            <button
              type="button"
              className={`story-rail__mark ${index === active ? "is-active" : ""}`}
              aria-current={index === active ? "step" : undefined}
              aria-label={`Chapter ${chapter.index} — ${chapter.title}`}
              onClick={() => scrollToChapter(index, STORY_CHAPTERS)}
            >
              <span aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
