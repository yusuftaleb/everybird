// Downloads the raw sources into data/raw/ (git-ignored) and writes data/raw/manifest.json.
// Run: npx tsx scripts/build-data/fetch-sources.ts
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAW = resolve(process.cwd(), 'data/raw')
const HUASHU_URL = 'https://github.com/alchaincyf/huashu-bird-sticker'
const EBIRD_URL = 'https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json'
const EBIRD_VERSIONS_URL = 'https://api.ebird.org/v2/ref/taxonomy/versions'
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'

const ISO_URL = 'https://salsa.debian.org/iso-codes-team/iso-codes/-/raw/main/data/iso_3166-2.json'

async function download(url: string, file: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(resolve(RAW, file), buf)
  console.log(`${file}: ${(buf.length / 1e6).toFixed(1)} MB`)
}

async function main() {
  mkdirSync(RAW, { recursive: true })
  const huashuDir = resolve(RAW, 'huashu')
  if (!existsSync(huashuDir)) {
    execFileSync('git', ['clone', '--depth', '1', HUASHU_URL, huashuDir], { stdio: 'inherit' })
  }
  const huashuCommit = execFileSync('git', ['-C', huashuDir, 'rev-parse', 'HEAD']).toString().trim()

  const versions = (await (await fetch(EBIRD_VERSIONS_URL)).json()) as { authorityVer: number; latest: boolean }[]
  const ebirdTaxonomy = String(versions.find((v) => v.latest)?.authorityVer ?? 'unknown')

  await download(EBIRD_URL, 'ebird-taxonomy.json')
  await download(NE + 'ne_50m_admin_0_countries.geojson', 'ne_50m_admin_0_countries.geojson')
  await download(NE + 'ne_10m_admin_1_states_provinces.geojson', 'ne_10m_admin_1_states_provinces.geojson')
  await download(ISO_URL, 'iso_3166-2.json')

  const date = new Date().toISOString().slice(0, 10)
  const manifest = {
    date,
    huashuCommit,
    ebirdTaxonomy,
    sources: [
      { name: 'huashu-bird-sticker', url: HUASHU_URL, date, commit: huashuCommit },
      { name: 'ebird-taxonomy', url: EBIRD_URL, date, version: ebirdTaxonomy },
      { name: 'ne_50m_admin_0_countries', url: NE + 'ne_50m_admin_0_countries.geojson', date },
      { name: 'ne_10m_admin_1_states_provinces', url: NE + 'ne_10m_admin_1_states_provinces.geojson', date },
      { name: 'iso-codes iso_3166-2 (Debian iso-codes, LGPL-2.1)', url: ISO_URL, date, licence: 'LGPL-2.1' },
    ],
  }
  writeFileSync(resolve(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('manifest written; huashu', huashuCommit, 'eBird taxonomy', ebirdTaxonomy)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
