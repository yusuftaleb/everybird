import Link from 'next/link'

/** On every page: the sticker credit (required by huashu-bird-sticker's CC BY 4.0 licence), the way to every credit and the maker. */
export function SiteFooter() {
  return (
    <footer className="eb-footer">
      <div className="eb-footer-in">
        <p className="eb-mono">
          Stickers: <a href="https://github.com/alchaincyf/huashu-bird-sticker" target="_blank" rel="noopener noreferrer">huashu-bird-sticker</a>, CC BY 4.0
        </p>
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
