import type {
  BBox,
  Layer,
  PaletteEntry,
  PathLayer,
  ProgressFn,
  ShapeItem,
  TextBox,
  TextLayer,
  TraceParams,
  TraceResult,
} from '../types.ts'
import { luminance, rgbToHex } from './color.ts'
import { bboxOf, gridSnap, orthoSnap, tryCircle, tryRect } from './geometry.ts'
import type { Point } from './geometry.ts'
import { binIndex, quantize } from './quantize.ts'
import { buildPathData, simplifyLoop, traceColors } from './trace.ts'

const ALPHA_MIN = 96

function compositeOverBackground(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  let bgR = 255
  let bgG = 255
  let bgB = 255
  const tally = new Map<string, { r: number; g: number; b: number; n: number }>()
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4
    if (data[i + 3] < ALPHA_MIN) return
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
    const entry = tally.get(key)
    if (entry) entry.n++
    else tally.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], n: 1 })
  }
  push(0, 0)
  push(width - 1, 0)
  push(0, height - 1)
  push(width - 1, height - 1)
  let best: { r: number; g: number; b: number; n: number } | null = null
  for (const entry of tally.values()) {
    if (!best || entry.n > best.n) best = entry
  }
  if (best) {
    bgR = best.r
    bgG = best.g
    bgB = best.b
  }
  const out = new Uint8ClampedArray(data)
  for (let p = 0; p < out.length; p += 4) {
    const a = out[p + 3]
    if (a === 255) continue
    const af = a / 255
    out[p] = Math.round(out[p] * af + bgR * (1 - af))
    out[p + 1] = Math.round(out[p + 1] * af + bgG * (1 - af))
    out[p + 2] = Math.round(out[p + 2] * af + bgB * (1 - af))
    out[p + 3] = 255
  }
  return out
}

function epsilonFor(params: TraceParams): number {
  const eps = 0.4 + (1 - params.detail) * 2.4
  return Math.max(0.35, Math.min(3.2, eps))
}

function unionBBox(boxes: BBox[]): BBox {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function sampleBoxColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box: TextBox,
  background: number,
): { color: string; ink: number } {
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(width, Math.ceil(box.x + box.w))
  const y1 = Math.min(height, Math.ceil(box.y + box.h))
  const buckets = new Map<number, number>()
  let ink = 0
  let total = 0
  let sumLum = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < ALPHA_MIN) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      buckets.set(bin, (buckets.get(bin) ?? 0) + 1)
      const l = luminance(r, g, b)
      sumLum += l
      total++
      if (l < 0.5) ink++
    }
  }
  const bg = background >= 0 ? background : 255
  const bgLum = luminance((bg >> 16) & 255, (bg >> 8) & 255, bg & 255)
  const wantDark = bgLum > 0.5
  let bestBin = -1
  let bestCount = -1
  for (const [bin, count] of buckets) {
    const r = ((bin >> 8) & 15) * 16 + 8
    const g = ((bin >> 4) & 15) * 16 + 8
    const b = (bin & 15) * 16 + 8
    const l = luminance(r, g, b)
    const matches = wantDark ? l < bgLum - 0.08 : l > bgLum + 0.08
    const effective = matches ? count : count * 0.2
    if (effective > bestCount) {
      bestCount = effective
      bestBin = bin
    }
  }
  let color = '#111827'
  if (bestBin >= 0) {
    const r = ((bestBin >> 8) & 15) * 16 + 8
    const g = ((bestBin >> 4) & 15) * 16 + 8
    const b = (bestBin & 15) * 16 + 8
    color = rgbToHex(r, g, b)
  }
  void sumLum
  const inkRatio = total > 0 ? Math.max(ink, total - ink) / total : 0
  return { color, ink: inkRatio }
}

function fontFromName(name: string | undefined): { weight: number; italic: boolean } {
  const n = (name ?? '').toLowerCase()
  const weight = /black|heavy|extrabold|ultra/.test(n) ? 800 : /bold|semibold|demi/.test(n) ? 700 : /medium/.test(n) ? 500 : /light|thin/.test(n) ? 300 : 400
  const italic = /italic|oblique/.test(n)
  return { weight, italic }
}

