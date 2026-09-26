/**
 * A minimal, dependency-free 2D canvas implementation — test harness only.
 *
 * Why it exists: the dial/bezel texture atelier paints with the Canvas 2D API,
 * and neither CI nor this container has a browser. This shim implements the
 * subset the atelier uses (paths, arcs, quadratic curves, rounded-rect arcTo,
 * linear + radial gradients, clipping, strokes, letter-spaced text blocks and
 * the handful of blend modes) well enough to rasterise the *real* texture into
 * a PNG for inspection.
 *
 * Fidelity notes: 4× vertical supersampling; text is laid out at the correct
 * position, size and advance but drawn as glyph blocks (no font rasteriser
 * exists in Node); shadows are ignored. Colour, geometry, gradients, clip
 * regions and layout are faithful, which is what the dial needs verified.
 */

export type Paint = string | RGBA | Gradient

export type RGBA = { r: number; g: number; b: number; a: number }

type Stop = { t: number; colour: RGBA }

export class Gradient {
  stops: Stop[] = []
  constructor(
    public kind: "linear" | "radial",
    public args: number[],
  ) {}
  addColorStop(t: number, colour: string) {
    this.stops.push({ t, colour: parseColour(colour) })
  }
  sample(t: number): RGBA {
    const stops = this.stops
    if (stops.length === 0) return { r: 0, g: 0, b: 0, a: 1 }
    if (t <= stops[0].t) return stops[0].colour
    if (t >= stops[stops.length - 1].t) return stops[stops.length - 1].colour
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i].t) {
        const a = stops[i - 1]
        const b = stops[i]
        const k = (t - a.t) / (b.t - a.t || 1)
        return {
          r: a.colour.r + (b.colour.r - a.colour.r) * k,
          g: a.colour.g + (b.colour.g - a.colour.g) * k,
          b: a.colour.b + (b.colour.b - a.colour.b) * k,
          a: a.colour.a + (b.colour.a - a.colour.a) * k,
        }
      }
    }
    return stops[stops.length - 1].colour
  }
}

