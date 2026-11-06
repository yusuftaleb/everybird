import type { ReactNode } from 'react'

/** The head of Settings and About: the page's title and a line under it (the top bar is the way home). */
export function PageHead({ title, lede }: { title: string; lede?: ReactNode }) {
  return (
    <div className="eb-head eb-pagehead">
      <h1 className="eb-title eb-title-page">{title}</h1>
      {lede && <p className="eb-lede-sm">{lede}</p>}
    </div>
  )
}
