// The top bar's fit, without a browser: a model of the bar (src/components/app/app.css, the .eb-topbar… rules) fed
// with the served fonts' advance widths (tests/fixtures/glyph-advances.json, from scripts/dev/measure-glyphs.ts) and
// the nav labels of all four dictionaries. For each preview variant (lang:a|b|c) and language, row one, and row two
// where the nav has its own row, fit inside the bar's padding with a 4px margin at every phone, tablet and desktop
// width we care about and at both sides of every breakpoint. A second test reads app.css and tokens.css and checks
// they still say what the model assumes, so a CSS change that would break the fit has to update the model too.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANG_VARIANTS } from '@/i18n/choose'
import { HTML_LANG, LANGS, type Lang } from '@/i18n/langs'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pl } from '@/i18n/messages/pl'
import { pt } from '@/i18n/messages/pt'
import glyphs from './fixtures/glyph-advances.json'

type Variant = (typeof LANG_VARIANTS)[number]
type FontKey = keyof typeof glyphs.fonts

const NAV = { en, es, pt, nl, pl }
const PAGES = ['collage', 'settings', 'about'] as const

/** Room left over that we insist on: kerning (tightens these words; `kernWidenEm` is added anyway), subpixel rounding. */
const MARGIN = 4

/** A string's width at `px`: the sum of its advances, the most kerning widens a word, and letter-spacing per glyph
 *  (browsers add it after every glyph, the last one too). */
function textWidth(font: FontKey, s: string, px: number, letterSpacingEm = 0): number {
  const f = glyphs.fonts[font]
  const adv = f.advances as Record<string, number>
  let em = f.kernWidenEm
  for (const ch of s) {
    const a = adv[ch]
    if (a === undefined) throw new Error(`no advance for ${JSON.stringify(ch)} in ${font}`)
    em += a + letterSpacingEm
  }
  return em * px
}

/** The bar's sizes at a page width. Each field names the rule it mirrors. */
type Sizes = {
  /** .eb-topbar-in max-width (border-box, so the padding is inside it). */
  maxWidth: number
  /** .eb-topbar-in padding's inline sides: 16px; 32px from 720px; 12px under 360px; 8px under 240px. */
  gutter: number
  /** .eb-topbar-in gap: 8px; 4px under 500px; 2px under 360px. */
  gap: number
  /** .eb-wordmark font-size (Cabinet Grotesk 700, letter-spacing -.01em): 22px; 19px under 500px; 17px under 360px. */
  wordmark: number
  /** .eb-nav ul gap: 4px; 2px under 500px; 0 under 360px. */
  navGap: number
  /** .eb-nav-link padding's inline sides: 12px; 8px under 500px; 6px under 360px; 3px under 240px (border 1px). */
  linkPad: number
  /** .eb-nav-link font-size (Satoshi 500; the current page 600, which the browser draws with the 700 file): 15px;
   *  14px under 500px; 13px under 360px. */
  linkFont: number
  /** .eb-theme width (the theme switch and the language button): 44px; 40px under 500px; 36px under 360px. */
  button: number
  /** .eb-topbar-end gap: 4px; 2px under 360px. */
  endGap: number
}

const WIDE: Sizes = { maxWidth: 1152, gutter: 16, gap: 8, wordmark: 22, navGap: 4, linkPad: 12, linkFont: 15, button: 44, endGap: 4 }
/** @media (min-width: 720px) { .eb-topbar-in { padding: 10px 32px; … } } */
const DESKTOP: Partial<Sizes> = { gutter: 32 }
/** @media (max-width: 499px) */
const SMALL: Partial<Sizes> = { gap: 4, wordmark: 19, navGap: 2, linkPad: 8, linkFont: 14, button: 40 }
/** @media (max-width: 359px) */
const TINY: Partial<Sizes> = { gutter: 12, gap: 2, wordmark: 17, navGap: 0, linkPad: 6, linkFont: 13, button: 36, endGap: 2 }
/** @media (max-width: 239px) */
const MICRO: Partial<Sizes> = { gutter: 8, linkPad: 3 }

