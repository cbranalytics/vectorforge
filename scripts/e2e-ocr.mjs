import { chromium } from 'playwright-core'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const outDir = join(process.env.TEMP ?? '.', 'opencode')
mkdirSync(outDir, { recursive: true })
const fixture = join(outDir, 'ocr-sample.png')

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
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 900, 240)
  ctx.fillStyle = '#111111'
  ctx.font = '700 54px Arial'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Neutron Flux 2.5 MeV', 60, 90)
  ctx.font = 'italic 40px Georgia'
  ctx.fillText('STEP: prepare-specimen_v4', 60, 165)
  const unit = 8
  ctx.fillStyle = '#222222'
  ctx.fillRect(620, 60, unit * 4, unit)
  return canvas.toDataURL('image/png')
})
if (!dataUrl) throw new Error('no canvas data')
writeFileSync(fixture, Buffer.from(dataUrl.split(',')[1], 'base64'))
console.log('OCR fixture written:', dataUrl.length, 'chars')

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' })
await page.setInputFiles('input[type="file"]', fixture)

let outcome = 'timeout'
for (let i = 0; i < 360; i++) {
  await page.waitForTimeout(500)
  const ready = await page.getByText('ready').first().isVisible().catch(() => false)
  const failed = await page.getByText('failed').first().isVisible().catch(() => false)
  if (ready || failed) {
    outcome = ready ? 'ready' : 'failed'
    break
  }
}
console.log('outcome:', outcome)

const ocrUnavailable = await page.getByText('OCR unavailable').first().isVisible().catch(() => false)
console.log('ocr unavailable:', ocrUnavailable)

const textTab = await page.getByRole('button', { name: new RegExp('^Text\\d*$') })
const label = await textTab.first().innerText().catch(() => '')
console.log('text tab label:', label.replace(/\s+/g, ' ').trim())
await textTab.first().click()
await page.waitForTimeout(300)

await page.getByRole('button', { name: 'Export', exact: true }).click()
const svg = await page.locator('textarea[readonly]').inputValue().catch(() => '')
console.log('svg has <text>:', svg.includes('<text'))
console.log('svg text count:', (svg.match(/<text/g) ?? []).length)
console.log('contains Neutron:', svg.includes('Neutron'))
console.log('contains STEP:', svg.includes('STEP'))

await browser.close()
process.exit(ocrUnavailable ? 1 : 0)