import { describe, expect, it, vi } from 'vitest'
import robots from '../app/robots'
import sitemap from '../app/sitemap'
import { encodeShare } from '@/lib/share/link'
import { en } from '@/i18n/messages/en'
import { LANGS } from '@/i18n/langs'
import { getMessages } from '@/i18n/server'
import { pageSeo, SITE_NAME } from '@/lib/site-meta'

const SITE_DESCRIPTION = en.page.meta.description
// The root layout loads Geist Mono through next/font, which only works under Next's compiler.
vi.mock('next/font/google', () => ({ Geist_Mono: () => ({ variable: 'font-geist-mono' }) }))
// The home page renders the app; only its JSON-LD script element is read here.
vi.mock('@/components/app/Home', () => ({ Home: () => null }))
const params = (lang: string) => ({ params: Promise.resolve({ lang }) })

const ORIGIN = 'https://everybird.yusuftaleb.com'

describe('robots.txt', () => {
  it('lets crawlers in, keeps them out of /s/ and /c/ and their per-language copies, and points at the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/s/', '/c/', '/en/s/', '/en/c/', '/es/s/', '/es/c/', '/pt/s/', '/pt/c/', '/nl/s/', '/nl/c/', '/pl/s/', '/pl/c/', '/fr/s/', '/fr/c/', '/de/s/', '/de/c/', '/it/s/', '/it/c/', '/sv/s/', '/sv/c/', '/da/s/', '/da/c/', '/ru/s/', '/ru/c/', '/ja/s/', '/ja/c/', '/zh-Hans/s/', '/zh-Hans/c/', '/zh-Hant/s/', '/zh-Hant/c/'] },
      sitemap: `${ORIGIN}/sitemap.xml`,
    })
  })
})

describe('sitemap.xml', () => {
  it('lists the landing page and /about on the production origin, nothing else', () => {
    expect(sitemap().map((e) => e.url)).toEqual([`${ORIGIN}/`, `${ORIGIN}/about`])
  })
})

