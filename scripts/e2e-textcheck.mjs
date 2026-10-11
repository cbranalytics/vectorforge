import { chromium } from 'playwright-core'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

const outDir = join(process.env.TEMP ?? '.', 'opencode')
mkdirSync(outDir, { recursive: true })
const fixture = join(outDir, 'ocr-check.png')

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage()

const dataUrl = await page.evaluate(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 240
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 900, 240)
  ctx.fillStyle = '#111111'
  ctx.font = '700 54px Arial'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Neutron Flux 2.5 MeV', 60, 90)
  ctx.font = 'italic 40px Georgia'
  ctx.fillText('STEP: prepare-specimen_v4', 60, 165)
  ctx.fillStyle = '#222222'
  ctx.fillRect(620, 60, 32, 8)
  return canvas.toDataURL('image/png')
})
writeFileSync(fixture, Buffer.from(dataUrl.split(',')[1], 'base64'))

const fixtureDataUrl = `data:image/png;base64,${readFileSync(fixture).toString('base64')}`

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' })
await page.setInputFiles('input[type="file"]', fixture)

let outcome = 'timeout'
for (let i = 0; i < 360; i++) {
  await page.waitForTimeout(500)
  const ready = await page.getByText('ready').first().isVisible().catch(() => false)
  if (ready) {
    outcome = 'ready'
    break
  }
}
console.log('outcome:', outcome)

// ground truth: where the text actually is in the source bitmap
const truth = await page.evaluate(async (dataUrl) => {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d')
  ctx.drawImage(bmp, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const dark = (x, y) => {
    const i = (y * c.width + x) * 4
    return d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100
  }
  // scan rows for dark ink bands (text lines), ignoring the bar at x>600
  const rows = []
  for (let y = 0; y < c.height; y++) {
    let n = 0
    for (let x = 0; x < 600; x++) if (dark(x, y)) n++
    rows.push(n)
  }
  const bands = []
  let start = -1
  for (let y = 0; y <= rows.length; y++) {
    if (y < rows.length && rows[y] > 2 && start < 0) start = y
    if ((y === rows.length || rows[y] <= 2) && start >= 0) {
      bands.push([start, y - 1])
      start = -1
    }
  }
  const lines = bands.map(([y0, y1]) => {
    let x0 = Infinity
    let x1 = -Infinity
    for (let y = y0; y <= y1; y++) for (let x = 0; x < 600; x++) if (dark(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x }
    return { x0, x1, y0, y1 }
  })
  return lines
}, fixtureDataUrl)

await page.getByRole('button', { name: 'Export', exact: true }).click()
const svg = await page.locator('textarea[readonly]').inputValue()
const svgPath = join(outDir, 'ocr-check.svg')
writeFileSync(svgPath, svg)

const rendered = await page.evaluate(async (svgText) => {
  const div = document.createElement('div')
  div.style.cssText = 'position:absolute;left:-9999px;top:0;'
  div.innerHTML = svgText
  document.body.appendChild(div)
  const out = []
  for (const t of div.querySelectorAll('text')) {
    const bb = t.getBBox()
    out.push({ text: t.textContent, x: bb.x, y: bb.y, w: bb.width, h: bb.height, fontSize: t.getAttribute('font-size'), yAttr: t.getAttribute('y') })
  }
  const pathBb = []
  for (const p of div.querySelectorAll('path')) {
    const bb = p.getBBox()
    pathBb.push({ x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height) })
  }
  div.remove()
  return { out, pathBb }
}, svg)

console.log('source ink bands (x0,x1,y0,y1):', JSON.stringify(truth))
console.log('rendered <text> boxes:', JSON.stringify(rendered.out, null, 1))
console.log('path boxes:', JSON.stringify(rendered.pathBb))

const line1 = truth[0]
const r1 = rendered.out[0]
if (line1 && r1) {
  console.log(`line1 dx=${(r1.x - line1.x0).toFixed(1)} dWidth=${(r1.w - (line1.x1 - line1.x0)).toFixed(1)} dTop=${(r1.y - line1.y0).toFixed(1)}`)
}

await browser.close()