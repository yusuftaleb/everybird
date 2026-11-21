import type { ReactNode, Ref } from 'react'

/**
 * The one page head of Collage (`/` with a list), Settings and About: the title, its actions on the same row (the
 * collage's "Add birds" and Share), and an optional line under it. Its place on the page (top offset, title type,
 * gap to the content) is the same on all three: `.eb-pagehead` in app.css, on a `.eb-page-titled` page. Compare uses
 * it too. `titleRef`: the title takes focus by script (Compare's Edit lists sends focus back to it).
 */
export function PageHead({ title, lede, actions, titleRef }: { title: string; lede?: ReactNode; actions?: ReactNode; titleRef?: Ref<HTMLHeadingElement> }) {
  return (
    <div className="eb-pagehead">
      <div className="eb-pagehead-row">
        <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="eb-pagehead-title">{title}</h1>
        {actions && <div className="eb-pagehead-actions">{actions}</div>}
      </div>
      {lede && <p className="eb-lede-sm">{lede}</p>}
    </div>
  )
}