export function parseColour(input: string): RGBA {
  const value = input.trim()
  if (value.startsWith("#")) {
    const hex =
      value.length === 4
        ? value
            .slice(1)
            .split("")
            .map((c) => c + c)
            .join("")
        : value.slice(1)
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: 1,
    }
  }
  const match = value.match(/rgba?\(([^)]+)\)/)
  if (match) {
    const parts = match[1].split(",").map((p) => parseFloat(p))
    return {
      r: parts[0] / 255,
      g: parts[1] / 255,
      b: parts[2] / 255,
      a: parts[3] === undefined ? 1 : parts[3],
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

type Point = [number, number]

/** Flattened path: a list of closed/open polylines in device space. */
class Path {
  subpaths: Point[][] = []
  private current: Point[] = []

  moveTo(x: number, y: number) {
    this.flush()
    this.current.push([x, y])
  }
  lineTo(x: number, y: number) {
    this.current.push([x, y])
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const start = this.current[this.current.length - 1] ?? [cx, cy]
    const steps = 12
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const mt = 1 - t
      this.current.push([
        mt * mt * start[0] + 2 * mt * t * cx + t * t * x,
        mt * mt * start[1] + 2 * mt * t * cy + t * t * y,
      ])
    }
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false) {
    const TAU = Math.PI * 2
    let delta = a1 - a0
    if (Math.abs(delta) >= TAU - 1e-9) {
      // A full turn: normalising by ±2π here must not collapse it to zero —
      // that is exactly what turned the bezel's even-odd annulus clip into a
      // solid disc in an earlier revision of this harness.
      delta = ccw ? -TAU : TAU
    } else if (ccw && delta > 0) {
      delta -= TAU
    } else if (!ccw && delta < 0) {
      delta += TAU
    }
    const steps = Math.max(8, Math.ceil(Math.abs(delta) * Math.max(r, 8) * 0.06))
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (delta * i) / steps
      this.current.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  /** Canvas spec arcTo: tangent lines, then the inscribed arc. */
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    const p0 = this.current[this.current.length - 1] ?? [x1, y1]
    const a1 = Math.atan2(p0[1] - y1, p0[0] - x1)
    const a2 = Math.atan2(y2 - y1, x2 - x1)
    let delta = a2 - a1
    while (delta < 0) delta += Math.PI * 2
    if (delta > Math.PI) delta = Math.PI * 2 - delta
    const tangent = Math.tan(delta / 2)
    const dist = Math.hypot(p0[0] - x1, p0[1] - y1)
    const radius = Math.abs(r)
    const cut = tangent === 0 ? 0 : radius / Math.abs(tangent)
    const t1: Point = [x1 + Math.cos(a1) * Math.min(cut, dist), y1 + Math.sin(a1) * Math.min(cut, dist)]
    const t2: Point = [x1 + Math.cos(a2) * Math.min(cut, dist), y1 + Math.sin(a2) * Math.min(cut, dist)]
    this.lineTo(t1[0], t1[1])
    const cx = t1[0] + Math.cos(a1 + Math.PI / 2) * radius * Math.sign(delta)
    const cy = t1[1] + Math.sin(a1 + Math.PI / 2) * radius * Math.sign(delta)
    const start = Math.atan2(t1[1] - cy, t1[0] - cx)
    const end = Math.atan2(t2[1] - cy, t2[0] - cx)
    this.arc(cx, cy, radius, start, end, false)
    void dist
  }
  closePath() {
    if (this.current.length > 1) this.current.push([...this.current[0]])
    this.flush()
  }
  private flush() {
    if (this.current.length > 1) this.subpaths.push(this.current)
    this.current = []
  }
  build(): Point[][] {
    this.flush()
    return this.subpaths.map((s) => s.slice())
  }
}

export class Canvas2DContext {
  private stack: {
    fillStyle: Paint
    strokeStyle: Paint
    lineWidth: number
    globalAlpha: number
    composite: string
    clip: Float32Array
    transform: [number, number, number, number, number, number]
  }[] = []

  private path = new Path()
  private transform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]
  private clipMask: Mask
  private fillStyle: Paint = { r: 0, g: 0, b: 0, a: 1 }
  private strokeStyle: Paint = { r: 0, g: 0, b: 0, a: 1 }
  private lineWidth = 1
  private globalAlpha = 1
  private composite = "source-over"

  /** Text state, read by the harness for layout assertions. */
  font = "10px sans-serif"
  textAlign = "start"
  textBaseline = "alphabetic"
  lineCap = "butt"
  shadowBlur = 0
  shadowColor = "rgba(0,0,0,0)"
  globalCompositeOperation = "source-over"

  readonly textOps: { text: string; x: number; y: number; size: number; align: string }[] = []

  constructor(
    readonly width: number,
    readonly height: number,
    readonly data: Float32Array,
  ) {
    this.clipMask = new Mask(width, height)
    this.clipMask.data.fill(1)
  }

  /* ── state ─────────────────────────────────────────────────────────────── */
  save() {
    const clipCopy = new Mask(
      this.width,
      this.height,
      this.clipMask.minX,
      this.clipMask.minY,
      this.clipMask.maxX,
      this.clipMask.maxY,
    )
    clipCopy.data.set(this.clipMask.data)
    this.stack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      clip: clipCopy,
      transform: [...this.transform] as [number, number, number, number, number, number],
    })
  }
  restore() {
    const state = this.stack.pop()
    if (!state) return
    this.fillStyle = state.fillStyle
    this.strokeStyle = state.strokeStyle
    this.lineWidth = state.lineWidth
    this.globalAlpha = state.globalAlpha
    this.globalCompositeOperation = state.composite
    this.clipMask = state.clip
    this.transform = state.transform
  }
  set fillStyleValue(value: Paint) {
    this.fillStyle = typeof value === "string" ? parseColour(value) : value
  }
  set fillStyle(value: Paint) {
    this.fillStyleValue = value
  }
  set strokeStyleValue(value: Paint) {
    this.strokeStyle = typeof value === "string" ? parseColour(value) : value
  }
  set strokeStyle(value: Paint) {
    this.strokeStyleValue = value
  }
  set lineWidthValue(value: number) {
    this.lineWidth = value
  }
  set lineWidth(value: number) {
    this.lineWidthValue = value
  }

  /* ── transforms ────────────────────────────────────────────────────────── */
  translate(x: number, y: number) {
    this.transform = multiply(this.transform, [1, 0, 0, 1, x, y])
  }
  rotate(angle: number) {
    this.transform = multiply(this.transform, [
      Math.cos(angle),
      Math.sin(angle),
      -Math.sin(angle),
      Math.cos(angle),
      0,
      0,
    ])
  }
  scale(x: number, y: number) {
    this.transform = multiply(this.transform, [x, 0, 0, y, 0, 0])
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.transform = [a, b, c, d, e, f]
  }
  private applyTransform(point: Point): Point {
    const [a, b, c, d, e, f] = this.transform
    return [a * point[0] + c * point[1] + e, b * point[0] + d * point[1] + f]
  }

  /* ── paths ─────────────────────────────────────────────────────────────── */
  beginPath() {
    this.path = new Path()
  }
  moveTo(x: number, y: number) {
    const p = this.applyTransform([x, y])
    this.path.moveTo(p[0], p[1])
  }
  lineTo(x: number, y: number) {
    const p = this.applyTransform([x, y])
    this.path.lineTo(p[0], p[1])
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const c = this.applyTransform([cx, cy])
    const p = this.applyTransform([x, y])
    this.path.quadraticCurveTo(c[0], c[1], p[0], p[1])
  }
  arc(
    cx: number,
    cy: number,
    r: number,
    a0: number,
    a1: number,
    ccw = false,
  ) {
    // Radius scales with the transform (the atelier never scales non-uniformly).
    const scale = Math.hypot(this.transform[0], this.transform[1]) || 1
    const c = this.applyTransform([cx, cy])
    this.path.arc(c[0], c[1], r * scale, a0, a1, ccw)
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    const p1 = this.applyTransform([x1, y1])
    const p2 = this.applyTransform([x2, y2])
    this.path.arcTo(p1[0], p1[1], p2[0], p2[1], r)
  }
  closePath() {
    this.path.closePath()
  }

  clip(rule: "nonzero" | "evenodd" = "nonzero") {
    const shape = rasterise(this.path.build(), this.width, this.height, rule === "evenodd")
    const next = new Float32Array(this.width * this.height)
    for (let y = shape.minY; y <= shape.maxY; y++) {
      for (let x = shape.minX; x <= shape.maxX; x++) {
        const index = y * this.width + x
        next[index] = shape.data[index] * this.clipMask.data[index]
      }
    }
    this.clipMask = new Mask(
      this.width,
      this.height,
      Math.max(shape.minX, this.clipMask.minX),
      Math.max(shape.minY, this.clipMask.minY),
      Math.min(shape.maxX, this.clipMask.maxX),
      Math.min(shape.maxY, this.clipMask.maxY),
    )
    this.clipMask.data.set(next)
  }

  /* ── painting ──────────────────────────────────────────────────────────── */
  fill(rule: "nonzero" | "evenodd" = "nonzero") {
    this.compositePaint(
      rasterise(this.path.build(), this.width, this.height, rule === "evenodd"),
      this.fillStyle,
    )
  }
  stroke() {
    const mask = new Mask(this.width, this.height, this.width, this.height, -1, -1)
    const radius = Math.max(this.lineWidth / 2, 0.4)
    for (const subpath of this.path.build()) {
      for (let i = 1; i < subpath.length; i++) {
        stampSegment(mask, subpath[i - 1], subpath[i], radius)
      }
    }
    this.compositePaint(mask, this.strokeStyle)
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const p = this.applyTransform([x, y])
    const p2 = this.applyTransform([x + w, y + h])
    const path = new Path()
    path.moveTo(p[0], p[1])
    path.lineTo(p2[0], p[1])
    path.lineTo(p2[0], p2[1])
    path.lineTo(p[0], p2[1])
    path.closePath()
    this.compositePaint(
      rasterise(path.build(), this.width, this.height, false),
      this.fillStyle,
    )
  }
  clearRect(x: number, y: number, w: number, h: number) {
    const p = this.applyTransform([x, y])
    const p2 = this.applyTransform([x + w, y + h])
    for (let y2 = Math.max(0, Math.floor(p[1])); y2 < Math.min(this.height, p2[1]); y2++) {
      for (let x2 = Math.max(0, Math.floor(p[0])); x2 < Math.min(this.width, p2[0]); x2++) {
        const i = (y2 * this.width + x2) * 4
        this.data[i] = 0
        this.data[i + 1] = 0
        this.data[i + 2] = 0
        this.data[i + 3] = 0
      }
    }
  }

  /** Text: layout-faithful, drawn as a glyph block (no font rasteriser in Node). */
  measureText(text: string) {
    const size = this.fontSize()
    const monospace = /mono/i.test(this.font)
    const advance = monospace ? size * 0.6 : size * 0.5
    return { width: [...text].length * advance }
  }
  fillText(text: string, x: number, y: number) {
    const p = this.applyTransform([x, y])
    const size = this.fontSize() * (Math.hypot(this.transform[0], this.transform[1]) || 1)
    const width = this.measureText(text).width * (Math.hypot(this.transform[0], this.transform[1]) || 1)
    let left = p[0]
    if (this.textAlign === "center") left -= width / 2
    else if (this.textAlign === "right" || this.textAlign === "end") left -= width
    const top = this.textBaseline === "middle" ? p[1] - size * 0.42 : p[1] - size * 0.78

    this.textOps.push({ text, x: left, y: top, size, align: this.textAlign })

    const path = new Path()
    path.moveTo(left, top)
    path.lineTo(left + width, top)
    path.lineTo(left + width, top + size * 0.84)
    path.lineTo(left, top + size * 0.84)
    path.closePath()
    this.compositePaint(
      rasterise(path.build(), this.width, this.height, false),
      this.fillStyle,
    )
  }

  private fontSize() {
    const match = this.font.match(/(\d+(?:\.\d+)?)px/)
    return match ? parseFloat(match[1]) : 10
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    const p = this.applyTransform([x, y])
    const p2 = this.applyTransform([x + w, y + h])
    const mask = new Mask(this.width, this.height, this.width, this.height, -1, -1)
    const corners: Point[] = [
      [p[0], p[1]],
      [p2[0], p[1]],
      [p2[0], p2[1]],
      [p[0], p2[1]],
    ]
    for (let i = 0; i < 4; i++) {
      stampSegment(mask, corners[i], corners[(i + 1) % 4], Math.max(this.lineWidth / 2, 0.4))
    }
    this.compositePaint(mask, this.strokeStyle)
  }

  /* ── paints ────────────────────────────────────────────────────────────── */
  createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
    const a = this.applyTransform([x0, y0])
    const b = this.applyTransform([x1, y1])
    return new Gradient("linear", [a[0], a[1], b[0], b[1]])
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
    const a = this.applyTransform([x0, y0])
    const b = this.applyTransform([x1, y1])
    const scale = Math.hypot(this.transform[0], this.transform[1]) || 1
    return new Gradient("radial", [a[0], a[1], r0 * scale, b[0], b[1], r1 * scale])
  }

  private sample(paint: Paint, x: number, y: number): RGBA {
    if (!(paint instanceof Gradient)) {
      return typeof paint === "string" ? parseColour(paint) : paint
    }
    if (paint.kind === "linear") {
      const [x0, y0, x1, y1] = paint.args
      const dx = x1 - x0
      const dy = y1 - y0
      const lengthSq = dx * dx + dy * dy || 1
      return paint.sample(((x - x0) * dx + (y - y0) * dy) / lengthSq)
    }
    const [x0, y0, r0, x1, y1, r1] = paint.args
    const distance = Math.hypot(x - x1, y - y1)
    return paint.sample((distance - r0) / (r1 - r0 || 1))
  }

  private compositePaint(mask: Mask, paint: Paint) {
    const { width, data } = this
    const alpha = this.globalAlpha
    const mode = this.globalCompositeOperation
    // Only the mask's touchable region is visited — this is the difference
    // between a two-minute render and a ten-second one.
    const y0 = Math.max(mask.minY, this.clipMask.minY)
    const y1 = Math.min(mask.maxY, this.clipMask.maxY)
    const x0 = Math.max(mask.minX, this.clipMask.minX)
    const x1 = Math.min(mask.maxX, this.clipMask.maxX)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const index = y * width + x
        const coverage = mask.data[index] * this.clipMask.data[index] * alpha
        if (coverage <= 0.001) continue
        const colour = this.sample(paint, x + 0.5, y + 0.5)
        const i = index * 4
        const sa = colour.a * coverage
        const dst = [data[i], data[i + 1], data[i + 2], data[i + 3]]
        const src = [colour.r, colour.g, colour.b]
        if (mode === "overlay") {
          for (let c = 0; c < 3; c++) {
            const base = dst[c]
            const blended = base < 0.5 ? 2 * src[c] * base : 1 - 2 * (1 - src[c]) * (1 - base)
            data[i + c] = base * (1 - sa) + blended * sa
          }
        } else {
          for (let c = 0; c < 3; c++) data[i + c] = dst[c] * (1 - sa) + src[c] * sa
        }
        data[i + 3] = Math.min(1, dst[3] * (1 - sa) + sa)
      }
    }
  }
}

