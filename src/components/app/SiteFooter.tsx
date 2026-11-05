import Link from 'next/link'

/** On every page: the sticker credit (required by huashu-bird-sticker's CC BY 4.0 licence) and the credits link. */
export function SiteFooter() {
  return (
    <footer className="eb-footer">
      <p className="eb-mono">
        Stickers: <a href="https://github.com/alchaincyf/huashu-bird-sticker" target="_blank" rel="noopener noreferrer">huashu-bird-sticker</a>, CC BY 4.0
      </p>
      <p className="eb-mono">
        <Link href="/credits">Credits</Link>
      </p>
    </footer>
  )
}
