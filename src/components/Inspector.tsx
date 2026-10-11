import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Boxes,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Layers as LayersIcon,
  Package,
  ScanText,
  SlidersHorizontal,
} from 'lucide-react'
import type { FileItem, OcrSettings, PresetId, SvgSettings, TextLayer, TraceParams } from '../types.ts'
import { PRESETS, FONT_OPTIONS } from '../lib/presets.ts'
import { formatBytes, formatCount, formatMs, formatPct } from '../lib/format.ts'
import { readableOn } from '../lib/color.ts'
import { cx } from '../lib/cx.ts'
import { Badge, Button, SectionLabel, Segmented, Slider, Stat, Toggle } from './ui.tsx'

type Tab = 'mode' | 'refine' | 'layers' | 'text' | 'export'

export function Inspector({
  params,
  onParams,
  preset,
  onPreset,
  ocr,
  onOcr,
  svgSettings,
  onSvg,
  item,
  selectedLayerId,
  onSelectLayer,
  onToggleLayer,
  onUpdateText,
  onExportActive,
  onExportAll,
  onCopy,
  copied,
  onRerunOcr,
  ocrBusy,
}: {
  params: TraceParams
  onParams: (patch: Partial<TraceParams>) => void
  preset: PresetId
  onPreset: (id: PresetId) => void
  ocr: OcrSettings
  onOcr: (patch: Partial<OcrSettings>) => void
  svgSettings: SvgSettings
  onSvg: (patch: Partial<SvgSettings>) => void
  item: FileItem | null
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  onToggleLayer: (id: string) => void
  onUpdateText: (id: string, patch: Partial<TextLayer>) => void
  onExportActive: () => void
  onExportAll: () => void
  onCopy: () => void
  copied: boolean
  onRerunOcr: () => void
  ocrBusy: boolean
}) {
  const [tab, setTab] = useState<Tab>('mode')

  const result = item?.result ?? null
  const pathLayers = result ? result.layers.filter((l) => l.kind === 'path') : []
  const textLayers = result ? (result.layers.filter((l) => l.kind === 'text') as TextLayer[]) : []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-ink-700/70 px-2 pb-2">
        <TabButton active={tab === 'mode'} onClick={() => setTab('mode')} icon={<Gauge size={14} />} label="Engine" />
        <TabButton active={tab === 'refine'} onClick={() => setTab('refine')} icon={<SlidersHorizontal size={14} />} label="Refine" />
        <TabButton active={tab === 'layers'} onClick={() => setTab('layers')} icon={<LayersIcon size={14} />} label="Layers" badge={pathLayers.length} />
        <TabButton active={tab === 'text'} onClick={() => setTab('text')} icon={<ScanText size={14} />} label="Text" badge={textLayers.length} />
        <TabButton active={tab === 'export'} onClick={() => setTab('export')} icon={<Package size={14} />} label="Export" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'mode' ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <SectionLabel>Processing preset</SectionLabel>
              {PRESETS.map((def) => {
                const active = preset === def.id
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => onPreset(def.id)}
                    className={cx(
                      'w-full rounded-xl border p-3 text-left transition-all duration-150',
                      active ? 'border-accent-500/60 bg-accent-600/10 shadow-[0_0_0_1px_rgba(99,102,241,0.25)]' : 'border-ink-700 bg-ink-900/50 hover:border-ink-500',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-ink-100">{def.name}</p>
                      {active ? <Badge tone="accent">active</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] font-medium text-aqua-300">{def.tagline}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{def.description}</p>
                  </button>
                )
              })}
            </div>

            <div className="space-y-2 rounded-xl border border-ink-700 bg-ink-900/50 p-3">
              <SectionLabel
                right={<Badge tone={ocr.enabled ? 'success' : 'neutral'}>{ocr.enabled ? 'on' : 'off'}</Badge>}
              >
                Text &amp; font recognition
              </SectionLabel>
              <Toggle
                checked={ocr.enabled}
                onChange={(v) => onOcr({ enabled: v })}
                label="OCR preprocessing (Tesseract)"
                hint="Detects text lines and replaces them with live, editable SVG <text> elements instead of jagged outlines."
              />
              <Slider
                label="Minimum word confidence"
                value={ocr.confidence}
                min={0}
                max={95}
                step={1}
                onChange={(v) => onOcr({ confidence: v })}
                display={`${ocr.confidence}%`}
                hint="Lower keeps more text; higher avoids false positives on dense line art."
              />
              <Slider
                label="Trace resolution (long edge)"
                value={params.maxDimension}
                min={512}
                max={4096}
                step={64}
                onChange={(v) => onParams({ maxDimension: v })}
                display={`${params.maxDimension}px`}
                hint="Higher keeps hairlines sharper but costs processing time."
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-ink-400">
                  {item?.textBoxes ? `${item.textBoxes.length} text lines cached` : 'No OCR result yet'}
                </span>
                <Button
                  variant="outline"
                  icon={<ScanText size={13} />}
                  busy={ocrBusy}
                  disabled={!item}
                  onClick={onRerunOcr}
                >
                  Re-run OCR
                </Button>
              </div>
              {item?.ocrError ? <p className="text-[11px] leading-snug text-amber-300">{item.ocrError}</p> : null}
            </div>

            <div className="space-y-2 rounded-xl border border-ink-700 bg-ink-900/50 p-3">
              <SectionLabel>Editable text font</SectionLabel>
              <select
                value={ocr.fontFamily}
                onChange={(event) => onOcr({ fontFamily: event.target.value })}
                className="w-full rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-xs text-ink-100"
              >
                <option value="auto">Match preset (auto)</option>
                {FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-snug text-ink-400">
                Applied to every recognised text block. Override individual blocks in the Text tab.
              </p>
            </div>
          </div>
        ) : null}

        {tab === 'refine' ? (
          <div className="space-y-4">
            <div className="space-y-3.5">
              <Slider
                label="Colour layers"
                value={params.colorCount}
                min={2}
                max={24}
                step={1}
                onChange={(v) => onParams({ colorCount: v })}
                display={`${params.colorCount}`}
                hint="Palette size. Fewer colours = smaller file, more = better fidelity."
              />
              <Slider
                label="Detail retention"
                value={params.detail}
                min={0.2}
                max={1}
                step={0.01}
                onChange={(v) => onParams({ detail: v })}
                display={params.detail.toFixed(2)}
                hint="Controls corner simplification. High values keep hairlines and tiny features."
              />
              <Slider
                label="Curve smoothing"
                value={params.smoothing}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onParams({ smoothing: v })}
                display={params.smoothing.toFixed(2)}
                hint="0 = straight polygonal segments, 1 = flowing bezier curves."
              />
              <Slider
                label="Corner threshold"
                value={params.cornerAngle}
                min={20}
                max={120}
                step={1}
                onChange={(v) => onParams({ cornerAngle: v })}
                display={`${params.cornerAngle}°`}
                hint="Angles sharper than this stay as hard corners instead of smoothed."
              />
              <Slider
                label="Speckle removal (min area)"
                value={params.minArea}
                min={0}
                max={60}
                step={1}
                onChange={(v) => onParams({ minArea: v })}
                display={`${params.minArea}px²`}
              />
            </div>

            <div className="space-y-0.5 rounded-xl border border-ink-700 bg-ink-900/50 p-3">
              <SectionLabel>Geometry</SectionLabel>
              <Toggle checked={params.despeckle} onChange={(v) => onParams({ despeckle: v })} label="Despeckle noise" hint="Drops isolated pixels and scan artefacts." />
              <Toggle checked={params.snapOrthogonal} onChange={(v) => onParams({ snapOrthogonal: v })} label="Orthogonal snapping" hint="Pulls near-horizontal and near-vertical runs to exact axes." />
              <Toggle checked={params.fitPrimitives} onChange={(v) => onParams({ fitPrimitives: v })} label="Fit native primitives" hint="Emits <rect> and <circle> instead of polygons where geometry matches." />
              <Toggle checked={params.removeBackground} onChange={(v) => onParams({ removeBackground: v })} label="Remove solid background" hint="Drops a uniform border colour and leaves the canvas transparent." />
              <div className="pt-2">
                <p className="mb-1.5 text-xs font-medium text-ink-200">Coordinate grid snap</p>
                <Segmented
                  value={String(params.gridSnap)}
                  onChange={(v) => onParams({ gridSnap: Number(v) })}
                  size="sm"
                  options={[
                    { value: '0', label: 'Off' },
                    { value: '0.5', label: '0.5px' },
                    { value: '1', label: '1px' },
                    { value: '2', label: '2px' },
                  ]}
                />
              </div>
            </div>

            {result ? (
              <div className="space-y-2">
                <SectionLabel right={<span className="text-[11px] text-ink-400">{result.palette.length} colours</span>}>
                  Detected palette
                </SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {result.palette.slice(0, 24).map((entry) => (
                    <span
                      key={entry.color + entry.pixels}
                      title={`${entry.color} · ${formatPct(entry.pct)}`}
                      className="grid h-7 w-7 place-items-center rounded-md border border-white/10 font-mono text-[8px]"
                      style={{ background: entry.color, color: readableOn(entry.color) }}
                    >
                      {Math.round(entry.pct * 100)}
                    </span>
                  ))}
                </div>
                {result.background ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
                    <span className="h-3 w-3 rounded-sm border border-white/10" style={{ background: result.background }} />
                    Background {result.background}
                    {params.removeBackground ? ' · removed' : ' · kept'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'layers' ? (
          <div className="space-y-3">
            {!result ? <EmptyHint text="Trace an image to inspect its geometric layers." /> : null}
            {result ? (
              <>
                <div className="flex items-center justify-between">
                  <SectionLabel>Shape layers · {pathLayers.length}</SectionLabel>
                  {selectedLayerId ? (
                    <Button variant="ghost" className="px-2 py-0.5 text-[11px]" onClick={() => onSelectLayer(null)}>
                      Clear focus
                    </Button>
                  ) : null}
                </div>
                <p className="text-[11px] leading-snug text-ink-400">
                  Click a layer to isolate it in the preview and dim the others.
                </p>
                <div className="space-y-1.5">
                  {pathLayers.map((layer) => {
                    const active = layer.id === selectedLayerId
                    return (
                      <div
                        key={layer.id}
                        className={cx(
                          'rounded-lg border p-2 transition-colors duration-150',
                          active ? 'border-accent-500/60 bg-accent-600/10' : 'border-ink-700 bg-ink-900/50 hover:border-ink-500',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Focus ${layer.name}`}
                            onClick={() => onSelectLayer(active ? null : layer.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="h-6 w-6 shrink-0 rounded-md border border-white/10" style={{ background: layer.color }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-ink-100">{layer.name}</span>
                              <span className="block font-mono text-[10px] text-ink-400">
                                {layer.color} · {layer.nodes} nodes · {formatCount(layer.paths.length)} shapes
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Toggle ${layer.name}`}
                            onClick={() => onToggleLayer(layer.id)}
                            className={cx('rounded p-1 hover:bg-ink-800', layer.visible ? 'text-ink-300' : 'text-ink-500')}
                          >
                            {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-800">
                            <div className="h-full rounded-full bg-accent-500/70" style={{ width: `${Math.min(100, layer.area / 4)}%` }} />
                          </div>
                          <span className="font-mono text-[10px] text-ink-400">{formatCount(Math.round(layer.area))}px²</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === 'text' ? (
          <div className="space-y-3">
            {!result ? <EmptyHint text="Trace an image to review recognised text blocks." /> : null}
            {result && textLayers.length === 0 ? (
              <EmptyHint text="No live text was recognised. Increase detail or lower the confidence threshold, then re-run OCR." />
            ) : null}
            {textLayers.map((layer) => (
              <div
                key={layer.id}
                className={cx(
                  'rounded-xl border p-3 transition-colors duration-150',
                  layer.id === selectedLayerId ? 'border-accent-500/60 bg-accent-600/10' : 'border-ink-700 bg-ink-900/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectLayer(layer.id === selectedLayerId ? null : layer.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-xs font-medium text-ink-100">{layer.text}</p>
                    <p className="font-mono text-[10px] text-ink-400">
                      {Math.round(layer.w)}×{Math.round(layer.h)} · {layer.fontSize.toFixed(1)}px
                      {layer.rotation ? ` · ${layer.rotation.toFixed(1)}°` : ''}
                    </p>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={layer.confidence > 80 ? 'success' : layer.confidence > 60 ? 'warn' : 'danger'}>
                      {Math.round(layer.confidence)}%
                    </Badge>
                    <button
                      type="button"
                      aria-label="Toggle text visibility"
                      onClick={() => onToggleLayer(layer.id)}
                      className={cx('rounded p-1 hover:bg-ink-800', layer.visible ? 'text-ink-300' : 'text-ink-500')}
                    >
                      {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 space-y-2">
                  <input
                    value={layer.text}
                    onChange={(event) => onUpdateText(layer.id, { text: event.target.value })}
                    aria-label="Text content"
                    className="w-full rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-xs text-ink-100"
                  />
                  <select
                    value={layer.fontFamily}
                    onChange={(event) => onUpdateText(layer.id, { fontFamily: event.target.value })}
                    className="w-full rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-xs text-ink-100"
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-ink-300">
                      size
                      <input
                        type="number"
                        value={Number(layer.fontSize.toFixed(1))}
                        min={4}
                        max={400}
                        step={0.5}
                        onChange={(event) => onUpdateText(layer.id, { fontSize: Number(event.target.value) })}
                        className="w-16 rounded-md border border-ink-600 bg-ink-850 px-1.5 py-1 font-mono text-[11px]"
                      />
                    </label>
                    <input
                      type="color"
                      aria-label="Text colour"
                      value={layer.color}
                      onChange={(event) => onUpdateText(layer.id, { color: event.target.value })}
                      className="h-7 w-7 cursor-pointer rounded-md border border-ink-600 bg-transparent p-0.5"
                    />
                    <Segmented
                      size="sm"
                      value={String(layer.fontWeight)}
                      onChange={(v) => onUpdateText(layer.id, { fontWeight: Number(v) })}
                      options={[
                        { value: '400', label: 'Reg' },
                        { value: '500', label: 'Med' },
                        { value: '700', label: 'Bold' },
                      ]}
                    />
                    <Button
                      variant="ghost"
                      className={cx('px-2 py-1 text-[11px]', layer.italic && 'text-accent-300')}
                      onClick={() => onUpdateText(layer.id, { italic: !layer.italic })}
                    >
                      Italic
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'export' ? (
          <div className="space-y-4">
            <div className="space-y-0.5 rounded-xl border border-ink-700 bg-ink-900/50 p-3">
              <SectionLabel>SVG output</SectionLabel>
              <Toggle checked={svgSettings.pretty} onChange={(v) => onSvg({ pretty: v })} label="Pretty print" hint="Human-readable indentation (slightly larger file)." />
              <Toggle checked={svgSettings.metadata} onChange={(v) => onSvg({ metadata: v })} label="Embed metadata" hint="Adds <title> and <desc> describing the trace." />
              <Toggle checked={svgSettings.includeBackground} onChange={(v) => onSvg({ includeBackground: v })} label="Include background rect" hint="Paints the detected background colour behind the shapes." />
              <div className="pt-2">
                <Slider
                  label="Coordinate precision"
                  value={svgSettings.precision}
                  min={0}
                  max={4}
                  step={1}
                  onChange={(v) => onSvg({ precision: v })}
                  display={`${svgSettings.precision} dp`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Stat label="Paths" value={result ? formatCount(result.stats.paths) : '—'} />
              <Stat label="Nodes" value={result ? formatCount(result.stats.nodes) : '—'} />
              <Stat label="Live text" value={result ? result.stats.textBlocks : '—'} />
              <Stat label="Trace time" value={result ? formatMs(result.stats.ms) : '—'} />
              <Stat label="SVG size" value={item?.svgBytes ? formatBytes(item.svgBytes) : '—'} tone="text-aqua-300" />
              <Stat
                label="Reduction"
                value={item?.svgBytes && item.size ? formatPct(Math.max(0, 1 - item.svgBytes / item.size)) : '—'}
                tone="text-emerald-300"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Download size={14} />} disabled={!item?.svg} onClick={onExportActive}>
                Download SVG
              </Button>
              <Button variant="outline" icon={copied ? <ClipboardCheck size={14} /> : <Copy size={14} />} disabled={!item?.svg} onClick={onCopy}>
                {copied ? 'Copied' : 'Copy SVG'}
              </Button>
              <Button variant="outline" icon={<Package size={14} />} disabled={!item?.svg} onClick={onExportAll}>
                Zip all
              </Button>
            </div>

            {item?.svg ? (
              <div className="space-y-1.5">
                <SectionLabel right={<span className="font-mono text-[11px] text-ink-400">{formatBytes(item.svgBytes)}</span>}>
                  SVG source
                </SectionLabel>
                <textarea
                  readOnly
                  value={item.svg}
                  spellCheck={false}
                  className="h-52 w-full resize-y rounded-lg border border-ink-700 bg-ink-950/80 p-2 font-mono text-[10px] leading-relaxed text-ink-300"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition-colors duration-150',
        active ? 'bg-accent-600/15 text-accent-300' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200',
      )}
    >
      <span className="flex items-center gap-1">
        {icon}
        {badge != null && badge > 0 ? <span className="rounded bg-ink-700 px-1 font-mono text-[9px] text-ink-200">{badge}</span> : null}
      </span>
      {label}
    </button>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-600 bg-ink-900/40 p-4 text-center">
      <Boxes size={18} className="mx-auto mb-2 text-ink-500" />
      <p className="text-[11px] leading-relaxed text-ink-400">{text}</p>
    </div>
  )
}
