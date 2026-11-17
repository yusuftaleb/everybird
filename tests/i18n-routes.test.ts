// The language rewrites (src/i18n/routes.ts), checked with Next's own matchers: path-to-regexp for the sources
// (getPathMatch, strict, as the router's custom routes), matchHas for the cookie and Accept-Language conditions (each
// value compiled as `new RegExp('^' + value + '$')`) and prepareDestination for the destinations (the cookie's named
// group becoming `:lang`). beforeFiles rules all run in turn on the rewritten path, so `resolve` chains them.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { matchHas, prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { fillMetadataSegment } from 'next/dist/lib/metadata/get-metadata-route'
import { stripLang } from '@/i18n/path'
import { ACCEPT, LANG_COOKIE, PAGE_SOURCES, langRewrites, type LangRewrite } from '@/i18n/routes'
import { LANGS } from '@/i18n/langs'

const matcher = (source: string) => getPathMatch(source, { strict: true, removeUnnamedParams: true })

type Req = { cookie?: string; accept?: string }
const asReq = (r: Req) => ({ headers: { ...(r.cookie ? { cookie: r.cookie } : {}), ...(r.accept ? { 'accept-language': r.accept } : {}) } })

/** One rule applied as Next applies it, or false. */
function apply(rule: LangRewrite, path: string, r: Req): string | false {
  const params = matcher(rule.source)(path)
  if (!params) return false
  const hasParams = rule.has ? matchHas(asReq(r) as never, {}, rule.has as never) : {}
  if (!hasParams) return false
  const { parsedDestination } = prepareDestination({ appendParamsToQuery: true, destination: rule.destination, params: { ...params, ...hasParams }, query: {} })
  return parsedDestination.pathname!
}

/** Every beforeFiles rule in order, each on the path the earlier ones left. */
function resolve(path: string, r: Req = {}, rules = langRewrites()): string {
  let cur = path
  for (const rule of rules) cur = apply(rule, cur, r) || cur
  return cur
}

/** Which Accept rule (es / pt / nl) a header takes, compiled as Next does. */
const acceptLang = (header: string) =>
  (Object.keys(ACCEPT) as (keyof typeof ACCEPT)[]).filter((l) => new RegExp('^' + ACCEPT[l] + '$').test(header))

describe('Accept-Language', () => {
  it('routes a header to its language', () => {
    expect(acceptLang('es-MX,es;q=0.9,en;q=0.8')).toEqual(['es'])
    expect(acceptLang('ES')).toEqual(['es'])
    expect(acceptLang('es')).toEqual(['es'])
    expect(acceptLang('es_AR')).toEqual(['es'])
    expect(acceptLang('pt-BR,pt;q=0.9')).toEqual(['pt'])
    expect(acceptLang('pt-PT')).toEqual(['pt'])
    expect(acceptLang('nl-BE,nl;q=0.9,fr;q=0.8')).toEqual(['nl'])
    expect(acceptLang('nl')).toEqual(['nl'])
    for (const h of ['en-US,en;q=0.9,es;q=0.8', '*', 'fr-CA,es;q=0.5', 'est', 'esperanto', 'en-ES', '', 'pt2'])
      expect(acceptLang(h), h).toEqual([])
  })
  it('through the router: the first tag decides, anything else is English', () => {
    expect(resolve('/about', { accept: 'es-MX,es;q=0.9,en;q=0.8' })).toBe('/es/about')
    expect(resolve('/about', { accept: 'pt-BR,pt;q=0.9' })).toBe('/pt/about')
    expect(resolve('/about', { accept: 'nl-BE,nl;q=0.9,fr;q=0.8' })).toBe('/nl/about')
    expect(resolve('/about', { accept: 'en-US,en;q=0.9,es;q=0.8' })).toBe('/en/about')
    expect(resolve('/about', { accept: 'fr-CA,es;q=0.5' })).toBe('/en/about')
    expect(resolve('/about', { accept: '*' })).toBe('/en/about')
  })
})

