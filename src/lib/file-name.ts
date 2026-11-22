// Every file the site saves is named by one rule (fileName): its parts joined by hyphens, an empty part left out:
// everybird · the title · what it shows · the format · how a batch is split · the local date · extension, as in
// "everybird-ada-story-by-family-2026-11-21.zip". Pure: no DOM, so tests and workers can import it. Every name has a
// prefix ("everybird-", a ZIP entry's number), so no part alone can be a Windows device name (CON, NUL).

/**
 * `s` as one safe file-name part: lower case, letters and digits of every script kept ("птицы", "鳥"), apostrophes
 * dropped, anything else (spaces, `/ \ : * ? " < > |`, dots, control characters) a hyphen, repeated hyphens collapsed
 * and none at either end; at most `max` characters, cut at a hyphen where one falls in the second half. '' if nothing is left.
 */
export function safeName(s: string, max = 40): string {
  let out = s
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  const chars = Array.from(out)
  if (chars.length > max) {
    const cut = chars.slice(0, max + 1).join('')
    const at = cut.lastIndexOf('-')
    out = at >= Math.floor(cut.length / 2) ? cut.slice(0, at) : chars.slice(0, max).join('')
    out = out.replace(/-+$/g, '')
  }
  return out
}

/** `d`'s local date as "2026-11-21": the day the share images' date stamp shows. */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

type FileNameParts = {
  /** The card's or poster's title as typed (made safe here). */
  title?: string
  /** What it shows: '' for the collage, 'map', 'tree-families', 'comparison', 'life-list', 'backup'. */
  shows?: string
  /** 'story', 'desktop', 'a4', 'a2-landscape', '18x24in'. */
  format?: string
  /** How a batch is split (splitPart). */
  split?: string
  date?: Date
  ext: string
}

export function fileName(p: FileNameParts): string {
  const parts = ['everybird', safeName(p.title ?? ''), p.shows, p.format, p.split, localDay(p.date)]
  return `${parts.filter(Boolean).join('-')}.${p.ext}`
}

/** A batch's split as a name part: "by-family", "100-birds-each"; '' for one batch of every bird. */
export function splitPart(split: string, batchSize?: number | 'all'): string {
  if (split !== 'batches') return `by-${split}`
  return typeof batchSize === 'number' ? `${batchSize}-birds-each` : ''
}

/** A file inside a batch ZIP: its place in the ZIP (zero-padded to the batch's size, at least two digits) and its group's stem. */
export function zipEntryName(i: number, total: number, stem: string, ext: string): string {
  const width = Math.max(2, String(total).length)
  return `${String(i + 1).padStart(width, '0')}-${stem}.${ext}`
}
