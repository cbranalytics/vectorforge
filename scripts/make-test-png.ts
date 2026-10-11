import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const W = 640
const H = 400

const pixels = new Uint8ClampedArray(W * H * 4)
for (let i = 0; i < pixels.length; i += 4) {
  pixels[i] = 255
  pixels[i + 1] = 255
  pixels[i + 2] = 255
  pixels[i + 3] = 255
}

function set(x: number, y: number, r: number, g: number, b: number) {
  const i = (y * W + x) * 4
  if (x < 0 || y < 0 || x >= W || y >= H) return
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c[0], c[1], c[2])
}

function fillCircle(cx: number, cy: number, r: number, c: [number, number, number]) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, c[0], c[1], c[2])
    }
  }
}

const NAVY: [number, number, number] = [24, 36, 80]
const RED: [number, number, number] = [214, 60, 40]
const TEAL: [number, number, number] = [18, 140, 120]

fillRect(60, 50, 300, 130, NAVY)
fillRect(360, 60, 540, 140, NAVY)
fillCircle(560, 300, 42, RED)
fillRect(50, 210, 470, 215, NAVY)
fillRect(150, 300, 560, 305, NAVY)
fillRect(72, 215, 140, 250, NAVY)
fillRect(210, 215, 278, 250, NAVY)
fillRect(348, 215, 416, 250, NAVY)
fillRect(486, 215, 554, 250, NAVY)
fillRect(120, 300, 180, 332, TEAL)
fillRect(120, 380, 420, 385, TEAL)
fillCircle(120, 342, 14, TEAL)

fillRect(60, 270, 300, 290, [15, 15, 15])

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const scanlines = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  scanlines[y * (W * 4 + 1)] = 0
  const row = pixels.subarray(y * W * 4, (y + 1) * W * 4)
  Buffer.from(row.buffer, row.byteOffset, row.byteLength).copy(scanlines, y * (W * 4 + 1) + 1)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8
ihdr[9] = 6
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = join(HERE, 'fixtures', 'sample-cells.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log('wrote', out, png.length, 'bytes')