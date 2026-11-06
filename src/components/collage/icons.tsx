// The site's own glyphs (LifeList.tsx, framer-site), drawn on a 256 grid: the dock's view tabs, the list's
// direction arrow, close, the phone filter button, the filter toggles' chevron and the search field.
type P = { className?: string }
const svg = (className: string | undefined, children: React.ReactNode) => (
  <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false" className={className}>{children}</svg>
)

export const CollageIcon = ({ className }: P) =>
  svg(className, <path d="M40 40h72v72H40zM144 40h72v72h-72zM40 144h72v72H40zM144 144h72v72h-72z" fill="none" stroke="currentColor" strokeWidth="16" strokeLinejoin="round" />)

export const ListIcon = ({ className }: P) =>
  svg(className, <>
    <path d="M88 64h128M88 128h128M88 192h128" stroke="currentColor" strokeWidth="16" strokeLinecap="round" />
    <circle cx="44" cy="64" r="12" fill="currentColor" /><circle cx="44" cy="128" r="12" fill="currentColor" /><circle cx="44" cy="192" r="12" fill="currentColor" />
  </>)

export const ArrowDownIcon = ({ className, up }: P & { up?: boolean }) => (
  <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false" className={className} style={up ? { transform: 'scaleY(-1)' } : undefined}>
    <path d="M128 48v152M64 140l64 64 64-64" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
)

export const CloseIcon = ({ className }: P) =>
  svg(className, <path d="M200 56 56 200M56 56l144 144" stroke="currentColor" strokeWidth="18" strokeLinecap="round" fill="none" />)

export const FilterLinesIcon = ({ className }: P) =>
  svg(className, <path d="M40 72h176M72 128h112M104 184h48" stroke="currentColor" strokeWidth="16" strokeLinecap="round" />)

/** Search: a lens in the same 16-unit stroke. */
export const SearchIcon = ({ className }: P) =>
  svg(className, <><circle cx="116" cy="116" r="72" fill="none" stroke="currentColor" strokeWidth="16" /><path d="M168 168l48 48" stroke="currentColor" strokeWidth="16" strokeLinecap="round" /></>)

/** Chevron down (the Places and Time toggles; turned up while the panel is open), in the close glyph's 18-unit stroke. */
export const ChevronDownIcon = ({ className }: P) =>
  svg(className, <path d="M64 100l64 64 64-64" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" fill="none" />)
