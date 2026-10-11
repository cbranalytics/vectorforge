export const BIN_SHIFT = 2
export const BIN_LEVELS = 64
export const BIN_COUNT = BIN_LEVELS * BIN_LEVELS * BIN_LEVELS

export function binIndex(r: number, g: number, b: number): number {
  return ((r >> BIN_SHIFT) << 12) | ((g >> BIN_SHIFT) << 6) | (b >> BIN_SHIFT)
}

function levelCenter(bin: number): [number, number, number] {
  return [((bin >> 12) & 63) * 4 + 2, ((bin >> 6) & 63) * 4 + 2, (bin & 63) * 4 + 2]
}

interface Histogram {
  hist: Uint32Array
  sr: Float64Array
  sg: Float64Array
  sb: Float64Array
  nonZero: number[]
}

interface Box {
  r0: number
  r1: number
  g0: number
  g1: number
  b0: number
  b1: number
  count: number
}

export interface QuantizeResult {
  palette: number[][]
  lut: Int32Array
  counts: number[]
}

function buildHistogram(data: Uint8ClampedArray, alphaMin: number): Histogram {
  const hist = new Uint32Array(BIN_COUNT)
  const sr = new Float64Array(BIN_COUNT)
  const sg = new Float64Array(BIN_COUNT)
  const sb = new Float64Array(BIN_COUNT)
  const nonZero: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaMin) continue
    const bin = binIndex(data[i], data[i + 1], data[i + 2])
    if (hist[bin] === 0) nonZero.push(bin)
    hist[bin]++
    sr[bin] += data[i]
    sg[bin] += data[i + 1]
    sb[bin] += data[i + 2]
  }
  return { hist, sr, sg, sb, nonZero }
}

function buildLut(
  palette: number[][],
  nonZero: number[],
  mean: (bin: number) => [number, number, number],
): Int32Array {
  const lut = new Int32Array(BIN_COUNT)
  for (const bin of nonZero) {
    const [r, g, b] = mean(bin)
    let best = 0
    let bestD = Infinity
    for (let p = 0; p < palette.length; p++) {
      const dr = r - palette[p][0]
      const dg = g - palette[p][1]
      const db = b - palette[p][2]
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    lut[bin] = best
  }
  return lut
}

function refinePalette(
  data: Uint8ClampedArray,
  alphaMin: number,
  lut: Int32Array,
  previous: number[][],
): number[][] {
  const len = previous.length
  const sr = new Float64Array(len)
  const sg = new Float64Array(len)
  const sb = new Float64Array(len)
  const sc = new Int32Array(len)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaMin) continue
    const p = lut[binIndex(data[i], data[i + 1], data[i + 2])]
    if (p < 0 || p >= len) continue
    sr[p] += data[i]
    sg[p] += data[i + 1]
    sb[p] += data[i + 2]
    sc[p]++
  }
  return previous.map((entry, p) =>
    sc[p] > 0 ? [Math.round(sr[p] / sc[p]), Math.round(sg[p] / sc[p]), Math.round(sb[p] / sc[p])] : entry,
  )
}

export function quantize(data: Uint8ClampedArray, colorCount: number, alphaMin = 96): QuantizeResult {
  const { hist, sr: hsr, sg: hsg, sb: hsb, nonZero } = buildHistogram(data, alphaMin)
  const mean = (bin: number): [number, number, number] => {
    const c = hist[bin]
    if (c === 0) return levelCenter(bin)
    return [hsr[bin] / c, hsg[bin] / c, hsb[bin] / c]
  }
  const boxes: Box[] = [{ r0: 0, r1: 63, g0: 0, g1: 63, b0: 0, b1: 63, count: 0 }]
  let total = 0
  for (const bin of nonZero) total += hist[bin]
  boxes[0].count = total

  const target = Math.max(1, Math.min(64, colorCount))
  while (boxes.length < target) {
    let bestIndex = -1
    let bestScore = 0
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.count === 0) continue
      const range = Math.max(box.r1 - box.r0, box.g1 - box.g0, box.b1 - box.b0)
      if (range <= 0) continue
      const score = range * Math.log1p(box.count)
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
    if (bestIndex === -1) break
    const box = boxes[bestIndex]
    const rr = box.r1 - box.r0
    const gr = box.g1 - box.g0
    const br = box.b1 - box.b0
    const axis = rr >= gr && rr >= br ? 0 : gr >= br ? 1 : 2
    const lo = axis === 0 ? box.r0 : axis === 1 ? box.g0 : box.b0
    const hi = axis === 0 ? box.r1 : axis === 1 ? box.g1 : box.b1
    const width = hi - lo + 1
    const partial: number[] = new Array(width).fill(0)
    for (const bin of nonZero) {
      const c = hist[bin]
      if (c === 0) continue
      const r = (bin >> 12) & 63
      const g = (bin >> 6) & 63
      const b = bin & 63
      if (r < box.r0 || r > box.r1 || g < box.g0 || g > box.g1 || b < box.b0 || b > box.b1) continue
      const v = axis === 0 ? r : axis === 1 ? g : b
      partial[v - lo] += c
    }
    let acc = 0
    let splitAt = lo
    const half = box.count / 2
    for (let v = 0; v < width; v++) {
      acc += partial[v]
      if (acc >= half) {
        splitAt = lo + v
        break
      }
    }
    if (splitAt >= hi) splitAt = hi - 1
    const left: Box = { ...box, count: 0 }
    const right: Box = { ...box, count: 0 }
    if (axis === 0) {
      left.r1 = splitAt
      right.r0 = splitAt + 1
    } else if (axis === 1) {
      left.g1 = splitAt
      right.g0 = splitAt + 1
    } else {
      left.b1 = splitAt
      right.b0 = splitAt + 1
    }
    for (const bin of nonZero) {
      const c = hist[bin]
      if (c === 0) continue
      const r = (bin >> 12) & 63
      const g = (bin >> 6) & 63
      const b = bin & 63
      if (r >= left.r0 && r <= left.r1 && g >= left.g0 && g <= left.g1 && b >= left.b0 && b <= left.b1) left.count += c
      else if (r >= right.r0 && r <= right.r1 && g >= right.g0 && g <= right.g1 && b >= right.b0 && b <= right.b1) right.count += c
    }
    boxes.splice(bestIndex, 1, left, right)
  }

  let palette: number[][] = []
  for (const box of boxes) {
    if (box.count === 0) continue
    let rSum = 0
    let gSum = 0
    let bSum = 0
    let n = 0
    for (const bin of nonZero) {
      const c = hist[bin]
      if (c === 0) continue
      const r = (bin >> 12) & 63
      const g = (bin >> 6) & 63
      const b = bin & 63
      if (r < box.r0 || r > box.r1 || g < box.g0 || g > box.g1 || b < box.b0 || b > box.b1) continue
      rSum += hsr[bin]
      gSum += hsg[bin]
      bSum += hsb[bin]
      n += c
    }
    if (n === 0) continue
    palette.push([Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)])
  }
  if (palette.length === 0) palette.push([0, 0, 0])

  let lut = buildLut(palette, nonZero, mean)
  palette = refinePalette(data, alphaMin, lut, palette)
  lut = buildLut(palette, nonZero, mean)

  const counts = new Array(palette.length).fill(0)
  for (const bin of nonZero) {
    const p = lut[bin]
    if (p >= 0 && p < counts.length) counts[p] += hist[bin]
  }

  return { palette, lut, counts }
}