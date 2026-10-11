import { ShieldCheck } from 'lucide-react'
import type { FileItem } from '../types.ts'
import { formatBytes, formatCount, formatMs } from '../lib/format.ts'

export function StatusBar({ item, total, done }: { item: FileItem | null; total: number; done: number }) {
  const s = item?.result?.stats
  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-ink-700/80 bg-ink-950/70 px-3 text-[11px] text-ink-400 backdrop-blur">
      <span className="inline-flex items-center gap-1.5 text-emerald-300/90">
        <ShieldCheck size={12} />
        Client-side engine · files never leave your device
      </span>
      <span className="hidden sm:inline">{total > 0 ? `${done}/${total} converted` : 'Ready'}</span>
      <div className="ml-auto flex items-center gap-3 overflow-hidden font-mono">
        {item && s ? (
          <>
            <span className="hidden md:inline">
              {item.width}×{item.height} → {item.result?.outWidth}×{item.result?.outHeight}
            </span>
            <span>{s.colors} colours</span>
            <span>{formatCount(s.nodes)} nodes</span>
            <span className="hidden sm:inline">{s.textBlocks} text</span>
            <span>{formatMs(item.timeMs)}</span>
            <span className="text-aqua-300">{formatBytes(item.svgBytes)}</span>
          </>
        ) : (
          <span>No active job</span>
        )}
      </div>
    </footer>
  )
}
