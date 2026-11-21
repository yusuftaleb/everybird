// A harness for the share image golden test: draws a card through drawShareImage on a recording canvas and returns
// every call and property set on the canvas it returns, in order, one line each. Synthetic birds only.
import { vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import type { ListEntry } from '@/lib/list/model'

/** The parts of image.ts the harness needs (the module, or an older copy of it). */
type ImageModule = {
  drawShareImage: (opts: never) => Promise<HTMLCanvasElement>
  clearStickerCache: () => void
}

/** The px in a canvas font string ("700 60px …" is 60). */
const fontPx = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10)

const PROPS = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'lineJoin', 'font', 'textAlign', 'textBaseline', 'letterSpacing',
  'imageSmoothingEnabled', 'imageSmoothingQuality',
] as const
const METHODS = ['fillRect', 'fillText', 'beginPath', 'roundRect', 'fill', 'drawImage', 'stroke', 'save', 'restore', 'translate', 'scale', 'setTransform', 'resetTransform'] as const

const show = (v: unknown): string => {
  if (v instanceof FakeImage) return `img(${v.src})`
  if (v instanceof FakePath2D) return 'path'
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6)
  return JSON.stringify(v)
}

/**
 * A 2D context that records everything. measureText is deterministic: each character is `em` of the font's px wide
 * (a mono font `monoEm`, anything else 0.5) plus the letter spacing, and the ascent is 0.7 of the px.
 */
function recordingContext(log: string[], monoEm: number) {
  const state: Record<string, unknown> = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineJoin: 'miter', font: '10px sans-serif', textAlign: 'start',
    textBaseline: 'alphabetic', letterSpacing: '0px', imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
  }
  const ctx: Record<string, unknown> = {}
  for (const p of PROPS) {
    Object.defineProperty(ctx, p, {
      enumerable: true,
      get: () => state[p],
      set: (v: unknown) => { log.push(`${p} = ${show(v)}`); state[p] = v },
    })
  }
  for (const m of METHODS) ctx[m] = (...args: unknown[]) => { log.push(`${m}(${args.map(show).join(', ')})`) }
  ctx.measureText = (text: string) => {
    const font = String(state.font)
    const px = fontPx(font)
    const em = /mono/i.test(font) ? monoEm : 0.5
    const ls = Number.parseFloat(String(state.letterSpacing)) || 0
    const width = text.length * (em * px + ls)
    log.push(`measureText(${show(text)}) -> ${show(width)}`)
    return { width, actualBoundingBoxAscent: 0.7 * px }
  }
  return ctx
}

export class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin = ''
  decoding = ''
  private _src = ''
  get src() { return this._src }
  set src(v: string) {
    this._src = v
    // Stickers whose code ends in "fail" fail; the rest load on the next microtask.
    queueMicrotask(() => (/fail(\.[0-9a-f]+)?\.webp$/.test(v) ? this.onerror?.() : this.onload?.()))
  }
  removeAttribute(name: string) { if (name === 'src') this._src = '' }
}
export class FakePath2D { constructor(public d: string) {} }

