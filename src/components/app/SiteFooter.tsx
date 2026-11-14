import { GithubLogo } from '@phosphor-icons/react/dist/ssr'
import Link from '@/components/app/IntentLink'

/** The repository, linked from the footer's right edge. */
export const REPO_URL = 'https://github.com/yusuftaleb/everybird'

/**
 * On every page: the way to every credit (About#credits, which carries huashu-bird-sticker's CC BY 4.0 attribution for
 * the site), the maker, and the code on GitHub (the footer row's right edge). Share images and link previews carry the
 * sticker credit themselves: they travel without it.
 */
export function SiteFooter() {
  return (
    <footer className="eb-footer">
      <div className="eb-footer-in">
        <p className="eb-mono">
          <Link href="/about#credits">All credits</Link>
        </p>
        <p className="eb-mono">
          <a href="https://www.yusuftaleb.com" target="_blank" rel="noopener">Made by Yusuf Taleb</a>
        </p>
        <a className="eb-footer-gh" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Everybird on GitHub">
          <GithubLogo aria-hidden="true" focusable="false" />
        </a>
      </div>
    </footer>
  )
}
