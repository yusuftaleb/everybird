// The collage's title (Settings > "Name your collage", `Saved.name`): written by the birder and used verbatim, on the
// collage page, in the share dialog, on share images and in share links. Empty: "My collage" on the page and no title
// on shares. Before v4 the field asked for a person's name and the app added "'s birds"; migrateSaved (storage.ts)
// turns such an old name into that title once, so nobody sees a change.

/** The longest title: what a share link carries (link.ts NAME_MAX; a test keeps them equal). */
export const TITLE_MAX = 40
const SUFFIX = "'s birds"

/** Trimmed, at most TITLE_MAX characters (code points), trimmed again. */
export function cleanTitle(s: string): string {
  return Array.from(s.trim()).slice(0, TITLE_MAX).join('').trim()
}

/**
 * Whether an old saved name already reads like a title, so the migration leaves it alone: it names birds, a list or a
 * life (the words "bird(s)", "birding", "list(s)", "life", "lifer(s)"; "Ada Birder" and "Birdie" are names), carries
 * a year (1900–2099), is possessive ("'s " or "’s ", or ends in "'s"), or starts "My " or holds " of " ("My year",
 * "Birds of Kenya"). A bare name ("Ada", "Sam Birder") does none of these.
 */
export function looksLikeTitle(name: string): boolean {
  const s = name.toLowerCase()
  return (
    /\b(birds?|birding|lists?|life|lifers?)\b/.test(s) ||
    /\b(19|20)\d\d\b/.test(s) ||
    /['’]s(\s|$)/.test(s) ||
    /^my\s/.test(s) ||
    /\sof\s/.test(s)
  )
}

/**
 * An old (pre-v4) saved name as the title it showed: "Ada" -> "Ada's birds". A name that already reads like a title
 * stays as it is. Too long for TITLE_MAX with the suffix: the name part is cut so the whole fits ("…'s birds" kept).
 */
export function titleFromOldName(name: string): string {
  const n = cleanTitle(name)
  if (!n || looksLikeTitle(n)) return n
  const room = TITLE_MAX - SUFFIX.length
  return `${Array.from(n).slice(0, room).join('').trimEnd()}${SUFFIX}`
}

/** The collage page's title: the saved title, or "My collage". */
export function pageTitle(name: string | undefined): string {
  return name?.trim() || 'My collage'
}
