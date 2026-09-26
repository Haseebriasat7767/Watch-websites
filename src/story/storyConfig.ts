import type { ResolvedChapter, StoryChapter } from "./storyTypes";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AURELIS · Laureate No. 01 — the exhibition script
 * ─────────────────────────────────────────────────────────────────────────────
 *  Nine rooms. The visitor walks them with the scrollbar.
 *
 *  World scale reminder (src/three/geometry.ts): the case is 1.21 units in
 *  radius, the dial sits at z ≈ +0.19 and the exhibition back at z ≈ −0.30.
 *  Camera poses below are written in that space; the watch itself is tilted
 *  −0.36 rad about X inside `ProceduralWatch`, so a pose on +Z looks straight
 *  into the dial and a pose on −Z looks into the calibre.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CHAPTERS: Omit<StoryChapter, "start" | "end">[] = [
  /* ── 00 · Enter the atelier ───────────────────────────────────────────── */
  {
    id: "atelier",
    index: "01",
    title: "Enter the Atelier",
    eyebrow: "Chapter I",
    lines: ["Enter the atelier.", "A timepiece shaped by patience,", "precision, and restraint."],
    span: 1.35,
    camera: { position: [0, 0.55, 9.8], target: [0, 0, 0], fov: 34, bias: [0, 0.04], biasMobile: [0, 0.12] },
    watch: { position: [0, 0, 0], rotation: [0, -0.62, 0], scale: 0.8, spin: 0.035 },
    lighting: {
      exposure: 0.62,
      env: 0.3,
      ambient: 0.06,
      keyIntensity: 8,
      rimIntensity: 26,
      goldIntensity: 14,
      atmosphere: 0.06,
      halo: 0.65,
    },
  },

  /* ── 01 · The silhouette ──────────────────────────────────────────────── */
  {
    id: "silhouette",
    index: "02",
    title: "The Silhouette",
    eyebrow: "Chapter II",
    lines: ["The silhouette", "Pure proportions.", "Nothing added without purpose."],
    body: "The Laureate No. 01 is built around a balanced 40 mm case, designed to feel present on the wrist without demanding attention.",
    span: 1.25,
    camera: { position: [1.55, 0.95, 7.45], target: [0, 0, 0], fov: 33, bias: [0.34, 0.03], biasMobile: [0, 0.27] },
    watch: { position: [0, 0, 0], rotation: [0, 0.42, 0], scale: 1, spin: 0.06 },
    lighting: {
      exposure: 0.85,
      env: 0.85,
      ambient: 0.12,
      keyIntensity: 26,
      rimIntensity: 30,
      goldIntensity: 18,
      atmosphere: 0.18,
      halo: 0.85,
    },
    draggable: true,
  },

  /* ── 02 · The case ────────────────────────────────────────────────────── */
  {
    id: "case",
    index: "03",
    title: "The Case",
    eyebrow: "Chapter III",
    lines: ["The case", "Measured in millimetres.", "Finished by hand."],
    data: [
      { label: "Diameter", value: "40 mm" },
      { label: "Thickness", value: "9.8 mm" },
      { label: "Crystal", value: "Sapphire" },
      { label: "Water resistance", value: "100 m" },
    ],
    span: 1.3,
    camera: { position: [5.6, 1.0, 3.5], target: [0.3, 0, 0.05], fov: 30, bias: [-0.3, 0.02], biasMobile: [0, 0.24] },
    watch: { position: [0, 0.02, 0], rotation: [0, -0.28, 0], scale: 1.1, spin: 0.05 },
    lighting: {
      exposure: 0.92,
      env: 1.1,
      ambient: 0.1,
      keyIntensity: 34,
      rimIntensity: 34,
      goldIntensity: 22,
      atmosphere: 0.2,
      halo: 0.75,
    },
    draggable: true,
  },

  /* ── 03 · The dial ────────────────────────────────────────────────────── */
  {
    id: "dial",
    index: "04",
    title: "The Dial",
    eyebrow: "Chapter IV",
    lines: ["The dial", "Light, captured in layers."],
    body: "Each surface is finished to respond differently to light, creating a dial that changes character throughout the day.",
    span: 1.35,
    camera: { position: [0.05, 0.22, 5.2], target: [0, 0.02, 0.12], fov: 26, bias: [0.2, 0.05], biasMobile: [0, 0.2] },
    watch: { position: [0, 0, 0], rotation: [0, 0.015, 0], scale: 1.32, spin: 0.012 },
    lighting: {
      exposure: 1.02,
      env: 1.25,
      ambient: 0.14,
      keyIntensity: 40,
      rimIntensity: 22,
      goldIntensity: 26,
      atmosphere: 0.24,
      halo: 1,
    },
  },

  /* ── 04 · The calibre ─────────────────────────────────────────────────── */
  {
    id: "calibre",
    index: "05",
    title: "The Calibre",
    eyebrow: "Chapter V",
    lines: ["The calibre", "Beauty beneath the surface."],
    body: "Developed over five years, the A01 calibre balances technical performance with traditional hand-finishing.",
    data: [
      { label: "Reference", value: "Calibre A01" },
      { label: "Winding", value: "Automatic" },
      { label: "Jewels", value: "31" },
      { label: "Power reserve", value: "72 hours" },
      { label: "Frequency", value: "4 Hz" },
    ],
    span: 1.5,
    camera: { position: [0.95, 0.8, -7.0], target: [0, 0, -0.24], fov: 28, bias: [0.3, 0.04], biasMobile: [0, 0.25] },
    watch: { position: [0, 0, 0], rotation: [0, -0.1, 0], scale: 1.25, exhibition: 1, spin: 0.03 },
    lighting: {
      exposure: 1,
      env: 1.2,
      ambient: 0.16,
      keyIntensity: 30,
      rimIntensity: 30,
      goldIntensity: 30,
      atmosphere: 0.22,
      halo: 0.95,
    },
    draggable: true,
  },

  /* ── 05 · Human hands ─────────────────────────────────────────────────── */
  {
    id: "hands",
    index: "06",
    title: "Human Hands",
    eyebrow: "Chapter VI",
    lines: ["Made by hand in Geneva.", "One watchmaker.", "One timepiece."],
    body: "From the first polish to final regulation, every Laureate remains with one watchmaker for more than 180 hours.",
    span: 1.35,
    camera: { position: [-3.3, 1.65, 5.6], target: [-0.1, 0.05, 0.05], fov: 30, bias: [-0.14, 0.05], biasMobile: [0, 0.26] },
    watch: { position: [0, -0.02, 0], rotation: [0, 0.68, 0], scale: 1.12, exhibition: 0.2, spin: 0.045 },
    lighting: {
      exposure: 0.88,
      env: 0.95,
      ambient: 0.1,
      keyIntensity: 30,
      rimIntensity: 26,
      goldIntensity: 24,
      atmosphere: 0.16,
      halo: 0.7,
    },
    media: { src: "/images/aurelis-craft.jpg", alt: "A watchmaker bevelling a bridge at the bench", placement: "left" },
  },

  /* ── 06 · Materials ───────────────────────────────────────────────────── */
  {
    id: "materials",
    index: "07",
    title: "Materials",
    eyebrow: "Chapter VII",
    lines: ["Materials", "Choose the register", "in which it speaks."],
    body: "Three cases, three dials. Every combination is finished to the same standard and individually numbered.",
    span: 1.45,
    camera: { position: [0.35, 0.55, 8.1], target: [0, 0, 0], fov: 32, bias: [0, 0.2], biasMobile: [0, 0.3] },
    watch: { position: [0, 0.05, 0], rotation: [0, -0.18, 0], scale: 1.16, spin: 0.09 },
    lighting: {
      exposure: 0.98,
      env: 1.2,
      ambient: 0.16,
      keyIntensity: 36,
      rimIntensity: 28,
      goldIntensity: 24,
      atmosphere: 0.26,
      halo: 0.95,
    },
    showMaterials: true,
    draggable: true,
  },

  /* ── 07 · On the wrist ────────────────────────────────────────────────── */
  {
    id: "wrist",
    index: "08",
    title: "On the Wrist",
    eyebrow: "Chapter VIII",
    lines: ["Designed for a lifetime.", "Effortless from morning to evening."],
    body: "A 40 mm case, 9.8 mm thin, on a bracelet that tapers to follow the wrist. It disappears until you look for it.",
    span: 1.3,
    camera: { position: [-1.15, -0.4, 8.2], target: [0, 0.02, 0], fov: 36, bias: [-0.32, 0.06], biasMobile: [0, 0.26] },
    watch: { position: [0, -0.05, 0], rotation: [0, 0.34, -0.22], scale: 0.86, spin: 0.05 },
    lighting: {
      exposure: 0.95,
      env: 1.1,
      ambient: 0.2,
      keyIntensity: 30,
      rimIntensity: 22,
      goldIntensity: 18,
      atmosphere: 0.34,
      halo: 0.8,
    },
    media: { src: "/images/aurelis-wrist.jpg", alt: "The Laureate No. 01 worn under a shirt cuff", placement: "left" },
  },

  /* ── 08 · Closing statement ───────────────────────────────────────────── */
  {
    id: "closing",
    index: "09",
    title: "Laureate No. 01",
    eyebrow: "Chapter IX",
    lines: ["Laureate No. 01", "Time, refined to its essence."],
    body: "Discover your timepiece.",
    span: 1.4,
    camera: { position: [0, 0.35, 8.2], target: [0, 0, 0], fov: 34, bias: [0, 0.16], biasMobile: [0, 0.26] },
    watch: { position: [0, 0, 0], rotation: [0, -0.5, 0], scale: 1.02, spin: 0.04 },
    lighting: {
      exposure: 1.05,
      env: 1.3,
      ambient: 0.24,
      keyIntensity: 30,
      rimIntensity: 26,
      goldIntensity: 22,
      atmosphere: 0.42,
      halo: 1.1,
    },
    cta: {
      label: "Request a private appointment",
      href: "mailto:atelier@aurelis.example?subject=Private%20appointment%20%C2%B7%20Laureate%20No.%2001",
      note: "Geneva · by appointment only",
    },
  },
];

/** Normalises the chapter spans into a 0 → 1 timeline. */
function buildTimeline(chapters: Omit<StoryChapter, "start" | "end">[]): ResolvedChapter[] {
  const total = chapters.reduce((sum, chapter) => sum + chapter.span, 0);
  let cursor = 0;
  return chapters.map((chapter) => {
    const start = cursor / total;
    cursor += chapter.span;
    return { ...chapter, start, end: cursor / total } as ResolvedChapter;
  });
}

export const STORY_CHAPTERS: ResolvedChapter[] = buildTimeline(CHAPTERS);

export const TOTAL_SPAN = CHAPTERS.reduce((sum, chapter) => sum + chapter.span, 0);

/** Opening titles, held above the first chapter. */
export const OVERTURE = {
  wordmark: "AURELIS",
  model: "LAUREATE NO. 01",
  line: "Time, refined to its essence.",
  prompt: "Scroll to enter the atelier",
} as const;

/** How the narrative fades relative to chapter-local progress. */
export const TEXT_WINDOW = { in: [0.04, 0.22], out: [0.72, 0.94] } as const;

/** The camera holds on its waypoint, then travels to the next one. */
export const CAMERA_HOLD = 0.34;
