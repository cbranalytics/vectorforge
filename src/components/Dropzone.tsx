import { useState } from 'react'
import type { DragEvent } from 'react'
import { FileImage, Upload } from 'lucide-react'
import { cx } from '../lib/cx.ts'

export function Dropzone({ onFiles, compact }: { onFiles: (files: File[]) => void; compact?: boolean }) {
  const [over, setOver] = useState(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setOver(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={cx(
        'rounded-xl border border-dashed transition-colors duration-150',
        compact ? 'p-3' : 'p-6',
        over ? 'border-accent-400 bg-accent-600/10' : 'border-ink-600 bg-ink-900/40',
      )}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span className={cx('grid place-items-center rounded-lg border border-ink-600 bg-ink-800/70 text-accent-300', compact ? 'h-8 w-8' : 'h-11 w-11')}>
          {compact ? <FileImage size={15} /> : <Upload size={20} />}
        </span>
        <div>
          <p className="text-xs font-semibold text-ink-100">Drop PNG, JPG or WebP</p>
          <p className="mt-0.5 text-[11px] text-ink-400">Up to 10 MB per file · batch supported</p>
        </div>
      </div>
    </div>
  )
}

export function DropOverlay({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent-400/70 bg-ink-900/80 px-12 py-10 shadow-2xl">
        <Upload size={30} className="text-accent-300" />
        <p className="text-sm font-semibold text-ink-100">Release to add to the forge</p>
      </div>
    </div>
  )
}
