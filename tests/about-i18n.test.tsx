// @vitest-environment jsdom
import { LATEST } from '@/components/about/how-it-works-data'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AboutPage from '../app/[lang]/(app)/about/page'
import { HowItWorksPoster } from '@/components/about/HowItWorksDemo'
import { TOTAL } from '@/components/about/how-it-works-data'
import { fmt } from '@/i18n/core'
import { formatInt, shortDay } from '@/i18n/format'
import { LANGS } from '@/i18n/langs'
import { countParts, summaryLine, type RowCount, type SourceCounts } from '@/lib/list/source-counts'
import { pageTitle } from '@/lib/list/title'
import { FOOTER_LINE } from '@/lib/share/image'
import { stampDate, stampStrings, withStamp } from '@/lib/share/stamp'
import { MESSAGES, withI18n } from './i18n-render'

vi.mock('@/components/app/IntentLink', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('@/components/app/PageHead', () => ({ PageHead: ({ title }: { title: string }) => <h1>{title}</h1> }))
vi.mock('@/components/about/HowItWorksDemo', async (orig) => ({ ...(await orig<typeof import('@/components/about/HowItWorksDemo')>()), HowItWorksDemo: () => null }))

afterEach(cleanup)

const STAMPED = new Date(2026, 10, 6)
const text = (el: Element | null) => el?.textContent ?? ''

/** The server-rendered poster in `lang`, as a DOM. */
function poster(lang: (typeof LANGS)[number]): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderToString(createElement(withI18n(lang), null, createElement(HowItWorksPoster)))
  return host
}

describe.each(LANGS)('About, the demo poster in %s', (lang) => {
  const ui = MESSAGES[lang].ui
  const host = poster(lang)
  const wide = host.querySelector('[data-poster="wide"]')!
  const compact = host.querySelector('[data-poster="compact"]')!

  it("draws the product's own strings: Settings rows, summary, page head, taxonomy labels", () => {
    expect(text(wide.querySelector('.ebd-h1'))).toBe(ui.shell.nav.settings)
    expect(text(wide.querySelector('.ebd-h2'))).toBe(ui.import.head)
    const titles = [...wide.querySelectorAll('.ebd-src-title')].map((e) => e.firstChild!.textContent)
    expect(titles).toEqual([ui.import.ebird.listTitle, 'MyEBirdData', 'iNaturalist', ui.tick.title])
    const sum = summaryLine({ total: TOTAL, parts: [{ group: 'ebird', n: TOTAL }] } as unknown as SourceCounts, ui)!
    expect(text(wide.querySelector('.ebd-sum .ebd-swap-b'))).toBe(`${sum} ${ui.settings.seeCollage}`)
    expect(text(wide.querySelector('.ebd-sum .ebd-swap-a'))).toBe(ui.import.combine)
    const imported = fmt(ui.import.imported, { date: shortDay(STAMPED.toISOString(), ui.date.months, STAMPED) })
    const skipped = ui.import.skipped.other.replace('{n}', formatInt(3, ui.num))
    const status = text(wide.querySelector('.ebd-src-full .ebd-src-meta > .ebd-swap > .ebd-swap-b'))
    expect(status).toBe(`${countParts({ species: TOTAL, only: 0 } as RowCount, ui).join(' · ')} · ${skipped} ${ui.import.why} · ${imported}`)
    expect(text(wide.querySelector('.ebd-src-full .ebd-src-meta > .ebd-swap > .ebd-swap-a .ebd-swap-a'))).toBe(ui.import.notAdded)
    expect(text(wide.querySelector('.ebd-head-title'))).toBe(pageTitle(undefined, ui))
    expect(text(wide.querySelector('.ebd-chips-label'))).toBe(ui.filters.rank.order)
    expect(text(wide.querySelector('.ebd-path-link'))).toBe(ui.filters.all)
    expect(text(compact.querySelector('.ebd-pick-label'))).toBe(ui.filters.choose.order)
    expect(text(wide.querySelector('.ebd-mid-label'))).toBe(ui.count.label)
    expect(text(wide.querySelector('.ebd-num'))).toBe(formatInt(TOTAL, ui.num))
    expect(text(wide.querySelector('.ebd-stats .ebd-swap-a'))).toContain(ui.collage.stats.orders.other.replace('{n}', '7'))
  })

  it("draws the share dialog and its images in the language, the stamp ending each footer", () => {
    expect(text(wide.querySelector('.ebd-share-title'))).toBe(ui.share.title)
    expect([...wide.querySelectorAll('.ebd-seg-btn')].map(text)).toEqual([`${ui.share.format.story}9:16`, `${ui.share.format.post}4:5`, `${ui.share.format.square}1:1`])
    expect(text(wide.querySelector('.ebd-share-label'))).toBe(ui.share.nameLabel)
    expect(text(wide.querySelector('.ebd-share-input'))).toBe(ui.share.namePlaceholder)
    expect(text(wide.querySelector('.ebd-share-switch'))).toBe(ui.share.showLatest)
    const line = withStamp(FOOTER_LINE, stampDate(STAMPED, stampStrings(ui)))
    expect([...wide.querySelectorAll('.ebd-img-line')].map(text)).toEqual([line, line, line])
    // The date alone, no lead: "6 Nov 2026" in English, "6 nov 2026" in es, pt and nl, "6 lis 2026" in pl
    expect(line.endsWith(lang === 'en' ? ' · 6 Nov 2026' : lang === 'pl' ? ' · 6 lis 2026' : ' · 6 nov 2026')).toBe(true)
    expect(line.startsWith('everybird.yusuftaleb.com · stickers by huashu')).toBe(true)
    expect(text(wide.querySelector('.ebd-img-latest-label'))).toContain(ui.share.latestLifer)
    expect(text(wide.querySelector('.ebd-img-latest-label'))).toContain(ui.date.months[9])
    expect(text(wide.querySelector('.ebd-img-mark'))).toBe('Everybird')
    // The latest lifer's name is the language's base name (es, pt_BR, nl, pl), English in English.
    const base = { en: undefined, es: 'es', pt: 'pt_BR', nl: 'nl', pl: 'pl' }[lang] as keyof typeof LATEST.names | undefined
    expect(text(wide.querySelector('.ebd-img-latest-name'))).toBe(base ? LATEST.names[base] : LATEST.name)
  })

  it('keeps no English behind: nothing of the scene is the English strings unless the language shares them', () => {
    if (lang === 'en') return
    const all = text(wide)
    for (const w of ['Your list', 'Not added', 'Share image', 'Collage title', 'See my collage', 'Latest lifer', 'As of']) expect(all, w).not.toContain(w)
  })
})

