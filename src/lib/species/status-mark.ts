// The Red List pill on a threatened bird (VU, EN, CR) in the List view's rows (item 3, Yusuf 2026-11-15). The collage's
// stickers carry none (they overlapped neighbours; Yusuf 2026-11-15).
import { THREATENED, type IucnCat } from './iucn'

/** Does a row with this category carry the pill? Threatened species only (VU, EN, CR); none without a category. */
export function markShown(iu: IucnCat | undefined): iu is IucnCat {
  return !!iu && THREATENED.includes(iu)
}

