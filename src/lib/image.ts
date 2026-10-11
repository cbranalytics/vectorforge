export interface PreparedImage {
  data: Uint8ClampedArray
  width: number
  height: number
  outWidth: number
  outHeight: number
}

const MAX_PIXELS = 9_000_000

export async function prepareImage(blob: Blob, maxDimension: number): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(blob)
  const outWidth = bitmap.width
  const outHeight = bitmap.height
  let scale = Math.min(1, maxDimension / Math.max(outWidth, outHeight))
  const pixels = outWidth * outHeight
  if (pixels * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / pixels)
  const width = Math.max(1, Math.round(outWidth * scale))
  const height = Math.max(1, Math.round(outHeight * scale))

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Unable to create 2D context')
  ctx.imageSmoothingEnabled = scale < 1
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  bitmap.close()

  return {
    data: imageData.data,
    width,
    height,
    outWidth,
    outHeight,
  }
}
