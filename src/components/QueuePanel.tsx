import { AlertTriangle, CircleCheck, LoaderCircle, RefreshCw, Trash, X } from 'lucide-react'
import type { FileItem } from '../types.ts'
import { formatBytes } from '../lib/format.ts'
import { cx } from '../lib/cx.ts'
import { Badge, Button, ProgressBar } from './ui.tsx'
import { Dropzone } from './Dropzone.tsx'

function statusBadge(item: FileItem) {
  switch (item.status) {
    case 'done':
      return (
        <Badge tone="success">
          <CircleCheck size={10} /> ready
        </Badge>
      )
    case 'error':
      return (
        <Badge tone="danger">
          <AlertTriangle size={10} /> failed
        </Badge>
      )
    case 'queued':
      return <Badge tone="neutral">queued</Badge>
    default:
      return (
        <Badge tone="accent">
          <LoaderCircle size={10} className="spin-slow" /> {item.status}
        </Badge>
      )
  }
}

export function QueuePanel({
  items,
  activeId,
  busy,
  onSelect,
  onRemove,
  onClear,
  onFiles,
  onRetry,
}: {
  items: FileItem[]
  activeId: string | null
  busy: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onFiles: (files: File[]) => void
  onRetry: (id: string) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          Batch queue {items.length > 0 ? `· ${items.length}` : ''}
        </h2>
        {items.length > 0 ? (
          <Button variant="ghost" onClick={onClear} className="px-2 py-1 text-[11px]">
            Clear
          </Button>
        ) : null}
      </div>

      <Dropzone onFiles={onFiles} compact />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {items.length === 0 ? (
          <p className="px-1 pt-2 text-[11px] leading-relaxed text-ink-400">
            Queued images appear here with live conversion progress. Select one to inspect its vector layers.
          </p>
        ) : null}
        {items.map((item) => {
          const active = item.id === activeId
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(item.id)
              }}
              className={cx(
                'group cursor-pointer rounded-xl border p-2 transition-all duration-150',
                active ? 'border-accent-500/60 bg-accent-600/10' : 'border-ink-700 bg-ink-900/50 hover:border-ink-500 hover:bg-ink-850',
              )}
            >
              <div className="flex items-start gap-2">
                <img
                  src={item.url}
                  alt={item.name}
                  className="checker h-11 w-11 shrink-0 rounded-lg border border-ink-700 object-contain"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <p className="truncate text-xs font-medium text-ink-100" title={item.name}>
                      {item.name}
                    </p>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onRemove(item.id)
                      }}
                      className="rounded p-0.5 text-ink-500 opacity-0 transition-opacity hover:bg-ink-800 hover:text-rose-300 group-hover:opacity-100"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-ink-400">
                    <span className="font-mono">
                      {item.width}×{item.height}
                    </span>
                    <span>{formatBytes(item.size)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    {statusBadge(item)}
                    {item.status === 'done' ? (
                      <span className="font-mono text-[10px] text-ink-400">{formatBytes(item.svgBytes)}</span>
                    ) : null}
                    {item.status === 'error' ? (
                      <Button
                        variant="ghost"
                        icon={<RefreshCw size={11} />}
                        className="px-1.5 py-0.5 text-[10px]"
                        onClick={(event) => {
                          event.stopPropagation()
                          onRetry(item.id)
                        }}
                      >
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              {item.status !== 'done' && item.status !== 'error' && item.status !== 'queued' ? (
                <div className="mt-2">
                  <ProgressBar value={item.progress} />
                  <p className="mt-1 truncate text-[10px] text-ink-400">{item.stage}</p>
                </div>
              ) : null}
              {item.status === 'error' && item.error ? (
                <p className="mt-1.5 line-clamp-2 text-[10px] text-rose-300">{item.error}</p>
              ) : null}
              {item.status === 'done' && item.ocrError ? (
                <p className="mt-1.5 line-clamp-2 text-[10px] text-amber-300">{item.ocrError}</p>
              ) : null}
            </div>
          )
        })}
      </div>

      {items.length > 1 ? (
        <Button
          variant="outline"
          icon={<Trash size={13} />}
          onClick={onClear}
          disabled={busy}
          className="w-full"
        >
          Reset queue
        </Button>
      ) : null}
    </div>
  )
}
