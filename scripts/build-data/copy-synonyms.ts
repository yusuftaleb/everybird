import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Publish data/inat-synonyms.json as minified public/data/inat-synonyms.v1.json. Needs no data/raw. */
const src = resolve(process.cwd(), 'data/inat-synonyms.json')
const outDir = resolve(process.cwd(), 'public/data')
mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'inat-synonyms.v1.json'), JSON.stringify(JSON.parse(readFileSync(src, 'utf8'))))
