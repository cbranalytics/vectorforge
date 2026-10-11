export interface RGB {
  r: number
  g: number
  b: number
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = Number.parseInt(h.slice(0, 6) || '000000', 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function distSq(r: number, g: number, b: number, c: RGB): number {
  const dr = r - c.r
  const dg = g - c.g
  const db = b - c.b
  return dr * dr + dg * dg + db * db
}

export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function readableOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  return luminance(r, g, b) > 0.55 ? '#0b1120' : '#f8fafc'
}

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${hexToRgb(hex).r}, ${hexToRgb(hex).g}, ${hexToRgb(hex).b}, ${Number(a.toFixed(3))})`
}
