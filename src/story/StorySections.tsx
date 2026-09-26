import { useEffect, useRef } from "react";
import { OVERTURE, STORY_CHAPTERS, TEXT_WINDOW } from "./storyConfig";
import { subscribeFrame } from "./useStoryProgress";
import { clamp01, smoothstep } from "../three/CameraWaypoints";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The narrative layer
 * ─────────────────────────────────────────────────────────────────────────────
 *  Nine semantic <section> elements stacked over the canvas. Each one is a real
 *  heading + real prose, so the story is complete to a screen reader, to search
 *  engines and to anyone whose GPU never wakes up.
 *
 *  Their opacity and offset are written directly to the DOM from the same rAF
 *  tick that drives the camera — HTML and WebGL stay frame-locked, and React
 *  renders this tree exactly once.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Props = {
  mode: "immersive" | "static";
};

export function StorySections({ mode }: Props) {
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const media = useRef<(HTMLDivElement | null)[]>([]);
  const overture = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === "static") return;

    return subscribeFrame((state) => {
      const p = state.progress;

      for (let i = 0; i < STORY_CHAPTERS.length; i++) {
        const chapter = STORY_CHAPTERS[i];
        const span = Math.max(1e-6, chapter.end - chapter.start);
        const local = (p - chapter.start) / span;

        // The opening chapter yields the stage to the overture first.
        const inStart = i === 0 ? 0.36 : TEXT_WINDOW.in[0];
        const inEnd = i === 0 ? 0.52 : TEXT_WINDOW.in[1];
        const rising = smoothstep(inStart, inEnd, local);
        const falling = 1 - smoothstep(TEXT_WINDOW.out[0], TEXT_WINDOW.out[1], local);
        const opacity = clamp01(rising * falling);

        const panel = panels.current[i];
        if (panel) {
          panel.style.opacity = opacity.toFixed(3);
          panel.style.transform = `translate3d(0, ${((1 - rising) * 34 - (1 - falling) * 22).toFixed(2)}px, 0)`;
          panel.style.pointerEvents = opacity > 0.65 ? "auto" : "none";
        }

        const layer = media.current[i];
        if (layer) {
          layer.style.opacity = (opacity * 0.88).toFixed(3);
          layer.style.transform = `translate3d(0, ${((1 - rising) * 20).toFixed(2)}px, 0) scale(${(1.06 - rising * 0.05).toFixed(3)})`;
        }
      }

      if (overture.current) {
        const first = STORY_CHAPTERS[0];
        const local = (p - first.start) / Math.max(1e-6, first.end - first.start);
        const out = 1 - smoothstep(0.03, 0.26, local);
        overture.current.style.opacity = out.toFixed(3);
        overture.current.style.transform = `translate3d(0, ${(-out * 0 - (1 - out) * 26).toFixed(2)}px, 0)`;
        overture.current.style.pointerEvents = out > 0.5 ? "auto" : "none";
      }
    });
  }, [mode]);

  return (
    <div className={`story-sections ${mode === "static" ? "is-static" : ""}`}>
      {STORY_CHAPTERS.map((chapter, index) => (
        <section
          key={chapter.id}
          id={`chapter-${chapter.id}`}
          className="story-chapter"
          style={{ "--span": chapter.span } as React.CSSProperties}
          aria-labelledby={`${chapter.id}-title`}
        >
          <div className="story-chapter__stick">
            {index === 0 ? (
              <div className="story-overture" ref={overture}>
                <p className="story-overture__wordmark">{OVERTURE.wordmark}</p>
                <p className="story-overture__model">{OVERTURE.model}</p>
                <p className="story-overture__line">{OVERTURE.line}</p>
                <p className="story-overture__prompt">
                  <span className="story-overture__rule" aria-hidden="true" />
                  {OVERTURE.prompt}
                </p>
              </div>
            ) : null}

            {chapter.media ? (
              <div
                className={`story-media story-media--${chapter.media.placement}`}
                ref={(node) => {
                  media.current[index] = node;
                }}
                aria-hidden="true"
              >
                <img src={chapter.media.src} alt="" loading="lazy" decoding="async" />
              </div>
            ) : null}

            <div
              className={`story-panel story-panel--${chapter.id}`}
              ref={(node) => {
                panels.current[index] = node;
              }}
            >
              <p className="story-panel__eyebrow">
                <span className="story-panel__index">{chapter.index}</span>
                {chapter.eyebrow}
              </p>

              <h2 id={`${chapter.id}-title`} className="story-panel__title">
                {chapter.lines[0]}
              </h2>

              {chapter.lines.length > 1 ? (
                <p className="story-panel__lines">
                  {chapter.lines.slice(1).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </p>
              ) : null}

              {chapter.body ? <p className="story-panel__body">{chapter.body}</p> : null}

              {chapter.data ? (
                <dl className="story-panel__data">
                  {chapter.data.map((entry) => (
                    <div key={entry.label}>
                      <dt>{entry.label}</dt>
                      <dd>{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {chapter.cta ? (
                <p className="story-panel__cta">
                  <a className="story-cta" href={chapter.cta.href}>
                    {chapter.cta.label}
                  </a>
                  {chapter.cta.note ? <span className="story-cta__note">{chapter.cta.note}</span> : null}
                </p>
              ) : null}

              {chapter.media ? <span className="sr-only">{chapter.media.alt}</span> : null}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