describe('page metadata', () => {
  it('the landing page has a canonical, Open Graph and a Twitter card with the existing title and description', () => {
    const image = { url: '/og/en.jpg', width: 1200, height: 630, alt: 'Everybird: a sticker collage of a bird life list' }
    expect(pageSeo('/', SITE_NAME, SITE_DESCRIPTION, 'en', en.page.meta.imageAlt)).toEqual({
      alternates: { canonical: `${ORIGIN}/` },
      openGraph: {
        type: 'website', siteName: 'Everybird', url: `${ORIGIN}/`, title: 'Everybird',
        description: SITE_DESCRIPTION,
        images: [image],
        locale: 'en_US',
      },
      twitter: { card: 'summary_large_image', title: 'Everybird', description: SITE_DESCRIPTION, images: [image] },
    })
  })

  it('/about has its own canonical and card', async () => {
    const metadata = await (await import('../app/[lang]/(app)/about/page')).generateMetadata(params('en'))
    expect(metadata.title).toBe('About · Everybird')
    expect(metadata.openGraph).toMatchObject({ url: `${ORIGIN}/about`, title: metadata.title, description: metadata.description })
  })

  it('the canonical of /about is unprefixed in every language, though the page is prerendered at /<lang>/about', async () => {
    const { generateMetadata } = await import('../app/[lang]/(app)/about/page')
    for (const lang of ['en', 'es', 'pt', 'nl']) {
      const canonical = String((await generateMetadata(params(lang))).alternates?.canonical)
      expect(canonical).toBe(`${ORIGIN}/about`)
      expect(canonical).not.toMatch(/\/(en|es|pt|nl)\//)
    }
  })

  it('/settings does not inherit the landing page canonical', async () => {
    const metadata = await (await import('../app/[lang]/(app)/settings/page')).generateMetadata(params('en'))
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/settings`)
    expect(metadata.title).toBe('Settings · Everybird')
  })

  it('every page\'s title, description and og:locale are its language\'s', async () => {
    const layout = (await import('../app/[lang]/layout')).generateMetadata
    const about = (await import('../app/[lang]/(app)/about/page')).generateMetadata
    const settings = (await import('../app/[lang]/(app)/settings/page')).generateMetadata
    const pt = await layout(params('pt'))
    expect(pt.title).toBe('Everybird · Sua lista de aves em uma colagem')
    expect(pt.description).toBe('Transforme sua lista de aves em uma colagem de adesivos grátis. Importe do eBird, iNaturalist ou observation.org. Compartilhe imagens ou imprima um pôster.')
    expect(pt.openGraph).toMatchObject({ locale: 'pt_BR', description: pt.description, url: `${ORIGIN}/` })
    expect(pt.referrer).toBe('strict-origin')
    expect((await about(params('es'))).title).toBe('Acerca de · Everybird')
    expect((await about(params('es'))).openGraph).toMatchObject({ locale: 'es_ES', title: 'Acerca de · Everybird' })
    expect((await settings(params('nl'))).title).toBe('Instellingen · Everybird')
    expect((await settings(params('nl'))).openGraph).toMatchObject({ locale: 'nl_NL' })
    expect((await layout(params('en'))).openGraph).toMatchObject({ locale: 'en_US' })
  })

  it('every public page\'s preview is its language\'s collage card, with its alt, as a large Twitter card', async () => {
    const pages = [
      (await import('../app/[lang]/layout')).generateMetadata,
      (await import('../app/[lang]/(app)/about/page')).generateMetadata,
      (await import('../app/[lang]/(app)/settings/page')).generateMetadata,
      (await import('../app/[lang]/(app)/compare/page')).generateMetadata,
    ]
    for (const lang of LANGS) {
      const image = { url: `/og/${lang}.jpg`, width: 1200, height: 630, alt: getMessages(lang).page.meta.imageAlt }
      for (const meta of pages) {
        const m = await meta(params(lang))
        expect(m.openGraph?.images).toEqual([image])
        expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: [image] })
      }
    }
    expect(new Set(LANGS.map((l) => getMessages(l).page.meta.imageAlt)).size).toBe(LANGS.length)
  })

  it('share and comparison links keep their own previews: no site card, their card types as before', async () => {
    const s = (await import('../app/[lang]/s/[token]/page')).generateMetadata
    const c = (await import('../app/[lang]/c/[token]/page')).generateMetadata
    const { token } = encodeShare({ v: 1, name: 'Test Birder', birds: [{ code: 'ostric2', ym: 1500 }] })
    for (const lang of ['en', 'ja'] as const) {
      const sm = await s({ params: Promise.resolve({ lang, token }) })
      const cm = await c({ params: Promise.resolve({ lang, token: 'not-a-token' }) })
      expect(sm.twitter).toEqual({ card: 'summary_large_image', title: sm.title, description: sm.description })
      expect(cm.twitter).toEqual({ card: 'summary', title: cm.title, description: cm.description })
      for (const m of [sm, cm]) expect(JSON.stringify(m)).not.toContain('/og/')
    }
  })

  it('a shared view is noindex and its metadata never carries the token', async () => {
    const { generateMetadata } = await import('../app/[lang]/s/[token]/page')
    const { token } = encodeShare({ v: 1, name: 'Test Birder', birds: [{ code: 'ostric2', ym: 1500 }] })
    for (const t of [token, 'not-a-token']) {
      const meta = await generateMetadata({ params: Promise.resolve({ lang: 'en', token: t }) })
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(meta.alternates).toEqual({ canonical: null })
      expect(meta.openGraph).toMatchObject({ url: null })
      expect(JSON.stringify(meta)).not.toContain(t)
    }
  })
})

describe('the home page\'s WebSite JSON-LD', () => {
  it('names Everybird, with the alternate name, on the canonical origin, on every language\'s home (/ rewrites to one)', async () => {
    const Page = (await import('../app/[lang]/(app)/page')).default
    for (const lang of LANGS) {
      const tree = await Page(params(lang))
      const script = (tree.props.children as React.ReactElement<{ type: string; dangerouslySetInnerHTML: { __html: string } }>[])[0]
      expect(script.props.type).toBe('application/ld+json')
      expect(JSON.parse(script.props.dangerouslySetInnerHTML.__html)).toEqual({
        '@context': 'https://schema.org', '@type': 'WebSite', name: 'Everybird', alternateName: 'Everybird app', url: `${ORIGIN}/`,
      })
    }
  })
})
