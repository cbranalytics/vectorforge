import type { Point } from './geometry.ts'
import { isCorner, rdp, shoelace } from './geometry.ts'

export type EdgeMap = Map<number, number[]>

function addEdge(map: EdgeMap, from: number, to: number): void {
  const arr = map.get(from)
  if (arr) arr.push(to)
  else map.set(from, [to])
}

function dirOf(from: number, to: number, stride: number): number {
  const d = to - from
  if (d === 1) return 0
  if (d === stride) return 1
  if (d === -1) return 2
  if (d === -stride) return 3
  return 0
}

function chainEdges(map: EdgeMap, stride: number, w: number, h: number): Point[][] {
  const loops: Point[][] = []
  while (map.size > 0) {
    const start = map.keys().next().value as number
    let cur = start
    let prevDir = -1
    const keys: number[] = [start]
    let guard = 0
    const limit = (w + 1) * (h + 1) * 4 + 16
    while (guard++ < limit) {
      const targets = map.get(cur)
      if (!targets || targets.length === 0) {
        map.delete(cur)
        break
      }
      let index = 0
      if (targets.length > 1 && prevDir >= 0) {
        let bestRank = 99
        for (let i = 0; i < targets.length; i++) {
          const turn = (dirOf(cur, targets[i], stride) - prevDir + 4) % 4
          const rank = turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3
          if (rank < bestRank) {
            bestRank = rank
            index = i
          }
        }
      }
      const next = targets[index]
      if (targets.length === 1) map.delete(cur)
      else targets.splice(index, 1)
      prevDir = dirOf(cur, next, stride)
      if (next === start) break
      keys.push(next)
      cur = next
    }
    if (keys.length >= 4) {
      const pts: Point[] = keys.map((k) => ({ x: k % stride, y: Math.floor(k / stride) }))
      loops.push(pts)
    }
  }
  return loops
}

export function traceMask(labels: Int16Array, w: number, h: number, color: number): Point[][] {
  const stride = w + 1
  const map: EdgeMap = new Map()
  const idx = (x: number, y: number) => y * w + x
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (labels[idx(x, y)] !== color) continue
      const above = y === 0 ? -1 : labels[idx(x, y - 1)]
      const right = x + 1 >= w ? -1 : labels[idx(x + 1, y)]
      const below = y + 1 >= h ? -1 : labels[idx(x, y + 1)]
      const left = x === 0 ? -1 : labels[idx(x - 1, y)]
      if (above !== color) addEdge(map, y * stride + x, y * stride + x + 1)
      if (right !== color) addEdge(map, (y + 1) * stride + x + 1, y * stride + x + 1)
      if (below !== color) addEdge(map, (y + 1) * stride + x, (y + 1) * stride + x + 1)
      if (left !== color) addEdge(map, y * stride + x, (y + 1) * stride + x)
    }
  }
  return chainEdges(map, stride, w, h)
}

export function traceColors(labels: Int16Array, w: number, h: number): Map<number, Point[][]> {
  const stride = w + 1
  const maps = new Map<number, EdgeMap>()
  const mapFor = (color: number): EdgeMap => {
    let m = maps.get(color)
    if (!m) {
      m = new Map()
      maps.set(color, m)
    }
    return m
  }
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const c = labels[row + x]
      if (c < 0) continue
      const right = x + 1 >= w ? -1 : labels[row + x + 1]
      if (right !== c) {
        addEdge(mapFor(c), (y + 1) * stride + x + 1, y * stride + x + 1)
        if (right >= 0) addEdge(mapFor(right), y * stride + x + 1, (y + 1) * stride + x + 1)
      }
      const below = y + 1 >= h ? -1 : labels[row + w + x]
      if (below !== c) {
        addEdge(mapFor(c), (y + 1) * stride + x, (y + 1) * stride + x + 1)
        if (below >= 0) addEdge(mapFor(below), (y + 1) * stride + x + 1, (y + 1) * stride + x)
      }
    }
  }
  const out = new Map<number, Point[][]>()
  for (const [color, map] of maps) out.set(color, chainEdges(map, stride, w, h))
  return out
}

