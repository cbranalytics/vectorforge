import { chromium } from 'playwright-core'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = join(HERE, 'fixtures', 'sample-cells.png')

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
await page.route(/^(https?:\/\/.*\.(jsdelivr|unpkg)\.(net|com)|.*tessdata.*)/, (route) => route.abort())
const errors = []
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' })
await page.setInputFiles('input[type="file"]', fixture)

let outcome = 'timeout'
for (let i = 0; i < 240; i++) {
  await page.waitForTimeout(500)
  const ready = await page.getByText('ready').first().isVisible().catch(() => false)
  const failed = await page.getByText('failed').first().isVisible().catch(() => false)
  if (ready || failed) {
    outcome = ready ? 'ready' : 'failed'
    break
  }
}
const ocrUnavailable = await page.getByText('OCR unavailable').first().isVisible().catch(() => false)
const svgHasText = (await page.getByRole('button', { name: 'Export', exact: true }).click().catch(() => {}).then(() => page.locator('textarea[readonly]').inputValue().catch(() => ''))).includes('<text')
console.log(`offline-ocr outcome=${outcome} ocrUnavailable=${ocrUnavailable} svgHasText=${svgHasText}`)
console.log(errors.length ? errors.join('\n') : 'no page errors')
await browser.close()
process.exit(errors.length ? 1 : 0)