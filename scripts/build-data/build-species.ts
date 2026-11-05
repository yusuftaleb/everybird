// Builds public/data/species.v1.json, taxonomy.v1.json and data/build/crosswalk-report.md
// from data/raw/*. Run: npx tsx scripts/build-data/build-species.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  HuashuRecord, Overrides, SpeciesFile, SpeciesRow, TaxonCategory, TaxonomyFile, TaxonRow,
} from '../../src/lib/species/types'

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function pickCandidate(cands: HuashuRecord[], sci: string): HuashuRecord {
  return [...cands].sort((a, b) => {
    const ea = a.scientificName === sci ? 0 : 1
    const eb = b.scientificName === sci ? 0 : 1
    if (ea !== eb) return ea - eb
    const sa = a.taxonConcept === 'same' ? 0 : 1
    const sb = b.taxonConcept === 'same' ? 0 : 1
    if (sa !== sb) return sa - sb
    return a.taxonomy.seq - b.taxonomy.seq
  })[0]
}

export function buildSpecies(
  huashu: HuashuRecord[], taxonomy: TaxonRow[], overrides: Overrides,
  meta: { ebirdTaxonomy?: string; huashuCommit?: string } = {},
): { file: SpeciesFile; report: string } {
  const byEbird = new Map<string, HuashuRecord[]>()
  const bySci = new Map<string, HuashuRecord>()
  const byId = new Map<string, HuashuRecord>()
  for (const h of huashu) {
    byId.set(h.id, h)
    if (h.ids.ebird) byEbird.set(h.ids.ebird, [...(byEbird.get(h.ids.ebird) ?? []), h])
    bySci.set(h.scientificName, h)
  }
  // previous names never shadow a current name
  for (const h of huashu) for (const p of h.previous ?? []) if (!bySci.has(p.scientificName)) bySci.set(p.scientificName, h)

  const species = taxonomy.filter((t) => t.cat === 'species').sort((a, b) => a.to - b.to)
  const multi: string[] = [], sciFallback: string[] = [], noSticker: string[] = [], massFallback: string[] = []
  const overrideHuashu: string[] = []

  type Pre = { t: TaxonRow; rec?: HuashuRecord; g?: number; gSrc?: SpeciesRow['gSrc'] }
  const pre: Pre[] = species.map((t) => {
    const ov = overrides[t.code]
    let rec: HuashuRecord | undefined
    if (ov?.huashu && byId.has(ov.huashu)) {
      rec = byId.get(ov.huashu)
      overrideHuashu.push(`${t.code} (${t.com}) -> ${ov.huashu}`)
    } else {
      const cands = byEbird.get(t.code) ?? []
      if (cands.length === 1) rec = cands[0]
      else if (cands.length > 1) {
        rec = pickCandidate(cands, t.sci)
        multi.push(`${t.code} (${t.com}): ${cands.map((c) => c.id).join(', ')} -> ${rec.id}`)
      } else if (bySci.has(t.sci)) {
        rec = bySci.get(t.sci)
        sciFallback.push(`${t.code} (${t.com}) -> ${rec!.id}`)
      }
    }
    if (!rec?.sticker) noSticker.push(`${t.code} (${t.com})${rec ? ` [huashu ${rec.id} has no sticker]` : ''}`)
    const p: Pre = { t, rec }
    if (typeof ov?.massG === 'number') { p.g = ov.massG; p.gSrc = 'override' }
    else if (typeof rec?.traits?.massG === 'number') { p.g = rec.traits.massG; p.gSrc = 'avonet' }
    return p
  })

  const fams = new Map<string, number[]>(), ords = new Map<string, number[]>(), all: number[] = []
  for (const p of pre) {
    if (p.g === undefined) continue
    all.push(p.g)
    fams.set(p.t.fam ?? '', [...(fams.get(p.t.fam ?? '') ?? []), p.g])
    ords.set(p.t.ord ?? '', [...(ords.get(p.t.ord ?? '') ?? []), p.g])
  }

  const rows: SpeciesRow[] = pre.map((p) => {
    let { g, gSrc } = p
    if (g === undefined) {
      const f = fams.get(p.t.fam ?? ''), o = ords.get(p.t.ord ?? '')
      if (f?.length) { g = median(f); gSrc = 'family' }
      else if (o?.length) { g = median(o); gSrc = 'order' }
      else { g = median(all); gSrc = 'order' } // last resort: global median, labelled 'order'
      massFallback.push(`${p.t.code} (${p.t.com}): ${g} g from ${f?.length ? 'family' : o?.length ? 'order' : 'global median'} ${f?.length ? p.t.fam : o?.length ? p.t.ord : ''}`.trimEnd())
    }
    return {
      code: p.t.code, com: p.t.com, sci: p.t.sci,
      ord: p.t.ord ?? '', fam: p.t.fam ?? '', famCom: p.t.famCom ?? '', to: p.t.to,
      g: g!, gSrc: gSrc!,
      st: !!p.rec?.sticker, ar: 1, q: !!p.rec?.sticker?.meetsQualityBar,
    }
  })

  const speciesCodes = new Set(species.map((t) => t.code))
  const orphans = huashu.filter((h) => h.ids.ebird && !speciesCodes.has(h.ids.ebird))
    .map((h) => `${h.ids.ebird}: ${h.id}`)

  const list = (title: string, items: string[]) =>
    `## ${title} (${items.length})\n\n${items.length ? items.map((i) => `- ${i}`).join('\n') : '_none_'}\n`
  const massCount = (s: string) => rows.filter((r) => r.gSrc === s).length
  const report = [
    '# Crosswalk report', '',
    `- Species rows: ${rows.length}`,
    `- With sticker: ${rows.filter((r) => r.st).length}; without: ${noSticker.length}`,
    `- Mass sources: avonet ${massCount('avonet')}, override ${massCount('override')}, family ${massCount('family')}, order ${massCount('order')}`,
    `- Multi-candidate choices: ${multi.length}; scientific-name fallbacks: ${sciFallback.length}; huashu orphans: ${orphans.length}`,
    '',
    list('Multi-candidate choices', multi),
    list('Scientific-name fallbacks', sciFallback),
    list('Override huashu records used', overrideHuashu),
    list('No sticker', noSticker),
    list('Mass fallbacks', massFallback),
    list('Huashu records matching no eBird species', orphans),
  ].join('\n')

  return {
    file: { v: 1, ebirdTaxonomy: meta.ebirdTaxonomy ?? '', huashuCommit: meta.huashuCommit ?? '', species: rows },
    report,
  }
}

