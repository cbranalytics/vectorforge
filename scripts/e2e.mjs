import { chromium } from 'playwright-core'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = join(HERE, 'fixtures', 'sample-cells.png')
const outDir = join(process.env.TEMP ?? '.', 'opencode')
mkdirSync(outDir, { recursive: true })

const launch = async () => {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ]
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ executablePath, headless: true })
    } catch (error) {
      console.warn(`launch failed for ${executablePath}: ${error.message.split('\n')[0]}`)
    }
  }
  throw new Error('No usable Chrome/Edge found')
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const errors = []
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 45000 })

const title = await page.title()
console.log('title:', title)

await page.setInputFiles('input[type="file"]', fixture)
console.log('uploaded fixture')

let done = false
for (let i = 0; i < 120; i++) {
  const ready = await page.getByText('ready').first().isVisible().catch(() => false)
  const failed = await page.getByText('failed').first().isVisible().catch(() => false)
  if (ready || failed) {
    done = true
    console.log('job finished:', ready ? 'ready' : 'failed', 'after', i, 'polls')
    break
  }
  await page.waitForTimeout(1000)
}
if (!done) {
  console.log('job did not finish within timeout')
}

await page.getByRole('button', { name: 'Export', exact: true }).click()
await page.waitForTimeout(400)

const svg = await page.locator('textarea[readonly]').inputValue().catch(() => '')
console.log('svg length:', svg.length)
console.log('has <svg>:', svg.includes('<svg'))
console.log('has viewBox:', /\bviewBox/.test(svg))
console.log('has path/primitives:', svg.includes('<path') || svg.includes('<rect') || svg.includes('<circle'))
console.log('has NaN:', /NaN|Infinity/.test(svg))
writeFileSync(join(outDir, 'vectorforge-e2e.svg'), svg)

await page.screenshot({ path: join(outDir, 'vectorforge-e2e.png'), fullPage: false })
console.log('screenshot:', join(outDir, 'vectorforge-e2e.png'))

const status = await page.locator('footer').innerText().catch(() => '')
console.log('status bar:', status.replace(/\s+/g, ' ').trim())

const panels = await page.evaluate(() => document.body.innerText.slice(0, 1200))
console.log('page text sample:', panels.replace(/\s+/g, ' ').trim().slice(0, 700))

if (errors.length) console.log('BROWSER ERRORS:\n' + errors.join('\n'))
else console.log('no browser errors')

await browser.close()
process.exit(errors.some((e) => !/favicon|net::ERR/.test(e)) ? 1 : 0)