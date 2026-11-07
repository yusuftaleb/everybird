// The whole "Copy link" step in one module (the dialog imports it lazily, with the link index inside it).
import type { ListEntry } from '../list/model'
import type { Regions } from '../species/types'
import { payloadFromList } from './convert'
import { encodeShare, isLinkCode, URL_BUDGET, type ShareLevel } from './link'

/**
 * The share URL for a list under `origin`. Codes the link index doesn't know (a taxonomy newer than the index) can't be
 * encoded, so they're left out and counted in `dropped`; the link is made from the rest. `name` is the collage's title.
 * Throws ShareTooLarge.
 */
export function makeShareLink(list: ListEntry[], regions: Regions, name: string | undefined, origin: string): { url: string; level: ShareLevel; dropped: number } {
  const linkable = list.filter((e) => isLinkCode(e.code))
  const prefix = `${origin}/s/`
  const payload = payloadFromList(linkable, regions, name)
  // The name is the collage's title, verbatim (links made before titles carry a bare name: link.ts F_TITLE).
  if (payload.name) payload.titled = true
  const { token, level } = encodeShare(payload, URL_BUDGET - prefix.length)
  return { url: prefix + token, level, dropped: list.length - linkable.length }
}
