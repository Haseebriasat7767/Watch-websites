/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AURELIS · configuration engine
 * ─────────────────────────────────────────────────────────────────────────────
 *  Every material preset carries:
 *    · the physical vector (color / roughness / metalness) applied to the mesh,
 *    · `targets` — the GLTF sub-mesh names it is allowed to override,
 *    · `keywords` — a fuzzy fallback matcher used when a bespoke GLB ships with
 *      its own naming convention (e.g. "Watch_Case.001", "Material #12").
 *
 *  The resolver in `useMaterialDriver.ts` walks the loaded scene graph, matches
 *  each node against these rules and clones the material so that instances are
 *  never shared between parts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PhysicalVector = {
  color: string;
  roughness: number;
  metalness: number;
};

export type MaterialOption = PhysicalVector & {
  id: string;
  name: string;
  /** Short luxury-copy line shown under the option label. */
  caption: string;
  /** Exact GLTF node / mesh / material names this preset drives. */
  targets: string[];
  /** Fuzzy matcher for third-party GLB naming conventions. */
  keywords: string[];
};

export type ConfigKey = "casing" | "face";

/* ── 1. Casing materials ──────────────────────────────────────────────────── */
export const CASINGS: MaterialOption[] = [
  {
    id: "polished-gold",
    name: "Polished Gold",
    caption: "18kt · hand-burnished",
    color: "#D4AF37",
    roughness: 0.15,
    metalness: 0.95,
    targets: [
      "casing",
      "lugs",
      "crown",
      "bracelet",
      "Casing_Main",
      "Crown_Assembly",
    ],
    keywords: ["case", "lug", "crown", "bracelet", "band", "metal", "body"],
  },
  {
    id: "platinum-silver",
    name: "Platinum Silver",
    caption: "950 pt · mirror polish",
    color: "#E5E4E2",
    roughness: 0.1,
    metalness: 1.0,
    targets: [
      "casing",
      "lugs",
      "crown",
      "bracelet",
      "Casing_Main",
      "Crown_Assembly",
    ],
    keywords: ["case", "lug", "crown", "bracelet", "band", "metal", "body"],
  },
  {
    id: "stealth-matte-black",
    name: "Stealth Matte Black",
    caption: "DLC · micro-blasted",
    color: "#1A1A1A",
    roughness: 0.55,
    metalness: 0.8,
    targets: [
      "casing",
      "lugs",
      "crown",
      "bracelet",
      "Casing_Main",
      "Crown_Assembly",
    ],
    keywords: ["case", "lug", "crown", "bracelet", "band", "metal", "body"],
  },
];

/* ── 2. Bezel & dial face variants ────────────────────────────────────────── */
export const FACES: MaterialOption[] = [
  {
    id: "emerald-sunburst",
    name: "Emerald Sunburst",
    caption: "Brushed radial · 42 cuts",
    color: "#097969",
    roughness: 0.2,
    metalness: 0.72,
    targets: ["dial", "bezel", "Dial_Face", "Bezel_Ring"],
    keywords: ["dial", "bezel", "face", "chapter"],
  },
  {
    id: "midnight-horizon",
    name: "Midnight Horizon",
    caption: "Lacquered fumé gradient",
    color: "#191970",
    roughness: 0.3,
    metalness: 0.68,
    targets: ["dial", "bezel", "Dial_Face", "Bezel_Ring"],
    keywords: ["dial", "bezel", "face", "chapter"],
  },
  {
    id: "crimson-guilloche",
    name: "Crimson Guilloché",
    caption: "Rose-engine turned",
    color: "#8B0000",
    roughness: 0.1,
    metalness: 0.75,
    targets: ["dial", "bezel", "Dial_Face", "Bezel_Ring"],
    keywords: ["dial", "bezel", "face", "chapter"],
  },
];

/* ── 3. Live GLB asset ────────────────────────────────────────────────────── */
/**
 * Drop a public/verified Draco-compressed GLB URL here and the component swaps
 * the procedural atelier model for the imported geometry — no other edit
 * required, the material driver, lighting rig and controls are agnostic.
 *
 *   export const MODEL_URL =
 *     'https://raw.githubusercontent.com/<owner>/<repo>/<ref>/public/watch-draco.glb'
 *
 * Leave it `null` to ship the bundled procedural model: it is deterministic,
 * ~0 KB of network cost, and holds 60 FPS on mobile GPUs.
 */
export const MODEL_URL: string | null = null;

/** Path to the Draco decoder used by `useGLTF(url, '/draco/')` + <Preload all />. */
export const DRACO_DECODER_PATH = "/draco/";

/* ── 4. Technical specification HUD ───────────────────────────────────────── */
export type Spec = { label: string; value: string; note?: string };

export const SPECS: Spec[] = [
  {
    label: "Movement",
    value: "Caliber R3F-Automatic",
    note: "in-house · 4 Hz",
  },
  { label: "Power Reserve", value: "72 Hours", note: "twin barrels" },
  { label: "Depth Rating", value: "100m", note: "screw-down crown" },
];

export const MATERIALS_LEDGER: Spec[] = [
  { label: "Case", value: "Ø 40.5 mm · 11.8 mm" },
  { label: "Crystal", value: "Double AR sapphire" },
  { label: "Jewels", value: "31 · Côtes de Genève" },
];

/* ── 5. Scene constants (camera / lighting / controls) ────────────────────── */
export const SCENE = {
  camera: {
    position: [0, 0, 3.5] as [number, number, number],
    fov: 45,
    near: 0.1,
    far: 40,
  },
  controls: {
    minDistance: 2,
    maxDistance: 5.5,
    minPolarAngle: Math.PI / 3,
    maxPolarAngle: Math.PI / 1.8,
  },
  ambientIntensity: 0.3,
  environmentIntensity: 1.5,
  dpr: [1, 1.85] as [number, number],
  /**
   * Hero framing: the timepiece is scaled so this radius (half the case width
   * plus the bracelet's breathing room) always fits the fixed 45° frustum —
   * which keeps the composition identical from a 430 px phone to a 4K display.
   */
  fitRadius: 1.9,
} as const;
