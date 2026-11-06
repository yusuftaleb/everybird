export type TaxonCategory = 'species'|'issf'|'form'|'intergrade'|'spuh'|'slash'|'hybrid'|'domestic'
export type SpeciesRow = {
  code: string; com: string; sci: string          // eBird code, English common name, scientific name
  ord: string; fam: string; famCom: string; to: number   // order, family (sci), family common, eBird taxonOrder
  g: number; gSrc: 'avonet'|'override'|'family'|'order' // body mass (g) and where it came from
  st: boolean; ar: number; q: boolean              // has sticker, sticker aspect w/h, meets huashu quality bar
}
// ord/fam/famCom are only present on build-time input (buildSpecies needs them); they are
// stripped before taxonomy.v1.json is written.
export type TaxonRow = { code: string; sci: string; com: string; cat: TaxonCategory; to: number; reportAs?: string;
  ord?: string; fam?: string; famCom?: string }
export type SpeciesFile = { v: 1; ebirdTaxonomy: string; huashuCommit: string; species: SpeciesRow[] }
export type TaxonomyFile = { v: 1; ebirdTaxonomy: string; taxa: TaxonRow[] }
export type HuashuRecord = { id: string; scientificName: string; taxonConcept: string;
  taxonomy: { seq: number; order: string; family: string }; ids: { ebird?: string };
  traits?: { massG?: number }; sticker?: { file: string; meetsQualityBar: boolean }; previous?: { scientificName: string }[] }
export type Overrides = Record<string /*eBird code*/, { huashu?: string /*huashu id*/; massG?: number; source: string }>
export type Regions = { v: 1; countries: Record<string, string>; sub1: Record<string, string> }
