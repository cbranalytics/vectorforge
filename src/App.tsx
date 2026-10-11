import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CircleCheck, X } from 'lucide-react'
import { Comparator } from './components/Comparator.tsx'
import { DropOverlay } from './components/Dropzone.tsx'
import { Inspector } from './components/Inspector.tsx'
import { QueuePanel } from './components/QueuePanel.tsx'
import { StatusBar } from './components/StatusBar.tsx'
import { TopBar } from './components/TopBar.tsx'
import { ACCEPTED, MAX_BYTES } from './lib/constants.ts'
import { buildZip, bytesOf, downloadBlob, safeName, svgBlob } from './lib/downloads.ts'
import { disposeOcr, recognizeText } from './lib/ocr.ts'
import { presetById, presetParams } from './lib/presets.ts'
import { buildSvg } from './lib/svg.ts'
import { TraceEngine } from './lib/traceClient.ts'
import type {
  FileItem,
  Layer,
  OcrSettings,
  PresetId,
  SvgSettings,
  TextBox,
  TextLayer,
  TraceParams,
  TraceResult,
} from './types.ts'

const PRESET_FONT = (id: PresetId) => presetById(id).fontFamily

function resolveFont(font: string, preset: PresetId): string {
  return font === 'auto' ? PRESET_FONT(preset) : font
}

function applyFontToResult(result: TraceResult, family: string): TraceResult {
  return {
    ...result,
    layers: result.layers.map((layer) =>
      layer.kind === 'text' ? { ...layer, fontFamily: family } : layer,
    ),
  }
}

async function sniffMime(file: File): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png'
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
    if (
      head[0] === 0x52 &&
      head[1] === 0x49 &&
      head[2] === 0x46 &&
      head[3] === 0x46 &&
      head[8] === 0x57 &&
      head[9] === 0x45 &&
      head[10] === 0x42 &&
      head[11] === 0x50
    ) {
      return 'image/webp'
    }
  } catch {
    return null
  }
  return null
}

