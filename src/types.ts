export type PresetId = 'scientific' | 'icons' | 'flowchart'

export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

export interface TraceParams {
  preset: PresetId
  colorCount: number
  detail: number
  smoothing: number
  minArea: number
  cornerAngle: number
  despeckle: boolean
  gridSnap: number
  snapOrthogonal: boolean
  fitPrimitives: boolean
  removeBackground: boolean
  maxDimension: number
}

export type TextMode = 'ocr' | 'outline'

export interface TextBox {
  text: string
  x: number
  y: number
  w: number
  h: number
  confidence: number
  fontName?: string
  rowHeight?: number
  baselineY?: number
  rotation?: number
  ascenders?: number
  descenders?: number
}

export interface ShapeItem {
  kind: 'path' | 'rect' | 'circle'
  d: string
  nodes: number
  area: number
  bbox: BBox
  rect?: { x: number; y: number; w: number; h: number }
  circle?: { cx: number; cy: number; r: number }
}

export interface PathLayer {
  id: string
  kind: 'path'
  name: string
  color: string
  fillRule: 'nonzero' | 'evenodd'
  bbox: BBox
  area: number
  nodes: number
  paths: ShapeItem[]
  visible: boolean
}

export interface TextLayer {
  id: string
  kind: 'text'
  text: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  fontFamily: string
  fontWeight: number
  italic: boolean
  color: string
  rotation: number
  confidence: number
  visible: boolean
}

export type Layer = PathLayer | TextLayer

export interface PaletteEntry {
  color: string
  r: number
  g: number
  b: number
  pixels: number
  pct: number
}

export interface TraceStats {
  ms: number
  colors: number
  paths: number
  nodes: number
  textBlocks: number
  sourcePixels: number
  processedPixels: number
  scale: number
}

export interface TraceResult {
  width: number
  height: number
  outWidth: number
  outHeight: number
  scale: number
  background: string | null
  layers: Layer[]
  palette: PaletteEntry[]
  stats: TraceStats
}

export type ProgressFn = (stage: string, value: number) => void

export type ItemStatus = 'queued' | 'ocr' | 'tracing' | 'done' | 'error'

export interface FileItem {
  id: string
  name: string
  size: number
  mime: string
  url: string
  width: number
  height: number
  status: ItemStatus
  progress: number
  stage: string
  error: string | null
  ocrError: string | null
  textBoxes: TextBox[] | null
  textMode: TextMode
  result: TraceResult | null
  svg: string | null
  svgBytes: number
  timeMs: number
}

export interface OcrSettings {
  enabled: boolean
  confidence: number
  language: string
  fontFamily: string
}

export interface SvgSettings {
  pretty: boolean
  precision: number
  includeBackground: boolean
  metadata: boolean
}