describe.each(LANGS)('About, the figure in %s', (lang) => {
  it('has its sticker credit and caption in the language, the credit link intact', () => {
    const ui = MESSAGES[lang].ui
    const host = document.createElement('div')
    // The page test mocks the demo away; this one needs the real figure.
    host.innerHTML = renderToString(createElement(withI18n(lang), null, createElement(RealDemo)))
    const credit = host.querySelector('.eb-howto-credit')!
    expect(credit.querySelector('a')).toHaveAttribute('href', 'https://github.com/alchaincyf/huashu-bird-sticker')
    expect(text(credit.querySelector('a'))).toBe('huashu-bird-sticker')
    expect(text(credit)).toBe(ui.demo.credit.replace(/<\/?link>/g, ''))
    expect(text(host.querySelector('figcaption'))).toBe(fmt(ui.demo.caption, { total: formatInt(TOTAL, ui.num) }))
  })
})

// The real HowItWorksDemo (the page test above mocks it out so the page renders alone).
const RealDemo = (await vi.importActual<typeof import('@/components/about/HowItWorksDemo')>('@/components/about/HowItWorksDemo')).HowItWorksDemo

describe.each(LANGS)('About, the page in %s', (lang) => {
  const m = MESSAGES[lang]
  it('has its h1, prose and the credits in the language, names and licences verbatim', async () => {
    render(await AboutPage({ params: Promise.resolve({ lang }) }))
    const main = document.querySelector('main')!
    expect(text(main.querySelector('h1'))).toBe(m.ui.shell.nav.about)
    expect(text(main.querySelector('#eb-what-h'))).toBe(m.page.about.what.head)
    expect(text(main.querySelector('#eb-how-h'))).toBe(m.page.about.how.head)
    expect(text(main.querySelector('#eb-size-h'))).toBe(m.page.about.size.head)
    const credits = document.getElementById('credits')!
    const made = { en: 'Made by Yusuf Taleb', es: 'Hecho por Yusuf Taleb', pt: 'Feito por Yusuf Taleb', nl: 'Gemaakt door Yusuf Taleb', pl: 'Autor: Yusuf Taleb' }[lang]
    expect(made).toBe(m.ui.shell.footer.madeBy)
    expect(text(credits.querySelector('.eb-prose'))).toMatch(new RegExp(`^${made}\\.`))
    expect(within(credits).getByRole('link', { name: 'Yusuf Taleb' })).toHaveAttribute('href', 'https://www.yusuftaleb.com')
    // The coffee sentence is translated, the button and its alt stay
    expect(text(credits.querySelector('.eb-coffee .eb-prose'))).toBe(m.page.about.credits.coffee)
    expect(within(credits).getByRole('img', { name: 'Buy me a coffee' })).toHaveAttribute('src', '/buy-me-a-coffee.png')
    for (const name of ['huashu-bird-sticker', 'CC BY 4.0', 'Icons8', 'Origami', 'Natural Earth', 'Debian iso-codes', 'Fontshare', 'flag-icons', 'AVONET', 'BIRDBASE', 'iNaturalist']) {
      expect(within(credits).getAllByRole('link', { name }).length, name).toBeGreaterThan(0)
    }
    expect(within(credits).getByRole('link', { name: 'huashu-bird-sticker' })).toHaveAttribute('href', 'https://github.com/alchaincyf/huashu-bird-sticker')
    expect(within(credits).getAllByRole('link', { name: 'CC BY 4.0' })[0]).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
    expect(text(credits)).toMatch(/Cornell Lab of Ornithology|Laboratorio de Ornitología de Cornell/)
    // The steps' first link is Settings, in the language
    expect(within(main).getByRole('link', { name: m.ui.shell.nav.settings })).toHaveAttribute('href', '/settings')
  })

  it("the privacy note keeps its claims and adds the language cookie and the visit language, translated", async () => {
    render(await AboutPage({ params: Promise.resolve({ lang }) }))
    const p = text(document.querySelector('main .eb-how, section[aria-labelledby="eb-how-h"] > p.eb-prose'))
    expect(p).toBe(m.page.about.how.privacy)
    expect(p).toContain('Cloudflare Web Analytics')
    // Polish quotes open low („es”).
    expect(p).toMatch(/[“„"]es[”"], [“„"]pt[”"].*[“„"]nl[”"].*[“„"]pl[”"]/)
    if (lang === 'en') {
      expect(p).toContain('anonymous and cookieless')
      expect(p).toContain('Your language choice is kept in a small cookie on this device; it never leaves it except to show you the right page.')
      expect(p).toContain('The visit count includes your browser\'s language (just “es”, “pt”, “nl” or “pl”).')
    }
  })
})