function sizesAt(w: number): Sizes {
  if (w >= 720) return { ...WIDE, ...DESKTOP }
  if (w >= 500) return WIDE
  if (w >= 360) return { ...WIDE, ...SMALL }
  if (w >= 240) return { ...WIDE, ...SMALL, ...TINY }
  return { ...WIDE, ...SMALL, ...TINY, ...MICRO }
}

/** Where the nav takes its own row (app.css's split rules, each paired with a --topbar-h rule in tokens.css): under
 *  `below` px, for the variant and languages `selector` matches. */
const SPLITS: { selector: string; below: number; applies: (v: Variant, l: Lang) => boolean }[] = [
  { selector: ':root:not([data-topbar="b"], [data-topbar="c"])', below: 430, applies: (v) => v === 'a' },
  { selector: ':root[data-topbar="b"]:is(:lang(es), :lang(nl))', below: 384, applies: (v, l) => v === 'b' && (l === 'es' || l === 'nl') },
  { selector: ':root[data-topbar="b"]', below: 366, applies: (v) => v === 'b' },
  { selector: ':root[data-topbar="c"]', below: 310, applies: (v) => v === 'c' },
]
/** c hides the Collage link under 480px: `:root[data-topbar="c"] .eb-nav [data-nav="collage"] { display: none; }`. */
const C_HIDES_COLLAGE_BELOW = 480

const splitAt = (v: Variant, l: Lang, w: number) => SPLITS.some((s) => s.applies(v, l) && w < s.below)
const hasLangButton = (v: Variant) => v !== 'b'
const pagesShown = (v: Variant, w: number) => PAGES.filter((p) => !(p === 'collage' && v === 'c' && w < C_HIDES_COLLAGE_BELOW))

/** The nav's width: every link at 500, plus the widest 600 (drawn 700) difference, for the current page. */
function navWidth(l: Lang, pages: readonly (typeof PAGES)[number][], s: Sizes): number {
  const labels = pages.map((p) => NAV[l].ui.shell.nav[p])
  const links = labels.map((t) => textWidth('satoshi-500', t, s.linkFont) + 2 * s.linkPad + 2)
  const bold = Math.max(...labels.map((t) => textWidth('satoshi-700', t, s.linkFont) - textWidth('satoshi-500', t, s.linkFont)))
  return links.reduce((a, b) => a + b, 0) + bold + s.navGap * (labels.length - 1)
}

type Fit = { split: boolean; inner: number; one: number; two?: number }

function fit(v: Variant, l: Lang, w: number): Fit {
  const s = sizesAt(w)
  const inner = Math.min(w, s.maxWidth) - 2 * s.gutter
  const wordmark = textWidth('cabinet-grotesk-700', 'Everybird', s.wordmark, -0.01)
  const end = s.button + (hasLangButton(v) ? s.endGap + s.button : 0)
  const nav = navWidth(l, pagesShown(v, w), s)
  const split = splitAt(v, l, w)
  if (split) return { split, inner, one: wordmark + s.gap + end, two: nav }
  return { split, inner, one: wordmark + s.gap + nav + s.gap + end }
}

const BREAKPOINT_EDGES = [239, 240, 299, 300, 309, 310, 359, 360, 365, 366, 383, 384, 429, 430, 479, 480, 499, 500, 719, 720]
const WIDTHS = [...new Set([195, 260, 300, 320, 340, 360, 375, 390, 414, 430, 480, 600, 720, 1280, ...BREAKPOINT_EDGES])].sort((a, b) => a - b)

