/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AURELIS · exhibition types
 * ─────────────────────────────────────────────────────────────────────────────
 *  The journey is described as data, never as imperative animation code. Every
 *  chapter is a waypoint: a camera pose, a watch transform, a lighting mood and
 *  the narrative that belongs to it. The runtime interpolates between them from
 *  a single scalar — normalised page scroll.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Vec3 = [number, number, number];

export type CameraWaypoint = {
  position: Vec3;
  target: Vec3;
  fov?: number;
  /**
   * Where the timepiece should sit in the frame, in fractions of the half
   * viewport (+x right, +y up). The rig trucks the camera rather than moving
   * the subject, so the viewing angle is preserved — this is what keeps the
   * watch clear of the narrative column instead of hiding behind it.
   */
  bias?: [number, number];
  /** Portrait-viewport override: phones stack text under the subject. */
  biasMobile?: [number, number];
};

export type WatchWaypoint = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: number;
  /** 0 → sealed case · 1 → exhibition back withdrawn, calibre exposed. */
  exhibition?: number;
  /** Continuous turntable speed (rad / s) layered on top of the waypoint. */
  spin?: number;
};

export type LightingWaypoint = {
  exposure?: number;
  /** Strength of the baked gallery IBL — the main lever on how much metal reads. */
  env?: number;
  ambient?: number;
  keyIntensity?: number;
  rimIntensity?: number;
  goldIntensity?: number;
  /** Atmospheric wash behind the canvas: 0 → void · 1 → lit gallery. */
  atmosphere?: number;
  /** Warm halo radius multiplier used by the CSS glow layer. */
  halo?: number;
};

export type ChapterMedia = {
  src: string;
  alt: string;
  /** Composition hint for the editorial image layer. */
  placement: "left" | "right" | "full";
};

export type StoryChapter = {
  id: string;
  /** Display counter, e.g. "01". */
  index: string;
  title: string;
  eyebrow?: string;
  /** Large serif narrative lines. */
  lines: string[];
  /** Supporting editorial paragraph. */
  body?: string;
  /** Technical ledger rendered in monospace. */
  data?: { label: string; value: string }[];
  /** Relative scroll length of the chapter (1 = one viewport of travel). */
  span: number;
  /** Normalised start, filled in by `buildTimeline`. */
  start: number;
  /** Normalised end, filled in by `buildTimeline`. */
  end: number;
  camera: CameraWaypoint;
  watch: WatchWaypoint;
  lighting?: LightingWaypoint;
  media?: ChapterMedia;
  /** Reveals the contextual material selector. */
  showMaterials?: boolean;
  /** Pointer-drag orbit is allowed while this chapter is on screen. */
  draggable?: boolean;
  /** Closing call to action. */
  cta?: { label: string; href: string; note?: string };
};

export type ResolvedChapter = StoryChapter & { start: number; end: number };
