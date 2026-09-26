/**
 * Composites the dial plates the way the shader does.
 *
 *   npx tsx scripts/tint.ts
 *
 * In a PBR material the `map` is *multiplied* into `material.color`, and three.js
 * multiplies in **linear** space before tone mapping re-encodes to sRGB. This
 * mirrors that maths exactly so the reference sheet shows what a visitor will
 * actually see when they click Emerald Sunburst / Midnight Horizon / Crimson
 * Guilloché — the check that the configured hue survives the texture.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { FACES } from "../src/lib/config";

const PLATE = 1024;
const OUT = 300;
const GAP = 10;

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}
function hexToLinear(hex: string) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) =>
    srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255),
  );
}

function readPPM(path: string) {
  const buffer = readFileSync(path);
  // P6\n<w> <h>\n255\n
  let cursor = 0;
  const token = () => {
    while (buffer[cursor] === 0x20 || buffer[cursor] === 0x0a) cursor++;
    const start = cursor;
    while (buffer[cursor] !== 0x20 && buffer[cursor] !== 0x0a) cursor++;
    return buffer.toString("ascii", start, cursor);
  };
  if (token() !== "P6") throw new Error(`${path} is not a binary PPM`);
  const width = parseInt(token(), 10);
  const height = parseInt(token(), 10);
  token(); // maxval
  cursor++; // single whitespace
  return { width, height, data: buffer.subarray(cursor, cursor + width * height * 3) };
}

function writePPM(rows: number[][][], path: string) {
  const width = rows[0].length;
  const height = rows.length;
  const header = `P6\n${width} ${height}\n255\n`;
  const bytes = Buffer.alloc(width * height * 3);
  rows.forEach((row, y) => {
    row.forEach((pixel, x) => {
      for (let c = 0; c < 3; c++) bytes[(y * width + x) * 3 + c] = pixel[c];
    });
  });
  writeFileSync(path, Buffer.concat([Buffer.from(header), bytes]));
}

/** Sample the full-resolution plate down to the sheet tile size (box filter). */
function tile(plate: ReturnType<typeof readPPM>, tint: number[]) {
  const step = PLATE / OUT;
  const rows: number[][][] = [];
  for (let y = 0; y < OUT; y++) {
    const row: number[][] = [];
    for (let x = 0; x < OUT; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = Math.floor(y * step); sy < Math.floor((y + 1) * step); sy++) {
        for (let sx = Math.floor(x * step); sx < Math.floor((x + 1) * step); sx++) {
          const i = (sy * PLATE + sx) * 3;
          r += plate.data[i];
          g += plate.data[i + 1];
          b += plate.data[i + 2];
          n++;
        }
      }
      const albedo = [r / n / 255, g / n / 255, b / n / 255].map(srgbToLinear);
      const lit = albedo.map((value, c) => value * tint[c]);
      row.push(
        lit.map((value) => Math.round(linearToSrgb(Math.min(1, value)) * 255)),
      );
    }
    rows.push(row);
  }
  return rows;
}

const patterns = ["sunburst", "fume", "guilloche"] as const;
const plates = patterns.map((pattern) => readPPM(`preview/dial-${pattern}.ppm`));

const tiles = patterns.map((_, index) => tile(plates[index], hexToLinear(FACES[index].color)));

const width = OUT * 3 + GAP * 4;
const height = OUT + GAP * 2;
const canvas: number[][][] = Array.from({ length: height }, () =>
  Array.from({ length: width }, () => [5, 5, 10]),
);
tiles.forEach((rows, index) => {
  const offsetX = GAP + index * (OUT + GAP);
  rows.forEach((row, y) => {
    row.forEach((pixel, x) => {
      canvas[y + GAP][x + offsetX] = pixel;
    });
  });
});
writePPM(canvas, "preview/dial-finishes.ppm");

console.log("Dial finishes — albedo = preset colour × finish map (linear space)");
patterns.forEach((pattern, index) => {
  const face = FACES[index];
  console.log(
    `  · ${pattern.padEnd(10)} ${face.name.padEnd(20)} ${face.color}  ` +
      `roughness ${face.roughness}  metalness ${face.metalness}`,
  );
});
console.log(`  · sheet written to preview/dial-finishes.ppm  (${width}×${height})`);
