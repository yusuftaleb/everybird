// Measures the count's glyphs (src/lib/layout/count-box.ts's header table) without a browser: downloads the woff2
// files the app's stylesheets serve (Fontshare: Cabinet Grotesk 700, Satoshi 700; Google Fonts: Geist Mono 500) and
// reads advances and ink bounds with fontkit. Satoshi's tabular digits come from its `tnum` feature, as tabular-nums
// asks for them.
//
//   npx -p fontkit -p tsx tsx scripts/dev/measure-count-glyphs.ts
//
// fontkit is not in package.json: npx installs it for this one run, and loadFontkit finds it through the npx install's
// node_modules/.bin on PATH and loads it with createRequire (a bare import would resolve from the repo's node_modules,
// where it isn't). It first checks the
// committed advances for 0-9 and "," (measured in Chromium) and exits 1 if any is off by more than 0.005 em; then it
// prints "." per face and Geist Mono 500's "É" ink top, for the table.
import { createRequire } from 'node:module'
import { ADV_TABLE } from '../../src/lib/layout/count-box'

type Glyph = { advanceWidth: number; bbox: { minY: number; maxY: number } }
type Font = {
  unitsPerEm: number
  variationAxes?: Record<string, unknown>
  getVariation?: (v: Record<string, number>) => Font
  layout: (text: string, features?: string[]) => { glyphs: Glyph[]; positions: { xAdvance: number }[] }
}
type Fontkit = { create: (buf: Buffer) => Font }

const require = createRequire(import.meta.url)
function loadFontkit(): Fontkit {
  // npx -p installs into its cache and puts that install's node_modules/.bin on PATH (NODE_PATH stays unset, and the
  // repo's own tsx runs this file), so look in the node_modules above each PATH entry, then NODE_PATH, then a plain resolve.
  const fromPath = (process.env.PATH ?? '').split(':').filter((p) => p.endsWith('node_modules/.bin')).map((p) => p.slice(0, -'.bin'.length))
  const paths = [...fromPath, ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean)]
  for (const p of paths) {
    try { return require(require.resolve('fontkit', { paths: [p] })) as Fontkit } catch { /* next */ }
  }
  return require('fontkit') as Fontkit
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
async function text(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': UA } })
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.text()
}
async function bytes(url: string): Promise<Buffer> {
  const r = await fetch(url.startsWith('//') ? `https:${url}` : url, { headers: { 'user-agent': UA } })
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

/** The woff2 URL in a stylesheet: the first, or the @font-face block whose unicode-range starts at U+0000 (latin). */
function woff2(css: string, latin = false): string {
  const blocks = css.split('@font-face').slice(1)
  const block = latin ? blocks.find((b) => /unicode-range:\s*U\+0000-00FF/i.test(b)) : blocks[0]
  const m = block && /url\(['"]?([^'")]+\.woff2)['"]?\)/.exec(block)
  if (!m) throw new Error('no woff2 in stylesheet')
  return m[1]
}

async function face(css: string, weight: number, latin = false): Promise<Font> {
  const fk = loadFontkit()
  let f = fk.create(await bytes(woff2(await text(css), latin)))
  if (f.variationAxes && 'wght' in f.variationAxes && f.getVariation) f = f.getVariation({ wght: weight })
  return f
}

const em = (f: Font, units: number) => units / f.unitsPerEm
function advance(f: Font, ch: string, features: string[] = []): number {
  return em(f, f.layout(ch, features).positions[0].xAdvance)
}
function inkTop(f: Font, ch: string): number {
  return em(f, f.layout(ch).glyphs[0].bbox.maxY)
}

async function main() {
  const cabinet = await face('https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700&display=swap', 700)
  const satoshi = await face('https://api.fontshare.com/v2/css?f[]=satoshi@700&display=swap', 700)
  const mono = await face('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@500', 500, true)

  const faces: [keyof typeof ADV_TABLE, (ch: string) => number][] = [
    ['cabinet', (ch) => advance(cabinet, ch)],
    ['satTab', (ch) => advance(satoshi, ch, ['tnum'])],
    ['satProp', (ch) => advance(satoshi, ch)],
  ]
  const chars = [...'0123456789', ',']
  let worst = 0, bad = 0
  for (const [name, adv] of faces) {
    const row = chars.map((ch, i) => {
      const got = adv(ch), want = ADV_TABLE[name][i], d = got - want
      worst = Math.max(worst, Math.abs(d))
      if (Math.abs(d) > 0.005) { bad++; console.log(`  ${name} "${ch}": measured ${got.toFixed(4)}, committed ${want.toFixed(3)} (Δ ${d.toFixed(4)})`) }
      return got.toFixed(3)
    })
    console.log(`${name.padEnd(8)} ${row.join('  ')}   "." ${adv('.').toFixed(3)}   "/" ${adv('/').toFixed(3)}`)
  }
  console.log(`largest difference from the committed table: ${worst.toFixed(4)} em`)
  if (bad) { console.error(`${bad} advances differ by more than 0.005 em: the table was measured in Chromium; stop.`); process.exit(1) }

  // Whole strings, kerning included: the dotted count must lay out no wider than the comma's.
  const width = (f: Font, s: string, features: string[] = []) => em(f, f.layout(s, features).positions.reduce((a, p) => a + p.xAdvance, 0))
  const runs: [string, Font, string[]][] = [['cabinet', cabinet, []], ['satTab', satoshi, ['tnum']], ['satProp', satoshi, []]]
  for (const [name, f, feats] of runs) for (const comma of ['1,089', '11,019', '1,111']) {
    const dotted = comma.replace(',', '.'), wc = width(f, comma, feats), wd = width(f, dotted, feats)
    console.log(`${name.padEnd(8)} "${comma}" ${wc.toFixed(3)}  "${dotted}" ${wd.toFixed(3)}${wd > wc + 1e-9 ? '  WIDER' : ''}`)
    if (wd > wc + 1e-9) bad++
  }
  if (bad) { console.error('a dotted count lays out wider than the comma one'); process.exit(1) }

  const dot = Math.max(...faces.map(([, adv]) => adv('.')))
  console.log(`"." widest of the three faces: ${dot.toFixed(3)} em`)
  const slash = Math.max(...faces.map(([, adv]) => adv('/')))
  console.log(`"/" widest of the three faces: ${slash.toFixed(3)} em`)
  for (const [name, f] of [['cabinet', cabinet], ['satoshi', satoshi]] as const) {
    const g = f.layout('/').glyphs[0].bbox
    console.log(`${name.padEnd(8)} "/" ink ${em(f, g.minY).toFixed(3)} to ${em(f, g.maxY).toFixed(3)} em, " " advance ${advance(f, ' ').toFixed(3)}, tnum ${advance(f, ' ', ['tnum']).toFixed(3)}`)
  }
  console.log(`Geist Mono 500: advance ${advance(mono, 'S').toFixed(3)}, "S" ink top ${inkTop(mono, 'S').toFixed(3)}, "É" ink top ${inkTop(mono, 'É').toFixed(3)} em`)
}

main().catch((e) => { console.error(e); process.exit(1) })
