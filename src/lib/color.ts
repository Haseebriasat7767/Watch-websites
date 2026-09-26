/** Shared colour maths for the swatch UI and the dial-texture atelier. */

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

export function rgba(r: number, g: number, b: number, a = 1) {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

/** Mix toward white (amount > 0) or black (amount < 0). */
export function shift(hex: string, amount: number, alpha = 1) {
  const [r, g, b] = parseHex(hex);
  const t = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  return rgba(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k, alpha);
}

/** Brushed-metal ball used by every material swatch in the configurator. */
export function swatchBackground(hex: string) {
  return [
    `radial-gradient(circle at 30% 26%, ${shift(hex, 0.55)} 0%, ${shift(hex, 0.06)} 34%, ${hex} 58%, ${shift(hex, -0.55)} 100%)`,
  ].join(", ");
}
