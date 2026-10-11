import { createWorker } from 'tesseract.js'
import type { TextBox } from '../types.ts'

interface LineLike {
  words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; font_name?: string }>
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
  baseline?: { x0: number; y0: number; x1: number; y1: number }
  rowAttributes?: { ascenders?: number; descenders?: number; rowHeight?: number }
}

export interface OcrOutcome {
  boxes: TextBox[]
  ms: number
  width: number
  height: number
}

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null
let progressSink: ((value: number, status: string) => void) | null = null

function getWorker(language: string) {
  if (!workerPromise) {
    workerPromise = createWorker(language, undefined, {
      logger: (message) => {
        if (message && typeof message.progress === 'number') {
          progressSink?.(message.progress, message.status ?? '')
        }
      },
      errorHandler: () => {},
    })
  }
  return workerPromise
}

export async function recognizeText(
  image: Blob,
  options: { confidence: number; language?: string; onProgress?: (value: number, status: string) => void },
): Promise<OcrOutcome> {
  const started = performance.now()
  progressSink = options.onProgress ?? null
  const worker = await getWorker(options.language ?? 'eng')
  const { data } = await worker.recognize(image, {}, { blocks: true, text: true })

  const boxes: TextBox[] = []
  const blocks = (data.blocks ?? []) as Array<{ paragraphs?: Array<{ lines?: LineLike[] }> }>
  for (const block of blocks) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const words = (line.words ?? []).filter(
          (word) => word.text.trim().length > 0 && word.confidence >= options.confidence,
        )
        if (words.length === 0) continue
        // Drop bar-like artifacts: dark graphics near the text get OCR'd as
        // tall-narrow pseudo-words (e.g. an em-dash for a rectangle).
        const heights = words
          .map((word) => word.bbox.y1 - word.bbox.y0)
          .filter((h) => h > 0)
          .sort((a, b) => a - b)
        const medianH = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 0
        const kept =
          medianH > 0
            ? words.filter((word) => {
                const h = word.bbox.y1 - word.bbox.y0
                const w = word.bbox.x1 - word.bbox.x0
                return !(h > medianH * 1.5 && w < h * 0.75)
              })
            : words
        const finalWords = kept.length > 0 ? kept : words
        const x0 = Math.min(...finalWords.map((w) => w.bbox.x0))
        const y0 = Math.min(...finalWords.map((w) => w.bbox.y0))
        const x1 = Math.max(...finalWords.map((w) => w.bbox.x1))
        const y1 = Math.max(...finalWords.map((w) => w.bbox.y1))
        const baseline = line.baseline
        const rotation = baseline ? (Math.atan2(baseline.y1 - baseline.y0, baseline.x1 - baseline.x0) * 180) / Math.PI : 0
        const rowHeight = line.rowAttributes?.rowHeight ?? y1 - y0
        const ascenders = line.rowAttributes?.ascenders
        const descenders = line.rowAttributes?.descenders
        boxes.push({
          text: finalWords.map((w) => w.text).join(' '),
          x: x0,
          y: y0,
          w: x1 - x0,
          h: y1 - y0,
          confidence: line.confidence,
          fontName: words[0]?.font_name,
          rowHeight,
          baselineY: baseline?.y0,
          rotation: Math.abs(rotation) > 0.4 ? rotation : 0,
          ascenders,
          descenders,
        })
      }
    }
  }
  progressSink = null

  return {
    boxes,
    ms: performance.now() - started,
    width: 0,
    height: 0,
  }
}

export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise.catch(() => null)
    workerPromise = null
    if (worker) await worker.terminate().catch(() => {})
  }
}
