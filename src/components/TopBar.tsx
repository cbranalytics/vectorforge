import { Download, FolderArchive, Plus, Sparkles } from 'lucide-react'
import { Button } from './ui.tsx'

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span
      className="relative grid place-items-center rounded-xl border border-accent-500/40 bg-gradient-to-br from-accent-600/40 to-aqua-500/20"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path d="M4 19 12 4l8 15" stroke="url(#g1)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M8.2 13.4h7.6" stroke="url(#g1)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="4" r="1.7" fill="#67e8f9" />
        <circle cx="4" cy="19" r="1.7" fill="#818cf8" />
        <circle cx="20" cy="19" r="1.7" fill="#818cf8" />
        <defs>
          <linearGradient id="g1" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a5b4fc" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  )
}

export function TopBar({
  itemCount,
  doneCount,
  busy,
  canExport,
  onPick,
  onExportActive,
  onExportAll,
  activeName,
}: {
  itemCount: number
  doneCount: number
  busy: boolean
  canExport: boolean
  onPick: () => void
  onExportActive: () => void
  onExportAll: () => void
  activeName: string | null
}) {
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-ink-700/80 bg-ink-950/70 px-3 backdrop-blur-xl sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo />
        <div className="min-w-0">
          <h1 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-ink-100">
            VectorForge AI
            <Sparkles size={13} className="text-aqua-400" />
          </h1>
          <p className="truncate text-[11px] text-ink-400">
            {activeName ? activeName : 'Raster to precision SVG'}
            {itemCount > 0 ? ` · ${doneCount}/${itemCount} ready` : ''}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {busy ? (
          <span className="hidden items-center gap-1.5 rounded-md border border-accent-500/40 bg-accent-600/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-300 md:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aqua-400" />
            Forging
          </span>
        ) : null}
        <Button variant="outline" icon={<Plus size={14} />} onClick={onPick} className="hidden sm:inline-flex">
          Add images
        </Button>
        <Button variant="outline" icon={<Download size={14} />} onClick={onExportActive} disabled={!canExport}>
          SVG
        </Button>
        <Button variant="primary" icon={<FolderArchive size={14} />} onClick={onExportAll} disabled={!canExport}>
          Export ZIP
        </Button>
      </div>
    </header>
  )
}
