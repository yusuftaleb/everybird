import { writeFileSync } from 'node:fs'

export const MYDATA_HEADER =
  'Submission ID,Common Name,Scientific Name,Taxonomic Order,Count,State/Province,County,Location ID,Location,Latitude,Longitude,Date,Time,Protocol,Duration (Min),All Obs Reported,Distance Traveled (km),Area Covered (ha),Number of Observers,Breeding Code,Observation Details,Checklist Comments,ML Catalog Numbers'

export type SyntheticSpecies = { com: string; sci: string; to: number }

/** Small, real-world species list (names only; nothing from any personal export). */
export const DEFAULT_SPECIES: SyntheticSpecies[] = [
  { com: 'Northern Flicker', sci: 'Colaptes auratus', to: 11980 },
  { com: 'Yellow-rumped Warbler', sci: 'Setophaga coronata', to: 34401 },
  { com: 'Gilded Flicker', sci: 'Colaptes chrysoides', to: 11994 },
  { com: 'Mallard', sci: 'Anas platyrhynchos', to: 700 },
  { com: 'American Robin', sci: 'Turdus migratorius', to: 30000 },
  { com: 'Black-capped Chickadee', sci: 'Poecile atricapillus', to: 25000 },
  { com: 'Song Sparrow', sci: 'Melospiza melodia', to: 32000 },
  { com: 'Bald Eagle', sci: 'Haliaeetus leucocephalus', to: 8000 },
]

const REGIONS: [string, string][] = [
  ['CA-BC', 'Okanagan-Similkameen'],
  ['US-AZ', 'Pima'],
  ['US-CA', 'Marin'],
  ['GB-ENG', 'Kent'],
]

/** Tiny deterministic PRNG so runs are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = s
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** Build a MyEBirdData.csv string with `n` synthetic observation rows (fake coordinates, no comments). */
export function buildSyntheticMyData(n: number, species: SyntheticSpecies[] = DEFAULT_SPECIES, seed = 1): string {
  const rand = rng(seed)
  const out: string[] = [MYDATA_HEADER]
  for (let i = 0; i < n; i++) {
    const sp = species[Math.floor(rand() * species.length)]
    const [st, county] = REGIONS[Math.floor(rand() * REGIONS.length)]
    const y = 2005 + Math.floor(rand() * 21)
    const m = 1 + Math.floor(rand() * 12)
    const d = 1 + Math.floor(rand() * 28)
    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const ml = rand() < 0.02 ? `${600000000 + i}` : ''
    out.push(
      `S${i},${sp.com},${sp.sci},${sp.to},1,${st},${county},L${i % 500},Test Site,0.0,0.0,${date},07:30 AM,eBird - Traveling Count,60,1,1.0,,1,,,,${ml}`,
    )
  }
  return out.join('\n') + '\n'
}

// CLI: tsx scripts/validate/synthetic-list.ts <path> [rows]
if (process.argv[1] && /synthetic-list\.ts$/.test(process.argv[1])) {
  const [path, rows] = process.argv.slice(2)
  if (!path) {
    console.error('usage: tsx scripts/validate/synthetic-list.ts <out.csv> [rows=200000]')
    process.exit(1)
  }
  writeFileSync(path, buildSyntheticMyData(rows ? Number(rows) : 200_000))
  console.log(`wrote ${path}`)
}