export function fmt(v: number, precision: number): string {
  const rounded = Number(v.toFixed(precision))
  return `${rounded}`
}

export interface PathData {
  d: string
  nodes: number
}

type Seg =
  | { kind: 'line'; end: Point }
  | { kind: 'cubic'; c1: Point; c2: Point; end: Point }

function bezierPoint(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y }
}

function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y)
  if (len < 1e-9) return { x: 1, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

// Least-squares cubic fit through pts[0..n] (Schneider-style): solves for the two
// control-arm lengths along the given unit tangents.
function fitCubic(pts: Point[], u: number[], tHat1: Point, tHat2: Point): { c1: Point; c2: Point } {
  const p0 = pts[0]
  const p3 = pts[pts.length - 1]
  const h12 = tHat1.x * tHat2.x + tHat1.y * tHat2.y
  let c11 = 0
  let c12 = 0
  let c22 = 0
  let x1 = 0
  let x2 = 0
  for (let i = 0; i < pts.length; i++) {
    const t = u[i]
    const mt = 1 - t
    const b0 = mt * mt * mt
    const b1 = 3 * mt * mt * t
    const b2 = 3 * mt * t * t
    const b3 = t * t * t
    const rx = pts[i].x - (b0 + b1) * p0.x - (b2 + b3) * p3.x
    const ry = pts[i].y - (b0 + b1) * p0.y - (b2 + b3) * p3.y
    c11 += b1 * b1
    c12 += b1 * b2 * h12
    c22 += b2 * b2
    x1 += b1 * (tHat1.x * rx + tHat1.y * ry)
    x2 += b2 * (tHat2.x * rx + tHat2.y * ry)
  }
  const det = c11 * c22 - c12 * c12
  let a1 = 0
  let a2 = 0
  if (Math.abs(det) > 1e-9) {
    a1 = (c22 * x1 - c12 * x2) / det
    a2 = (c12 * x1 - c11 * x2) / det
  }
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y)
  const maxArm = 3 * chord + 1e-6
  a1 = Math.max(0, Math.min(maxArm, a1))
  a2 = Math.max(0, Math.min(maxArm, a2))
  return {
    c1: { x: p0.x + a1 * tHat1.x, y: p0.y + a1 * tHat1.y },
    c2: { x: p3.x - a2 * tHat2.x, y: p3.y - a2 * tHat2.y },
  }
}

function maxBezierError(pts: Point[], c1: Point, c2: Point, p3: Point, u: number[]): { err: number; index: number } {
  const p0 = pts[0]
  let err = 0
  let index = -1
  for (let i = 1; i < pts.length - 1; i++) {
    const b = bezierPoint(p0, c1, c2, p3, u[i])
    const d = Math.hypot(pts[i].x - b.x, pts[i].y - b.y)
    if (d > err) {
      err = d
      index = i
    }
  }
  return { err, index }
}

