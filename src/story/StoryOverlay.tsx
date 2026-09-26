import { useEffect, useRef, useState } from "react";
import { CASINGS, FACES, type MaterialOption } from "../lib/config";
import { swatchBackground } from "../lib/color";
import type { WatchConfig } from "../three/materials";
import { STORY_CHAPTERS } from "./storyConfig";
import { useActiveChapter } from "./storyState";
import { subscribeFrame } from "./useStoryProgress";
import { StoryProgress } from "./StoryProgress";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Exhibition chrome
 * ─────────────────────────────────────────────────────────────────────────────
 *  Everything that is not the story itself, kept to the edges of the frame: a
 *  wordmark, a chapter counter, the rail, three discreet controls and the
 *  contextual material selector. No sidebars, no panels, no dashboard.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function Swatch({
  option,
  active,
  onSelect,
}: {
  option: MaterialOption;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`story-swatch ${active ? "is-active" : ""}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className="story-swatch__disc" style={{ backgroundImage: swatchBackground(option.color) }} aria-hidden="true" />
      <span className="story-swatch__label">{option.name}</span>
    </button>
  );
}

function MaterialSelector({
  config,
  onCasing,
  onFace,
  visible,
}: {
  config: WatchConfig;
  onCasing: (option: MaterialOption) => void;
  onFace: (option: MaterialOption) => void;
  visible: boolean;
}) {
  return (
    <div
      className={`story-materials ${visible ? "is-visible" : ""}`}
      aria-hidden={!visible}
      inert={!visible}
    >
      <fieldset className="story-materials__group">
        <legend>Case</legend>
        <div className="story-materials__row">
          {CASINGS.map((option) => (
            <Swatch
              key={option.id}
              option={option}
              active={config.casing.id === option.id}
              onSelect={() => onCasing(option)}
            />
          ))}
        </div>
      </fieldset>
      <span className="story-materials__divider" aria-hidden="true" />
      <fieldset className="story-materials__group">
        <legend>Dial</legend>
        <div className="story-materials__row">
          {FACES.map((option) => (
            <Swatch
              key={option.id}
              option={option}
              active={config.face.id === option.id}
              onSelect={() => onFace(option)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function StoryOverlay({
  config,
  onCasing,
  onFace,
  sound,
  onSound,
  reducedMotion,
  onMotion,
}: {
  config: WatchConfig;
  onCasing: (option: MaterialOption) => void;
  onFace: (option: MaterialOption) => void;
  sound: boolean;
  onSound: () => void;
  reducedMotion: boolean;
  onMotion: () => void;
}) {
  const active = useActiveChapter();
  const chapter = STORY_CHAPTERS[active] ?? STORY_CHAPTERS[0];
  const [configure, setConfigure] = useState(false);
  const hint = useRef<HTMLParagraphElement>(null);

  // The scroll prompt retires once the visitor is clearly on their way.
  useEffect(
    () =>
      subscribeFrame((state) => {
        if (!hint.current) return;
        const fade = state.progress < 0.02 ? 0 : state.progress > 0.9 ? 0 : 1;
        hint.current.style.opacity = String(fade);
      }),
    [],
  );

  const materialsVisible = configure || chapter.showMaterials === true;

  return (
    <div className="story-overlay">
      <header className="story-topbar">
        <a className="story-wordmark" href="#chapter-atelier">
          AURELIS
          <span aria-hidden="true">Genève</span>
        </a>
        <p className="story-counter" aria-live="polite">
          <span>{chapter.index}</span>
          <span aria-hidden="true"> / </span>
          <span>{String(STORY_CHAPTERS.length).padStart(2, "0")}</span>
        </p>
      </header>

      <div className="story-controls">
        <button
          type="button"
          className={`story-control ${materialsVisible ? "is-on" : ""}`}
          aria-pressed={configure}
          onClick={() => setConfigure((value) => !value)}
        >
          Configure
        </button>
        <button type="button" className={`story-control ${sound ? "is-on" : ""}`} aria-pressed={sound} onClick={onSound}>
          Sound {sound ? "on" : "off"}
        </button>
        <button
          type="button"
          className={`story-control ${reducedMotion ? "is-on" : ""}`}
          aria-pressed={reducedMotion}
          onClick={onMotion}
        >
          {reducedMotion ? "Motion off" : "Motion on"}
        </button>
      </div>

      <MaterialSelector config={config} onCasing={onCasing} onFace={onFace} visible={materialsVisible} />

      <footer className="story-bottombar">
        <p className="story-chaptertitle">
          <span className="story-chaptertitle__eyebrow">{chapter.eyebrow}</span>
          <span className="story-chaptertitle__name">{chapter.title}</span>
        </p>
        <p className="story-scrollhint" ref={hint}>
          <span aria-hidden="true" className="story-scrollhint__rule" />
          {chapter.draggable ? "Drag to turn · scroll to continue" : "Scroll to continue"}
        </p>
      </footer>

      <StoryProgress />
    </div>
  );
}
