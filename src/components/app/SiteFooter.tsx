'use client'
import { GithubLogo } from '@phosphor-icons/react/dist/ssr'
import { BackToTop } from '@/components/app/BackToTop'
import Link from '@/components/app/IntentLink'
import { useI18n } from '@/i18n/I18nProvider'
import { COFFEE_URL, REPO_URL } from '@/lib/site-meta'

/**
 * On every page: the way to every credit (About#credits, which carries huashu-bird-sticker's CC BY 4.0 attribution for
 * the site), the maker, a way to support him (Buy Me a Coffee), and the code on GitHub (the footer row's right edge).
 * Share images and link previews carry the sticker credit themselves: they travel without it.
 * It also mounts "Back to top" (BackToTop), since the footer is the one piece every page has.
 */
export function SiteFooter() {
  const { t } = useI18n()
  const f = t.shell.footer
  return (
    <>
    <footer className="eb-footer">
      <div className="eb-footer-in">
        <p className="eb-mono">
          <Link href="/about#credits">{f.credits}</Link>
        </p>
        <p className="eb-mono">
          <a href="https://www.yusuftaleb.com" target="_blank" rel="noopener noreferrer">{f.madeBy}</a>
        </p>
        <p className="eb-mono">
          <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">{f.coffee}</a>
        </p>
        <a className="eb-footer-gh" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label={f.github}>
          <GithubLogo aria-hidden="true" focusable="false" />
        </a>
      </div>
    </footer>
    {/* Beside the footer, not in it: the button is fixed to the window and belongs to the whole page. */}
    <BackToTop />
    </>
  )
}
