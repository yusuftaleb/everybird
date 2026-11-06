import { flagSrc } from '@/lib/flag'

/**
 * A country's flag as on yusuftaleb.com's places (PlacesMap): an 18×13 image, 2px corners, cover, never shrinking.
 * Decorative (alt=""): the country's name is always beside it. Nothing for a code flag-icons lacks.
 */
export function Flag({ iso }: { iso: string | undefined }) {
  const src = flagSrc(iso)
  // A same-origin SVG at a fixed small size: next/image has nothing to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="eb-flag" src={src} alt="" width={18} height={13} /> : null
}
