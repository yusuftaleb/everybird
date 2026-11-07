import { describe, expect, it } from 'vitest'
import robots from '../app/robots'
import sitemap from '../app/sitemap'
import { encodeShare } from '@/lib/share/link'
import { pageSeo, SITE_DESCRIPTION, SITE_NAME } from '@/lib/site-meta'

const ORIGIN = 'https://everybird.yusuftaleb.com'

describe('robots.txt', () => {
  it('lets crawlers in, keeps them out of /s/, and points at the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: '/s/' },
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
    expect(pageSeo('/', SITE_NAME, SITE_DESCRIPTION)).toEqual({
      alternates: { canonical: `${ORIGIN}/` },
      openGraph: {
        type: 'website', siteName: 'Everybird', url: `${ORIGIN}/`, title: 'Everybird',
        description: 'Your life list as a sticker collage, from eBird, iNaturalist, or by hand.',
        images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Everybird' }],
      },
      twitter: { card: 'summary', title: 'Everybird', description: SITE_DESCRIPTION, images: ['/icons/icon-512.png'] },
    })
  })

  it('/about has its own canonical and card', async () => {
    const { metadata } = await import('../app/(app)/about/page')
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/about`)
    expect(metadata.openGraph).toMatchObject({ url: `${ORIGIN}/about`, title: metadata.title, description: metadata.description })
  })

  it('/settings does not inherit the landing page canonical', async () => {
    const { metadata } = await import('../app/(app)/settings/page')
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/settings`)
  })

  it('a shared view is noindex and its metadata never carries the token', async () => {
    const { generateMetadata } = await import('../app/s/[token]/page')
    const { token } = encodeShare({ v: 1, name: 'Test Birder', birds: [{ code: 'ostric2', ym: 1500 }] })
    for (const t of [token, 'not-a-token']) {
      const meta = await generateMetadata({ params: Promise.resolve({ token: t }) })
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(meta.alternates).toEqual({ canonical: null })
      expect(meta.openGraph).toMatchObject({ url: null })
      expect(JSON.stringify(meta)).not.toContain(t)
    }
  })
})
