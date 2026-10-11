import { traceImage } from '../src/lib/pipeline.ts'
import { buildSvg } from '../src/lib/svg.ts'
import { presetParams } from '../src/lib/presets.ts'
import type { TextBox, TraceParams } from '../src/types.ts'

const W = 260
const H = 200

function makeCanvas(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255
    data[i + 1] = 255
    data[i + 2] = 255
    data[i + 3] = 255
  }
  return data
}

function set(data: Uint8ClampedArray, w: number, x: number, y: number, r: number, g: number, b: number, a = 255) {
  const i = (y * w + x) * 4
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = a
}

function fillRect(data: Uint8ClampedArray, w: number, x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(data, w, x, y, c[0], c[1], c[2])
}

function fillCircle(data: Uint8ClampedArray, w: number, cx: number, cy: number, r: number, c: [number, number, number]) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(data, w, x, y, c[0], c[1], c[2])
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE FAIL: ${message}`)
  console.log(`  ok  ${message}`)
}

function luminanceOf(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3
}

const data = makeCanvas(W, H)
fillRect(data, W, 24, 24, 96, 64, [20, 30, 60])
fillCircle(data, W, 180, 52, 26, [200, 60, 40])
fillRect(data, W, 24, 110, 220, 113, [20, 30, 60])
fillRect(data, W, 120, 130, 123, 185, [20, 30, 60])
fillRect(data, W, 40, 150, 80, 156, [20, 130, 110])

const textBox: TextBox = { text: 'Phase 1', x: 130, y: 150, w: 90, h: 22, confidence: 91, rowHeight: 18, baselineY: 166 }
fillRect(data, W, 136, 152, 214, 166, [10, 10, 10])

const scientific: TraceParams = { ...presetParams('scientific'), maxDimension: 4096 }
const textual: TraceParams = { ...presetParams('flowchart'), maxDimension: 4096 }

console.log('Scientific & line art preset')
const artResult = traceImage(data, W, H, scientific, [], W, H)
console.log(`  layers=${artResult.layers.length} nodes=${artResult.stats.nodes} paths=${artResult.stats.paths} palette=${artResult.palette.length}`)
assert(artResult.layers.length >= 3, 'detects multiple shape layers')
assert(artResult.stats.nodes > 20, 'produces path nodes')
assert(artResult.stats.paths > 0, 'produces traced paths')
assert(artResult.background === '#ffffff', 'detects the white background')
assert(!artResult.layers.some((l) => l.kind === 'path' && l.color === '#ffffff'), 'drops the background layer')
assert(artResult.palette[0].pct > 0.5, 'white dominates the palette')

const near = (target: [number, number, number], maxDist: number) =>
  artResult.palette.some((e) => Math.hypot(e.r - target[0], e.g - target[1], e.b - target[2]) <= maxDist)
assert(near([20, 30, 60], 3), 'resolves the navy fill exactly')
assert(near([200, 60, 40], 3), 'resolves the red fill exactly')
assert(near([20, 130, 110], 3), 'resolves the teal fill exactly')
assert(near([255, 255, 255], 2), 'resolves pure white exactly')

console.log('Flowchart preset (primitive fitting)')
const flowResult = traceImage(data, W, H, textual, [], W, H)
const primitives = flowResult.layers.flatMap((l) => (l.kind === 'path' ? l.paths : []))
const rects = primitives.filter((p) => p.kind === 'rect')
const circles = primitives.filter((p) => p.kind === 'circle')
console.log(`  primitives: rects=${rects.length} circles=${circles.length}`)
assert(rects.length >= 1, 'fits at least one native rectangle')
assert(circles.length >= 1, 'fits at least one native circle')

console.log('OCR text boxes -> live <text> layers')
const textResult = traceImage(data, W, H, scientific, [textBox], W, H)
const textLayers = textResult.layers.filter((l) => l.kind === 'text')
assert(textLayers.length === 1, 'creates one live text layer')
assert(textLayers[0].text === 'Phase 1', 'keeps the recognised string')
assert(textLayers[0].y > 0 && textLayers[0].x > 0, 'positions the text baseline')
assert(textLayers[0].fontSize > 5 && textLayers[0].fontSize < 60, 'estimates a sane font size')
assert(luminanceOf(textLayers[0].color) < 90, 'samples a dark text colour')

const svg = buildSvg(textResult, { pretty: true, precision: 2, includeBackground: true, metadata: true, sourceName: 'smoke-test' })
assert(svg.startsWith('<svg'), 'emits an svg root')
assert(svg.includes('viewBox="0 0 260 200"'), 'keeps the source viewBox')
assert(svg.includes('<text'), 'emits a live text element')
assert(svg.includes('Phase 1'), 'embeds the text content')
assert(svg.includes('textLength='), 'locks text width to the bitmap box')
assert(svg.includes('fill-rule="evenodd"'), 'uses even-odd filling for holes')
assert(!/NaN|Infinity|undefined/.test(svg), 'no invalid numbers in output')

const minified = buildSvg(artResult, { pretty: false, precision: 1, includeBackground: false, metadata: false })
assert(minified.length < svg.length, 'minified output is smaller than pretty output')
assert(!minified.includes('\n'), 'minified output has no newlines')

console.log(`\nAll smoke checks passed. Sample layer count=${textResult.layers.length}, svg=${svg.length} bytes.`)
console.log(`First rect: ${rects[0] ? JSON.stringify(rects[0].rect) : 'n/a'}`)
