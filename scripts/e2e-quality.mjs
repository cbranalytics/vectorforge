import { chromium } from 'playwright-core'
import { join } from 'node:path'

const fixture = 'C:\\Users\\Arif Ullah\\Documents\\SVG Creater\\scripts\\fixtures\\sample-cells.png'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' })
await page.setInputFiles('input[type="file"]', fixture)
let ready = false
for (let i = 0; i < 240; i++) {
  await page.waitForTimeout(500)
  ready = await page.getByText('ready').first().isVisible().catch(() => false)
  if (ready) break
}
console.log('ready:', ready)
await page.getByRole('button', { name: 'Export', exact: true }).click()
await page.locator('textarea[readonly]').waitFor({ timeout: 15000 })
const svg = await page.locator('textarea[readonly]').inputValue()
console.log('svg bytes:', svg.length)

const report = await page.evaluate(async ({ svgText, fixtureUrl }) => {
  async function rasterize(blobUrl, overWhite) {
    const img = new Image()
    img.src = blobUrl
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    if (overWhite) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
    }
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, c.width, c.height)
  }
  const src = await rasterize(fixtureUrl, false)
  const out = await rasterize(URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' })), true)
  const n = Math.min(src.data.length, out.data.length)
  let match = 0
  let total = 0
  let sumDist = 0
  const tol = 24
  for (let i = 0; i < n; i += 4) {
    if (src.data[i + 3] < 96) continue
    total++
    const dr = src.data[i] - out.data[i]
    const dg = src.data[i + 1] - out.data[i + 1]
    const db = src.data[i + 2] - out.data[i + 2]
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    sumDist += dist
    if (dist < tol) match++
  }
  // count path commands in the svg
  const cubics = (svgText.match(/C-?\d/g) || []).length
  const lines = (svgText.match(/L-?\d/g) || []).length
  return { total, match, pct: ((match / total) * 100).toFixed(1), avgDist: (sumDist / total).toFixed(1), cubics, lines, sample: svgText.slice(0, 400) }
}, { svgText: svg, fixtureUrl: `data:image/png;base64,${(await import('node:fs')).readFileSync(fixture).toString('base64')}` })

console.log(`pixel match: ${report.match}/${report.total} = ${report.pct}% (tol 24)`)
console.log(`avg color distance: ${report.avgDist}/765`)
console.log(`path commands: ${report.cubics} cubics, ${report.lines} lines`)
console.log('svg sample:', report.sample)

await page.screenshot({ path: join(process.env.TEMP ?? '.', 'opencode', 'quality-check.png') })
await browser.close()