function multiply(
  m: [number, number, number, number, number, number],
  n: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

/* ── rasterisation ────────────────────────────────────────────────────────── */
const SUBSAMPLES = 4

/** A coverage buffer plus the region that was actually touched. */
class Mask {
  readonly data: Float32Array
  minX: number
  minY: number
  maxX: number
  maxY: number
  constructor(
    readonly width: number,
    readonly height: number,
    minX = 0,
    minY = 0,
    maxX = width - 1,
    maxY = height - 1,
  ) {
    this.data = new Float32Array(width * height)
    this.minX = minX
    this.minY = minY
    this.maxX = maxX
    this.maxY = maxY
  }
  grow(x: number, y: number) {
    if (x < this.minX) this.minX = x
    if (y < this.minY) this.minY = y
    if (x > this.maxX) this.maxX = x
    if (y > this.maxY) this.maxY = y
  }
}

/** Scanline fill with 4× vertical supersampling. `evenOdd` switches the rule. */
function rasterise(
  subpaths: Point[][],
  width: number,
  height: number,
  evenOdd: boolean,
): Mask {
  if (subpaths.length === 0) return new Mask(width, height, 1, 1, 0, 0)

  let minY = Infinity
  let maxY = -Infinity
  let minX = Infinity
  let maxX = -Infinity
  for (const subpath of subpaths) {
    for (const [x, y] of subpath) {
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
  }
  const mask = new Mask(
    width,
    height,
    Math.max(0, Math.floor(minX) - 1),
    Math.max(0, Math.floor(minY) - 1),
    Math.min(width - 1, Math.ceil(maxX) + 1),
    Math.min(height - 1, Math.ceil(maxY) + 1),
  )
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(height - 1, Math.ceil(maxY))

  const crossings: { x: number; direction: number }[] = []
  for (let py = y0; py <= y1; py++) {
    const accumulator = new Map<number, number>()
    for (let s = 0; s < SUBSAMPLES; s++) {
      const sampleY = py + (s + 0.5) / SUBSAMPLES
      crossings.length = 0
      for (const subpath of subpaths) {
        for (let i = 1; i < subpath.length; i++) {
          const [ax, ay] = subpath[i - 1]
          const [bx, by] = subpath[i]
          if (ay === by) continue
          const minEdgeY = Math.min(ay, by)
          const maxEdgeY = Math.max(ay, by)
          if (sampleY < minEdgeY || sampleY >= maxEdgeY) continue
          const t = (sampleY - ay) / (by - ay)
          crossings.push({ x: ax + (bx - ax) * t, direction: by > ay ? 1 : -1 })
        }
      }
      if (crossings.length === 0) continue
      crossings.sort((a, b) => a.x - b.x)

      if (evenOdd) {
        for (let i = 0; i + 1 < crossings.length; i += 2) {
          addSpan(accumulator, crossings[i].x, crossings[i + 1].x, 1 / SUBSAMPLES)
        }
      } else {
        let winding = 0
        for (let i = 0; i < crossings.length - 1; i++) {
          winding += crossings[i].direction
          if (winding !== 0) {
            addSpan(accumulator, crossings[i].x, crossings[i + 1].x, 1 / SUBSAMPLES)
          }
        }
      }
    }
    for (const [px, coverage] of accumulator) {
      const value = Math.min(1, coverage)
      if (value <= 0) continue
      mask.data[py * width + px] += value
    }
  }
  return mask
}

function addSpan(target: Map<number, number>, from: number, to: number, weight: number) {
  const start = Math.floor(from)
  const end = Math.ceil(to)
  for (let px = start; px < end; px++) {
    if (px < 0) continue
    const left = Math.max(from, px)
    const right = Math.min(to, px + 1)
    if (right <= left) continue
    target.set(px, (target.get(px) ?? 0) + (right - left) * weight)
  }
}

function stampSegment(mask: Mask, a: Point, b: Point, radius: number) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const steps = Math.max(1, Math.ceil(length))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    stampDisc(mask, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, radius)
  }
}

