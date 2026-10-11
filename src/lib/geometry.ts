import type { BBox, ShapeItem } from '../types.ts'

export interface Point {
  x: number
  y: number
}

export function bboxOf(points: Point[]): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function shoelace(points: Point[]): number {
  let sum = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function sign(v: number): number {
  return v < 0 ? -1 : v > 0 ? 1 : 0
}

function distToSegmentSq(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  if (len === 0) {
    const px = p.x - a.x
    const py = p.y - a.y
    return px * px + py * py
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  const ex = p.x - cx
  const ey = p.y - cy
  return ex * ex + ey * ey
}

export function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3 || epsilon <= 0) return points.slice()
  const epsSq = epsilon * epsilon
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number]
    let maxDist = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distToSegmentSq(points[i], points[first], points[last])
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index !== -1 && maxDist > epsSq && last - first > 1) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  const out: Point[] = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out
}

export function gridSnap(points: Point[], step: number): Point[] {
  if (step <= 0) return points
  return points.map((p) => ({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }))
}

export function orthoSnap(points: Point[], step: number): Point[] {
  if (points.length < 2) return points
  const out = points.map((p) => ({ ...p }))
  const n = out.length
  for (let i = 0; i < n - 1; i++) {
    const a = out[i]
    const b = out[i + 1]
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    if (dx <= step && dy > dx) {
      const mid = (a.x + b.x) / 2
      a.x = mid
      b.x = mid
    } else if (dy <= step && dx > dy) {
      const mid = (a.y + b.y) / 2
      a.y = mid
      b.y = mid
    }
  }
  return out
}

export function turnCos(prev: Point, cur: Point, next: Point): number {
  const ax = cur.x - prev.x
  const ay = cur.y - prev.y
  const bx = next.x - cur.x
  const by = next.y - cur.y
  const na = Math.hypot(ax, ay)
  const nb = Math.hypot(bx, by)
  if (na === 0 || nb === 0) return 1
  return (ax * bx + ay * by) / (na * nb)
}

export function isCorner(prev: Point, cur: Point, next: Point, cornerAngleDeg: number): boolean {
  const limit = Math.cos((cornerAngleDeg * Math.PI) / 180)
  return turnCos(prev, cur, next) < limit
}

export function tryRect(points: Point[], tol: number): ShapeItem | null {
  if (points.length < 4 || points.length > 40) return null
  const box = bboxOf(points)
  if (box.w < 3 || box.h < 3) return null
  const area = Math.abs(shoelace(points))
  const boxArea = box.w * box.h
  if (area / boxArea < 0.86) return null
  const x1 = box.x + box.w
  const y1 = box.y + box.h
  let residual = 0
  for (const p of points) {
    const d = Math.min(
      Math.abs(p.x - box.x),
      Math.abs(p.x - x1),
      Math.abs(p.y - box.y),
      Math.abs(p.y - y1),
    )
    if (d > tol) return null
    residual += d
  }
  if (residual / points.length > tol * 0.6) return null
  return {
    kind: 'rect',
    d: '',
    nodes: 4,
    area,
    bbox: box,
    rect: { x: box.x, y: box.y, w: box.w, h: box.h },
  }
}

export function tryCircle(points: Point[], tol: number): ShapeItem | null {
  if (points.length < 6) return null
  const box = bboxOf(points)
  const rx = box.w / 2
  const ry = box.h / 2
  if (rx < 3 || ry < 3) return null
  if (Math.abs(rx - ry) / Math.max(rx, ry) > 0.12) return null
  const cx = box.x + rx
  const cy = box.y + ry
  const r = (rx + ry) / 2
  const area = Math.abs(shoelace(points))
  if (area / (Math.PI * rx * ry) < 0.85) return null
  let err = 0
  for (const p of points) {
    const d = Math.hypot(p.x - cx, p.y - cy) - r
    err += d * d
  }
  if (Math.sqrt(err / points.length) > tol) return null
  return {
    kind: 'circle',
    d: '',
    nodes: 4,
    area,
    bbox: box,
    circle: { cx, cy, r },
  }
}
