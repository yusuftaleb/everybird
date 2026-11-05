import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/app/SiteFooter'
import '@/components/app/app.css'
import './credits.css'

export const metadata: Metadata = {
  title: 'Credits · Everybird',
  description: 'The data, stickers, fonts and code Everybird is built from.',
}

/** The public repo (created at launch, Task 25). */
const REPO_URL = 'https://github.com/yusuftaleb/everybird'
const HUASHU_URL = 'https://github.com/alchaincyf/huashu-bird-sticker'

/** Read once at build time: the page is static. Only the two header fields are used. */
function dataVersions(): { ebirdTaxonomy: string; huashuCommit: string } {
  const head = JSON.parse(readFileSync(join(process.cwd(), 'public/data/species.v1.json'), 'utf8')) as {
    ebirdTaxonomy?: string
    huashuCommit?: string
  }
  return { ebirdTaxonomy: head.ebirdTaxonomy ?? 'unknown', huashuCommit: head.huashuCommit ?? '' }
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
}

function Credit({ label, title, children }: { label: string; title: ReactNode; children: ReactNode }) {
  return (
    <li className="eb-credit">
      <p className="eb-mono eb-credit-label">{label}</p>
      <h3 className="eb-credit-title">{title}</h3>
      <p className="eb-credit-body">{children}</p>
    </li>
  )
}

export default function CreditsPage() {
  const { ebirdTaxonomy, huashuCommit } = dataVersions()
  return (
    <>
      <main className="eb-page">
        <header className="eb-head">
          <h1 className="eb-title">Credits</h1>
          <p className="eb-tagline">Everybird is built from other people&apos;s generous work.</p>
        </header>

        <section className="eb-block" aria-labelledby="eb-credits-art">
          <h2 id="eb-credits-art" className="eb-h2">Stickers and inspiration</h2>
          <ul className="eb-credits">
            <Credit label="Stickers · CC BY 4.0" title={<A href={HUASHU_URL}>huashu-bird-sticker</A>}>
              Every bird sticker comes from huashu-bird-sticker by alchaincyf, licensed{' '}
              <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>. The stickers were resized and trimmed for
              the web; nothing else was changed.
              {huashuCommit && <> Source commit <code className="eb-mono eb-credit-code">{huashuCommit.slice(0, 7)}</code>.</>}
            </Credit>
            <Credit label="Inspiration" title={<A href="https://theodore.net/projects/AvianVisitors/">Avian Visitors</A>}>
              Teddy Warner&apos;s Avian Visitors showed how lovely a wall of birds can be. Everybird started there.
            </Credit>
          </ul>
        </section>

        <section className="eb-block" aria-labelledby="eb-credits-data">
          <h2 id="eb-credits-data" className="eb-h2">Data</h2>
          <ul className="eb-credits">
            <Credit label="Taxonomy" title={<A href="https://www.birds.cornell.edu/clementschecklist/">eBird and Clements</A>}>
              Bird names, species and their order follow the eBird/Clements taxonomy, version {ebirdTaxonomy}, from the
              Cornell Lab of Ornithology. eBird files are read in your browser.
            </Credit>
            <Credit label="Body masses · CC BY 4.0" title={<A href="https://doi.org/10.1111/ele.13898">AVONET</A>}>
              True-size mode uses body masses from AVONET (Tobias et al. 2022, Ecology Letters), via huashu&apos;s species table.
            </Credit>
            <Credit label="API" title={<A href="https://api.inaturalist.org/v1/docs/">iNaturalist</A>}>
              Observations come from iNaturalist&apos;s public API, called straight from your browser, about once a second.
            </Credit>
            <Credit label="Maps · Public domain" title={<A href="https://www.naturalearthdata.com/">Natural Earth</A>}>
              Country shapes and most region names come from Natural Earth.
            </Credit>
            <Credit label="Region names · LGPL-2.1" title={<A href="https://salsa.debian.org/iso-codes-team/iso-codes">Debian iso-codes</A>}>
              The rest of the state and province names come from Debian&apos;s iso-codes ISO 3166-2 data, used for names only.
            </Credit>
          </ul>
        </section>

        <section className="eb-block" aria-labelledby="eb-credits-type">
          <h2 id="eb-credits-type" className="eb-h2">Type and icons</h2>
          <ul className="eb-credits">
            <Credit label="Fonts · ITF Free Font License" title={<A href="https://www.fontshare.com/">Fontshare</A>}>
              Satoshi and Cabinet Grotesk by Indian Type Foundry, served by Fontshare.
            </Credit>
            <Credit label="Font · OFL" title={<A href="https://vercel.com/font">Geist Mono</A>}>
              Geist Mono by Vercel, under the SIL Open Font License.
            </Credit>
            <Credit label="Icons · MIT" title={<A href="https://phosphoricons.com/">Phosphor</A>}>
              Icons from Phosphor Icons, under the MIT licence.
            </Credit>
          </ul>
        </section>

        <section className="eb-block" aria-labelledby="eb-credits-code">
          <h2 id="eb-credits-code" className="eb-h2">Code</h2>
          <ul className="eb-credits">
            <Credit label="Code · MIT" title={<A href={REPO_URL}>Everybird</A>}>
              Everybird&apos;s code is open source under the <A href={`${REPO_URL}/blob/main/LICENSE`}>MIT licence</A>. We count
              visits anonymously, without cookies. Your list never leaves your browser.
            </Credit>
          </ul>
        </section>

        <div className="eb-hero">
          <Link className="eb-btn" href="/">Back to Everybird</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
