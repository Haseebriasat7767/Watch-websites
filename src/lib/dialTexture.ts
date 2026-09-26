import * as THREE from "three";
import { shift as shade } from "./color";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dial / bezel-insert texture atelier
 * ─────────────────────────────────────────────────────────────────────────────
 *  Generates every finish on a 2D canvas at load time: radial sunburst brushing,
 *  fumé lacquer gradients, rose-engine guilloché rosettes, the printed minute
 *  track, the diving-bezel scale, the date aperture and the house marks.
 *
 *  ── Why the maps are neutral ──────────────────────────────────────────────
 *  A PBR `map` is *multiplied* by `material.color`. Baking hue into the canvas
 *  would make the configurator's colour vector a no-op, so the canvas supplies
 *  luminance (bright field, dark etched print) and the preset supplies the
 *  physical vectors: color / roughness / metalness. One click repaints the dial
 *  in the exact specified hue, and the finish detail rides along underneath.
 *
 *  Cost: three 1024² canvases prepared once during the loading sequence — no
 *  network requests, no per-click texture uploads, zero stutter while orbiting.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DIAL_TEXTURE_SIZE = 1024;
/** World-space half extent covered by the texture (the dial radius is 0.90). */
export const WORLD_HALF = 1.2;
const PX_PER_UNIT = DIAL_TEXTURE_SIZE / 2 / WORLD_HALF;
const C = DIAL_TEXTURE_SIZE / 2;

/** Neutral dial field — bright enough that `color × map` keeps the true hue. */
const TONE = "#EDEDF0";
/** Etched print: stays dark under every preset. */
const INK = "rgba(9,10,13,0.82)";

export type DialPattern = "sunburst" | "fume" | "guilloche";

export type DialTextureOptions = {
  pattern: DialPattern;
  inclBezelScale?: boolean;
};

/* ── helpers ──────────────────────────────────────────────────────────────── */
/** Letter-spaced text drawn per glyph — sidesteps ctx.letterSpacing support gaps. */
function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  spacing: number,
) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total =
    widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, x, cy);
    x += widths[i] + spacing;
  });
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createCanvas(size: number): { canvas: Canvas; ctx: Ctx2D } {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    if (ctx) return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for dial texture.");
  return { canvas, ctx };
}