/** Install the stubs: canvases that record, images that load at once, fonts ready at once. Returns the canvases' logs. */
export function installStubs(opts: { monoEm?: number } = {}) {
  const logs = new Map<object, string[]>()
  const createElement = (tag: string) => {
    if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`)
    const log: string[] = []
    const canvas: Record<string, unknown> = {}
    let w = 300, h = 150
    Object.defineProperty(canvas, 'width', { get: () => w, set: (v: number) => { log.push(`canvas.width = ${v}`); w = v } })
    Object.defineProperty(canvas, 'height', { get: () => h, set: (v: number) => { log.push(`canvas.height = ${v}`); h = v } })
    const ctx = recordingContext(log, opts.monoEm ?? 0.6)
    canvas.getContext = (kind: string) => (kind === '2d' ? ctx : null)
    logs.set(canvas, log)
    return canvas
  }
  vi.stubGlobal('document', {
    createElement,
    documentElement: {},
    fonts: { load: () => Promise.resolve([]) },
  })
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('Path2D', FakePath2D)
  return logs
}

// --- the synthetic list ---

const codes = Array.from({ length: 14 }, (_, i) => (i === 4 ? `bird${i}fail` : `bird${i}`))
const row = (code: string, i: number): SpeciesRow => ({
  code, com: `Synthetic Bird ${i}`, sci: `Avis ${code}`, ord: 'Passeriformes', fam: 'Avidae', famCom: 'Synthetic birds', to: i,
  g: 10 + 7 * i, gSrc: 'family', st: i !== 6, ar: 0.6 + (i % 5) * 0.2, q: true, ...(i === 9 ? { sv: '0123456789' } : {}),
}) as SpeciesRow
export const species = buildSpeciesIndex(codes.map(row))
// bird13 is the latest lifer (its date is the last); one entry has no date and one code is unknown.
export const entries = [
  ...codes.map((code, i) => ({ code, ...(i === 2 ? {} : { date: `20${String(10 + i).padStart(2, '0')}-0${(i % 9) + 1}` }), heard: false, dead: false, media: false, sources: ['ebird'] })),
  { code: 'notabird', date: '2030-01', heard: false, dead: false, media: false, sources: ['ebird'] },
] as ListEntry[]
/** A hand-made ring around the hole, uneven sizes, one bird (bird11) left out of the pack. */
export const pack = {
  W: 1000, H: 1200,
  boxes: new Map(codes.filter((c) => c !== 'bird11').map((c, i) => {
    const a = (i / 13) * 2 * Math.PI
    const s = 90 + (i % 4) * 30
    return [c, [500 + 360 * Math.cos(a) - s / 2, 600 + 430 * Math.sin(a) - s / 2, s, s * (0.8 + (i % 3) * 0.1)]] as [string, [number, number, number, number]]
  })),
}
export const NOW = new Date(2026, 10, 15)

export type Case = { format: 'story' | 'post' | 'square'; name?: string; filterLabel?: string; latest: boolean; theme: 'light' | 'dark' }
export const CASES: Case[] = (['story', 'post', 'square'] as const).flatMap((format) =>
  [undefined, 'Ada Lovelace’s life list'].flatMap((name) =>
    [undefined, 'Perching birds · Canada + Egypt'].flatMap((filterLabel) =>
      [true, false].map((latest, i) => ({ format, name, filterLabel, latest, theme: i ? 'dark' : 'light' }) as Case))))
export const caseName = (c: Case) => `${c.format}${c.name ? ' name' : ''}${c.filterLabel ? ' filter' : ''}${c.latest ? ' latest' : ' no-latest'} ${c.theme}`

/** Draw one case and return the log of the canvas drawShareImage returned. */
export async function renderLog(mod: ImageModule, logs: Map<object, string[]>, c: Case): Promise<string[]> {
  mod.clearStickerCache()
  logs.clear()
  const canvas = await mod.drawShareImage({ ...c, entries, species, pack, now: NOW, strings: en.ui } as never)
  const log = logs.get(canvas as unknown as object)
  if (!log) throw new Error('drawShareImage returned a canvas the harness did not make')
  return log
}

/**
 * The draws alone, each with the state it is drawn in: what reaches the pixels, without the property sets and
 * measurements in between. Two logs with equal draw lists paint the same image.
 */
export function drawsOnly(log: string[]): string[] {
  const state = new Map<string, string>()
  const out: string[] = []
  for (const line of log) {
    const set = /^(\w+) = (.*)$/.exec(line)
    if (set && !line.startsWith('canvas.')) { state.set(set[1], set[2]); continue }
    if (line.startsWith('measureText')) continue
    const op = /^(\w+)\(/.exec(line)?.[1]
    const keys = op === 'fillText' ? ['fillStyle', 'font', 'textAlign', 'textBaseline', 'letterSpacing']
      : op === 'fillRect' ? ['fillStyle']
      : op === 'stroke' ? ['strokeStyle', 'lineWidth', 'lineJoin']
      : op === 'drawImage' ? ['imageSmoothingEnabled', 'imageSmoothingQuality'] : []
    out.push(keys.length ? `${line} {${keys.map((k) => `${k}: ${state.get(k) ?? '-'}`).join(', ')}}` : line)
  }
  return out
}
