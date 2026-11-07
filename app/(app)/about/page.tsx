import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { HowItWorksDemo } from '@/components/about/HowItWorksDemo'
import { PageHead } from '@/components/app/PageHead'
import '@/components/app/app.css'
import './about.css'

export const metadata: Metadata = {
  title: 'About · Everybird',
  description: 'What Everybird is, how it works, what True size means, and the data, stickers, fonts and code it is built from.',
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
      <h3 className="eb-credit-title">{title}<span className="eb-mono">{label}</span></h3>
      <p className="eb-credit-body">{children}</p>
    </li>
  )
}

export default function AboutPage() {
  const { ebirdTaxonomy, huashuCommit } = dataVersions()
  return (
    <main className="eb-page eb-about eb-page-titled">
      <PageHead title="About" lede="Everybird turns any birder's life list into a sticker collage." />

      <section className="eb-block" aria-labelledby="eb-what-h">
        <h2 id="eb-what-h" className="eb-h2">What it is</h2>
        <p className="eb-prose">
          Your life list is already the record of a lifetime of birds. Everybird lays it out as one collage: every species
          a sticker, sized by its body mass, with the count in the middle. Filter it by group, place or year, then share it as an
          image or a link.
        </p>
      </section>

      <section className="eb-block" aria-labelledby="eb-how-h">
        <h2 id="eb-how-h" className="eb-h2">How it works</h2>
        <HowItWorksDemo />
        <ol className="eb-steps">
          <li>Bring your list on <Link href="/settings">Settings</Link>: an eBird file, an iNaturalist username, or birds ticked by hand. Combine them if you keep more than one record.</li>
          <li>Each bird is matched to this year&apos;s eBird taxonomy and keeps its earliest date. Rows that don&apos;t match are listed, so nothing is dropped quietly.</li>
          <li>The collage, the filters and the share images are all made in your browser.</li>
        </ol>
        <p className="eb-prose">
          Your list never leaves your browser. We count visits with Cloudflare Web Analytics, anonymous and cookieless, and a
          few actions (a collage made, an image shared or saved, a link copied) with a small counter of our own that never
          sees your birds, names or places. A daily-changing anonymous id lets us count unique visitors without tracking
          anyone across days. Neither runs if your browser asks not to be tracked.
        </p>
      </section>

      <section className="eb-block" aria-labelledby="eb-size-h">
        <h2 id="eb-size-h" className="eb-h2">What True size means</h2>
        <p className="eb-prose">
          Each sticker is sized from the bird&apos;s average body mass, from AVONET. The default evens sizes out: the long side
          follows mass to the power of 0.2, so small birds stay visible next to big ones.
        </p>
        <p className="eb-prose">
          True size uses the cube root of mass instead. Birds are roughly similar in density, so mass tracks volume, and its cube
          root tracks length: a bird eight times heavier is drawn about twice as long. It&apos;s an estimate of relative size, not a
          measured length, so birds with long tails or legs read a little small.
        </p>
      </section>

      <section id="credits" className="eb-block" aria-labelledby="eb-credits-h" tabIndex={-1}>
        <h2 id="eb-credits-h" className="eb-h2">Credits</h2>
        <p className="eb-prose">
          Made by <A href="https://www.yusuftaleb.com">Yusuf Taleb</A>. It grew out of the{' '}
          <A href="https://www.yusuftaleb.com/lifelist">life list on his site</A>, and is built from other people&apos;s generous work.
        </p>
        <ul className="eb-credits">
          <Credit label="Stickers · CC BY 4.0" title={<A href={HUASHU_URL}>huashu-bird-sticker</A>}>
            Every bird sticker comes from huashu-bird-sticker by alchaincyf, licensed{' '}
            <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>. The stickers were resized and trimmed for the
            web; nothing else was changed.
            {huashuCommit && <> Source commit <code className="eb-mono eb-credit-code">{huashuCommit.slice(0, 7)}</code>.</>}
          </Credit>
          <Credit label="Inspiration" title={<A href="https://theodore.net/projects/AvianVisitors/">Avian Visitors</A>}>
            Teddy Warner&apos;s Avian Visitors showed how lovely a wall of birds can be. Everybird started there.
          </Credit>
          <Credit label="Taxonomy" title={<A href="https://www.birds.cornell.edu/clementschecklist/">eBird and Clements</A>}>
            Bird names, species and their order follow the eBird/Clements taxonomy, version {ebirdTaxonomy}, from the Cornell Lab
            of Ornithology. eBird files are read in your browser.
          </Credit>
          <Credit label="Body masses · CC BY 4.0" title={<A href="https://doi.org/10.1111/ele.13898">AVONET</A>}>
            Sticker sizes use body masses from AVONET (Tobias et al. 2022, Ecology Letters), via huashu&apos;s species table.
          </Credit>
          <Credit label="API" title={<A href="https://api.inaturalist.org/v1/docs/">iNaturalist</A>}>
            Observations come from iNaturalist&apos;s public API, called straight from your browser, about once a second.
          </Credit>
          <Credit label="Country names · Public domain" title={<A href="https://www.naturalearthdata.com/">Natural Earth</A>}>
            Country names and most region names come from Natural Earth.
          </Credit>
          <Credit label="Region names · LGPL-2.1" title={<A href="https://salsa.debian.org/iso-codes-team/iso-codes">Debian iso-codes</A>}>
            The rest of the state and province names come from Debian&apos;s iso-codes ISO 3166-2 data, used for names only.
          </Credit>
          <Credit label="Fonts · ITF Free Font License" title={<A href="https://www.fontshare.com/">Fontshare</A>}>
            Satoshi and Cabinet Grotesk by Indian Type Foundry, served by Fontshare.
          </Credit>
          <Credit label="Font · OFL" title={<A href="https://vercel.com/font">Geist Mono</A>}>
            Geist Mono by Vercel, under the SIL Open Font License.
          </Credit>
          <Credit label="Flags · MIT" title={<A href="https://github.com/lipis/flag-icons">flag-icons</A>}>
            Country flags from flag-icons by Panayiotis Lipiridis, under the MIT licence.
          </Credit>
          <Credit label="Icons · MIT" title={<A href="https://phosphoricons.com/">Phosphor</A>}>
            Icons from Phosphor Icons, under the MIT licence.
          </Credit>
          <Credit label="Icons" title={<A href="https://icons8.com/">Icons8</A>}>
            The site icon&rsquo;s origami bird: <A href="https://icons8.com/icon/JUYuJxA8MPVT/origami">Origami</A> (Fluent Systems Regular) by Icons8.
          </Credit>
          <Credit label="Code · MIT" title={<A href={REPO_URL}>Everybird</A>}>
            Everybird&apos;s code is open source under the <A href={`${REPO_URL}/blob/main/LICENSE`}>MIT licence</A>.
          </Credit>
        </ul>
      </section>
    </main>
  )
}
