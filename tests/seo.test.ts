import { describe, expect, it, vi } from 'vitest'
import robots from '../app/robots'
import sitemap from '../app/sitemap'
import { encodeShare } from '@/lib/share/link'
import { en } from '@/i18n/messages/en'
import { pageSeo, SITE_NAME } from '@/lib/site-meta'

const SITE_DESCRIPTION = en.page.meta.description
// The root layout loads Geist Mono through next/font, which only works under Next's compiler.
vi.mock('next/font/google', () => ({ Geist_Mono: () => ({ variable: 'font-geist-mono' }) }))
const params = (lang: string) => ({ params: Promise.resolve({ lang }) })

const ORIGIN = 'https://everybird.yusuftaleb.com'

describe('robots.txt', () => {
  it('lets crawlers in, keeps them out of /s/ and its per-language copies, and points at the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/s/', '/en/s/', '/es/s/', '/pt/s/', '/nl/s/', '/pl/s/'] },
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
    expect(pageSeo('/', SITE_NAME, SITE_DESCRIPTION, 'en')).toEqual({
      alternates: { canonical: `${ORIGIN}/` },
      openGraph: {
        type: 'website', siteName: 'Everybird', url: `${ORIGIN}/`, title: 'Everybird',
        description: SITE_DESCRIPTION,
        images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Everybird' }],
        locale: 'en_US',
      },
      twitter: { card: 'summary', title: 'Everybird', description: SITE_DESCRIPTION, images: ['/icons/icon-512.png'] },
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
