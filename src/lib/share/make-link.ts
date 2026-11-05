// The whole "Copy link" step in one module (the dialog imports it lazily, with the link index inside it).
import type { ListEntry } from '../list/model'
import type { Regions } from '../species/types'
import { payloadFromList } from './convert'
import { encodeShare, isLinkCode, URL_BUDGET, type ShareLevel } from './link'

/**
 * The share URL for a list under `origin`. Codes the link index doesn't know (a taxonomy newer than the index) can't be
 * encoded, so they're left out and counted in `dropped`; the link is made from the rest. Throws ShareTooLarge.
 */
export function makeShareLink(list: ListEntry[], regions: Regions, name: string | undefined, origin: string): { url: string; level: ShareLevel; dropped: number } {
  const linkable = list.filter((e) => isLinkCode(e.code))
  const prefix = `${origin}/s/`
  const { token, level } = encodeShare(payloadFromList(linkable, regions, name), URL_BUDGET - prefix.length)
  return { url: prefix + token, level, dropped: list.length - linkable.length }
}
