// The About demo's sticker files cover their drawn size: each demo sticker is a srcset of the 128 and 384 files with
// `sizes` its widest drawn width (HowItWorksScene's demoSticker). Here the browser's choice is played out at page
// widths from a phone to a wide desktop and at 1x to 3x, against the drawn size worked out from the layout data
// and About's CSS on its own (.eb-page's gutters and 1088px content, the Stage's zoom min(2, width / design)).
import { describe, expect, it } from 'vitest'
import { AR, BIRDS, COLLAGE } from '@/components/about/how-it-works-data'
import { demoSticker } from '@/components/about/HowItWorksScene'

/** About's content width and the design shown at a page width (app.css .eb-page; the compact design under 560px). */
function figure(vw: number) {
  const content = vw < 720 ? vw - 32 : Math.min(vw - 64, 1088)
  const layout = content < 560 ? 'compact' as const : 'wide' as const
  return { layout, scale: Math.min(2, content / (layout === 'wide' ? 720 : 358)) }
}

/** `sizes` at a page width, in CSS px: the first entry whose media matches (only the forms demoSticker writes). */
function sizesAt(sizes: string, vw: number): number {
  for (const entry of sizes.split(/, (?=\(max-width|calc)/)) {
    const m = /^(?:\(max-width: ([\d.]+)px\) )?calc\(\((.+)\) \* ([\d.]+)\)$/.exec(entry)
    if (!m) throw new Error(`unexpected sizes entry: ${entry}`)
    if (m[1] && vw > Number(m[1])) continue
    const content = m[2] === '100vw - 32px' ? vw - 32 : m[2] === 'min(100vw - 64px, 1088px)' ? Math.min(vw - 64, 1088) : NaN
    return content * Number(m[3])
  }
  throw new Error('no sizes entry matched')
}

/** The candidate a browser takes: the smallest whose density (width / sizes) reaches the screen's, else the largest. */
function chosen(srcSet: string, slot: number, dpr: number): number {
  const ws = srcSet.split(', ').map((c) => Number(/ (\d+)w$/.exec(c)![1])).sort((a, b) => a - b)
  return ws.find((w) => w / slot >= dpr) ?? ws[ws.length - 1]
}

const WIDTHS = [320, 360, 390, 430, 560, 591, 592, 700, 719, 720, 768, 1024, 1152, 1280, 1440, 1920]

describe('About demo stickers', () => {
  it('take a file that covers their drawn device size at every page width and density, the 384 file where drawn past 128', () => {
    const short: string[] = []
    for (const code of BIRDS) {
      const { srcSet, sizes, src } = demoSticker(code)
      expect(srcSet).toMatch(/\/v1\/128\/.+ \d+w, .+\/v1\/384\/.+ \d+w$/)
      expect(src).toContain('/v1/128/')
      const wf = Math.min(1, AR[code] ?? 1)
      for (const vw of WIDTHS) {
        const { layout, scale } = figure(vw)
        const c = COLLAGE[layout]
        const drawn = Math.max(c.all[code][2], c.herons[code]?.[2] ?? 0) * scale // CSS px, the collage's widest box
        for (const dpr of [1, 2, 3]) {
          const w = chosen(srcSet, sizesAt(sizes, vw), dpr)
          // The file's width covers the drawn width in device px, up to the 384 file's own width
          if (w + 0.5 < Math.min(384 * wf, drawn * dpr)) short.push(`${code} @${vw}px ${dpr}x: ${w}w for ${Math.round(drawn * dpr)} device px`)
        }
      }
    }
    expect(short).toEqual([])
  })

  it('on a 2x screen at the full 1088px figure, the 384 file goes only to the few birds drawn past 128 device px', () => {
    const big = BIRDS.filter((code) => chosen(demoSticker(code).srcSet, sizesAt(demoSticker(code).sizes, 1152), 2) > Math.round(128 * Math.min(1, AR[code] ?? 1)))
    expect(big.length).toBeGreaterThan(0)
    expect(big.length).toBeLessThan(16)
    // and a 1x screen takes the small file for every bird
    expect(BIRDS.filter((code) => chosen(demoSticker(code).srcSet, sizesAt(demoSticker(code).sizes, 1152), 1) > 128)).toEqual([])
  })
})
