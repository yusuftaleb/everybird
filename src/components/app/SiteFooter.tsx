import Link from 'next/link'

/**
 * On every page: the way to every credit (About#credits, which carries huashu-bird-sticker's CC BY 4.0 attribution for
 * the site) and the maker. Share images and link previews carry the sticker credit themselves: they travel without it.
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
      </div>
    </footer>
  )
}
