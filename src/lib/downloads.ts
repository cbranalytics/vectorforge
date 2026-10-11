import JSZip from 'jszip'

export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function downloadText(text: string, filename: string, mime = 'image/svg+xml'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename)
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

export function safeName(name: string): string {
  return baseName(name).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'vector'
}

export async function buildZip(files: Array<{ name: string; content: string }>): Promise<Blob> {
  const zip = new JSZip()
  for (const file of files) zip.file(file.name, file.content)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length
}