describe('the top bar fits (fontkit advances of the served fonts)', () => {
  for (const v of LANG_VARIANTS) {
    for (const l of LANGS) {
      it(`lang:${v}, ${l}: row one, and row two where the nav has it, fit at every width`, () => {
        const bad: string[] = []
        for (const w of WIDTHS) {
          const f = fit(v, l, w)
          if (f.one + MARGIN > f.inner) bad.push(`${w}px: row one ${f.one.toFixed(1)} in ${f.inner}`)
          if (f.two !== undefined && f.two + MARGIN > f.inner) bad.push(`${w}px: row two ${f.two.toFixed(1)} in ${f.inner}`)
        }
        expect(bad).toEqual([])
      })
    }
  }

  it('the language code fits its button at its narrowest (Geist Mono 13px, letter-spacing .06em)', () => {
    for (const l of LANGS) expect(textWidth('geist-mono-500', l.toUpperCase(), 13, 0.06)).toBeLessThan(TINY.button! - 2 * MARGIN)
  })

  it('every split rule matches some language (no dead rule) and the html lang values the selectors key on', () => {
    for (const s of SPLITS) expect(LANG_VARIANTS.some((v) => LANGS.some((l) => s.applies(v, l)))).toBe(true)
    expect(HTML_LANG.es).toBe('es')
    expect(HTML_LANG.nl).toBe('nl')
  })

  if (process.env.TOPBAR_FIT_TABLE) {
    it('prints the table', () => {
      for (const v of LANG_VARIANTS) {
        for (const l of LANGS) {
          const cells = WIDTHS.map((w) => {
            const f = fit(v, l, w)
            const spare = Math.min(f.inner - f.one, f.two === undefined ? Infinity : f.inner - f.two)
            return `${w}${f.split ? '²' : ''}:${spare.toFixed(0)}`
          })
          console.log(`${v} ${l} ${cells.join(' ')}`)
        }
      }
    })
  }
})