describe('the rewrites', () => {
  it('the cookie wins over the header, and English is the default', () => {
    const about = langRewrites().filter((r) => r.source === '/about')
    expect(about.map((r) => [r.destination, r.has?.map((h) => `${h.type}:${h.key}`).join() ?? ''])).toEqual([
      ['/:lang/about', `cookie:${LANG_COOKIE}`],
      ['/es/about', 'header:accept-language'],
      ['/pt/about', 'header:accept-language'],
      ['/nl/about', 'header:accept-language'],
      ['/pl/about', 'header:accept-language'],
      ['/en/about', ''],
    ])
    expect(resolve('/about', { accept: 'pl-PL,pl;q=0.9,en;q=0.8' })).toBe('/pl/about')
    expect(resolve('/about', { cookie: `${LANG_COOKIE}=en`, accept: 'es-ES,es;q=0.9' })).toBe('/en/about')
    expect(resolve('/about', { cookie: `theme=dark; ${LANG_COOKIE}=pt`, accept: 'nl' })).toBe('/pt/about')
    expect(resolve('/settings', { cookie: `${LANG_COOKIE}=nl` })).toBe('/nl/settings')
    // A cookie that names no language is ignored: the header decides.
    expect(resolve('/about', { cookie: `${LANG_COOKIE}=fr`, accept: 'es' })).toBe('/es/about')
    expect(resolve('/about', { cookie: `${LANG_COOKIE}=ES`, accept: 'pt' })).toBe('/pt/about')
    expect(resolve('/about', { cookie: `${LANG_COOKIE}=es-x` })).toBe('/en/about')
    expect(resolve('/about')).toBe('/en/about')
  })
  it('the landing page goes to /<lang> with no trailing slash', () => {
    expect(resolve('/')).toBe('/en')
    expect(resolve('/', { accept: 'pt-BR' })).toBe('/pt')
    expect(resolve('/', { cookie: `${LANG_COOKIE}=es` })).toBe('/es')
  })
  it('the shared view is negotiated; old image URLs are never', () => {
    const images = langRewrites().filter((r) => r.source === '/s/:token/:rest*')
    expect(images).toEqual([{ source: '/s/:token/:rest*', destination: '/en/s/:token/:rest*' }])
    expect(resolve('/s/AbC-1_x', { accept: 'nl' })).toBe('/nl/s/AbC-1_x')
    expect(resolve('/s/AbC-1_x', { cookie: `${LANG_COOKIE}=pt`, accept: 'es' })).toBe('/pt/s/AbC-1_x')
    expect(resolve('/s/AbC-1_x')).toBe('/en/s/AbC-1_x')
    for (const r of [{ accept: 'es-ES' }, { accept: 'pt-BR' }, { cookie: `${LANG_COOKIE}=es` }, {}]) {
      expect(resolve('/s/AbC-1_x/opengraph-image', r)).toBe('/en/s/AbC-1_x/opengraph-image')
      expect(resolve('/s/AbC-1_x/twitter-image', r)).toBe('/en/s/AbC-1_x/twitter-image')
    }
  })
  it('the page rules come before the old image rule (which also matches /s/<token>)', () => {
    const rules = langRewrites()
    const firstImage = rules.findIndex((r) => r.source === '/s/:token/:rest*')
    expect(rules.findLastIndex((r) => r.source === '/s/:token')).toBeLessThan(firstImage)
    // Flipped, the page would always be English: the order is what keeps it negotiated.
    const flipped = [rules[firstImage], ...rules.filter((_, i) => i !== firstImage)]
    expect(resolve('/s/AbC', { accept: 'es' }, flipped)).toBe('/en/s/AbC')
  })
  it('a prefixed path is left alone (no rule matches it twice)', () => {
    for (const p of ['/es/about', '/en', '/nl/settings', '/pt/s/AbC', '/es/s/AbC/opengraph-image'])
      expect(resolve(p, { cookie: `${LANG_COOKIE}=en`, accept: 'nl' })).toBe(p)
  })
  it('every destination is a page under app/[lang] for a language it prerenders', () => {
    const r: Req[] = [{}, ...LANGS.map((l) => ({ cookie: `${LANG_COOKIE}=${l}` })), { accept: 'es' }, { accept: 'pt' }, { accept: 'nl' }]
    for (const source of PAGE_SOURCES) {
      const path = source.replace(':token', 'AbC').replace(':rest*', 'opengraph-image')
      for (const q of r) {
        const out = resolve(path, q)
        const [, lang, ...rest] = out.split('/')
        expect(LANGS, out).toContain(lang)
        expect('/' + rest.join('/'), out).toBe(path === '/' ? '/' : path)
      }
    }
  })
})

/** The page routes on disk: app/[lang]/**\/page.tsx, without groups, with [x] as :x. */
function pageRoutes(): string[] {
  const root = join(process.cwd(), 'app', '[lang]')
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name))
      else if (e.name === 'page.tsx') {
        const segs = relative(root, dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s)).map((s) => s.replace(/^\[(\w+)\]$/, ':$1'))
        out.push('/' + segs.join('/'))
      }
    }
  }
  walk(root)
  return out.sort()
}

