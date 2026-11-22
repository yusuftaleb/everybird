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
import { fmt, plural } from '@/i18n/core'
import { formatInt, shortDay } from '@/i18n/format'
import { LANGS } from '@/i18n/langs'
import { showLabel } from '@/lib/list/filter-summary'
import { countParts, summaryLine, type RowCount, type SourceCounts } from '@/lib/list/source-counts'
import { pageTitle } from '@/lib/list/title'
import { FOOTER_LINE } from '@/lib/share/image'
import { stampDate, stampStrings } from '@/lib/share/stamp'
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

  it("draws the product's own strings: top bar, Settings rows, summary, page head, controls bar, Taxa panel", () => {
    expect([...wide.querySelectorAll('.ebd-nav-link')].map(text)).toEqual([ui.shell.nav.collage, ui.shell.nav.compare, ui.shell.nav.settings, ui.shell.nav.about])
    expect(text(wide.querySelector('.ebd-h1'))).toBe(ui.shell.nav.settings)
    expect(text(wide.querySelector('.ebd-h2'))).toBe(ui.import.head)
    expect(text(wide.querySelector('.ebd-btn-hand'))).toBe(ui.add.hand)
    const titles = [...wide.querySelectorAll('.ebd-src-title')].map((e) => e.firstChild!.textContent)
    expect(titles).toEqual([ui.import.ebird.listTitle, 'MyEBirdData', 'iNaturalist', ui.import.sheet.title])
    const sum = summaryLine({ total: TOTAL, parts: [{ group: 'ebird', n: TOTAL }] } as unknown as SourceCounts, ui)!
    expect(text(wide.querySelector('.ebd-sum .ebd-swap-b'))).toBe(`${sum} ${ui.settings.seeCollage}`)
    expect(text(wide.querySelector('.ebd-sum .ebd-swap-a'))).toBe(ui.import.combine)
    const imported = fmt(ui.import.imported, { date: shortDay(STAMPED.toISOString(), ui.date.months, STAMPED) })
    const skipped = plural(ui.import.skipped, 3, { n: formatInt(3, ui.num) })
    const status = text(wide.querySelector('.ebd-src-full .ebd-src-meta > .ebd-swap > .ebd-swap-b'))
    expect(status).toBe(`${countParts({ species: TOTAL, only: 0 } as RowCount, ui).join(' · ')} · ${skipped} ${ui.import.why} · ${imported}`)
    expect(text(wide.querySelector('.ebd-src-full .ebd-src-meta > .ebd-swap > .ebd-swap-a .ebd-swap-a'))).toBe(ui.import.notAdded)
    expect(text(wide.querySelector('.ebd-head-title'))).toBe(pageTitle(undefined, ui))
    expect(text(wide.querySelector('.ebd-btn-add'))).toBe(ui.collage.addBirds)
    expect(text(wide.querySelector('.ebd-btn-print'))).toBe(ui.collage.print)
    expect(text(wide.querySelector('.ebd-btn-share'))).toBe(ui.collage.share)
    // The controls bar: four view tabs, then Taxa, Display and Filters, then search (ControlsBar)
    for (const root of [wide, compact]) {
      expect(root.querySelectorAll('.ebd-dock-tabs .ebd-icontab')).toHaveLength(4)
      expect([...root.querySelectorAll('.ebd-drop')].map(text)).toEqual([ui.collage.controls.taxa, ui.collage.controls.display, ui.filters.label])
    }
    // The Taxa panel (wide) and its sheet (compact): the coverage head, the rank label and the order chips
    const head = plural(ui.collage.controls.taxaHead.order, 45, { n: '7', total: '45' })
    expect(text(wide.querySelector('.ebd-taxa .ebd-taxa-head'))).toBe(head)
    expect(text(compact.querySelector('.ebd-sheet .ebd-taxa-head'))).toBe(head)
    expect(text(wide.querySelector('.ebd-taxa .ebd-chips-label'))).toBe(ui.filters.rank.order)
    expect(wide.querySelectorAll('.ebd-taxa .ebd-chip')).toHaveLength(7)
    expect(text(compact.querySelector('.ebd-sheet-show .ebd-swap-a'))).toBe(showLabel(TOTAL, ui))
    expect(text(wide.querySelector('.ebd-path-link'))).toBe(ui.filters.all)
    expect(text(wide.querySelector('.ebd-mid-label'))).toBe(plural(ui.count.word, TOTAL)) // "112 gatunków", "112 видов" (H7)
    expect(text(wide.querySelector('.ebd-num'))).toBe(formatInt(TOTAL, ui.num))
    expect(text(wide.querySelector('.ebd-stats .ebd-swap-a'))).toContain(plural(ui.collage.stats.orders, 7, { n: '7' }))
  })

  it("draws the share dialog and its images in the language, each footer one line: the credits link, the date at the right", () => {
    expect(text(wide.querySelector('.ebd-share-title'))).toBe(ui.share.title)
    expect([...wide.querySelectorAll('.ebd-seg-btn')].map(text)).toEqual([ui.share.format.story, ui.share.format.post, ui.share.format.square])
    expect(text(wide.querySelector('.ebd-share-bulk'))).toBe(ui.share.print.bulk.title)
    expect(text(wide.querySelector('.ebd-share-label'))).toBe(ui.share.nameLabel)
    expect(text(wide.querySelector('.ebd-share-input'))).toBe(ui.share.namePlaceholder)
    expect(text(wide.querySelector('.ebd-share-switch'))).toBe(ui.share.showLatest)
    expect([...wide.querySelectorAll('.ebd-img-line')].map(text)).toEqual([FOOTER_LINE, FOOTER_LINE, FOOTER_LINE])
    expect(FOOTER_LINE).toBe('everybird.yusuftaleb.com/credits')
    // The date alone, no lead: "6 Nov 2026" in English, "6 nov 2026" in es, pt and nl, "6 lis 2026" in pl, "2026年11月6日" in ja and zh
    const stamp = { en: '6 Nov 2026', de: '6 Nov 2026', pl: '6 lis 2026', ru: '6 ноя 2026', ja: '2026年11月6日', 'zh-Hans': '2026年11月6日', 'zh-Hant': '2026年11月6日' }[lang as string] ?? '6 nov 2026'
    expect(stampDate(STAMPED, stampStrings(ui))).toBe(stamp)
    expect([...wide.querySelectorAll('.ebd-img-date')].map(text)).toEqual([stamp, stamp, stamp])
    // One line: the wordmark, the link and the date are the foot's only children, in that order.
    for (const foot of wide.querySelectorAll('.ebd-img-foot')) expect([...foot.children].map((c) => c.className)).toEqual(['ebd-img-mark', 'ebd-img-line', 'ebd-img-date'])
    expect(text(wide.querySelector('.ebd-img-latest-label'))).toContain(ui.share.latestLifer)
    expect(text(wide.querySelector('.ebd-img-latest-label'))).toContain(ui.date.months[9])
    expect(text(wide.querySelector('.ebd-img-mark'))).toBe('Everybird')
    // The latest lifer's name is the language's base name (es, pt_BR, nl, pl, fr_FR, de, it, sv, da, ru, ja, zh_SIM, zh), English in English.
    const base = { en: undefined, es: 'es', pt: 'pt_BR', nl: 'nl', pl: 'pl', fr: 'fr_FR', de: 'de', it: 'it', sv: 'sv', da: 'da', ru: 'ru', ja: 'ja', 'zh-Hans': 'zh_SIM', 'zh-Hant': 'zh' }[lang] as keyof typeof LATEST.names | undefined
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
    // What it is: the collage, then the other views, sharing, printing, batches and Compare, one column
    const what = main.querySelector('section[aria-labelledby="eb-what-h"]')!
    expect([...what.querySelectorAll('p')].map(text)).toEqual([m.page.about.what.body, m.page.about.what.more])
    const credits = document.getElementById('credits')!
    const made = { en: 'Made by Yusuf Taleb', es: 'Hecho por Yusuf Taleb', pt: 'Feito por Yusuf Taleb', nl: 'Gemaakt door Yusuf Taleb', pl: 'Autor: Yusuf Taleb', fr: 'Créé par Yusuf Taleb', de: 'Gemacht von Yusuf Taleb', it: 'Creato da Yusuf Taleb', sv: 'Gjord av Yusuf Taleb', da: 'Lavet af Yusuf Taleb', ru: 'Автор: Yusuf Taleb', ja: '制作：Yusuf Taleb', 'zh-Hans': '由Yusuf Taleb制作', 'zh-Hant': '由 Yusuf Taleb 製作' }[lang]
    expect(made).toBe(m.ui.shell.footer.madeBy)
    expect(text(credits.querySelector('.eb-prose'))).toMatch(new RegExp(`^${made}[.。]`))
    expect(within(credits).getByRole('link', { name: 'Yusuf Taleb' })).toHaveAttribute('href', 'https://www.yusuftaleb.com')
    // "Made by" and the coffee sentence are one paragraph (joined by a space, none after 。), the button beside it
    const c = m.page.about.credits
    const plain = (s: string) => s.replace(/<\/?\w+>/g, '')
    expect(text(credits.querySelector('.eb-coffee .eb-prose'))).toBe(`${plain(c.madeBy)}${c.madeBy.endsWith('。') ? '' : ' '}${c.coffee}`)
    expect(credits.querySelector('.eb-coffee > .eb-prose + a.eb-coffee-btn')).not.toBeNull()
    // The thank-you follows it, before the credit rows
    const thanks = credits.querySelector('.eb-coffee + .eb-prose')!
    expect(text(thanks)).toBe(c.thanks)
    expect(thanks.nextElementSibling).toHaveClass('eb-credits')
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

  it("the privacy note is short, keeps its claims (both counters, the cookie, Google Fonts) and is translated", async () => {
    render(await AboutPage({ params: Promise.resolve({ lang }) }))
    const p = text(document.querySelector('section[aria-labelledby="eb-how-h"] .eb-about-cols > p.eb-prose'))
    expect(p).toBe(m.page.about.how.privacy)
    expect(p).toContain('Cloudflare Web Analytics')
    expect(p).toContain('Google Fonts')
    expect(p).toMatch(/cookie|クッキー/i)
    // No longer the event-by-event list or the language codes (round 6: "shorten this section").
    expect(p).not.toMatch(/zh-Hans/)
    expect(p).not.toMatch(/[—!！]/)
    if (lang !== 'en') expect(p).not.toBe(MESSAGES.en.page.about.how.privacy)
    if (lang === 'en') {
      expect(p.split(/\s+/).length).toBeLessThanOrEqual(110)
      // analytics.ts and the stats Worker: the receipt time, country, device class, and the browser language on visits only.
      expect(p).toContain('with the time, your country and device type, and on visits your browser language')
      expect(p).toContain('neither counter runs if your browser asks not to be tracked')
      expect(p).toContain('A small cookie remembers your language.')
    }
  })
})
