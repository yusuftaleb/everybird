import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { placeholders } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { HTML_LANG, isLang, LANG_NAMES, LANGS, langFromTag, primarySubtag } from '@/i18n/langs'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pl } from '@/i18n/messages/pl'
import { pt } from '@/i18n/messages/pt'
import { ORDERS } from '@/lib/species/orders'
import { withI18n } from './i18n-render'

/** Values that may read the same as English: names, formats, and words the languages share. */
const ALLOW_SAME = [
  'eBird', 'iNaturalist', 'CSV', 'JSON', 'Everybird', 'GitHub', 'Collage',
  // Words the languages share: pt "Story" (a common format label in Brazil), nl "Filters", "Families", "{n} families"; order labels (es Kiwis, es/pt Turacos, pt
  // Flamingos, pt Seriemas, nl Hoatzin, nl Trogons); nl "{n} continent" (the same word); nl's full month needs no "de" ("maart 2020").
  'Filters', '{n} continent', 'Filters · {n} · {species}', 'Filters · {species}', 'Families', '{n} families', 'Story', 'Post', 'Kiwis', 'Turacos', 'Flamingos', 'Seriemas', 'Hoatzin', 'Trogons', '{month} {year}',
  // The orientation switch and the desktop format: es and pt keep "Vertical" and "Horizontal", and pt and nl "Desktop".
  'Vertical', 'Horizontal', 'Desktop',
  // Templates with no words: the summary line's joins (ui.import.summary).
  '{head}: {parts}.', '{head}, {all}.',
  // About's credits: es and nl keep "Stickers" and "API" as they are; nl "Credits" and "Code".
  'Stickers · CC BY 4.0', 'API', 'Credits', 'Code · MIT',
  // Red List: es "Vulnerable" and nl "Status" are the same word as English.
  'Vulnerable', 'Status',
  // Continents: es Asia, pt Oceania and nl Antarctica are the English spelling.
  'Asia', 'Oceania', 'Antarctica',
]

const OTHERS = { es, pt, nl, pl } as const

/** Every leaf as [path, value]: strings, array items and Plural forms each count as one. */
function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]]
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`))
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  throw new Error(`${path}: not a string, array or object`)
}

describe('the dictionaries', () => {
  const enLeaves = new Map(leaves(en))

  it('every language has every key of English, and nothing else', () => {
    const keys = [...enLeaves.keys()].sort()
    for (const [lang, m] of Object.entries(OTHERS)) expect(leaves(m).map(([k]) => k).sort(), lang).toEqual(keys)
  })

  it('every template keeps English placeholders', () => {
    for (const [lang, m] of Object.entries(OTHERS)) {
      for (const [k, v] of leaves(m)) {
        const want = placeholders(enLeaves.get(k)!)
        const have = new Set(placeholders(v))
        for (const p of want) expect(have.has(p), `${lang} ${k} lacks ${p}`).toBe(true)
      }
    }
  })

  it('no value is empty, none has an em dash or "!"', () => {
    for (const [lang, m] of Object.entries({ en, ...OTHERS })) {
      for (const [k, v] of leaves(m)) {
        expect(v.trim(), `${lang} ${k}`).not.toBe('')
        expect(v, `${lang} ${k}`).not.toMatch(/[—!¡]/)
      }
    }
  })

  it('only allow-listed values are identical to English', () => {
    for (const [lang, m] of Object.entries(OTHERS)) {
      for (const [k, v] of leaves(m)) {
        const e = enLeaves.get(k)!
        if (v === e) expect(ALLOW_SAME, `${lang} ${k} is still English: "${v}"`).toContain(v)
      }
    }
  })

  it('en.ui.orders is ORDERS (the English table), and every language labels every order', () => {
    expect(en.ui.orders).toEqual(ORDERS)
    for (const m of Object.values(OTHERS)) expect(Object.keys(m.ui.orders)).toEqual(Object.keys(ORDERS))
  })

  it('the count label fits the hole in every language', () => {
    // COUNT_LABEL_CHARS (Task 6) is 8: "ESPECIES" and "ESPÉCIES".
    for (const m of [en, es, pt, nl, pl]) expect(m.ui.count.label.length).toBeLessThanOrEqual(8)
    expect([en, es, pt, nl, pl].map((m) => m.ui.count.label)).toEqual(['species', 'especies', 'espécies', 'soorten', 'gatunki'])
  })

  it('the tables: separators, 12 months', () => {
    // Polish groups with "." like es, pt and nl, not its usual space: count-box.ts sizes the count's hole for "," and ".".
    expect([en, es, pt, nl, pl].map((m) => m.ui.num.group + m.ui.num.decimal)).toEqual([',.', '.,', '.,', '.,', '.,'])
    expect(es.ui.date.months.join(' ')).toBe('ene feb mar abr may jun jul ago sept oct nov dic')
    expect(pt.ui.date.months.join(' ')).toBe('jan fev mar abr mai jun jul ago set out nov dez')
    expect(nl.ui.date.months.join(' ')).toBe('jan feb mrt apr mei jun jul aug sep okt nov dec')
    expect(pl.ui.date.months.join(' ')).toBe('sty lut mar kwi maj cze lip sie wrz paź lis gru')
  })
})

describe('langs', () => {
  it('lists the languages with their html lang and own names', () => {
    expect(LANGS).toEqual(['en', 'es', 'pt', 'nl', 'pl'])
    expect(LANGS.map((l) => HTML_LANG[l])).toEqual(['en', 'es', 'pt-BR', 'nl', 'pl'])
    expect(LANGS.map((l) => LANG_NAMES[l])).toEqual(['English', 'Español', 'Português', 'Nederlands', 'Polski'])
    expect(isLang('es')).toBe(true)
    expect(isLang('de')).toBe(false)
    expect(isLang('ES')).toBe(false)
  })
  it('langFromTag reads the primary subtag', () => {
    expect(langFromTag('es-MX')).toBe('es')
    expect(langFromTag('pt-PT')).toBe('pt')
    expect(langFromTag('pt_BR')).toBe('pt')
    expect(langFromTag('nl-BE')).toBe('nl')
    expect(langFromTag('pl-PL')).toBe('pl')
    expect(langFromTag('NL')).toBe('nl')
    expect(langFromTag('en-GB')).toBe('en')
    expect(langFromTag('de-DE')).toBe('en')
    expect(langFromTag('')).toBe('en')
  })
  it('primarySubtag is a lower-case 2–3 letter code or undefined', () => {
    expect(primarySubtag('es-AR')).toBe('es')
    expect(primarySubtag('FIL-PH')).toBe('fil')
    expect(primarySubtag('zh_Hant')).toBe('zh')
    expect(primarySubtag('x')).toBeUndefined()
    expect(primarySubtag('1234')).toBeUndefined()
    expect(primarySubtag('')).toBeUndefined()
    expect(primarySubtag(undefined)).toBeUndefined()
  })
})

describe('I18nProvider', () => {
  function Probe() {
    const { lang, t } = useI18n()
    return createElement('p', null, `${lang}:${t.shell.nav.settings}`)
  }
  it('without a provider, English', () => {
    expect(renderToString(createElement(Probe))).toContain('en:Settings')
  })
  it('withI18n wraps a tree in a language', () => {
    expect(renderToString(createElement(withI18n('es'), null, createElement(Probe)))).toContain(`es:${es.ui.shell.nav.settings}`)
    expect(renderToString(createElement(withI18n('nl'), null, createElement(Probe)))).toContain(`nl:${nl.ui.shell.nav.settings}`)
  })
})
