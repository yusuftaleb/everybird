import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import Link from '@/components/app/IntentLink'
import type { ReactNode } from 'react'
import { HowItWorksDemo } from '@/components/about/HowItWorksDemo'
import { PageHead } from '@/components/app/PageHead'
import { fmt, rich } from '@/i18n/core'
import { getMessages, langParam } from '@/i18n/server'
import { COFFEE_URL, REPO_URL, pageSeo, siteTitle } from '@/lib/site-meta'
import { AVILIST, IUCN_SOURCE } from '@/lib/species/iucn'
import '@/components/app/app.css'
import './about.css'

// Only the layout's 14 languages exist: any other first segment (/nope) is the static 404, never a render.
export const dynamicParams = false

/** About's title and description in the page's language. */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langParam(params)
  const { about, imageAlt } = getMessages(lang).page.meta
  const title = siteTitle(about.title)
  return { title, description: about.description, ...pageSeo('/about', title, about.description, lang, imageAlt) }
}

/** The public repo (created at launch, Task 25). */
const HUASHU_URL = 'https://github.com/alchaincyf/huashu-bird-sticker'
const AVES_URL = 'https://github.com/McTavishLab/AvesData'

/** Read once at build time: the page is static. Only the two header fields are used. */
function dataVersions(): { ebirdTaxonomy: string; huashuCommit: string } {
  const head = JSON.parse(readFileSync(join(process.cwd(), 'public/data/species.v1.json'), 'utf8')) as {
    ebirdTaxonomy?: string
    huashuCommit?: string
  }
  return { ebirdTaxonomy: head.ebirdTaxonomy ?? 'unknown', huashuCommit: head.huashuCommit ?? '' }
}

/** The bird tree's header fields, for its credit (read once at build time, as dataVersions). */
function treeVersions(): { tree: string; taxonomy: string; year: string } {
  const f = JSON.parse(readFileSync(join(process.cwd(), 'public/data/tree.v1.json'), 'utf8')) as { tree?: string; taxonomy?: string; ebirdTaxonomy?: string }
  return { tree: f.tree ?? 'AvesData', taxonomy: f.taxonomy ?? 'unknown', year: f.ebirdTaxonomy ?? 'unknown' }
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
}

/** A tag's words as an external link, for `rich`. */
function link(href: string): (chunk: string) => ReactNode {
  // eslint-disable-next-line react/display-name -- a render callback for `rich`, not a component
  return (chunk) => <A href={href}>{chunk}</A>
}