/* ── the generator ────────────────────────────────────────────────────────── */
export function createDialTexture({
  pattern,
  inclBezelScale = true,
}: DialTextureOptions): THREE.Texture {
  const { canvas, ctx } = createCanvas(DIAL_TEXTURE_SIZE);
  const c = ctx as CanvasRenderingContext2D;
  const R = (u: number) => u * PX_PER_UNIT; // world units → pixels
  const dialR = R(0.9);

  c.clearRect(0, 0, DIAL_TEXTURE_SIZE, DIAL_TEXTURE_SIZE);

  /* 1 ─ dial field: fumé base --------------------------------------------- */
  c.save();
  c.beginPath();
  c.arc(C, C, dialR, 0, Math.PI * 2);
  c.clip();

  const base = c.createRadialGradient(
    C,
    C - dialR * 0.16,
    dialR * 0.04,
    C,
    C,
    dialR * 1.06,
  );
  base.addColorStop(0, shade(TONE, 0.3));
  base.addColorStop(0.36, shade(TONE, 0.08));
  base.addColorStop(0.72, shade(TONE, -0.16));
  base.addColorStop(1, shade(TONE, -0.62));
  c.fillStyle = base;
  c.fillRect(0, 0, DIAL_TEXTURE_SIZE, DIAL_TEXTURE_SIZE);

  /* 2 ─ finish: sunburst brushing / rose-engine guilloché ------------------ */
  if (pattern === "sunburst" || pattern === "fume") {
    const rays = pattern === "sunburst" ? 288 : 144;
    const wedge = (Math.PI * 2) / rays;
    for (let i = 0; i < rays; i++) {
      const a = i * wedge;
      const strength = pattern === "sunburst" ? 0.075 : 0.045;
      const lit = i % 2 === 0;
      const grad = c.createLinearGradient(
        C,
        C,
        C + Math.cos(a) * dialR,
        C + Math.sin(a) * dialR,
      );
      grad.addColorStop(0, shade(TONE, lit ? strength : -strength, 0.9));
      grad.addColorStop(0.6, shade(TONE, lit ? strength : -strength, 0.8));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(C, C);
      c.arc(C, C, dialR, a, a + wedge * 1.03);
      c.closePath();
      c.fill();
    }
    c.lineWidth = 1;
    for (let i = 0; i < 1600; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = Math.random() * dialR * 1.05;
      const len = dialR * (0.25 + Math.random() * 0.75);
      c.strokeStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      c.beginPath();
      c.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      c.lineTo(C + Math.cos(a) * (r0 + len), C + Math.sin(a) * (r0 + len));
      c.stroke();
    }
  }

  if (pattern === "guilloche") {
    for (let r = 6; r < dialR; r += 3) {
      c.beginPath();
      c.arc(C, C, r, 0, Math.PI * 2);
      c.strokeStyle =
        Math.round(r) % 9 === 0
          ? "rgba(255,255,255,0.085)"
          : "rgba(0,0,0,0.085)";
      c.lineWidth = 1.4;
      c.stroke();
    }
    c.globalCompositeOperation = "overlay";
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      c.beginPath();
      c.arc(
        C + Math.cos(a) * dialR * 0.48,
        C + Math.sin(a) * dialR * 0.48,
        dialR * 0.48,
        0,
        Math.PI * 2,
      );
      c.strokeStyle = "rgba(255,255,255,0.06)";
      c.lineWidth = 1.1;
      c.stroke();
    }
    c.globalCompositeOperation = "source-over";
  }

  /* 3 ─ printed minute track (railroad, every 5th, lume dot at 12) --------- */
  const trackR = R(0.815);
  c.lineCap = "butt";
  for (let i = 0; i < 300; i++) {
    const major = i % 25 === 0;
    const mid = i % 5 === 0;
    const a = (i / 300) * Math.PI * 2 - Math.PI / 2;
    const len = major ? R(0.052) : mid ? R(0.03) : R(0.014);
    const inner = trackR - len;
    c.beginPath();
    c.moveTo(C + Math.cos(a) * inner, C + Math.sin(a) * inner);
    c.lineTo(C + Math.cos(a) * trackR, C + Math.sin(a) * trackR);
    c.strokeStyle = major
      ? INK
      : mid
        ? "rgba(9,10,13,0.66)"
        : "rgba(9,10,13,0.42)";
    c.lineWidth = major ? 3.6 : mid ? 2.4 : 1.3;
    c.stroke();
  }
  // hands shadow halo so the painted hands read against the brushed field
  const halo = c.createRadialGradient(C, C, dialR * 0.05, C, C, dialR * 0.8);
  halo.addColorStop(0, "rgba(0,0,0,0.26)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = halo;
  c.fillRect(0, 0, DIAL_TEXTURE_SIZE, DIAL_TEXTURE_SIZE);

  /* 4 ─ house marks ------------------------------------------------------- */
  c.fillStyle = "rgba(12,12,16,0.9)";
  c.font = `300 ${Math.round(R(0.14))}px "Cormorant Garamond", serif`;
  spacedText(c, "AURELIS", C, C - R(0.42), R(0.05));
  c.fillStyle = "rgba(12,12,16,0.62)";
  c.font = `400 ${Math.round(R(0.052))}px "JetBrains Mono", monospace`;
  spacedText(c, "AUTOMATIC", C, C - R(0.29), R(0.022));
  c.font = `300 ${Math.round(R(0.042))}px "JetBrains Mono", monospace`;
  spacedText(c, "CHRONOMÈTRE · 31 JEWELS", C, C + R(0.63), R(0.014));
  c.fillStyle = "rgba(12,12,16,0.72)";
  c.font = `300 ${Math.round(R(0.05))}px "JetBrains Mono", monospace`;
  spacedText(c, "100 m", C, C + R(0.19), R(0.014));

  /* 5 ─ date aperture at 3 o'clock ---------------------------------------- */
  const dw = R(0.15);
  const dh = R(0.19);
  const dx = C + R(0.5);
  c.save();
  c.beginPath();
  const rr = 6;
  c.moveTo(dx - dw / 2 + rr, C - dh / 2);
  c.arcTo(dx + dw / 2, C - dh / 2, dx + dw / 2, C + dh / 2, rr);
  c.arcTo(dx + dw / 2, C + dh / 2, dx - dw / 2, C + dh / 2, rr);
  c.arcTo(dx - dw / 2, C + dh / 2, dx - dw / 2, C - dh / 2, rr);
  c.arcTo(dx - dw / 2, C - dh / 2, dx + dw / 2, C - dh / 2, rr);
  c.closePath();
  c.fillStyle = "rgba(5,5,8,0.96)";
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.5)";
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = "rgba(246,240,226,0.97)";
  c.textAlign = "center";
  c.font = `400 ${Math.round(R(0.115))}px "JetBrains Mono", monospace`;
  c.fillText("26", dx, C + R(0.042));
  c.restore();

  c.restore(); /* end dial clip */

  /* 6 ─ bezel insert scale ------------------------------------------------ */
  if (inclBezelScale) {
    c.save();
    c.beginPath();
    c.arc(C, C, R(1.115), 0, Math.PI * 2);
    c.arc(C, C, R(0.95), 0, Math.PI * 2, true);
    c.clip("evenodd");

    const insert = c.createRadialGradient(C, C, R(0.95), C, C, R(1.12));
    insert.addColorStop(0, shade(TONE, -0.52));
    insert.addColorStop(0.55, shade(TONE, -0.6));
    insert.addColorStop(1, shade(TONE, -0.7));
    c.fillStyle = insert;
    c.fillRect(0, 0, DIAL_TEXTURE_SIZE, DIAL_TEXTURE_SIZE);

    for (let m = 0; m < 60; m++) {
      const five = m % 5 === 0;
      const a = (m / 60) * Math.PI * 2 - Math.PI / 2;
      const outer = R(1.104);
      const inner = outer - (five ? R(0.062) : R(0.03));
      c.beginPath();
      c.moveTo(C + Math.cos(a) * inner, C + Math.sin(a) * inner);
      c.lineTo(C + Math.cos(a) * outer, C + Math.sin(a) * outer);
      c.strokeStyle = five ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.6)";
      c.lineWidth = five ? 4.4 : 1.8;
      c.stroke();
    }
    c.fillStyle = "rgba(255,255,255,0.98)";
    c.font = `500 ${Math.round(R(0.078))}px "JetBrains Mono", monospace`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const m of [10, 20, 30, 40, 50]) {
      const a = (m / 60) * Math.PI * 2 - Math.PI / 2;
      const ring = R(1.036);
      c.save();
      c.translate(C + Math.cos(a) * ring, C + Math.sin(a) * ring);
      c.rotate(a + Math.PI / 2);
      c.fillText(String(m), 0, 0);
      c.restore();
    }
    c.beginPath();
    c.arc(C, C - R(1.035), R(0.045), 0, Math.PI * 2);
    c.fillStyle = "rgba(255,255,255,0.99)";
    c.shadowColor = "rgba(255,255,255,0.9)";
    c.shadowBlur = 26;
    c.fill();
    c.restore();
  }

  /* 7 ─ organic grain ----------------------------------------------------- */
  c.globalCompositeOperation = "overlay";
  for (let i = 0; i < 5200; i++) {
    c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    c.fillRect(
      Math.random() * DIAL_TEXTURE_SIZE,
      Math.random() * DIAL_TEXTURE_SIZE,
      1,
      1,
    );
  }
  c.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(
    canvas as unknown as HTMLCanvasElement,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.name = `dial-${pattern}`;
  return texture;
}