const CATS: Record<string, TaxonCategory> = {
  species: 'species', issf: 'issf', form: 'form', intergrade: 'intergrade', spuh: 'spuh',
  slash: 'slash', hybrid: 'hybrid', domestic: 'domestic',
}

type EbirdApiRow = {
  sciName: string; comName: string; speciesCode: string; category: string; taxonOrder: number
  reportAs?: string; order?: string; familySciName?: string; familyComName?: string
}

export function loadHuashu(dir: string): HuashuRecord[] {
  return JSON.parse(readFileSync(resolve(dir, 'data/species.json'), 'utf8')).species as HuashuRecord[]
}

export function loadEbirdTaxonomy(file: string): TaxonRow[] {
  const rows = JSON.parse(readFileSync(file, 'utf8')) as EbirdApiRow[]
  return rows.map((r) => {
    const t: TaxonRow = {
      code: r.speciesCode, sci: r.sciName, com: r.comName, cat: CATS[r.category] ?? 'species', to: r.taxonOrder,
      ord: r.order ?? '', fam: r.familySciName ?? '', famCom: r.familyComName ?? '',
    }
    if (r.reportAs) t.reportAs = r.reportAs
    return t
  })
}

function main() {
  const raw = resolve(process.cwd(), 'data/raw')
  const manifest = JSON.parse(readFileSync(resolve(raw, 'manifest.json'), 'utf8'))
  const taxa = loadEbirdTaxonomy(resolve(raw, 'ebird-taxonomy.json'))
  const overrides = JSON.parse(readFileSync(resolve(process.cwd(), 'data/overrides.json'), 'utf8')) as Overrides
  const { file, report } = buildSpecies(loadHuashu(resolve(raw, 'huashu')), taxa, overrides, manifest)

  const outDir = resolve(process.cwd(), 'public/data')
  mkdirSync(outDir, { recursive: true })
  mkdirSync(resolve(process.cwd(), 'data/build'), { recursive: true })
  writeFileSync(resolve(outDir, 'species.v1.json'), JSON.stringify(file))
  const taxonomyFile: TaxonomyFile = {
    v: 1, ebirdTaxonomy: manifest.ebirdTaxonomy,
    taxa: taxa.map(({ ord: _o, fam: _f, famCom: _fc, ...t }) => t),
  }
  writeFileSync(resolve(outDir, 'taxonomy.v1.json'), JSON.stringify(taxonomyFile))
  writeFileSync(resolve(process.cwd(), 'data/build/crosswalk-report.md'), report)
  console.log(report.split('\n').slice(0, 8).join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
