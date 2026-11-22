// The landing sample, packed ahead of time (public/data/sample-pack.v1.json, scripts/build-data/build-sample-pack.ts):
// the sample list, the species rows, region names and masks it uses, and its full even-mode collage for each layout
// class. The landing renders it straight away, without the 2.4 MB species file or the 1 MB masks file, so stickers
// appear fast on a slow link; the worker takes over (with the same layout and the pack's masks) for filters and True
// size. Its names in the UI language are a small file of their own per base language (sample-names.<base>.v1.json).
import type { LayoutName } from '@/lib/layout/layout.worker'
import type { StateLayout } from '@/lib/layout/layout-client'
import type { Box } from '@/lib/layout/pack'
import { buildSpeciesIndex, loadGroupMap, type SpeciesIndex } from '@/lib/species/load'
import type { NameBase } from '@/lib/species/name-locales'
import type { NameSet } from '@/lib/species/names'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { sampleToSaved, type SampleFile } from './sample'
import type { Saved } from './storage'
import { addMasks, fetchData, type MaskTable } from '../data-url'
import type { DataFile } from '../data-files'

export type PackedLayout = { layout: LayoutName; W: number; H: number; base: number; codes: string[]; boxes: number[] }
/** The sample's own names in one base language (never a regional set), so its birds read in the UI language before the
 *  names file arrives: only the sample's codes and their families, taken from public/data/names.<base>.v1.json. */
export type SampleNames = Pick<NameSet, 'names' | 'fam'>
/** Every base language's (the build writes one sample-names.<base>.v1.json each). */
export type PackNames = Record<NameBase, SampleNames>
/** `masks`: the sample's own, by order then code (what the order files, public/data/masks/<Order>.v1.json, have for them). */
export type SamplePackFile = SampleFile & { species: SpeciesRow[]; regions: Regions; layouts: PackedLayout[]; masks: Record<string, MaskTable> }
export type SamplePack = { saved: Saved; species: SpeciesIndex; regions: Regions; seed: StateLayout[] }

/** The pack's layouts as the layout client's full collages (key "<layout>|even|", scale 1). */
export function seedLayouts(f: Pick<SamplePackFile, 'layouts'>): StateLayout[] {
  return f.layouts.map((l) => {
    const boxes = new Map<string, Box>()
    l.codes.forEach((c, i) => boxes.set(c, [l.boxes[4 * i], l.boxes[4 * i + 1], l.boxes[4 * i + 2], l.boxes[4 * i + 3]]))
    return { key: `${l.layout}|even|`, layout: l.layout, mode: 'even', W: l.W, H: l.H, boxes, scale: 1, base: l.base }
  })
}

/** `groups`: eBird's groups (the search's group chip and the Filter.group bounds); the sample's index has none without them. */
export function fromPackFile(f: SamplePackFile, groups?: SpeciesIndex['groups']): SamplePack {
  const index = buildSpeciesIndex(f.species)
  return { saved: sampleToSaved(f), species: groups ? { ...index, groups } : index, regions: f.regions, seed: seedLayouts(f) }
}

let packP: Promise<SamplePack> | null = null

/** The landing sample, fetched once (a failure is not cached). */
export function loadSamplePack(): Promise<SamplePack> {
  if (packP) return packP
  const p = (async () => {
    // The small, shared groups file rides along; without it the sample's search just offers no group chip.
    const [file, groups] = await Promise.all([fetchData<SamplePackFile>('sample-pack.v1.json', { priority: 'high' } as RequestInit), loadGroupMap()])
    addMasks(file.masks ?? {}) // the layout worker and hit-testing take these instead of fetching masks.v3.bin
    return fromPackFile(file, groups)
  })().catch((e) => {
    packP = null
    throw e
  })
  packP = p
  return p
}

const namesP = new Map<NameBase, Promise<SampleNames>>()
/** The sample's names in a base language, fetched once (a failure is not cached: the sample reads in English meanwhile). */
export function loadSampleNames(base: NameBase): Promise<SampleNames> {
  let p = namesP.get(base)
  if (!p) {
    const mine = fetchData<SampleNames>(`sample-names.${base}.v1.json` as DataFile)
    mine.catch(() => { if (namesP.get(base) === mine) namesP.delete(base) })
    namesP.set(base, (p = mine))
  }
  return p
}
