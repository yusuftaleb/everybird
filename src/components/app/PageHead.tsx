import Link from 'next/link'
import type { ReactNode } from 'react'

/** The head of /make and /my: the way home, the page's title and, beside it, its main actions. */
export function PageHead({ title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="eb-head eb-pagehead">
      <Link href="/" className="eb-mono eb-home">Everybird</Link>
      <div className="eb-pagehead-row">
        <h1 className="eb-title eb-title-page">{title}</h1>
        {actions && <div className="eb-pagehead-actions">{actions}</div>}
      </div>
      {lede && <p className="eb-lede-sm">{lede}</p>}
    </header>
  )
}