export function traceImage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: TraceParams,
  textBoxes: TextBox[],
  outWidth: number,
  outHeight: number,
  onProgress?: ProgressFn,
): TraceResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const progress = onProgress ?? (() => {})
  const totalPixels = width * height

  progress('Quantizing palette', 0.04)
  const work = compositeOverBackground(data, width, height)
  const { palette, lut, counts } = quantize(work, params.colorCount, ALPHA_MIN)

  let counted = 0
  for (const c of counts) counted += c

  const borderVotes = new Map<number, number>()
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 512))
  for (let x = 0; x < width; x += stride) {
    for (const y of [0, height - 1]) {
      const i = (y * width + x) * 4
      if (work[i + 3] < ALPHA_MIN) continue
      const c = lut[binIndex(work[i], work[i + 1], work[i + 2])]
      borderVotes.set(c, (borderVotes.get(c) ?? 0) + 1)
    }
  }
  for (let y = 0; y < height; y += stride) {
    for (const x of [0, width - 1]) {
      const i = (y * width + x) * 4
      if (work[i + 3] < ALPHA_MIN) continue
      const c = lut[binIndex(work[i], work[i + 1], work[i + 2])]
      borderVotes.set(c, (borderVotes.get(c) ?? 0) + 1)
    }
  }

  let backgroundIndex = -1
  let backgroundHex: string | null = null
  let borderTotal = 0
  for (const n of borderVotes.values()) borderTotal += n
  let dominant = 0
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[dominant]) dominant = i
  const dominantFrac = counted > 0 ? counts[dominant] / counted : 0
  const borderFrac = borderTotal > 0 ? (borderVotes.get(dominant) ?? 0) / borderTotal : 0
  const cornerColors: number[] = []
  const cornerAt = (x: number, y: number) => {
    const i = (y * width + x) * 4
    if (work[i + 3] >= ALPHA_MIN) cornerColors.push(lut[binIndex(work[i], work[i + 1], work[i + 2])])
  }
  cornerAt(0, 0)
  cornerAt(width - 1, 0)
  cornerAt(0, height - 1)
  cornerAt(width - 1, height - 1)
  const cornersAgree = cornerColors.length === 4 && cornerColors.every((c) => c === dominant)
  if (params.removeBackground && dominantFrac > 0.35 && dominantFrac < 0.95 && borderFrac > 0.5 && cornersAgree) {
    backgroundIndex = dominant
    backgroundHex = rgbToHex(palette[dominant][0], palette[dominant][1], palette[dominant][2])
  }
  const backgroundRgb =
    backgroundIndex >= 0
      ? (palette[backgroundIndex][0] << 16) | (palette[backgroundIndex][1] << 8) | palette[backgroundIndex][2]
      : -1

  const textMask = new Uint8Array(totalPixels)
  if (textBoxes.length > 0) {
    const grow = 1
    for (const box of textBoxes) {
      const x0 = Math.max(0, Math.floor(box.x) - grow)
      const y0 = Math.max(0, Math.floor(box.y) - grow)
      const x1 = Math.min(width, Math.ceil(box.x + box.w) + grow)
      const y1 = Math.min(height, Math.ceil(box.y + box.h) + grow)
      for (let y = y0; y < y1; y++) {
        const row = y * width
        for (let x = x0; x < x1; x++) textMask[row + x] = 1
      }
    }
  }

  progress('Building label map', 0.12)
  const labels = new Int16Array(totalPixels)
  let opaque = 0
  for (let i = 0, p = 0; i < totalPixels; i++, p += 4) {
    const a = data[p + 3]
    if (a < ALPHA_MIN) {
      labels[i] = -2
      continue
    }
    opaque++
    if (textMask[i]) {
      labels[i] = -1
      continue
    }
    labels[i] = lut[binIndex(work[p], work[p + 1], work[p + 2])]
  }

  progress('Tracing contours', 0.2)
  const traced = traceColors(labels, width, height)

  const order: number[] = []
  for (let i = 0; i < palette.length; i++) if (i !== backgroundIndex && counts[i] > 0) order.push(i)
  order.sort((a, b) => counts[b] - counts[a])

  const epsilon = epsilonFor(params)
  const minArea = params.despeckle ? Math.max(params.minArea, 9) : params.minArea
  const layers: PathLayer[] = []
  let totalNodes = 0
  let totalPaths = 0

  order.forEach((color, index) => {
    const loops = traced.get(color)
    if (!loops || loops.length === 0) return
    const shapes: ShapeItem[] = []
    let nodes = 0
    let area = 0
    for (const loop of loops) {
      if (loop.length < 4) continue
      const simplified = simplifyLoop(loop, epsilon)
      if (simplified.area < minArea) continue
      let points: Point[] = simplified.points
      if (params.gridSnap > 0) points = gridSnap(points, params.gridSnap)
      if (params.snapOrthogonal) points = orthoSnap(points, 2)
      if (points.length < 3) continue
      let shape: ShapeItem | null = null
      if (params.fitPrimitives) shape = tryRect(points, 1.7) ?? tryCircle(points, Math.max(1.4, epsilon))
      if (!shape) {
        const pathData = buildPathData(points, {
          closed: true,
          cornerAngle: params.cornerAngle,
          smoothing: params.smoothing,
          precision: 2,
          epsilon,
        })
        if (!pathData.d) continue
        shape = { kind: 'path', d: pathData.d, nodes: pathData.nodes, area: simplified.area, bbox: bboxOf(points) }
      }
      shapes.push(shape)
      nodes += shape.nodes
      area += shape.area
    }
    if (shapes.length === 0) return
    totalNodes += nodes
    totalPaths += shapes.length
    const hex = rgbToHex(palette[color][0], palette[color][1], palette[color][2])
    layers.push({
      id: `shape-${color}-${layers.length}`,
      kind: 'path',
      name: `Shape ${layers.length + 1}`,
      color: hex,
      fillRule: 'evenodd',
      bbox: unionBBox(shapes.map((s) => s.bbox)),
      area,
      nodes,
      paths: shapes,
      visible: true,
    })
    progress(`Tracing layer ${layers.length} of ${order.length}`, 0.2 + 0.62 * ((index + 1) / Math.max(1, order.length)))
  })

  const textLayers: TextLayer[] = textBoxes
    .filter((b) => b.text.trim().length > 0)
    .map((box, index) => {
      const sampled = sampleBoxColor(work, width, height, box, backgroundRgb)
      const font = fontFromName(box.fontName)
      const bold = font.weight >= 600 || sampled.ink > 0.34
      const fontSize = Math.max(4, Math.min(2000, Math.max(box.rowHeight ?? 0, box.h * 1.05)))
      return {
        id: `text-${index}`,
        kind: 'text' as const,
        text: box.text,
        x: box.x,
        y: box.baselineY ?? box.y + box.h * 0.84,
        w: box.w,
        h: box.h,
        fontSize,
        fontFamily: params.preset === 'scientific' ? "Latin Modern Roman, 'Computer Modern', 'Times New Roman', Georgia, serif" : "Inter, Roboto, 'Helvetica Neue', Arial, sans-serif",
        fontWeight: bold ? 700 : 400,
        italic: font.italic,
        color: sampled.color,
        rotation: box.rotation ?? 0,
        confidence: box.confidence,
        visible: true,
      }
    })

  const allLayers: Layer[] = [...layers, ...textLayers]
  allLayers.sort((a, b) => {
    const aText = a.kind === 'text' ? 1 : 0
    const bText = b.kind === 'text' ? 1 : 0
    if (aText !== bText) return bText - aText
    return (a.kind === 'path' ? a.area : 0) - (b.kind === 'path' ? b.area : 0)
  })

  const paletteEntries: PaletteEntry[] = palette.map((c, i) => ({
    color: rgbToHex(c[0], c[1], c[2]),
    r: c[0],
    g: c[1],
    b: c[2],
    pixels: counts[i],
    pct: counted > 0 ? counts[i] / counted : 0,
  }))
  paletteEntries.sort((a, b) => b.pixels - a.pixels)

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  progress('Finalizing', 0.97)

  return {
    width,
    height,
    outWidth,
    outHeight,
    scale: outWidth / width,
    background: backgroundHex,
    layers: allLayers,
    palette: paletteEntries,
    stats: {
      ms: t1 - t0,
      colors: layers.length,
      paths: totalPaths,
      nodes: totalNodes,
      textBlocks: textLayers.length,
      sourcePixels: totalPixels,
      processedPixels: opaque,
      scale: outWidth / width,
    },
  }
}
