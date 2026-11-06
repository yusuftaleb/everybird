// The landing sample, packed ahead of time (public/data/sample-pack.v1.json, scripts/build-data/build-sample-pack.ts):
// the sample list, the species rows and region names it uses, and its full even-mode collage for each layout class.
// The landing renders it straight away, without the 2.4 MB species file or the layout worker's mask downloads, so
// stickers appear fast on a slow link; the worker takes over (with the same layout) for filters and True size.
import type { LayoutName } from '@/lib/layout/layout.worker'
import type { StateLayout } from '@/lib/layout/layout-client'
import type { Box } from '@/lib/layout/pack'
import { buildSpeciesIndex, type SpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { sampleToSaved, type SampleFile } from './sample'
import type { Saved } from './storage'

export type PackedLayout = { layout: LayoutName; W: number; H: number; base: number; codes: string[]; boxes: number[] }
export type SamplePackFile = SampleFile & { species: SpeciesRow[]; regions: Regions; layouts: PackedLayout[] }
export type SamplePack = { saved: Saved; species: SpeciesIndex; regions: Regions; seed: StateLayout[] }

/** The pack's layouts as the layout client's full collages (key "<layout>|even|", scale 1). */
export function seedLayouts(f: Pick<SamplePackFile, 'layouts'>): StateLayout[] {
  return f.layouts.map((l) => {
    const boxes = new Map<string, Box>()
    l.codes.forEach((c, i) => boxes.set(c, [l.boxes[4 * i], l.boxes[4 * i + 1], l.boxes[4 * i + 2], l.boxes[4 * i + 3]]))
    return { key: `${l.layout}|even|`, layout: l.layout, mode: 'even', W: l.W, H: l.H, boxes, scale: 1, base: l.base }
  })
}

export function fromPackFile(f: SamplePackFile): SamplePack {
  return { saved: sampleToSaved(f), species: buildSpeciesIndex(f.species), regions: f.regions, seed: seedLayouts(f) }
}

const PACK_URL = '/data/sample-pack.v1.json'
let packP: Promise<SamplePack> | null = null

/** The landing sample, fetched once (a failure is not cached). */
export function loadSamplePack(): Promise<SamplePack> {
  if (packP) return packP
  const p = (async () => {
    const res = await fetch(PACK_URL, { priority: 'high' } as RequestInit)
    if (!res.ok) throw new Error(`Failed to load ${PACK_URL}: ${res.status}`)
    return fromPackFile((await res.json()) as SamplePackFile)
  })().catch((e) => {
    packP = null
    throw e
  })
  packP = p
  return p
}
