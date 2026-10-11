import type { ProgressFn, TextBox, TraceParams, TraceResult } from '../types.ts'

interface Pending {
  resolve: (result: TraceResult) => void
  reject: (error: Error) => void
  onProgress?: ProgressFn
}

export class TraceEngine {
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<number, Pending>()

  private ensure(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../workers/trace.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as {
        type: 'progress' | 'done' | 'error'
        id?: number
        stage?: string
        value?: number
        result?: TraceResult
        error?: string
      }
      if (typeof message.id !== 'number') return
      const job = this.pending.get(message.id)
      if (!job) return
      if (message.type === 'progress') {
        job.onProgress?.(message.stage ?? '', message.value ?? 0)
      } else if (message.type === 'done' && message.result) {
        this.pending.delete(message.id)
        job.resolve(message.result)
      } else if (message.type === 'error') {
        this.pending.delete(message.id)
        job.reject(new Error(message.error ?? 'Tracing failed'))
      }
    }
    worker.onerror = (event) => {
      for (const job of this.pending.values()) job.reject(new Error(event.message || 'Worker error'))
      this.pending.clear()
    }
    this.worker = worker
    return worker
  }

  run(blob: Blob, params: TraceParams, textBoxes: TextBox[], onProgress?: ProgressFn): Promise<TraceResult> {
    const worker = this.ensure()
    const id = ++this.seq
    return new Promise<TraceResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress })
      worker.postMessage({ id, blob, params, textBoxes })
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
  }
}
