import { prepareImage } from '../lib/image.ts'
import { traceImage } from '../lib/pipeline.ts'
import type { TextBox, TraceParams } from '../types.ts'

interface TraceRequest {
  id: number
  blob: Blob
  params: TraceParams
  textBoxes: TextBox[]
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TraceRequest>) => void) | null
  postMessage: (message: unknown) => void
}

scope.onmessage = async (event) => {
  const { id, blob, params, textBoxes } = event.data
  try {
    scope.postMessage({ type: 'progress', id, stage: 'Decoding image', value: 0.01 })
    const image = await prepareImage(blob, params.maxDimension)
    const factor = image.width / image.outWidth
    const scaledBoxes = textBoxes.map((box) => ({
      ...box,
      x: box.x * factor,
      y: box.y * factor,
      w: box.w * factor,
      h: box.h * factor,
      rowHeight: box.rowHeight != null ? box.rowHeight * factor : undefined,
      baselineY: box.baselineY != null ? box.baselineY * factor : undefined,
      ascenders: box.ascenders != null ? box.ascenders * factor : undefined,
      descenders: box.descenders != null ? box.descenders * factor : undefined,
      confidence: box.confidence,
    }))
    const result = traceImage(
      image.data,
      image.width,
      image.height,
      params,
      scaledBoxes,
      image.outWidth,
      image.outHeight,
      (stage, value) => scope.postMessage({ type: 'progress', id, stage, value }),
    )
    scope.postMessage({ type: 'done', id, result })
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