function Credit({ label, title, children }: { label: string; title: ReactNode; children: ReactNode }) {
  return (
    <li className="eb-credit">
      {/* The space keeps title and label two words for screen readers ("huashu-bird-sticker Stickers"); flex drops it visually. */}
      <h3 className="eb-credit-title">{title}{' '}<span className="eb-mono">{label}</span></h3>
      <p className="eb-credit-body">{children}</p>
    </li>
  )
}

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = await langParam(params)
  const { page } = getMessages(lang)
  const a = page.about
  const c = a.credits
  const { ebirdTaxonomy, huashuCommit } = dataVersions()
  const tree = treeVersions()
  return (
    <main className="eb-page eb-about eb-page-titled">
      <PageHead title={page.meta.about.title} lede={a.lede} />

      {/* One column where text reads on (a section's paragraphs, a long section beside a short one); two equal columns
          from 1024px only where parts pair at a similar length (the steps beside the privacy note; the credit rows).
          The demo spans the content width. */}
      <section className="eb-block" aria-labelledby="eb-what-h">
        <h2 id="eb-what-h" className="eb-h2">{a.what.head}</h2>
        <p className="eb-prose">{a.what.body}</p>
        <p className="eb-prose">{a.what.more}</p>
      </section>

      <section className="eb-block" aria-labelledby="eb-how-h">
        <h2 id="eb-how-h" className="eb-h2">{a.how.head}</h2>
        <HowItWorksDemo />
        <div className="eb-about-cols">
          <ol className="eb-steps">
            <li>{rich(a.how.steps[0], { link: (chunk) => <Link href="/settings">{chunk}</Link> })}</li>
            <li>{a.how.steps[1]}</li>
            <li>{a.how.steps[2]}</li>
          </ol>
          <p className="eb-prose">{a.how.privacy}</p>
        </div>
      </section>

      <section className="eb-block" aria-labelledby="eb-size-h">
        <h2 id="eb-size-h" className="eb-h2">{a.size.head}</h2>
        <p className="eb-prose">{a.size.even}</p>
        <p className="eb-prose">{a.size.true}</p>
      </section>

      <section className="eb-block" aria-labelledby="eb-status-h">
        <h2 id="eb-status-h" className="eb-h2">{a.status.head}</h2>
        <p className="eb-prose">{fmt(a.status.body, { source: IUCN_SOURCE })}</p>
      </section>

      <section id="credits" className="eb-block" aria-labelledby="eb-credits-h" tabIndex={-1}>
        <h2 id="eb-credits-h" className="eb-h2">{c.head}</h2>
        {/* "Made by" and the coffee sentence are one paragraph, Buy Me a Coffee's button at its right where both fit,
            under it where they don't. Languages that end a sentence with 。 join sentences without a space. */}
        <div className="eb-coffee">
          <p className="eb-prose">
            {rich(c.madeBy, { you: link('https://www.yusuftaleb.com'), life: link('https://www.yusuftaleb.com/lifelist') })}
            {c.madeBy.endsWith('。') ? '' : ' '}
            {c.coffee}
          </p>
          <a className="eb-coffee-btn" href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
            {/* Buy Me a Coffee's standard static button (https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png, 545 × 153),
                self-hosted so nothing loads from them before a click: no widget, no script, no cookies. The image says
                "Buy me a coffee" in English in every language, so its alt does too. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/buy-me-a-coffee.png" width={143} height={40} alt="Buy me a coffee" />
          </a>
        </div>
        <p className="eb-prose">{c.thanks}</p>
        <ul className="eb-credits">
          <Credit label={c.label.stickers} title={<A href={HUASHU_URL}>huashu-bird-sticker</A>}>
            {rich(c.stickers.lead, { cc: link('https://creativecommons.org/licenses/by/4.0/'), how: link('https://birdalbum.com/how-stickers-are-made/') })}
            {huashuCommit && <>{' '}{rich(fmt(c.stickers.commit, { sha: huashuCommit.slice(0, 7) }), { code: (chunk) => <code className="eb-mono eb-credit-code">{chunk}</code> })}</>}{' '}
            {c.stickers.tail}
          </Credit>
          <Credit label={c.label.inspiration} title={<A href="https://theodore.net/projects/AvianVisitors/">Avian Visitors</A>}>
            {c.inspiration}
          </Credit>
          <Credit label={c.label.taxonomy} title={<A href="https://www.birds.cornell.edu/clementschecklist/">{c.taxonomyTitle}</A>}>
            {rich(fmt(c.taxonomy, { version: ebirdTaxonomy }), { cc: link('https://creativecommons.org/licenses/by/3.0/') })}
          </Credit>
          <Credit label={c.label.masses} title={<A href="https://doi.org/10.1111/ele.13898">AVONET</A>}>
            {c.masses}
          </Credit>
          <Credit label={c.label.masses} title={<A href="https://doi.org/10.1038/s41597-025-05615-3">BIRDBASE</A>}>
            {c.birdbase}
          </Credit>
          <Credit label={c.label.redList} title={<A href={AVILIST.doi}>AviList</A>}>
            {rich(fmt(c.redList, { birdlife: AVILIST.birdlife, version: AVILIST.version, year: String(AVILIST.year) }), { cc: link('https://creativecommons.org/licenses/by/4.0/') })}
          </Credit>
          <Credit label={c.label.tree} title={<A href={AVES_URL}>AvesData</A>}>
            {rich(fmt(c.tree, tree), { cc: link('https://creativecommons.org/licenses/by/4.0/') })}
          </Credit>
          <Credit label={c.label.api} title={<A href="https://api.inaturalist.org/v1/docs/">iNaturalist</A>}>
            {c.api}
          </Credit>
          <Credit label={c.label.countries} title={<A href="https://www.naturalearthdata.com/">Natural Earth</A>}>
            {c.countries}
          </Credit>
          <Credit label={c.label.regions} title={<A href="https://salsa.debian.org/iso-codes-team/iso-codes">Debian iso-codes</A>}>
            {c.regions}
          </Credit>
          <Credit label={c.label.boundaries} title={<A href="https://data.humdata.org/dataset/cod-ab-vnm">{c.vietnamBoundariesTitle}</A>}>
            {rich(c.vietnamBoundaries, { cc: link('https://creativecommons.org/licenses/by/3.0/igo/') })}
          </Credit>
          <Credit label={c.label.fonts} title={<A href="https://www.fontshare.com/">Fontshare</A>}>
            {c.fonts}
          </Credit>
          <Credit label={c.label.mono} title={<A href="https://vercel.com/font">Geist Mono</A>}>
            {c.mono}
          </Credit>
          <Credit label={c.label.flags} title={<A href="https://github.com/lipis/flag-icons">flag-icons</A>}>
            {c.flags}
          </Credit>
          <Credit label={c.label.phosphor} title={<A href="https://phosphoricons.com/">Phosphor</A>}>
            {c.phosphor}
          </Credit>
          <Credit label={c.label.icons8} title={<A href="https://icons8.com/">Icons8</A>}>
            {rich(c.icons8, { link: link('https://icons8.com/icon/JUYuJxA8MPVT/origami') })}
          </Credit>
          <Credit label={c.label.code} title={<A href={REPO_URL}>Everybird</A>}>
            {rich(c.code, { link: link(`${REPO_URL}/blob/main/LICENSE`) })}
          </Credit>
        </ul>
      </section>
    </main>
  )
}
