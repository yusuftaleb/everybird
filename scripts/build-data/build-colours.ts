// Writes public/data/colours.v1.json: each sticker's main colour as one sortable key (colour-key.ts), for the collage's
// By colour arrangement. Reads the huashu drawings the lock's `codes` name, under <data/raw>/huashu (git-ignored):
//   DATA_RAW=<data/raw> npx tsx scripts/build-data/build-colours.ts
// then rerun data-files.ts. Prints how many drawings differ from the lock's `shipped` blob (a checkout at another
// commit than the lock: their colours come from that drawing), the chromatic / neutral split and a few known keys.
// Output: { v: 1, huashu: <lock commit>, c: { <code>: <key> } }, codes sorted; a code with no readable drawing is left out.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { gitBlobSha } from './huashu-pin'
import { CHROMATIC_KEYS, colourKey, type ColourName } from './colour-key'

const SIDE = 128
const SHOW = ['norcar', 'blujay', 'amecro', 'mutswa', 'amegfi', 'eurrob1', 'mallar3', 'scamac1']

async function main() {
  const raw = resolve(process.env.DATA_RAW ?? 'data/raw')
  const lock = JSON.parse(readFileSync('data/huashu.lock.json', 'utf8')) as { commit: string; codes: Record<string, string>; shipped: Record<string, string> }
  const names: Record<string, ColourName> = JSON.parse(readFileSync('data/colour-names.json', 'utf8'))
  const out: Record<string, number> = {}
  let mismatched = 0, missing = 0
  for (const code of Object.keys(lock.codes).sort()) {
    let buf: Buffer
    try { buf = readFileSync(join(raw, 'huashu', lock.codes[code])) } catch { missing++; continue }
    if (lock.shipped[code] && gitBlobSha(buf) !== lock.shipped[code]) mismatched++
    const { data, info } = await sharp(buf).resize(SIDE, SIDE, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const k = colourKey(data, info.width, info.height, names[code])
    if (k !== null) out[code] = k
  }
  writeFileSync('public/data/colours.v1.json', JSON.stringify({ v: 1, huashu: lock.commit, c: out }))
  const keys = Object.values(out)
  const chroma = keys.filter((k) => k < CHROMATIC_KEYS).length
  console.log(`colours: ${keys.length} keys (${chroma} chromatic, ${keys.length - chroma} neutral), ${missing} drawings missing, ${mismatched} not the lock's shipped blob`)
  console.log(SHOW.map((c) => `${c}=${out[c] ?? '-'}`).join(' '))
}

void main()