function chordParams(pts: Point[]): number[] {
  const u: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    u.push(u[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  const total = u[u.length - 1]
  if (total > 1e-9) for (let i = 0; i < u.length; i++) u[i] = i / (pts.length - 1)
  else for (let i = 0; i < u.length; i++) u[i] /= total
  return u
}

function fitRun(pts: Point[], tolerance: number, out: Seg[], depth: number): void {
  const n = pts.length
  if (n <= 2 || depth > 24) {
    for (let i = 1; i < n; i++) out.push({ kind: 'line', end: pts[i] })
    return
  }
  const u = chordParams(pts)
  const tHat1 = unit({ x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y })
  const tHat2 = unit({ x: pts[n - 1].x - pts[n - 2].x, y: pts[n - 1].y - pts[n - 2].y })
  const { c1, c2 } = fitCubic(pts, u, tHat1, tHat2)
  const p3 = pts[n - 1]
  const { err, index } = maxBezierError(pts, c1, c2, p3, u)
  if (err <= tolerance) {
    out.push({ kind: 'cubic', c1, c2, end: p3 })
    return
  }
  if (index <= 0 || index >= n - 1) {
    for (let i = 1; i < n; i++) out.push({ kind: 'line', end: pts[i] })
    return
  }
  fitRun(pts.slice(0, index + 1), tolerance, out, depth + 1)
  fitRun(pts.slice(index), tolerance, out, depth + 1)
}

export function buildPathData(
  points: Point[],
  options: { closed: boolean; cornerAngle: number; smoothing: number; precision: number; epsilon: number },
): PathData {
  const { closed, cornerAngle, smoothing, precision, epsilon } = options
  const n = points.length
  if (n === 0) return { d: '', nodes: 0 }
  if (n === 1) return { d: `M${fmt(points[0].x, precision)} ${fmt(points[0].y, precision)}`, nodes: 1 }
  if (n === 2) {
    return {
      d: `M${fmt(points[0].x, precision)} ${fmt(points[0].y, precision)}L${fmt(points[1].x, precision)} ${fmt(points[1].y, precision)}`,
      nodes: 2,
    }
  }

  const at = (i: number): Point => {
    if (closed) return points[((i % n) + n) % n]
    return points[Math.max(0, Math.min(n - 1, i))]
  }

  const corner: boolean[] = new Array(n).fill(false)
  for (let i = 0; i < n; i++) {
    corner[i] = isCorner(at(i - 1), points[i], at(i + 1), cornerAngle)
  }
  const anyCorner = corner.some(Boolean)
  const tolerance = Math.max(0.05, epsilon * (0.3 + smoothing * 1.7))

  const segs: Seg[] = []
  let nodes = 1

  const emitRun = (run: Point[]): void => {
    if (run.length < 2) return
    const before = segs.length
    fitRun(run, tolerance, segs, 0)
    for (let i = before; i < segs.length; i++) nodes += segs[i].kind === 'cubic' ? 2 : 1
  }

  let pathStart: Point
  if (!closed) {
    pathStart = points[0]
    emitRun(points)
  } else if (!anyCorner) {
    pathStart = points[0]
    const half = Math.max(1, Math.floor(n / 2))
    emitRun(points.slice(0, half + 1))
    emitRun([points[half], ...points.slice(half + 1), points[0]])
  } else {
    const start = corner.findIndex(Boolean)
    pathStart = points[start]
    const rotated = [...points.slice(start), ...points.slice(0, start), points[start]]
    const cornerAt: number[] = [0]
    for (let i = 1; i < rotated.length - 1; i++) {
      if (corner[(start + i) % n]) cornerAt.push(i)
    }
    cornerAt.push(rotated.length - 1)
    for (let k = 0; k < cornerAt.length - 1; k++) {
      const a = cornerAt[k]
      const b = cornerAt[k + 1]
      if (b <= a) continue
      emitRun(rotated.slice(a, b + 1))
    }
  }

  if (segs.length === 0) {
    const fallback: string[] = [`M${fmt(points[0].x, precision)} ${fmt(points[0].y, precision)}`]
    for (let i = 1; i < n; i++) fallback.push(`L${fmt(points[i].x, precision)} ${fmt(points[i].y, precision)}`)
    if (closed) fallback.push('Z')
    return { d: fallback.join(''), nodes: n }
  }

  const parts: string[] = [`M${fmt(pathStart.x, precision)} ${fmt(pathStart.y, precision)}`]
  for (const seg of segs) {
    if (seg.kind === 'cubic') {
      parts.push(
        `C${fmt(seg.c1.x, precision)} ${fmt(seg.c1.y, precision)} ${fmt(seg.c2.x, precision)} ${fmt(seg.c2.y, precision)} ${fmt(seg.end.x, precision)} ${fmt(seg.end.y, precision)}`,
      )
    } else {
      parts.push(`L${fmt(seg.end.x, precision)} ${fmt(seg.end.y, precision)}`)
    }
  }
  if (closed) parts.push('Z')
  return { d: parts.join(''), nodes }
}

export function simplifyLoop(
  points: Point[],
  epsilon: number,
): { points: Point[]; area: number } {
  const closedPoints = points.slice()
  closedPoints.push(closedPoints[0])
  const simplified = rdp(closedPoints, epsilon)
  simplified.pop()
  const area = Math.abs(shoelace(simplified))
  return { points: simplified, area }
}
