import { OVERTURE } from "./storyConfig";
import { StorySections } from "./StorySections";

/**
 * The written exhibition.
 *
 * Shown when WebGL is unavailable, blocked, or the context is lost mid-visit.
 * Same story, same order, same words — just told with photography and type.
 */
export function StoryFallback({ reason }: { reason: "unsupported" | "lost" }) {
  return (
    <div className="story-static">
      <div className="story-static__hero">
        <img src="/images/aurelis-hero.jpg" alt="The Aurelis Laureate No. 01 in profile" />
        <div className="story-static__heroText">
          <p className="story-overture__wordmark">{OVERTURE.wordmark}</p>
          <p className="story-overture__model">{OVERTURE.model}</p>
          <p className="story-overture__line">{OVERTURE.line}</p>
        </div>
      </div>

      <p className="story-static__note" role="status">
        {reason === "unsupported"
          ? "Your browser could not start the interactive 3D exhibition. The full journey is written below."
          : "The 3D exhibition was interrupted by your device. The full journey is written below."}
      </p>

      <StorySections mode="static" />

      <footer className="story-static__footer">
        <a className="story-cta" href="mailto:atelier@aurelis.example?subject=Private%20appointment">
          Request a private appointment
        </a>
        <p>Geneva · by appointment only</p>
      </footer>
    </div>
  );
}
