/**
 * Renders the real dial/bezel texture atelier to PNGs.
 *
 *   npm run render:textures
 *
 * There is no browser here, so `scripts/canvas2d.ts` provides the Canvas 2D
 * surface and this harness wires it into `createDialTexture` — the exact code
 * the browser runs. Output: preview/dial-{sunburst,fume,guilloche}.ppm, each one
 * a full 1024² plate containing the dial field, minute track, date aperture,
 * house marks and the printed bezel scale, as it will be projected onto the
 * watch.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createDialRoughness,
  createDialTexture,
  WORLD_HALF,
} from "../src/lib/dialTexture";
import { ShimCanvas, type Canvas2DContext } from "./canvas2d";

const SIZE = 1024;
const canvases: ShimCanvas[] = [];

/** Installs the shim as the ambient canvas implementation for the atelier. */
function installShim() {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.OffscreenCanvas = class extends ShimCanvas {
    constructor(width: number, height: number) {
      super(width, height);
      canvases.push(this);
    }
  };
}

installShim();
mkdirSync("preview", { recursive: true });

/**
 * Rendering all three plates is the design-review pass; a single pattern is
 * what runs inside `npm run check`, keeping CI under ten seconds.
 */
const requested = process.argv[2]
const patterns = (
  requested ? [requested] : ["sunburst", "fume", "guilloche"]
) as readonly ("sunburst" | "fume" | "guilloche")[];
let failures = 0;

for (const pattern of patterns) {
  canvases.length = 0;
  const texture = createDialTexture({ pattern });
  const canvas = canvases[0];
  if (!canvas) {
    console.error(`  ✗ ${pattern}: no canvas was allocated`);
    failures++;
    continue;
  }

  const context = canvas.getContext("2d") as unknown as Canvas2DContext;
  const pixels = canvas.data;
  const pixelsPerUnit = SIZE / 2 / WORLD_HALF; // the atelier's own mapping


  let painted = 0;
  let trackInk = 0;
  let scaleBright = 0;
  let marksInk = 0;
  let apertureInk = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (pixels[i + 3] > 0.02) painted++;
      if (pixels[i + 3] < 0.5) continue;
      const l = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      // minute track sits just inside the dial rim (r 0.73 … 0.82 world units)
      const r = Math.hypot(x - 512, y - 512) / pixelsPerUnit;
      if (r > 0.74 && r < 0.82 && l < 0.42) trackInk++;
      // printed bezel scale (r 0.95 … 1.12 world units) is bright on a dark insert
      if (r > 0.95 && r < 1.12 && l > 0.6) scaleBright++;
      // house marks: the AURELIS line, ~0.42 world units above centre
      const markBand = pixelsPerUnit * 0.1;
      if (
        Math.abs(x - 512) < pixelsPerUnit * 0.45 &&
        y > 512 - pixelsPerUnit * 0.42 - markBand &&
        y < 512 - pixelsPerUnit * 0.42 + markBand &&
        l < 0.35
      )
        marksInk++;
      // date aperture at 3 o'clock, 0.5 world units out
      if (
        Math.abs(x - 512 - pixelsPerUnit * 0.5) < pixelsPerUnit * 0.07 &&
        Math.abs(y - 512) < pixelsPerUnit * 0.09 &&
        l < 0.45
      )
        apertureInk++;
    }
  }

  /**
   * House marks are drawn glyph-by-glyph (so letter spacing works on every
   * browser), so the check reassembles the run from the recorded text ops.
   */
  const textOps = context.textOps ?? [];
  const run = (y: number) =>
    textOps
      .filter((op) => Math.abs(op.y - y) < 1)
      .map((op) => op.text)
      .join("");
  const stamped = new Set(textOps.map((op) => run(op.y)));
  const has = (value: string) => [...stamped].some((line) => line.includes(value));

  const coverage = painted / (SIZE * SIZE);
  const checks: [string, boolean][] = [
    ["dial field painted", coverage > 0.4],
    ["minute track etched", trackInk > 2000],
    ["bezel scale printed", has("10") && has("50") && scaleBright > 8000],
    ["house marks stamped", has("AURELIS") && has("AUTOMATIC")],
    ["house marks composited onto the dial", marksInk > 3000],
    ["date aperture cut at three", apertureInk > 1000],
  ];
  for (const [label, pass] of checks) {
    if (!pass) failures++;
    console.log(`  ${pass ? "✓" : "✗"} ${pattern}: ${label}`);
  }

  if (process.env.TEXTURE_DEBUG === "1") {
    const profile: string[] = [];
    for (let y = 250; y < 400; y += 10) {
      const i = (y * SIZE + 512) * 4;
      profile.push(
        `${y}: l=${(((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3)).toFixed(3)} a=${pixels[i + 3].toFixed(2)}`,
      );
    }
    console.log(`    [debug] ops=${context.textOps.length} profile:\n      ${profile.join("\n      ")}`);
    console.log(
      `    [debug] mark ops: ${JSON.stringify(
        context.textOps
          .filter((op) => op.y > 250 && op.y < 400)
          .slice(0, 8)
          .map((op) => ({ t: op.text, x: Math.round(op.x), y: Math.round(op.y), s: Math.round(op.size) })),
      )}`,
    );
  }

  writeFileSync(`preview/dial-${pattern}.ppm`, canvas.toPPM());
  const roughness = createDialRoughness(pattern);
  console.log(
    `  · preview/dial-${pattern}.ppm  coverage ${(coverage * 100).toFixed(1)}%  ` +
      `track ${(trackInk / 1000).toFixed(1)}k  scale ${(scaleBright / 1000).toFixed(1)}k  ` +
      `marks ${(marksInk / 1000).toFixed(1)}k  aperture ${(apertureInk / 1000).toFixed(1)}k`,
  );
  texture.dispose();
  roughness.dispose();
}

console.log(
  failures === 0
    ? "✔ every dial finish painted, printed and etched correctly"
    : `✘ ${failures} texture check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
