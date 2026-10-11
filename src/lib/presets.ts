import type { PresetId, TraceParams } from '../types.ts'

export interface PresetDef {
  id: PresetId
  name: string
  tagline: string
  description: string
  fontFamily: string
  params: TraceParams
}

export const SCIENTIFIC_FONT = "Latin Modern Roman, 'Computer Modern', 'Times New Roman', Georgia, serif"
export const SANS_FONT = "Inter, Roboto, 'Helvetica Neue', Arial, sans-serif"
export const MONO_FONT = "'JetBrains Mono', 'Roboto Mono', 'Courier New', monospace"

export const PRESETS: PresetDef[] = [
  {
    id: 'scientific',
    name: 'Scientific & Line Art',
    tagline: 'Crisp paths, thin lines, grid alignment',
    description:
      'Optimized for figures, plots, microscopy and engineering drawings. Keeps hairlines and fine strokes, minimises smoothing so straight structures stay sharp.',
    fontFamily: SCIENTIFIC_FONT,
    params: {
      preset: 'scientific',
      colorCount: 16,
      detail: 0.92,
      smoothing: 0.3,
      minArea: 3,
      cornerAngle: 60,
      despeckle: true,
      gridSnap: 0,
      snapOrthogonal: false,
      fitPrimitives: false,
      removeBackground: true,
      maxDimension: 2560,
    },
  },
  {
    id: 'icons',
    name: 'Icons & Logos',
    tagline: 'Smooth beziers, minimal node count',
    description:
      'Optimized for flat icons, pictograms and logos. Fits flowing bezier curves, merges visual noise and produces the fewest possible nodes.',
    fontFamily: SANS_FONT,
    params: {
      preset: 'icons',
      colorCount: 12,
      detail: 0.6,
      smoothing: 0.9,
      minArea: 6,
      cornerAngle: 80,
      despeckle: true,
      gridSnap: 0,
      snapOrthogonal: false,
      fitPrimitives: false,
      removeBackground: true,
      maxDimension: 2048,
    },
  },
  {
    id: 'flowchart',
    name: 'Flowcharts & Diagrams',
    tagline: 'Straight lines, primitives, orthogonal snap',
    description:
      'Optimized for structured diagrams. Snaps runs to horizontal / vertical axes and fits rectangles and circles as native SVG primitives instead of polygons.',
    fontFamily: SANS_FONT,
    params: {
      preset: 'flowchart',
      colorCount: 10,
      detail: 0.78,
      smoothing: 0.25,
      minArea: 5,
      cornerAngle: 46,
      despeckle: true,
      gridSnap: 1,
      snapOrthogonal: true,
      fitPrimitives: true,
      removeBackground: true,
      maxDimension: 2560,
    },
  },
]

export const DEFAULT_PRESET: PresetId = 'scientific'

export function presetById(id: PresetId): PresetDef {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]
}

export function presetParams(id: PresetId): TraceParams {
  return { ...presetById(id).params }
}

export const FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Scientific serif', value: SCIENTIFIC_FONT },
  { label: 'Inter / Roboto (sans)', value: SANS_FONT },
  { label: 'JetBrains / Roboto Mono', value: MONO_FONT },
  { label: 'Georgia (serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Arial (sans)', value: "Arial, 'Helvetica Neue', sans-serif" },
  { label: 'Courier New (mono)', value: "'Courier New', Courier, monospace" },
]
