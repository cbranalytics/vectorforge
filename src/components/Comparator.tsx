import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react'
import { Columns2, Image as ImageIcon, Maximize, MoveHorizontal, Shapes, SquareDashed, ZoomIn, ZoomOut } from 'lucide-react'
import type { FileItem } from '../types.ts'
import { renderPreviewUrl } from '../lib/svg.ts'
import { cx } from '../lib/cx.ts'
import { Badge, Button, ProgressBar, Segmented } from './ui.tsx'

export type ViewMode = 'slider' | 'side' | 'vector' | 'original'

interface ViewState {
  zoom: number
  panX: number
  panY: number
  slider: number
  checker: boolean
}

const DEFAULTS: ViewState = { zoom: 1, panX: 0, panY: 0, slider: 0.5, checker: true }

export function Comparator({
  item,
  previewSvg,
  busy,
}: {
  item: FileItem | null
  previewSvg: string
  busy: boolean
}) {
  const [mode, setMode] = useState<ViewMode>('slider')
  const [view, setView] = useState<ViewState>(DEFAULTS)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const natural = {
    w: item?.result?.outWidth || item?.width || 1200,
    h: item?.result?.outHeight || item?.height || 800,
  }

  const fit = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const pad = 48
    const scale = Math.min((el.clientWidth - pad) / natural.w, (el.clientHeight - pad) / natural.h)
    setView((v) => ({ ...v, zoom: Math.max(0.05, Math.min(24, scale)), panX: 0, panY: 0 }))
  }, [natural.w, natural.h])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setView((v) => {
        if (Math.abs(v.zoom - 1) > 0.001) return v
        const scale = Math.min((el.clientWidth - 48) / natural.w, (el.clientHeight - 48) / natural.h)
        return { ...v, zoom: Math.max(0.05, Math.min(24, scale)) }
      })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [natural.w, natural.h])

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const mx = event.clientX - rect.left - rect.width / 2
    const my = event.clientY - rect.top - rect.height / 2
    setView((v) => {
      const next = Math.max(0.05, Math.min(32, v.zoom * Math.exp(-event.deltaY * 0.0015)))
      const k = next / v.zoom
      return { ...v, zoom: next, panX: mx - (mx - v.panX) * k, panY: my - (my - v.panY) * k }
    })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, panX: view.panX, panY: view.panY }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setView((v) => ({ ...v, panX: drag.panX + (event.clientX - drag.x), panY: drag.panY + (event.clientY - drag.y) }))
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const startSlider = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const move = (ev: { clientX: number }) => {
      const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
      setView((v) => ({ ...v, slider: p }))
    }
    move(event)
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const handler = (ev: PointerEvent) => move(ev)
    const cleanup = () => {
      target.removeEventListener('pointermove', handler as EventListener)
      target.removeEventListener('pointerup', cleanup)
      target.removeEventListener('pointercancel', cleanup)
    }
    target.addEventListener('pointermove', handler as EventListener)
    target.addEventListener('pointerup', cleanup)
    target.addEventListener('pointercancel', cleanup)
  }

  const boxStyle = {
    width: natural.w * view.zoom,
    height: natural.h * view.zoom,
    transform: `translate(${view.panX}px, ${view.panY}px)`,
  }

  const processing = busy && item != null && item.status !== 'done'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'slider', label: <span className="flex items-center gap-1"><MoveHorizontal size={13} /> Compare</span>, title: 'A/B slider' },
            { value: 'side', label: <span className="flex items-center gap-1"><Columns2 size={13} /> Split</span>, title: 'Side by side' },
            { value: 'vector', label: <span className="flex items-center gap-1"><Shapes size={13} /> Vector</span>, title: 'Vector only' },
            { value: 'original', label: <span className="flex items-center gap-1"><ImageIcon size={13} /> Raster</span>, title: 'Original only' },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" icon={<ZoomOut size={14} />} onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.05, v.zoom / 1.25) }))} aria-label="Zoom out" className="px-2" />
          <span className="w-12 text-center font-mono text-[11px] text-ink-300">{Math.round(view.zoom * 100)}%</span>
          <Button variant="ghost" icon={<ZoomIn size={14} />} onClick={() => setView((v) => ({ ...v, zoom: Math.min(32, v.zoom * 1.25) }))} aria-label="Zoom in" className="px-2" />
          <Button variant="ghost" icon={<Maximize size={14} />} onClick={fit} aria-label="Fit to view" className="px-2" />
          <Button
            variant="ghost"
            icon={<SquareDashed size={14} />}
            onClick={() => setView((v) => ({ ...v, checker: !v.checker }))}
            aria-label="Toggle transparency checkerboard"
            className={cx('px-2', view.checker ? 'text-accent-300' : 'text-ink-400')}
          />
        </div>
      </div>

      <div
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cx(
          'relative min-h-0 flex-1 touch-none overflow-hidden rounded-xl border border-ink-700 bg-ink-900/40',
          view.checker ? 'checker' : 'bg-ink-900',
        )}
      >
        {item ? (
          <>
            <div className="grid-overlay pointer-events-none absolute inset-0 opacity-40" />
            {mode === 'side' ? (
              <div className="absolute inset-0 flex">
                <Pane title="Raster source" className="border-r border-ink-700">
                  <img src={item.url} alt="Original" className="max-h-full max-w-full object-contain" draggable={false} />
                </Pane>
                <Pane title="Vector output">
                  {previewSvg ? <img src={renderPreviewUrl(previewSvg)} alt="Vector" className="max-h-full max-w-full object-contain" draggable={false} /> : <Empty />}
                </Pane>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <div className="relative" style={boxStyle}>
                  {mode !== 'original' && previewSvg ? (
                    <img
                      src={renderPreviewUrl(previewSvg)}
                      alt="Vector preview"
                      className="absolute inset-0 h-full w-full select-none object-contain"
                      draggable={false}
                    />
                  ) : null}
                  {mode === 'vector' && !previewSvg ? (
                    <div className="absolute inset-0 grid place-items-center text-xs text-ink-400">Vector preview pending</div>
                  ) : null}
                  {mode === 'slider' || mode === 'original' ? (
                    <img
                      src={item.url}
                      alt="Original raster"
                      draggable={false}
                      className="absolute inset-0 h-full w-full select-none object-contain"
                      style={mode === 'slider' ? { clipPath: `inset(0 ${(1 - view.slider) * 100}% 0 0)` } : undefined}
                    />
                  ) : null}
                </div>
              </div>
            )}

            {mode === 'slider' ? (
              <div
                className="absolute inset-y-0 z-10 w-8 -translate-x-1/2 cursor-ew-resize"
                style={{ left: `${view.slider * 100}%` }}
                onPointerDown={startSlider}
              >
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-aqua-400 to-transparent" />
                <div className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-aqua-400/70 bg-ink-900/90 shadow-lg">
                  <MoveHorizontal size={15} className="text-aqua-300" />
                </div>
              </div>
            ) : null}

            {processing ? (
              <div className="absolute inset-0 z-20 grid place-items-center bg-ink-950/70 backdrop-blur-[2px]">
                <div className="w-64 rounded-xl border border-ink-700 bg-ink-900/90 p-4">
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="font-semibold uppercase tracking-wider text-accent-300">{item.status === 'ocr' ? 'Text recognition' : 'Vectorizing'}</span>
                    <span className="font-mono text-ink-300">{Math.round(item.progress * 100)}%</span>
                  </div>
                  <ProgressBar value={item.progress} />
                  <p className="mt-2 truncate text-[11px] text-ink-400">{item.stage}</p>
                </div>
              </div>
            ) : null}

            <div className="absolute bottom-2 left-2 z-10 flex flex-wrap items-center gap-1.5">
              <Badge tone={mode === 'original' ? 'neutral' : 'accent'}>
                {mode === 'slider' ? 'A/B overlay' : mode === 'side' ? 'side by side' : mode === 'vector' ? 'vector only' : 'raster only'}
              </Badge>
              {item.result ? (
                <>
                  <Badge tone="aqua">{item.result.stats.colors} colors</Badge>
                  <Badge tone="neutral">{item.result.stats.nodes} nodes</Badge>
                  {item.result.stats.scale < 0.999 ? <Badge tone="warn">×{item.result.stats.scale.toFixed(2)} trace</Badge> : null}
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-ink-600 bg-ink-800/70 text-accent-300">
                <Shapes size={22} />
              </div>
              <p className="text-sm font-semibold text-ink-100">Precision vector workspace</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">
                Add a PNG, JPG or WebP to trace it into clean SVG paths, recognise its text as editable SVG
                <span className="font-mono"> &lt;text&gt; </span>, and inspect every layer.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Pane({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('relative flex-1 overflow-hidden', className)}>
      <div className="absolute left-2 top-2 z-10 rounded-md border border-ink-700 bg-ink-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-300">
        {title}
      </div>
      <div className="flex h-full w-full items-center justify-center p-3">{children}</div>
    </div>
  )
}

function Empty() {
  return <span className="text-xs text-ink-400">Waiting for a traced result…</span>
}