describe('coverage', () => {
  it('every page has a source', () => {
    const pages = pageRoutes()
    expect(pages).toEqual(['/', '/about', '/credits', '/make', '/my', '/s/:token', '/settings'])
    for (const p of pages) expect(PAGE_SOURCES, p).toContain(p)
  })
  it('static files and metadata routes match no source', () => {
    const files = ['/data/species.v1.json', '/data/masks/Passeriformes.v1.json', '/icons/icon-192.png', '/favicon.ico', '/robots.txt',
      '/sitemap.xml', '/manifest.webmanifest', '/buy-me-a-coffee.png', '/_next/static/chunks/main.js', '/apple-icon.png']
    for (const f of files) {
      for (const source of PAGE_SOURCES) expect(matcher(source)(f), `${source} vs ${f}`).toBe(false)
      expect(resolve(f, { cookie: `${LANG_COOKIE}=es`, accept: 'es' })).toBe(f)
    }
  })
  it("the shared view's og:image is the prefixed path, which no source matches", () => {
    // How Next builds the image URL for app/[lang]/s/[token]/opengraph-image.tsx from the page's own params (the
    // rewritten route's: lang from the destination). A route group in the path would add a hash suffix; none here.
    for (const lang of ['es', 'pt'] as const) {
      const url = fillMetadataSegment('/[lang]/s/[token]', { lang, token: 'AbC' }, 'opengraph-image', false)
      expect(url).toBe(`/${lang}/s/AbC/opengraph-image`)
      expect(resolve(url, { accept: 'nl' })).toBe(url)
      expect(fillMetadataSegment('/[lang]/s/[token]', { lang, token: 'AbC' }, 'twitter-image', false)).toBe(`/${lang}/s/AbC/twitter-image`)
    }
  })
  it('the shared view and its images render per request, never prerendered', () => {
    // The build lists /[lang]/s/[token] and both image routes as ƒ and leaves them out of prerender-manifest.json's
    // dynamicRoutes (no ISR): nothing lists tokens, and the root layout never closes its params (dynamicParams = false
    // would 404 every token).
    for (const f of ['page.tsx', 'opengraph-image.tsx', 'twitter-image.tsx']) {
      const src = readFileSync(join(process.cwd(), 'app/[lang]/s/[token]', f), 'utf8')
      expect(src, f).not.toMatch(/generateStaticParams|export const (revalidate|dynamicParams)\b/)
    }
    expect(readFileSync(join(process.cwd(), 'app/[lang]/layout.tsx'), 'utf8')).not.toMatch(/export const dynamicParams/)
  })
  it('the image routes refuse a language segment they do not know (they skip the root layout)', () => {
    const src = readFileSync(join(process.cwd(), 'app/[lang]/s/[token]/opengraph-image.tsx'), 'utf8')
    expect(src).toMatch(/if \(!isLang\(lang\)\) notFound\(\)/)
    expect(readFileSync(join(process.cwd(), 'app/[lang]/s/[token]/twitter-image.tsx'), 'utf8')).toMatch(/from '\.\/opengraph-image'/)
  })
  it('every prerendered page closes its language, so /nope is the static 404 and never a render', () => {
    const files = ['(app)/page.tsx', '(app)/about/page.tsx', '(app)/settings/page.tsx', 'make/page.tsx', 'my/page.tsx', 'credits/page.tsx']
    for (const f of files) {
      expect(readFileSync(join(process.cwd(), 'app/[lang]', f), 'utf8'), f).toMatch(/^export const dynamicParams = false$/m)
    }
  })
})

describe('stripLang', () => {
  it('drops a language prefix and nothing else', () => {
    expect(stripLang('/es/settings')).toBe('/settings')
    expect(stripLang('/es')).toBe('/')
    expect(stripLang('/en/about')).toBe('/about')
    expect(stripLang('/nl/s/AbC')).toBe('/s/AbC')
    expect(stripLang('/pt/')).toBe('/')
    for (const p of ['/', '/settings', '/about', '/espresso', '/esx/about', '/s/es', '/fr/about'])
      expect(stripLang(p), p).toBe(p)
  })
})

describe('the rules follow LANGS', () => {
  it('Accept-Language is negotiated for every language but English, each with its own rule per page', () => {
    const others = LANGS.filter((l) => l !== 'en')
    expect(Object.keys(ACCEPT).sort()).toEqual([...others].sort())
    for (const l of others) {
      expect(resolve('/about', { accept: l })).toBe(`/${l}/about`)
      expect(resolve('/about', { accept: `${l.toUpperCase()}-xx,en;q=0.8` })).toBe(`/${l}/about`)
    }
    expect(resolve('/about', { accept: 'en-GB' })).toBe('/en/about')
  })
  it('a language cookie among others is found, whatever its position', () => {
    for (const l of LANGS) expect(resolve('/settings', { cookie: `a=1; ${LANG_COOKIE}=${l}; b=2`, accept: 'nl' })).toBe(`/${l}/settings`)
  })
})