/**
 * Roughness variation (G channel) — brushed zones scatter light slightly more
 * than lacquered ones. Values hover around 0.9 so the material's own roughness
 * vector stays effectively authoritative.
 */
export function createDialRoughness(pattern: DialPattern): THREE.Texture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  const c = ctx as CanvasRenderingContext2D;
  const half = size / 2;
  const p = half / WORLD_HALF;
  const base = 0.9;
  const contrast = pattern === "guilloche" ? 0.1 : 0.06;
  /**
   * Only luminance undulation here — no hue. PBR multiplies the roughness map's
   * G channel into the material's own roughness, so the material keeps its
   * exact specified value (0.1 / 0.2 / 0.3) and the brushed zones simply add a
   * few percent of scatter on top.
   */
  c.fillStyle = shade("#FFFFFF", -0.1);
  c.fillRect(0, 0, size, size);

  const rays = pattern === "sunburst" ? 320 : pattern === "fume" ? 160 : 200;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const v = base + (i % 2 === 0 ? contrast : -contrast);
    c.strokeStyle = shade("#FFFFFF", -(1 - v));
    c.lineWidth = Math.max((p * 1.2 * Math.PI * 2) / rays, 1);
    c.beginPath();
    c.moveTo(half, half);
    c.lineTo(half + Math.cos(a) * p * 1.2, half + Math.sin(a) * p * 1.2);
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial alpha used to dissolve the studio floor into the void. */
export function createFloorTexture(): THREE.Texture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  const c = ctx as CanvasRenderingContext2D;
  const grad = c.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, "rgba(26,26,32,1)");
  grad.addColorStop(0.34, "rgba(19,19,24,0.94)");
  grad.addColorStop(0.62, "rgba(12,12,16,0.5)");
  grad.addColorStop(0.86, "rgba(6,6,10,0.12)");
  grad.addColorStop(1, "rgba(4,4,8,0)");
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);

  c.strokeStyle = "rgba(212,175,55,0.05)";
  for (let i = 1; i <= 7; i++) {
    c.beginPath();
    c.arc(size / 2, size / 2, (i / 8) * size * 0.5, 0, Math.PI * 2);
    c.lineWidth = 1;
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