async function imageDimensions(file: File): Promise<{ w: number; h: number }> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { w: bitmap.width, h: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return { w: 0, h: 0 }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

interface Notice {
  tone: 'error' | 'info'
  text: string
}

export default function App() {
  const [items, setItems] = useState<FileItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [preset, setPreset] = useState<PresetId>('scientific')
  const [params, setParams] = useState<TraceParams>(() => presetParams('scientific'))
  const [ocr, setOcr] = useState<OcrSettings>({ enabled: true, confidence: 55, language: 'eng', fontFamily: 'auto' })
  const [svgSettings, setSvgSettings] = useState<SvgSettings>({ pretty: false, precision: 2, includeBackground: false, metadata: true })
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef(new Map<string, File>())
  const textRef = useRef(new Map<string, TextBox[]>())
  const itemsRef = useRef<FileItem[]>([])
  const engineRef = useRef<TraceEngine | null>(null)
  const runningRef = useRef(false)
  const queuedRef = useRef<{ ids: string[]; rerunOcr: boolean } | null>(null)
  const cfgRef = useRef({ params, ocr, svgSettings, preset })

  useEffect(() => {
    itemsRef.current = items
    cfgRef.current = { params, ocr, svgSettings, preset }
  })

  const getEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new TraceEngine()
    return engineRef.current
  }, [])

  useEffect(() => {
    return () => {
      engineRef.current?.dispose()
      void disposeOcr()
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  const buildOptions = useCallback((name: string) => {
    const cfg = cfgRef.current
    return { ...cfg.svgSettings, sourceName: name, onlyVisible: true }
  }, [])

  const runItem = useCallback(
    async (id: string, rerunOcr: boolean) => {
      const file = filesRef.current.get(id)
      if (!file) return
      const patch = (changes: Partial<FileItem>) =>
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)))

      try {
        patch({ error: null, progress: 0.02, stage: 'Preparing', status: rerunOcr && cfgRef.current.ocr.enabled ? 'ocr' : 'tracing' })

        let textBoxes: TextBox[] = rerunOcr ? [] : (textRef.current.get(id) ?? [])
        let ocrError: string | null = null

        if (rerunOcr && cfgRef.current.ocr.enabled) {
          patch({ status: 'ocr', progress: 0.04, stage: 'Recognising text', ocrError: null })
          setOcrBusy(true)
          try {
            const outcome = await recognizeText(file, {
              confidence: cfgRef.current.ocr.confidence,
              language: cfgRef.current.ocr.language,
              onProgress: (value, status) =>
                patch({ progress: 0.04 + value * 0.38, stage: `OCR · ${status.replace(/_/g, ' ')}` }),
            })
            textBoxes = outcome.boxes
          } catch (error) {
            ocrError = `OCR unavailable, text will be traced as outlines (${errorMessage(error)})`
            textBoxes = []
          } finally {
            setOcrBusy(false)
          }
          textRef.current.set(id, textBoxes)
          patch({ textBoxes, ocrError })
        } else if (rerunOcr) {
          textRef.current.set(id, [])
          patch({ textBoxes: [], ocrError: null })
        }

        patch({ status: 'tracing', progress: 0.5, stage: 'Vectorizing' })
        const result = await getEngine().run(file, cfgRef.current.params, textBoxes, (stage, value) =>
          patch({ progress: 0.5 + value * 0.48, stage }),
        )

        const family = resolveFont(cfgRef.current.ocr.fontFamily, cfgRef.current.preset)
        const styled = applyFontToResult(result, family)
        const svg = buildSvg(styled, buildOptions(file.name))
        patch({
          result: styled,
          svg,
          svgBytes: bytesOf(svg),
          status: 'done',
          progress: 1,
          stage: 'Complete',
          timeMs: styled.stats.ms,
        })
      } catch (error) {
        patch({ status: 'error', error: errorMessage(error), progress: 0, stage: 'Failed' })
      }
    },
    [buildOptions, getEngine],
  )

  const enqueue = useCallback(
    (ids: string[], rerunOcr: boolean) => {
      if (ids.length === 0) return
      const previous = queuedRef.current
      queuedRef.current = { ids, rerunOcr: rerunOcr || (previous?.rerunOcr ?? false) }
      if (runningRef.current) return
      runningRef.current = true
      void (async () => {
        while (queuedRef.current) {
          const job = queuedRef.current
          queuedRef.current = null
          setBusy(true)
          for (const id of job.ids) {
            if (!filesRef.current.has(id)) continue
            await runItem(id, job.rerunOcr)
          }
          setBusy(false)
        }
        runningRef.current = false
      })()
    },
    [runItem],
  )

  const addFiles = useCallback(
    async (files: File[]) => {
      const accepted: FileItem[] = []
      const rejected: string[] = []
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          rejected.push(`${file.name} is larger than 10 MB`)
          continue
        }
        const mime = await sniffMime(file)
        const effectiveMime = mime ?? file.type
        if (!ACCEPTED.includes(effectiveMime)) {
          rejected.push(`${file.name} is not a PNG, JPG or WebP`)
          continue
        }
        const size = await imageDimensions(file)
        const id = crypto.randomUUID()
        filesRef.current.set(id, file)
        accepted.push({
          id,
          name: file.name,
          size: file.size,
          mime: effectiveMime,
          url: URL.createObjectURL(file),
          width: size.w,
          height: size.h,
          status: 'queued',
          progress: 0,
          stage: 'Queued',
          error: null,
          ocrError: null,
          textBoxes: null,
          textMode: 'ocr',
          result: null,
          svg: null,
          svgBytes: 0,
          timeMs: 0,
        })
      }

      if (accepted.length > 0) {
        setItems((prev) => [...prev, ...accepted])
        setActiveId((prev) => prev ?? accepted[0].id)
        enqueue(
          accepted.map((item) => item.id),
          true,
        )
      }
      if (rejected.length > 0) setNotice({ tone: 'error', text: rejected.join(' · ') })
    },
    [enqueue],
  )

  const removeItem = useCallback((id: string) => {
    filesRef.current.delete(id)
    textRef.current.delete(id)
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== id)
      return next
    })
    setActiveId((prev) => {
      if (prev !== id) return prev
      const remaining = itemsRef.current.filter((item) => item.id !== id)
      return remaining.length ? remaining[0].id : null
    })
    setSelectedLayerId(null)
  }, [])

  const clearAll = useCallback(() => {
    filesRef.current.clear()
    textRef.current.clear()
    setItems([])
    setActiveId(null)
    setSelectedLayerId(null)
  }, [])

  const handlePreset = useCallback((id: PresetId) => {
    setPreset(id)
    setParams(presetParams(id))
    const family = resolveFont(cfgRef.current.ocr.fontFamily, id)
    setItems((prev) =>
      prev.map((item) => {
        if (!item.result) return item
        const result = applyFontToResult(item.result, family)
        const svg = buildSvg(result, { ...cfgRef.current.svgSettings, sourceName: item.name, onlyVisible: true })
        return { ...item, result, svg, svgBytes: bytesOf(svg) }
      }),
    )
  }, [])

  const handleParams = useCallback((patch: Partial<TraceParams>) => {
    setParams((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleSvg = useCallback((patch: Partial<SvgSettings>) => {
    const next = { ...cfgRef.current.svgSettings, ...patch }
    setSvgSettings(next)
    setItems((list) =>
      list.map((item) => {
        if (!item.result) return item
        const svg = buildSvg(item.result, { ...next, sourceName: item.name, onlyVisible: true })
        return { ...item, svg, svgBytes: bytesOf(svg) }
      }),
    )
  }, [])

  const handleOcr = useCallback((patch: Partial<OcrSettings>) => {
    setOcr((prev) => ({ ...prev, ...patch }))
    if (patch.fontFamily !== undefined) {
      const family = resolveFont(patch.fontFamily, cfgRef.current.preset)
      setItems((list) =>
        list.map((item) => {
          if (!item.result) return item
          const result = applyFontToResult(item.result, family)
          const svg = buildSvg(result, { ...cfgRef.current.svgSettings, sourceName: item.name, onlyVisible: true })
          return { ...item, result, svg, svgBytes: bytesOf(svg) }
        }),
      )
    }
  }, [])

  const updateResult = useCallback(
    (id: string, mutate: (layer: Layer, result: TraceResult) => Layer) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id || !item.result) return item
          const result: TraceResult = {
            ...item.result,
            layers: item.result.layers.map((layer) => mutate(layer, item.result as TraceResult)),
          }
          const svg = buildSvg(result, { ...cfgRef.current.svgSettings, sourceName: item.name, onlyVisible: true })
          return { ...item, result, svg, svgBytes: bytesOf(svg) }
        }),
      )
    },
    [],
  )

  const handleUpdateText = useCallback(
    (id: string, patch: Partial<TextLayer>) => {
      const targetId = activeId
      if (!targetId) return
      updateResult(targetId, (layer) => (layer.id === id && layer.kind === 'text' ? { ...layer, ...patch } : layer))
    },
    [activeId, updateResult],
  )

  const handleToggleLayer = useCallback(
    (layerId: string) => {
      const targetId = activeId
      if (!targetId) return
      updateResult(targetId, (layer) => (layer.id === layerId ? { ...layer, visible: !layer.visible } : layer))
    },
    [activeId, updateResult],
  )

  const activeItem = useMemo(() => items.find((item) => item.id === activeId) ?? null, [items, activeId])

  const previewSvg = useMemo(() => {
    if (!activeItem?.result) return ''
    return buildSvg(activeItem.result, {
      ...svgSettings,
      sourceName: activeItem.name,
      onlyVisible: true,
      layerOpacity: selectedLayerId ? (layer) => (layer.id === selectedLayerId ? 1 : 0.08) : undefined,
    })
  }, [activeItem, svgSettings, selectedLayerId])

  useEffect(() => {
    const ids = itemsRef.current.map((item) => item.id)
    if (ids.length === 0) return
    const timer = setTimeout(() => enqueue(ids, false), 400)
    return () => clearTimeout(timer)
  }, [params, enqueue])

  useEffect(() => {
    const ids = itemsRef.current.map((item) => item.id)
    if (ids.length === 0) return
    const timer = setTimeout(() => enqueue(ids, true), 550)
    return () => clearTimeout(timer)
  }, [ocr.confidence, ocr.language, ocr.enabled, enqueue])

  useEffect(() => {
    const handleOver = (event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer?.types.includes('Files')) setDragging(true)
    }
    const handleLeave = (event: DragEvent) => {
      if (!event.relatedTarget) setDragging(false)
    }
    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      setDragging(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length) void addFiles(files)
    }
    window.addEventListener('dragover', handleOver)
    window.addEventListener('dragleave', handleLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleOver)
      window.removeEventListener('dragleave', handleLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [addFiles])

  const exportActive = useCallback(() => {
    const item = itemsRef.current.find((entry) => entry.id === activeId)
    if (!item?.svg) return
    downloadBlob(svgBlob(item.svg), `${safeName(item.name)}.svg`)
  }, [activeId])

  const exportAll = useCallback(async () => {
    const ready = itemsRef.current.filter((item) => item.svg)
    if (ready.length === 0) return
    if (ready.length === 1) {
      downloadBlob(svgBlob(ready[0].svg as string), `${safeName(ready[0].name)}.svg`)
      return
    }
    const blob = await buildZip(ready.map((item) => ({ name: `${safeName(item.name)}.svg`, content: item.svg as string })))
    downloadBlob(blob, `vectorforge-${ready.length}-vectors.zip`)
    setNotice({ tone: 'info', text: `Exported ${ready.length} SVG files as a ZIP archive.` })
  }, [])

  const copySvg = useCallback(async () => {
    const item = itemsRef.current.find((entry) => entry.id === activeId)
    if (!item?.svg) return
    try {
      await navigator.clipboard.writeText(item.svg)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setNotice({ tone: 'error', text: 'Clipboard access was blocked by the browser.' })
    }
  }, [activeId])

  const rerunOcr = useCallback(() => {
    if (!activeId) return
    textRef.current.delete(activeId)
    enqueue([activeId], true)
  }, [activeId, enqueue])

  const doneCount = items.filter((item) => item.status === 'done').length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar
        itemCount={items.length}
        doneCount={doneCount}
        busy={busy}
        canExport={Boolean(activeItem?.svg)}
        onPick={() => inputRef.current?.click()}
        onExportActive={exportActive}
        onExportAll={() => void exportAll()}
        activeName={activeItem?.name ?? null}
      />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) void addFiles(files)
        }}
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 xl:flex-row xl:overflow-hidden">
        <aside className="panel flex h-64 shrink-0 flex-col p-3 xl:h-auto xl:w-64">
          <QueuePanel
            items={items}
            activeId={activeId}
            busy={busy}
            onSelect={(id) => {
              setActiveId(id)
              setSelectedLayerId(null)
            }}
            onRemove={removeItem}
            onClear={clearAll}
            onFiles={(files) => void addFiles(files)}
            onRetry={(id) => enqueue([id], false)}
          />
        </aside>

        <section className="flex min-h-[440px] flex-1 flex-col xl:min-h-0">
          <Comparator key={activeItem?.id ?? 'none'} item={activeItem} previewSvg={previewSvg} busy={busy} />
        </section>

        <aside className="panel flex h-[560px] shrink-0 flex-col xl:h-auto xl:w-[23rem]">
          <Inspector
            params={params}
            onParams={handleParams}
            preset={preset}
            onPreset={handlePreset}
            ocr={ocr}
            onOcr={handleOcr}
            svgSettings={svgSettings}
            onSvg={handleSvg}
            item={activeItem}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onToggleLayer={handleToggleLayer}
            onUpdateText={handleUpdateText}
            onExportActive={exportActive}
            onExportAll={() => void exportAll()}
            onCopy={() => void copySvg()}
            copied={copied}
            onRerunOcr={rerunOcr}
            ocrBusy={ocrBusy}
          />
        </aside>
      </main>

      <StatusBar item={activeItem} total={items.length} done={doneCount} />
      <DropOverlay active={dragging} />

      {notice ? (
        <div
          className={`fixed bottom-12 right-4 z-50 flex max-w-sm items-start gap-2 rounded-xl border px-3 py-2.5 text-xs shadow-2xl backdrop-blur ${
            notice.tone === 'error' ? 'border-rose-500/40 bg-rose-950/80 text-rose-200' : 'border-aqua-500/40 bg-ink-900/90 text-ink-100'
          }`}
        >
          {notice.tone === 'error' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <CircleCheck size={14} className="mt-0.5 shrink-0 text-aqua-300" />}
          <span className="leading-snug">{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="ml-1 rounded p-0.5 hover:bg-white/10">
            <X size={13} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