describe('the model mirrors the CSS', () => {
  const app = readFileSync(join(__dirname, '../src/components/app/app.css'), 'utf8')
  const tokens = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8')
  /** The body of the first `@media (<query>) {` block whose first line holds `marker`. */
  const block = (css: string, query: string, marker: string): string => {
    const head = `@media (${query}) {\n`
    let at = css.indexOf(head)
    while (at >= 0) {
      const body = css.slice(at + head.length, css.indexOf('\n}', at))
      if (body.split('\n')[0].includes(marker)) return body
      at = css.indexOf(head, at + 1)
    }
    throw new Error(`no @media (${query}) block starting with ${marker}`)
  }

  it('the bar never clips: its menus (the language menu) hang below it', () => {
    // overflow-x: clip clipped the language menu to a sliver at the bar's bottom edge (some engines clip both axes).
    const bar = /\.eb-topbar \{([^}]*)\}/.exec(app)?.[1] ?? ''
    expect(bar).not.toMatch(/overflow/)
  })
  it('the base rules and the 720/500/360/240 steps say what Sizes says', () => {
    expect(app).toContain(`max-width: ${WIDE.maxWidth}px; margin: 0 auto; padding: 8px ${WIDE.gutter}px;`)
    expect(app).toContain(`display: flex; align-items: center; gap: ${WIDE.gap}px;\n}`)
    expect(app).toContain(`@media (min-width: 720px) { .eb-topbar-in { padding: 10px ${DESKTOP.gutter}px;`)
    expect(app).toContain(`font-family: var(--font-display); font-weight: 700; font-size: ${WIDE.wordmark}px; line-height: 1; letter-spacing: -.01em;`)
    expect(app).toContain(`.eb-nav ul { display: flex; gap: ${WIDE.navGap}px;`)
    expect(app).toContain(`min-height: 40px; padding: 0 ${WIDE.linkPad}px; white-space: nowrap;\n  border: 1px solid transparent;`)
    expect(app).toContain(`font-size: ${WIDE.linkFont}px; font-weight: 500;`)
    expect(app).toMatch(/\.eb-nav-link\[aria-current="page"\] \{[^}]*font-weight: 600;/)
    expect(app).toContain(`.eb-theme {\n  position: relative; display: grid; place-items: center; width: ${WIDE.button}px;`)
    expect(app).toContain(`.eb-topbar-end { display: flex; align-items: center; gap: ${WIDE.endGap}px; flex: none; }`)

    const small = block(app, 'max-width: 499px', '.eb-topbar-in')
    expect(small).toContain(`.eb-topbar-in { gap: ${SMALL.gap}px; }`)
    expect(small).toContain(`.eb-wordmark { font-size: ${SMALL.wordmark}px; }`)
    expect(small).toContain(`.eb-nav ul { gap: ${SMALL.navGap}px; }`)
    expect(small).toContain(`.eb-nav-link { padding: 0 ${SMALL.linkPad}px; font-size: ${SMALL.linkFont}px; }`)
    expect(small).toContain(`.eb-theme { width: ${SMALL.button}px;`)

    const tiny = block(app, 'max-width: 359px', '.eb-topbar-in')
    expect(tiny).toContain(`.eb-topbar-in { padding: 8px ${TINY.gutter}px; gap: ${TINY.gap}px; }`)
    expect(tiny).toContain(`.eb-wordmark { font-size: ${TINY.wordmark}px; }`)
    expect(tiny).toContain(`.eb-nav ul { gap: ${TINY.navGap}; }`)
    expect(tiny).toContain(`.eb-nav-link { padding: 0 ${TINY.linkPad}px; font-size: ${TINY.linkFont}px; }`)
    expect(tiny).toContain(`.eb-theme { width: ${TINY.button}px; }`)
    expect(tiny).toContain(`.eb-topbar-end { gap: ${TINY.endGap}px; }`)

    const micro = block(app, 'max-width: 239px', '.eb-topbar-in')
    expect(micro).toContain(`.eb-topbar-in { padding-inline: ${MICRO.gutter}px; }`)
    expect(micro).toContain(`.eb-nav-link { padding: 0 ${MICRO.linkPad}px; }`)
    // A pill narrower than 44px still takes a 44px press across.
    expect(app).toContain(".eb-nav-link::after { content: ''; position: absolute; inset: -2px min(0px, calc((100% - 44px) / 2)); }")
  })

  it('each split in app.css has its --topbar-h twin in tokens.css, with the same query and selector, and no others', () => {
    for (const s of SPLITS) {
      const q = `max-width: ${s.below - 1}px`
      const body = block(app, q, `${s.selector} .eb-topbar-in`)
      expect(body).toContain(`${s.selector} .eb-topbar-in { flex-wrap: wrap; row-gap: 0; padding-block: 4px; min-height: 0; }`)
      expect(body).toContain(`${s.selector} .eb-topbar-end { order: 1; margin-left: auto; }`)
      expect(body).toContain(`${s.selector} .eb-nav { order: 2; flex: 1 0 100%; margin-left: 0; }`)
      expect(tokens).toContain(`@media (${q}) { ${s.selector} { --topbar-h: 93px; } }`)
    }
    expect(tokens.match(/--topbar-h: 93px/g)).toHaveLength(SPLITS.length)
    expect(app.match(/\.eb-topbar-in \{ flex-wrap: wrap;/g)).toHaveLength(SPLITS.length)
    expect(app).toContain(`@media (max-width: ${C_HIDES_COLLAGE_BELOW - 1}px) {\n  :root[data-topbar="c"] .eb-nav [data-nav="collage"] { display: none; }`)
  })

  it('--topbar-h is the bar: 8 + 44 + 8 and the hairline in one row (10 + 44 + 10 from 720px), 4 + 44 + 40 + 4 in two', () => {
    expect(tokens).toContain('--topbar-h: 61px;')
    expect(tokens).toContain('@media (min-width: 720px) { :root { --topbar-h: 65px; } }')
    expect(app).toContain('min-height: 60px;')
    expect(app).toContain('min-height: 64px;')
    expect(app).toContain('display: inline-flex; align-items: center; min-height: 44px;') // the wordmark, row one
    expect(app).toContain('display: inline-flex; align-items: center; min-height: 40px;') // a nav link, row two
    expect(4 + 44 + 40 + 4 + 1).toBe(93)
  })
})