function stampDisc(mask: Mask, cx: number, cy: number, radius: number) {
  const { width, height } = mask
  const x0 = Math.max(0, Math.floor(cx - radius - 1))
  const x1 = Math.min(width - 1, Math.ceil(cx + radius + 1))
  const y0 = Math.max(0, Math.floor(cy - radius - 1))
  const y1 = Math.min(height - 1, Math.ceil(cy + radius + 1))
  mask.grow(x0, y0)
  mask.grow(x1, y1)
  const inner = Math.max(0, radius - 0.5)
  const outer = radius + 0.5
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (distance > outer) continue
      const coverage = distance <= inner ? 1 : (outer - distance) / (outer - inner)
      const index = y * width + x
      mask.data[index] = Math.min(1, mask.data[index] + coverage)
    }
  }
}

/** The `HTMLCanvasElement`/`OffscreenCanvas` surface the atelier touches. */
export class ShimCanvas {
  readonly data: Float32Array
  private context: Canvas2DContext | undefined

  constructor(
    public width: number,
    public height: number,
  ) {
    this.data = new Float32Array(width * height * 4)
  }
  getContext(_kind: "2d") {
    this.context ??= new Canvas2DContext(this.width, this.height, this.data)
    return this.context
  }
  toPPM(): Buffer {
    const header = `P6\n${this.width} ${this.height}\n255\n`
    const bytes = Buffer.alloc(this.width * this.height * 3)
    for (let i = 0; i < this.width * this.height; i++) {
      const a = this.data[i * 4 + 3]
      // Composite over the studio void so the dial reads on the page's ground.
      for (let c = 0; c < 3; c++) {
        const value = this.data[i * 4 + c] * a + 0.02 * (1 - a)
        bytes[i * 3 + c] = Math.max(0, Math.min(255, Math.round(Math.sqrt(value) * 255)))
      }
    }
    return Buffer.concat([Buffer.from(header), bytes])
  }
}
