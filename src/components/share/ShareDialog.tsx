'use client'
// The share dialog, on one screen (Yusuf, 2026-11-19: the fewest steps from the collage to a shared image; every other
// option is complementary and stays out of the way; 2026-11-20: nothing scrolls on a 1440 × 830 laptop). The page opens
// it two ways: Share (images) and Print beside it (the poster, `print`); neither switches to the other inside it. Both
// draw what the view on screen draws: from the Tree or the Map that view's own picture (renderTreeImage, renderMapImage;
// the poster at the paper's size, makeViewPoster), from Collage or List the collage; dialogRows says which options each
// shows. On top the format control (Story, Post, Square; Desktop, Post 5:4 and Square when the Vertical | Horizontal
// switch beside it says Horizontal; the poster has none) and the orientation, on one row where they fit. Beside them the
// live preview (above them on phones). Then the optional collage title (Saved.name verbatim), its label above the field,
// and the option rows in one bordered group (as Settings' Counting group, a Hairline between rows and no other rule),
// label left and control right: in the poster the size first (a dropdown, A4 to A1 and the inch sizes, with its line
// under the label), Arrangement (Fit or Oval), Count (a dropdown), Goal (Share only), then the switches two to a row
// where they fit, each label beside its own switch (Show latest lifer and the poster's species names; the Tree's Lifers
// only and Hide totals, the Map's Hide totals; Dark image and Transparent background). Under the group Export in
// batches, its own box, collapsed: a ZIP of one image (PNG, the dialog's format and options) or one poster per group, by
// the Split by choices (Number of birds first, with Birds per image or per poster). Then Share image (the system share
// sheet when it takes files, else a download) over Download and Copy link; in the poster Make poster (makePoster, its
// chunk fetched when the dialog opens) and Copy link side by side, then the progress and Cancel, then Download PNG and
// Download PDF serving the one encode, side by side the same way. Last, in the bottom right corner, Buy Me a Coffee's
// static button (self-hosted, never on the images). Every dropdown is MenuSelect.
// On phones the actions come straight under the preview, so Share image (or Make poster) is on the first screen.
// The Goal row (Share only; posters never draw a goal): "Add a goal" until one is set; then a number box, "species in",
// a year menu (All time and each year with birds, newest first) and a remove button. With a year the image is that
// year's birds against the target (the Big Year); with All time, the birds on screen against it. Kept in Saved.bigYear
// (year left out for All time). The image draws the goal under the count ("OF 150 SPECIES"), the number as large as without one.
// The link encoder (and its ~111 KB species index) is a separate chunk, fetched when the dialog opens, so a Copy link
// click awaits nothing slow (iOS drops the clipboard permission once a click handler waits on the network).
// Share image and Download wait for the current render: they're disabled while it's busy, so a click has the PNG at hand.
// Every word is the UI language's (ui.share), the image's and the poster's too; the credit line, the share text
// (SHARE_CREDIT), the download names and the link stay the same in every language (a link carries no language).
// Changing the size, title or a switch, or closing the dialog cancels a poster make and drops a finished poster.
// Counted: poster_made (by size) when a make finishes, poster_downloaded (png|pdf) when a file is saved; link_copied
// isn't, from the poster; the ZIPs aren't counted.
import {
  ArrowClockwise, CaretDown, Circle, DownloadSimple, FilePdf, LinkSimple, Printer, Rectangle, ShareNetwork, X, type Icon,
} from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { trapTab, useEscapeCapture, useFocusInAndBack, useHoldTopBar } from '@/components/dialog-utils'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { HTML_LANG } from '@/i18n/langs'
import { useI18n } from '@/i18n/I18nProvider'
import { countryName, regionsIn } from '@/lib/i18n-places'
import { track, type PosterSizeWire } from '@/lib/analytics'
import { currentTheme, type Theme } from '@/lib/theme'
import { setTreeMine, useTreeMine } from '@/lib/tree-mine'
import { ARRANGEMENTS, setArrangement, useArrangement, type Arrangement } from '@/lib/arrangement'
import { COFFEE_URL } from '@/lib/site-meta'
import { downloadBlob } from '@/lib/download'
import { BULK_BATCH_OPTIONS, bulkGroups, bulkPackSpec, makeBulkZip, makeImageZip, type BulkBatch, type BulkSplit } from '@/lib/share/bulk'
import type { Poster } from '@/lib/share/poster'
import { CAPTION_CAPS, PRINT_IN, PRINT_SIZES, captionMinPx, isUsSize, printCm, printDesign, printFileStem, printIn, printPackH, printPx, type PrintSize } from '@/lib/share/print'
import { planCaptions, type CaptionPlan } from '@/lib/share/captions'
import { goalBasis, hasDates, isTarget, listYears, TARGET_MAX, yearFilter, yearList, type BigYear } from '@/lib/list/big-year'
import { applyFilter, filterKey } from '@/lib/list/filters'
import { groupName } from '@/lib/search/groups'
import type { Action, AppState } from '@/lib/list/store'
import {
  NAME_MAX_LEN, SHARE_CREDIT, abortError, IMAGE_SIZE, captionMeasurer, cardLayout, clearStickerCache, ensureCaptionFont, filterLabel as labelFor, fitCaptionPack, imagePackSpec, imageShape, isPrint, packForImage, renderShareImage,
  type CardFormat, type CountSize, type FormatSlot, type ImagePack, type Orientation,
} from '@/lib/share/image'
import type { ShareLevel } from '@/lib/share/link'
import type { makeShareLink as MakeShareLink } from '@/lib/share/make-link'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { Regions } from '@/lib/species/types'
import type { ViewKind } from '@/lib/view-resume'
import type { ShareAt, ViewImageOpts } from '@/lib/share/view-image'
import '@/components/app/app.css'
import '@/components/collage/collage.css'
import { dialogRows, subjectOf } from './dialog-options'
import { MenuSelect } from './MenuSelect'
import './share.css'

/** How long the preview's frame eases to a new shape and the images cross-fade (share.css, as the photo lightbox). */
const PREVIEW_EASE_MS = 420

/** `view`: the view Share was pressed in, `at` the level it had open (the Map's place, the Tree's family or genus).
 *  Every view shares the birds on screen (the filter applied). `print`: opened by Print, on the poster. */
type Props = { state: AppState; dispatch: (a: Action) => void; species: SpeciesIndex; regions: Regions; view?: ViewKind; at?: ShareAt; print?: boolean; onClose: () => void }

/** The views that draw their own image and poster: each module loads only when Share or Print is pressed there.
 *  Unset, a view shares and prints the collage of the birds on screen. */
export const VIEW_IMAGE: Partial<Record<ViewKind, () => Promise<(o: ViewImageOpts) => Promise<Blob>>>> = {
  map: () => import('@/lib/share/map-image').then((m) => m.renderMapImage),
  tree: () => import('@/lib/share/tree-image').then((m) => m.renderTreeImage),
}

const RENDER_DELAY_MS = 250
/** The format buttons: each slot's ratio in each orientation (the square is square in both), in its spoken name. */
const FORMATS: { id: FormatSlot; hint: Record<Orientation, string> }[] = [
  { id: 'story', hint: { vertical: '9:16', horizontal: '16:9' } },
  { id: 'post', hint: { vertical: '4:5', horizontal: '5:4' } },
  { id: 'square', hint: { vertical: '1:1', horizontal: '1:1' } },
]
const ORIENTATIONS: Orientation[] = ['vertical', 'horizontal']
/** Fit or Oval's icons: the frame the birds fill, or the oval they sit in. */
const ARRANGE_ICON: Record<Arrangement, Icon> = { packed: Rectangle, oval: Circle }
const COUNT_SIZES: CountSize[] = ['small', 'medium', 'large', 'title', 'hide']
const BULK_BATCHES: BulkBatch[] = ['all', ...[...BULK_BATCH_OPTIONS].reverse()]
type LinkResult = ReturnType<typeof MakeShareLink>
/** The goal's year: a year, or the birds on screen (All time). */
type GoalYear = number | 'all'
const loadLinkModule = () => import('@/lib/share/make-link')
type PosterModule = typeof import('@/lib/share/poster')

/** A quiet action: a full label (its accessible name), a shorter one for the row, an icon. */
type QuietAction = { label: string; short?: string; icon: Icon; onClick: () => void; disabled?: boolean; ref?: RefObject<HTMLButtonElement | null> }

/** Why a link carries less than the regions (a large list), or nothing for a full link. */
const levelReason = (level: ShareLevel, t: ReturnType<typeof useI18n>['t']) => (level === 'regions' ? '' : t.share.level[level])

export default function ShareDialog({ state, dispatch, species, regions, view, at, print = false, onClose }: Props) {
  const names = useNames()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const nameId = useId()
  const optionalId = useId()
  const helperId = useId()
  const countSizeId = useId()
  const goalId = useId()
  const goalYearId = useId()
  const targetNoteId = useId()
  const bulkToggleId = useId()
  const bulkBodyId = useId()
  const arrangeId = useId()
  const bulkSplitId = useId()
  const bulkSizeId = useId()
  const sizeId = useId()
  const namesNoteId = useId()
  // An open dropdown takes Escape first (the dialog catches it on the window before the menu could): it closes the menu.
  const menuEsc = useRef<(() => void) | null>(null)
  useEscapeCapture(() => (menuEsc.current ? menuEsc.current() : onClose()))
  useFocusInAndBack(ref)
  useHoldTopBar()
  const { lang, t } = useI18n()
  const pt = t.share.print
  const sizeName = (s: PrintSize) => (isUsSize(s) ? fmt(pt.inches, { w: PRINT_IN[s][0], h: PRINT_IN[s][1] }) : s)
  /** After a make: ready, then (when some did) the soft stickers, then the ones that didn't load. */
  const readyNote = (p: Poster) =>
    [fmt(pt.ready, { size: sizeName(p.size) }), p.namesDropped ? pt.namesDropped : '', p.soft > 0 ? pt.soft : '', p.missing > 0 ? plural(pt.missing, p.missing, { n: formatInt(p.missing, t.num) }) : ''].filter(Boolean).join(' ')

  const { list, filter, saved, seen, sci } = state
  const [format, setFormat] = useState<FormatSlot>('story')
  // The orientation flips every format at once (Square stays square; its switch is off). It holds while the dialog is open.
  const [orientation, setOrientation] = useState<Orientation>('vertical')
  const landscape = orientation === 'horizontal'
  /** The share image's shape: the slot in this orientation (story is desktop, post is wide when horizontal). */
  const shape = imageShape(format, orientation)
  const [size, setSize] = useState<PrintSize>('A2')
  // In the Map or Tree view the image and the poster draw that view: no stickers, so no sticker options (dialogRows).
  const subject = subjectOf(view)
  const rows = dialogRows(subject, print)
  const viewImage = subject === 'collage' ? undefined : VIEW_IMAGE[subject]
  const treeImage = subject === 'tree'
  // The Tree image's "Lifers only" is the bar's switch (tree-mine.ts), so the image and the view agree.
  const treeMine = useTreeMine()
  const [hideTotals, setHideTotals] = useState(false)
  // Square is the same in both orientations (its image doesn't change; the dialog keeps its narrow layout for it).
  const squareShare = !print && format === 'square'
  // Horizontal (a desktop or wide image, or a landscape poster) lays out wide: the dialog widens and the preview takes
  // the width left beside the controls' column (share.css, data-layout). Vertical keeps its narrower dialog.
  const wideLayout = landscape && !squareShare
  const lastWide = useRef(wideLayout)
  // The collage's title: saved with the list as it is typed (the store trims it), so it also names the page.
  const [name, setName] = useState(saved.name ?? '')
  const [countSizeChoice, setCountSize] = useState<CountSize>('medium')
  // The Tree and Map images have no Count row: their count is the medium one.
  const countSize: CountSize = rows.count ? countSizeChoice : 'medium'
  const [showLatest, setShowLatest] = useState(true)
  const [showNames, setShowNames] = useState(false)
  const [namesFitFailKey, setNamesFitFailKey] = useState<string | null>(null)
  const [fontsTick, setFontsTick] = useState(0)
  // The look of everything the dialog makes: the app's theme when the dialog opens, then this dialog's own choice.
  const [dark, setDark] = useState(() => currentTheme() === 'dark')
  const theme: Theme = dark ? 'dark' : 'light'
  // No background fill in the PNGs (images and posters; a PDF needs one, so it's offered only with this off). Not stored.
  const [transparent, setTransparent] = useState(false)

  // What the image shows: the current view (the filter applied), and the filter in words, in the UI language (countries
  // named by regionsIn; the link below is made from the English `regions`, so it is the same in every language).
  const known = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  const fk = filterKey(filter)
  const shown = useMemo(() => (fk ? applyFilter(known, filter, species, seen) : known), [known, filter, fk, species, seen])
  const label = useMemo(() => {
    const named = regionsIn(regions, lang)
    return labelFor(filter, { species, countryName: (iso) => countryName(iso, lang, regions), regions: named, familyName, groupName: (id) => { const g = species.groups?.get(id); return g && groupName(g, lang) } }, t)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  }, [filter, species, regions, lang, t, names])
  // The Goal row (the collage image and the poster): closed ("Add a goal") until a goal is set or saved.
  const dated = useMemo(() => hasDates(known, seen), [known, seen])
  const [goalOpen, setGoalOpen] = useState(() => !!saved.bigYear)
  const [goalYear, setGoalYear] = useState<GoalYear>(() => (saved.bigYear ? (saved.bigYear.year ?? 'all') : 'all'))
  const [goalTarget, setGoalTarget] = useState(() => (saved.bigYear ? String(saved.bigYear.target) : ''))
  /** The target box was left holding something that isn't a whole number from 1 to TARGET_MAX (the saved goal stays). */
  const [targetBad, setTargetBad] = useState(false)
  const parsedTarget = /^\d+$/.test(goalTarget.trim()) ? Number(goalTarget.trim()) : undefined
  const validTarget = isTarget(parsedTarget) ? parsedTarget : undefined
  // The year menu: All time, then (for a list with dates) this year and each year with birds, newest first, and the
  // saved goal's year. Worked out only while the row is open.
  const years = useMemo(() => {
    if (!goalOpen) return []
    const ys = dated ? listYears(known, species, seen) : []
    if (typeof goalYear === 'number' && !ys.includes(goalYear)) ys.push(goalYear)
    return ys.sort((a, b) => b - a)
  }, [goalOpen, dated, known, species, seen, goalYear])
  // A year's goal draws that year's birds even before a target is typed; an All time goal only once it has a target.
  // Never in Print: posters draw no goal (its row is Share's alone), so a saved goal waits for Share.
  const goalActive = rows.goal && goalOpen && !viewImage && (goalYear !== 'all' || validTarget !== undefined)
  const yearGoal = goalActive && goalYear !== 'all' ? goalYear : undefined
  const cardEntries = useMemo(() => (yearGoal !== undefined ? yearList(known, yearGoal, species, seen) : shown), [yearGoal, known, species, seen, shown])
  const cardGoal = useMemo(
    () => (goalActive ? { ...(yearGoal !== undefined ? { year: yearGoal } : {}), target: validTarget, basis: goalBasis(seen) } : undefined),
    [goalActive, yearGoal, validTarget, seen],
  )
  const cardLabel = yearGoal !== undefined ? undefined : label
  /** The goal as saved: the year left out for All time. */
  const goalOf = (y: GoalYear, target: number): BigYear => (y === 'all' ? { target } : { year: y, target })
  const hasLatest = useMemo(() => cardEntries.some((e) => e.date), [cardEntries])
  const withLatest = hasLatest && showLatest && !viewImage
  // Packed or Oval (kept per device): how the images and the poster place the birds. The collage on the page is always packed.
  const arrangement = useArrangement()
  const cardFormat: CardFormat = print ? (landscape ? 'printLandscape' : 'print') : shape
  const trimmed = name.trim()
  const hasTitle = !!trimmed
  const hasFilter = !!(cardLabel || cardGoal)
  const goalKey = cardGoal ? `by:${cardGoal.year ?? 'all'}:${cardGoal.target ?? ''}:${cardGoal.basis}` : ''
  const overCap = cardEntries.length > CAPTION_CAPS[size]
  useEffect(() => {
    if (!rows.names || overCap || typeof document === 'undefined' || !document.fonts) return
    let live = true
    const sample = cardEntries.map((e) => {
      const r = species.byCode.get(e.code)
      return r ? displayName(r) : ''
    }).join('')
    void ensureCaptionFont(captionMinPx(size), sample).then(() => {
      if (live) setFontsTick((n) => n + 1)
    })
    return () => { live = false }
  }, [rows.names, overCap, size, cardEntries, species, lang, names])
  const captionPlan = useMemo(() => {
    if (!rows.names || overCap) return null
    const L = cardLayout(cardFormat, { name: hasTitle, filter: hasFilter, latest: true, count: cardEntries.length, target: cardGoal?.target, countSize }, printDesign(size, landscape))
    return planCaptions(cardEntries, species, size, L.collage.w, displayName, captionMeasurer())
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names`, `lang`, `fontsTick` trigger recheck for `displayName` and loaded Satoshi metrics
  }, [rows.names, overCap, cardFormat, hasTitle, hasFilter, cardEntries, cardGoal?.target, countSize, size, landscape, species, names, lang, fontsTick])
  const namesCheckKey = `${cardFormat}|${arrangement}|${size}|${hasTitle}|${hasFilter}|${cardEntries.length}|${cardGoal?.target ?? ''}|${countSize}|${lang}|${names}|${fk}|${goalKey}|${fontsTick}`
  const namesFitFailed = namesFitFailKey === namesCheckKey
  const namesAvailable = !overCap && !!captionPlan?.ok && !namesFitFailed
  const effectiveShowNames = rows.names && showNames && namesAvailable
  const namesUnavailableReason = overCap
    ? fmt(pt.namesCap, { size: sizeName(size), max: formatInt(CAPTION_CAPS[size], t.num) })
    : !namesAvailable
      ? fmt(pt.namesNoFit, { size: sizeName(size) })
      : null

  // One pack per format and name-or-not while the dialog is open (the view can't change underneath it; a
  // name takes a line off the collage, so each gets its own pack; the latest lifer switch never changes the pack), and for the
  // poster per shape (printPackH: the A sizes share one, the US 2:3 sizes another); workers end on close.
  const life = useRef<AbortController | null>(null)
  useEffect(() => {
    const c = new AbortController()
    life.current = c
    return () => { c.abort(); clearStickerCache() }
  }, [])
  const packFor = useMemo(() => {
    const packs = new Map<string, Promise<ImagePack>>()
    // A names pack is keyed by its plan (captionPlan is remade whenever the names, their language, the rings, the fonts or
    // the paper change), so those never remake the names-off packs.
    const planIds = new WeakMap<object, number>()
    let nextPlan = 0
    const planId = (plan: object) => {
      if (!planIds.has(plan)) planIds.set(plan, nextPlan++)
      return planIds.get(plan)!
    }
    // Not keyed by the latest lifer switch: imagePackSpec packs for the with-row frame, so on and off share one pack.
    return (f: CardFormat, named: boolean, printSize: PrintSize, cs: CountSize, plan?: Extract<CaptionPlan, { ok: true }> | null, signal?: AbortSignal) => {
      const hasPlan = !!plan?.ok && isPrint(f)
      // With names, the paper size too: the caption font follows the paper, though every A size shares one pack height.
      const k = `${f}|${named}|${isPrint(f) ? printPackH(printSize) : ''}|${cs}|${hasPlan ? `${printSize}|plan${planId(plan)}` : ''}`
      let p = packs.get(k)
      if (!p) {
        const spec = imagePackSpec(f, { name: named, filter: !!(cardLabel || cardGoal), latest: true, count: cardEntries.length, target: cardGoal?.target, countSize: cs }, printSize, hasPlan ? plan : undefined, arrangement)
        p = packForImage(cardEntries, species, spec, signal ?? life.current?.signal)
        packs.set(k, p)
        p.catch(() => packs.delete(k))
      }
      return p
    }
  }, [cardEntries, species, cardLabel, cardGoal, arrangement])
  useEffect(() => {
    if (!rows.names || overCap || !captionPlan?.ok) return
    let live = true
    const ctl = new AbortController()
    const onLifeAbort = () => ctl.abort()
    life.current?.signal.addEventListener('abort', onLifeAbort, { once: true })
    const checkKey = namesCheckKey
    void packFor(cardFormat, hasTitle, size, countSize, captionPlan, ctl.signal).then((pack) => {
      if (!live || !(pack.boxes instanceof Map)) return
      const res = fitCaptionPack(
        pack, cardEntries, cardFormat,
        { name: hasTitle, filter: hasFilter, latest: true, count: cardEntries.length, target: cardGoal?.target, countSize },
        size, captionPlan,
      )
      if (!res.ok) setNamesFitFailKey(checkKey)
    }).catch((err: unknown) => {
      if (live && (err as Error)?.name !== 'AbortError') setNamesFitFailKey(checkKey)
    })
    return () => {
      live = false
      ctl.abort()
      life.current?.signal.removeEventListener('abort', onLifeAbort)
    }
  }, [rows.names, overCap, captionPlan, namesCheckKey, packFor, cardFormat, hasTitle, size, countSize, cardEntries, hasFilter, cardGoal?.target])

  // The image: re-rendered (debounced) when the format, name, theme or the latest lifer switch changes. `current` is the newest render;
  // a render superseded before it starts rejects with an AbortError. In print mode it is the poster's preview (the
  // size instead of the format).
  /** What the Tree or Map image reads besides the share image's options: the view's level, the app state, its switches. */
  const viewOf = () => ({ at: treeImage ? { ...at, mine: treeMine } : at ?? {}, state: { list, filter, seen, sci }, t, hideTotals })
  const [preview, setPreview] = useState<{ url: string; format: CardFormat; size: PrintSize; key: string } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const current = useRef<Promise<Blob> | null>(null)
  /** The finished PNG for `key`, so Share and Download can use it without awaiting anything. */
  const ready = useRef<{ key: string; blob: Blob } | null>(null)
  const previewUrl = useRef<string | null>(null)
  // The image being replaced stays a layer over the frame while it fades out (share.css); its blob URL is revoked after.
  const [outgoing, setOutgoing] = useState<{ url: string; w: number; h: number } | null>(null)
  const outgoingUrl = useRef<string | null>(null)
  const outgoingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shownSize = useRef<[number, number]>([0, 0])
  const first = useRef(true)
  // The Tree's or Map's drawing: the view, its switches.
  // `at` is the view's level, live (the Tree's follows the taxonomy filter); its JSON leaves out the map's names function.
  const viewKey = viewImage ? `${subject}|${treeImage ? treeMine : ''}|${hideTotals}|${JSON.stringify(at ?? {})}` : ''
  const key = `${print ? `print|${size}|${landscape}|${effectiveShowNames}` : shape}|${viewKey}|${arrangement}|${trimmed}|${theme}|${withLatest}|${lang}|${names}|${fk}|${goalKey}|${countSize}|${transparent}`
  const busy = preview?.key !== key && failedKey !== key
  const failed = failedKey === key
  useEffect(() => {
    let live = true
    let cancel = () => {}
    const delay = first.current ? 0 : RENDER_DELAY_MS
    first.current = false
    const job = new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay)
      cancel = () => { clearTimeout(t); reject(abortError('superseded')) }
    })
      .then(async () => {
        const opts = {
          format: cardFormat, ...(print ? { printSize: size, showNames: effectiveShowNames } : {}), entries: cardEntries, species, filterLabel: cardLabel, goal: cardGoal, name: trimmed || undefined,
          theme, transparent, latest: withLatest, countSize, strings: t, nameOf: displayName, signal: life.current?.signal,
        }
        if (viewImage) return (await viewImage())({ ...opts, ...viewOf() })
        const pack = await packFor(cardFormat, !!trimmed, size, countSize, effectiveShowNames && captionPlan?.ok ? captionPlan : null)
        return renderShareImage({ ...opts, pack })
      })
    current.current = job
    job.then(
      (blob) => {
        if (!live) return
        clearTimeout(outgoingTimer.current)
        if (outgoingUrl.current) URL.revokeObjectURL(outgoingUrl.current)
        outgoingUrl.current = previewUrl.current
        if (outgoingUrl.current) {
          const gone = outgoingUrl.current
          setOutgoing({ url: gone, w: shownSize.current[0], h: shownSize.current[1] })
          outgoingTimer.current = setTimeout(() => {
            URL.revokeObjectURL(gone)
            if (outgoingUrl.current === gone) outgoingUrl.current = null
            setOutgoing(null)
          }, PREVIEW_EASE_MS)
        }
        ready.current = { key, blob }
        previewUrl.current = URL.createObjectURL(blob)
        setPreview({ url: previewUrl.current, format: cardFormat, size, key })
      },
      (e: unknown) => {
        if (!live || (e as Error)?.name === 'AbortError') return
        console.warn('Everybird share image failed:', e)
        setFailedKey(key)
      },
    )
    return () => { live = false; cancel() }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- viewOf reads treeImage, treeMine, hideTotals, at, list, filter, seen and sci, all in `key` or below
  }, [key, print, size, cardFormat, trimmed, theme, transparent, withLatest, packFor, cardEntries, species, cardLabel, cardGoal, countSize, t, effectiveShowNames, captionPlan, viewImage, treeImage, treeMine, hideTotals, at, list, filter, seen, sci])
  useEffect(() => () => {
    clearTimeout(outgoingTimer.current)
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    if (outgoingUrl.current) URL.revokeObjectURL(outgoingUrl.current)
  }, [])

  // The link module starts loading as soon as the dialog opens (still out of the main bundle).
  const linkModule = useRef<ReturnType<typeof loadLinkModule> | null>(null)
  useEffect(() => {
    const p = loadLinkModule()
    p.catch(() => { if (linkModule.current === p) linkModule.current = null }) // retried on the click
    linkModule.current = p
  }, [])

  // `print` marks a note about the poster, dropped with the poster.
  const [note, setNote] = useState<{ text: string; error?: boolean; print?: boolean } | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const manualRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (manual) manualRef.current?.select() }, [manual])

  // The poster: one make at a time, for `posterKey`. A new key or closing the dialog cancels the make and drops the
  // poster (its encoder ends with it). Export in batches' ZIP is cancelled by a new key too (in Share, `key`: the image's).
  const posterKey = print ? `print|${viewKey}|${arrangement}|${size}|${landscape}|${effectiveShowNames}|${trimmed}|${theme}|${withLatest}|${lang}|${names}|${fk}|${goalKey}|${countSize}|${transparent}` : key
  const [poster, setPoster] = useState<{ key: string; p: Poster } | null>(null)
  const [making, setMaking] = useState<{ key: string; done: number; total: number } | null>(null)
  // Export in batches: closed until its row is pressed (or the names note's "export in batches").
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSplit, setBulkSplit] = useState<BulkSplit>(() => rows.splits[0] ?? 'family')
  // The most birds per poster (or image) when splitting by number of birds: All (one of every bird) or a cap.
  const [bulkSize, setBulkSize] = useState<BulkBatch>('all')
  const [bulkMaking, setBulkMaking] = useState<{ key: string; done: number; total: number } | null>(null)
  const makeCtl = useRef<AbortController | null>(null)
  const bulkCtl = useRef<AbortController | null>(null)
  const posterRef = useRef<Poster | null>(null)
  const posterModule = useRef<Promise<PosterModule> | null>(null)
  const loadPoster = () => {
    const p = import('@/lib/share/poster')
    p.catch(() => { if (posterModule.current === p) posterModule.current = null }) // retried on Make poster
    posterModule.current = p
    return p
  }
  useEffect(() => { if (print && !posterModule.current) loadPoster() }, [print])
  useEffect(() => () => {
    makeCtl.current?.abort()
    makeCtl.current = null
    bulkCtl.current?.abort()
    bulkCtl.current = null
    posterRef.current?.dispose()
    posterRef.current = null
    setPoster(null)
    setMaking(null)
    setBulkMaking(null)
    setNote((n) => (n?.print ? null : n))
  }, [posterKey])
  const posterNow = print && poster?.key === posterKey ? poster.p : null
  const makingNow = print && making?.key === posterKey ? making : null
  const bulkMakingNow = bulkMaking?.key === posterKey ? bulkMaking : null
  // A ZIP in the making keeps its section open, so its Cancel stays in reach.
  const bulkShown = bulkOpen || !!bulkMakingNow
  // Export in batches: for the collage image and the poster (the Map and Tree draw their own subject).
  const bulkOn = rows.bulk
  const bulkList = useMemo(() => {
    if (!bulkOn) return []
    const named = regionsIn(regions, lang)
    return bulkGroups(bulkSplit, cardEntries, {
      species,
      regions: named,
      seen,
      filter: yearGoal !== undefined ? yearFilter(yearGoal, seen) : filter,
      continents: t.places.continents,
      batchLabel: (n) => fmt(pt.bulk.batch, { n: formatInt(n, t.num) }),
      familyLabel: familyName,
      orderLabel: (ord) => t.orders[ord as keyof typeof t.orders] ?? ord,
      locale: HTML_LANG[lang],
      batchSize: bulkSize,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  }, [bulkOn, bulkSplit, bulkSize, cardEntries, species, regions, lang, seen, yearGoal, filter, t, pt.bulk.batch, names])

  // Where focus goes once the button that had it is gone (only if it fell to the page or the dialog itself).
  const goalAddRef = useRef<HTMLButtonElement>(null)
  const goalTargetRef = useRef<HTMLInputElement>(null)
  const makeRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const pngRef = useRef<HTMLButtonElement>(null)
  const bulkPngRef = useRef<HTMLButtonElement>(null)
  const bulkPdfRef = useRef<HTMLButtonElement>(null)
  const bulkCancelRef = useRef<HTMLButtonElement>(null)
  /** The ZIP button that started the make: focus comes back to it when the make ends. */
  const bulkKind = useRef<'png' | 'pdf'>('png')
  const bulkToggleRef = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<'goalAdd' | 'goalTarget' | 'make' | 'cancel' | 'png' | 'bulkPng' | 'bulkPdf' | 'bulkCancel' | null>(null)
  useEffect(() => {
    const want = focusNext.current
    if (!want) return
    focusNext.current = null
    const el = { goalAdd: goalAddRef, goalTarget: goalTargetRef, make: makeRef, cancel: cancelRef, png: pngRef, bulkPng: bulkPngRef, bulkPdf: bulkPdfRef, bulkCancel: bulkCancelRef }[want].current
    const active = document.activeElement
    if (el && (!active || active === document.body || active === ref.current)) el.focus()
  })

  const addGoal = () => {
    setGoalOpen(true)
    // A list with dates starts at its newest year (usually this one); one without starts at All time.
    if (!saved.bigYear) setGoalYear(dated ? (listYears(known, species, seen)[0] ?? 'all') : 'all')
    focusNext.current = 'goalTarget'
  }
  /** The names note's "export in batches": opens Export in batches and takes the reader to it. */
  const openBulk = () => {
    setBulkOpen(true)
    bulkToggleRef.current?.focus()
    bulkToggleRef.current?.scrollIntoView?.({ block: 'nearest' })
  }
  const removeGoal = () => {
    setGoalOpen(false)
    setGoalTarget('')
    setTargetBad(false)
    if (saved.bigYear) dispatch({ type: 'bigYear', bigYear: undefined })
    focusNext.current = 'goalAdd'
  }
  const pickGoalYear = (y: GoalYear) => {
    setGoalYear(y)
    if (validTarget !== undefined) dispatch({ type: 'bigYear', bigYear: goalOf(y, validTarget) })
  }

  const makePoster = async () => {
    makeCtl.current?.abort()
    const ctl = new AbortController()
    makeCtl.current = ctl
    const forKey = posterKey
    setNote({ text: pt.makingNote, print: true }) // announced; replaced when the make ends, cleared on a cancel
    setMaking({ key: forKey, done: 0, total: 0 })
    focusNext.current = 'cancel'
    try {
      const mod = await (posterModule.current ?? loadPoster())
      const progress = (done: number, total: number) => { if (!ctl.signal.aborted) setMaking({ key: forKey, done, total }) }
      const common = { entries: cardEntries, species, filterLabel: cardLabel, goal: cardGoal, name: trimmed || undefined, latest: withLatest, countSize, theme, transparent, strings: t, nameOf: displayName }
      let p: Poster
      if (viewImage) {
        // The Tree or the Map as on screen, drawn at the poster's size (makeViewPoster).
        const render = await viewImage()
        if (ctl.signal.aborted) return
        p = await mod.makeViewPoster(
          { size, landscape, transparent, signal: ctl.signal, render: (scale) => render({ ...common, format: cardFormat, printSize: size, signal: ctl.signal, scale, ...viewOf() }) },
          progress,
        )
      } else {
        const pack = await packFor(landscape ? 'printLandscape' : 'print', !!trimmed, size, countSize, effectiveShowNames && captionPlan?.ok ? captionPlan : null)
        if (ctl.signal.aborted) return
        p = await mod.makePoster({ ...common, size, landscape, showNames: effectiveShowNames, pack, signal: ctl.signal }, progress)
      }
      if (ctl.signal.aborted) { p.dispose(); return }
      makeCtl.current = null
      posterRef.current = p
      setPoster({ key: forKey, p })
      setMaking(null)
      setNote({ text: readyNote(p), print: true })
      focusNext.current = 'png'
      track('poster_made', { size: `${p.size.toLowerCase()}${p.landscape ? '-l' : ''}` as PosterSizeWire })
    } catch (e) {
      if (ctl.signal.aborted || (e as Error)?.name === 'AbortError') return
      const memory = (e as Error)?.message === 'poster-memory'
      if (!memory) console.warn('Everybird poster failed:', e)
      makeCtl.current = null
      setMaking(null)
      setNote({ text: memory ? pt.failedMemory : pt.failed, error: true, print: true })
      focusNext.current = 'make'
    }
  }
  const cancelPoster = () => {
    makeCtl.current?.abort()
    makeCtl.current = null
    setMaking(null)
    setNote((n) => (n?.print ? null : n))
    focusNext.current = 'make'
  }
  const makeBulk = async (kind: 'png' | 'pdf') => {
    if (!bulkList.length) return
    makeCtl.current?.abort()
    makeCtl.current = null
    setMaking(null)
    bulkCtl.current?.abort()
    const ctl = new AbortController()
    bulkCtl.current = ctl
    const forKey = posterKey
    const total = bulkList.length
    setNote({ text: pt.bulk.makingNote, print: true })
    setBulkMaking({ key: forKey, done: 0, total })
    bulkKind.current = kind
    focusNext.current = 'bulkCancel'
    const onProgress = (done: number, count: number) => {
      if (!ctl.signal.aborted) setBulkMaking({ key: forKey, done, total: count })
    }
    try {
      let blob: Blob, file: string, namesDropped = 0
      if (!print) {
        // Share: one PNG per group in the dialog's format, with its options.
        blob = await makeImageZip({
          groups: bulkList,
          species,
          image: {
            format: shape, name: trimmed || undefined, filterLabel: cardLabel, goal: cardGoal, latest: withLatest, countSize, theme, transparent,
            arrangement, strings: t, nameOf: displayName, signal: ctl.signal,
          },
          onProgress,
        })
        file = `everybird-${shape}-groups.zip`
      } else {
        const mod = await (posterModule.current ?? loadPoster())
        if (effectiveShowNames) {
          const sample = bulkList.flatMap((g) => g.entries).map((e) => {
            const r = species.byCode.get(e.code)
            return r ? displayName(r) : ''
          }).join('')
          await ensureCaptionFont(captionMinPx(size), sample)
          if (ctl.signal.aborted) return
        }
        const measure = captionMeasurer()
        const made = await makeBulkZip({
          groups: bulkList,
          kind,
          species,
          poster: {
            size, landscape, showNames: effectiveShowNames, name: trimmed || undefined, filterLabel: cardLabel, goal: cardGoal, latest: withLatest,
            countSize, theme, transparent, strings: t, nameOf: displayName, signal: ctl.signal,
          },
          packSpec: (entries) => bulkPackSpec(entries, {
            size, landscape, named: !!trimmed, countSize, target: cardGoal?.target, showNames: effectiveShowNames, species, nameOf: displayName, measure, arrangement,
          }),
          onProgress,
          deps: { makePoster: mod.makePoster },
        })
        blob = made.blob
        namesDropped = made.namesDropped
        file = `${printFileStem(size, landscape)}-bulk.zip`
      }
      if (ctl.signal.aborted) return
      bulkCtl.current = null
      setBulkMaking(null)
      downloadBlob(blob, file)
      const dropped = namesDropped > 0 ? plural(pt.bulk.namesDropped, namesDropped, { n: formatInt(namesDropped, t.num) }) : ''
      setNote({ text: [plural(print ? pt.bulk.ready : pt.bulk.readyImages, total, { file, n: formatInt(total, t.num) }), dropped].filter(Boolean).join(' '), print: true })
      focusNext.current = kind === 'png' ? 'bulkPng' : 'bulkPdf'
    } catch (e) {
      if (ctl.signal.aborted || (e as Error)?.name === 'AbortError') return
      console.warn('Everybird bulk ZIP failed:', e)
      bulkCtl.current = null
      setBulkMaking(null)
      setNote({ text: pt.bulk.failed, error: true, print: true })
      focusNext.current = kind === 'png' ? 'bulkPng' : 'bulkPdf'
    }
  }
  const cancelBulk = () => {
    bulkCtl.current?.abort()
    bulkCtl.current = null
    setBulkMaking(null)
    setNote((n) => (n?.print ? null : n))
    focusNext.current = bulkKind.current === 'png' ? 'bulkPng' : 'bulkPdf'
  }
  /** Drops the poster on screen (its encoder ends with it). */
  const dropPoster = () => {
    posterRef.current?.dispose()
    posterRef.current = null
    setPoster(null)
  }
  // Make again (shown when some stickers didn't load): a fresh make, which retries them.
  const remake = () => {
    dropPoster()
    void makePoster()
  }
  const savePoster = async (kind: 'png' | 'pdf') => {
    const p = posterNow
    if (!p) return
    const file = `${printFileStem(p.size, p.landscape)}.${kind}`
    let blob: Blob
    try {
      blob = await p.file(kind)
    } catch (e) {
      console.warn('Everybird poster file failed:', e)
      if (posterRef.current !== p) return
      // The poster can't give its files any more: drop it and bring Make poster back.
      dropPoster()
      setNote({ text: (e as Error)?.message === 'poster-memory' ? pt.failedMemory : pt.failed, error: true, print: true })
      focusNext.current = 'make'
      return
    }
    if (posterRef.current !== p) return // dropped while the file was made: never a stale poster
    downloadBlob(blob, file)
    track('poster_downloaded', { format: kind })
    setNote({ text: fmt(t.share.saved, { file }), print: true })
  }

  const fileName = `everybird-${shape}.png`
  /** The newest render's PNG: at hand once it's done (the buttons are disabled before), else waiting for it; null if it failed. */
  const getBlob = async (): Promise<Blob | null> => {
    if (ready.current?.key === key) return ready.current.blob
    for (;;) {
      const p = current.current
      if (!p) return null
      try {
        const b = await p
        if (p === current.current) return b
      } catch {
        if (p === current.current) return null
      }
    }
  }
  const download = async () => {
    const blob = await getBlob()
    if (!blob) return setNote({ text: t.share.imageFailed, error: true })
    downloadBlob(blob, fileName)
    track('image_downloaded', { format: shape })
    setNote({ text: fmt(t.share.saved, { file: fileName }) })
  }
  const share = async () => {
    const blob = await getBlob()
    if (!blob) return setNote({ text: t.share.imageFailed, error: true })
    const file = new File([blob], fileName, { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      try {
        // The image says "Stickers: huashu-bird-sticker, CC BY 4.0"; the post's text carries the full CC BY 4.0 credit and its link.
        await nav.share({ files: [file], title: 'Everybird', text: SHARE_CREDIT })
        track('shared', { via: shape })
        return
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return // the birder closed the share sheet: not shared, nothing sent
        // Any other failure: nothing counted as shared; the download below is counted as a download.
      }
    }
    downloadBlob(blob, fileName)
    track('image_downloaded', { format: shape })
    setNote({ text: fmt(t.share.savedPost, { file: fileName }) })
  }
  const copyLink = async () => {
    setManual(null)
    const mod = (linkModule.current ??= loadLinkModule())
    const linking: Promise<LinkResult> = mod.then((m) => m.makeShareLink(list, regions, trimmed || undefined, window.location.origin))
    // Where the clipboard takes a promised item (Safari, Chromium), hand it over now, inside the click, and let the
    // link arrive later. Otherwise writeText after the (normally already loaded) module, then the manual field.
    let copied: Promise<boolean> = Promise.resolve(false)
    const clip = navigator.clipboard
    if (typeof ClipboardItem === 'function' && typeof clip?.write === 'function') {
      try {
        const item = new ClipboardItem({ 'text/plain': linking.then((l) => new Blob([l.url], { type: 'text/plain' })) })
        copied = clip.write([item]).then(() => true, () => false)
      } catch {
        // An old ClipboardItem that refuses promises: fall through to writeText.
      }
    }
    let link: LinkResult
    try {
      link = await linking
    } catch (e) {
      if ((e as Error)?.name === 'ShareTooLarge') return setNote({ text: t.share.tooLarge, error: true })
      console.warn('Everybird share link failed:', e)
      return setNote({ text: t.share.linkFailed, error: true })
    }
    const { url, level, dropped } = link
    // Counted once the link exists, whether the clipboard takes it or the birder copies it by hand; never in print mode.
    if (!print) track('link_copied', { level })
    // The note's sentences, joined by a space: why the link carries less (a large list), then the birds left out.
    const why = [levelReason(level, t), dropped ? plural(t.share.dropped, dropped, { n: formatInt(dropped, t.num) }) : ''].filter(Boolean)
    let ok = await copied
    if (!ok && typeof clip?.writeText === 'function') ok = await clip.writeText(url).then(() => true, () => false)
    if (ok) return setNote({ text: [t.share.copied, ...why].join(' ') })
    setManual(url)
    setNote({ text: [...why, t.share.copyThis].join(' ') })
  }

  const shownCard: CardFormat = preview?.format ?? cardFormat
  const [w, h] = isPrint(shownCard)
    ? (printDesign(preview?.size ?? size, shownCard === 'printLandscape').map(Math.round) as [number, number])
    : IMAGE_SIZE[shownCard]
  shownSize.current = [w, h]
  const pct = makingNow && makingNow.total > 0 ? Math.round((makingNow.done / makingNow.total) * 100) : 0
  const bulkPct = bulkMakingNow && bulkMakingNow.total > 0 ? Math.round((bulkMakingNow.done / bulkMakingNow.total) * 100) : 0
  const [pxW, pxH] = printPx(size, landscape)
  const [dimW, dimH] = isUsSize(size) ? printIn(size, landscape) : printCm(size, landscape)
  const sizeLine = fmt(isUsSize(size) ? pt.sizeLineIn : pt.sizeLine, { size, w: dimW, h: dimH, pw: pxW, ph: pxH })
  // The box eases to a new format's shape (data-resizing, share.css), but follows a window resize at once.
  const previewBox = useRef<HTMLDivElement>(null)
  const shownFormat = preview && isPrint(preview.format) ? `${preview.format}|${printPackH(preview.size)}` : preview?.format
  const lastShown = useRef(shownFormat)
  // Switching between the side-by-side and the wide layout eases the preview and fades the controls in (share.css).
  useLayoutEffect(() => {
    if (lastWide.current === wideLayout) return
    lastWide.current = wideLayout
    const el = ref.current
    const pv = previewBox.current
    if (el) el.dataset.changing = ''
    if (pv) pv.dataset.resizing = ''
    const t = setTimeout(() => { if (el) delete el.dataset.changing; if (pv) delete pv.dataset.resizing }, PREVIEW_EASE_MS + 60)
    return () => clearTimeout(t)
  }, [wideLayout])
  useLayoutEffect(() => {
    const el = previewBox.current
    const was = lastShown.current
    lastShown.current = shownFormat
    if (!el || !was || was === shownFormat) return
    el.dataset.resizing = ''
    const t = setTimeout(() => { delete el.dataset.resizing }, PREVIEW_EASE_MS + 60)
    return () => clearTimeout(t)
  }, [shownFormat])
  // The actions: the primary slot (Share image; in print mode Make poster, the progress row or
  // Download PNG; each its own key, so a change of state is a new element and the focus moves below run instead of
  // focus staying on a renamed button), then the quiet ones (a row of three).
  const primary: ReactNode = !print ? (
    <button key="share" type="button" className="eb-btn eb-share-primary" disabled={busy} onClick={() => void share()}>
      <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
      {t.share.shareImage}
    </button>
  ) : makingNow ? (
    <div key="progress" className="eb-share-progress eb-share-primary">
      <div
        className="eb-share-bar" role="progressbar" aria-label={pt.making}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
      >
        <span className="eb-share-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="eb-share-pct" aria-hidden="true">{pct}%</span>
      <button ref={cancelRef} type="button" className="eb-btn eb-btn-quiet" onClick={cancelPoster}>{pt.cancel}</button>
    </div>
  ) : posterNow ? (
    <button key="png" ref={pngRef} type="button" className="eb-btn eb-share-primary" onClick={() => void savePoster('png')}>
      <DownloadSimple aria-hidden="true" focusable="false" weight="bold" />
      {pt.png}
    </button>
  ) : (
    <button key="make" ref={makeRef} type="button" className="eb-btn eb-share-primary" disabled={!!bulkMakingNow} onClick={() => void makePoster()}>
      <Printer aria-hidden="true" focusable="false" weight="bold" />
      {pt.make}
    </button>
  )
  const copy: QuietAction = { label: t.share.copyLink, icon: LinkSimple, onClick: () => void copyLink() }
  // Share: Share image over Download and Copy link. Print: the primary and the first quiet one side by side (Make poster
  // and Copy link; once made, Download PNG and Download PDF), the rest (Copy link, Make again) in a row under them.
  const quiet: QuietAction[] = !print
    ? [
        { label: t.share.download, short: t.share.downloadShort, icon: DownloadSimple, disabled: busy, onClick: () => void download() },
        copy,
      ]
    : [
        ...(posterNow && !transparent ? [{ label: pt.pdf, icon: FilePdf, onClick: () => void savePoster('pdf') }] : []),
        copy,
        ...(posterNow && posterNow.missing > 0 ? [{ label: pt.again, icon: ArrowClockwise, onClick: remake }] : []),
      ]
  const [beside, ...under] = print ? quiet : []
  const quietButton = ({ label: text, short, icon: Glyph, onClick, disabled, ref: btnRef }: QuietAction) => {
    const glyph = <Glyph aria-hidden="true" focusable="false" />
    const shorter = short ?? null
    return (
      <button key={text} ref={btnRef} type="button" className="eb-btn eb-btn-quiet" aria-label={shorter ? text : undefined} disabled={disabled} onClick={onClick}>
        {glyph}
        {shorter ?? text}
      </button>
    )
  }
  /** An option row that is a switch: the whole row presses, the label on the left, the track on the right. */
  const switchRow = (on: boolean, text: string, toggle: () => void, testId?: string) => (
    <button key={text} type="button" role="switch" aria-checked={on} className="eb-switch eb-share-switch eb-share-opt" data-testid={testId} onClick={toggle}>
      <span>{text}</span>
      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
    </button>
  )
  /** Two switches in one row of the group, each label beside its own switch, space between them; each on a line of its
   *  own where they don't fit (share.css). One alone is a plain row, its switch at the right as the other rows' controls. */
  const pair = (...items: ReactNode[]) => {
    const shown = items.filter(Boolean)
    return shown.length > 1 ? <div className="eb-share-pair">{shown}</div> : shown[0] ?? null
  }
  const gt = t.share.bigYear
  const perBatch = print ? pt.bulk.perPoster : pt.bulk.perImage
  const namesSwitch = rows.names && (
    <button
      key="names"
      type="button"
      role="switch"
      aria-checked={showNames && namesAvailable}
      disabled={!namesAvailable}
      aria-describedby={namesUnavailableReason ? namesNoteId : undefined}
      className="eb-switch eb-share-switch eb-share-opt"
      data-testid="share-print-names-switch"
      onClick={() => setShowNames((v) => !v)}
    >
      <span>{pt.showNames}</span>
      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
    </button>
  )
  return (
    <div className="eb-share-scrim" data-layout={wideLayout ? 'wide' : 'side'} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        className="eb-share"
        data-mode={print ? 'print' : 'share'}
        data-layout={wideLayout ? 'wide' : 'side'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => trapTab(e, ref.current)}
      >
        <div className="eb-share-head">
          <h2 id={titleId} className="eb-share-title">{print ? pt.title : t.share.title}</h2>
          <button type="button" className="eb-share-close" aria-label={t.collage.close} onClick={onClose}>
            <X aria-hidden="true" focusable="false" weight="bold" />
          </button>
        </div>

        <div className="eb-share-body">
          {/* On top of the controls beside the preview, above the preview on phones (share.css): the format (not in the
              poster) and the orientation on one row, the orientation under the format where the two don't fit. */}
          <div className="eb-share-formats">
            <div className="eb-share-toprow">
              {!print && (
                <div className="eb-seg eb-share-format" role="group" aria-label={t.share.formats}>
                  {FORMATS.map(({ id, hint }) => {
                    // Horizontal, the story is the desktop wallpaper: its name changes, the post keeps its name.
                    const name = landscape && id === 'story' ? t.share.format.desktop : t.share.format[id]
                    return (
                      <button key={id} type="button" className="eb-seg-btn" aria-label={fmt(t.share.formatName, { name, ratio: hint[orientation] })} aria-pressed={format === id} onClick={() => setFormat(id)}>
                        {name}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="eb-seg eb-share-orient" role="group" aria-label={t.share.orientation.group}>
                {ORIENTATIONS.map((o) => (
                  <button key={o} type="button" className="eb-seg-btn" aria-pressed={orientation === o} onClick={() => setOrientation(o)}>
                    {t.share.orientation[o]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* The box takes the shown image's format (share.css), so it changes shape with the image, not before it; it sits
              centred in an area the story's size, so the controls keep their place in every format. */}
          <div
            ref={previewBox} className="eb-share-preview" data-format={shownCard} data-size={isPrint(shownCard) ? (preview?.size ?? size) : undefined}
            aria-busy={busy} data-testid="share-preview" data-transparent={transparent || undefined}
          >
            {outgoing && (
              // The image just replaced, fading out over the frame while it changes shape.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="eb-share-out" src={outgoing.url} width={outgoing.w} height={outgoing.h} alt="" aria-hidden="true" />
            )}
            {preview && (
              // A blob URL of the rendered PNG: next/image has nothing to optimise here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={preview.url} className="eb-share-in" src={preview.url} width={w} height={h}
                alt={isPrint(preview.format) ? fmt(t.share.print.previewAlt, { size: sizeName(preview.size) }) : t.share.preview[preview.format]}
              />
            )}
            {busy && <span className="eb-share-spin" aria-hidden="true" />}
            {failed && !busy && <p className="eb-error eb-share-failed">{t.share.failed}</p>}
          </div>

          <div className="eb-share-controls">
            {/* The options: the title under its label, then one row per option in a bordered group (in the poster the
                size first), two switches to a row where they fit; Export in batches in its own box under the group. */}
            <div className="eb-share-options">
              <div className="eb-share-field">
                <div className="eb-share-labelrow">
                  <label htmlFor={nameId} className="eb-share-label">{t.share.nameLabel}</label>
                  <span id={optionalId} className="eb-share-optional">{t.share.nameOptional}</span>
                </div>
                <input
                  id={nameId}
                  className="eb-share-input"
                  type="text"
                  autoComplete="off"
                  maxLength={NAME_MAX_LEN}
                  placeholder={t.share.namePlaceholder}
                  aria-describedby={`${optionalId} ${helperId}`}
                  value={name}
                  onChange={(e) => { setName(e.target.value); dispatch({ type: 'name', name: e.target.value }) }}
                />
                <p id={helperId} className="eb-sr">{t.share.nameHelper}</p>
              </div>

              <div className="eb-share-opts" data-testid="share-switches">
                {print && (
                  <div className="eb-share-opt">
                    <span className="eb-share-optcol">
                      <span id={sizeId} className="eb-share-optlabel">{pt.size}</span>
                      <span className="eb-share-optnote">{sizeLine}</span>
                    </span>
                    <MenuSelect
                      labelledBy={sizeId} menuLabel={pt.size} escapeRef={menuEsc} testId="share-print-size"
                      options={PRINT_SIZES.map((s) => ({ value: s, label: sizeName(s) }))}
                      value={size} onChange={setSize}
                    />
                  </div>
                )}
                {rows.arrangement && (
                  <div className="eb-share-opt">
                    <span id={arrangeId} className="eb-share-optlabel">{t.share.arrange.label}</span>
                    <div className="eb-seg eb-share-arrange" role="group" aria-labelledby={arrangeId} data-testid="share-arrangement">
                      {/* Two icon buttons, named and titled Fit and Oval: no label to wrap in any language. */}
                      {ARRANGEMENTS.map((a) => {
                        const Glyph = ARRANGE_ICON[a]
                        return (
                          <button key={a} type="button" className="eb-seg-btn" aria-label={t.share.arrange[a]} title={t.share.arrange[a]} aria-pressed={arrangement === a} onClick={() => setArrangement(a)}>
                            <Glyph aria-hidden="true" focusable="false" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {rows.count && (
                  <div className="eb-share-opt">
                    <span id={countSizeId} className="eb-share-optlabel">{t.share.countSize.label}</span>
                    <MenuSelect
                      labelledBy={countSizeId} menuLabel={t.share.countSize.label} escapeRef={menuEsc} testId="share-count-size"
                      options={COUNT_SIZES.map((cs) => ({ value: cs, label: t.share.countSize[cs] }))}
                      value={countSizeChoice} onChange={setCountSize}
                    />
                  </div>
                )}

                {rows.goal && (
                  <div className="eb-share-opt" data-testid="share-goal">
                    <span id={goalId} className="eb-share-optlabel">{gt.label}</span>
                    {!goalOpen ? (
                      <button ref={goalAddRef} type="button" className="eb-textbtn" onClick={addGoal}>{gt.add}</button>
                    ) : (
                      <span className="eb-share-goal" role="group" aria-labelledby={goalId}>
                        <input
                          ref={goalTargetRef}
                          className="eb-input eb-share-num"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={5}
                          placeholder={formatInt(150, t.num)}
                          aria-label={gt.target}
                          value={goalTarget}
                          aria-invalid={targetBad || undefined}
                          aria-describedby={targetBad ? targetNoteId : undefined}
                          onChange={(e) => setGoalTarget(e.target.value)}
                          onBlur={(e) => {
                            // Saved once the box is left. Anything but a whole number from 1 to TARGET_MAX keeps the saved
                            // goal and says why; only a box left empty clears it.
                            const v = e.currentTarget.value.trim()
                            const n = /^\d+$/.test(v) ? Number(v) : undefined
                            if (v !== '' && !isTarget(n)) return setTargetBad(true)
                            setTargetBad(false)
                            if (isTarget(n)) dispatch({ type: 'bigYear', bigYear: goalOf(goalYear, n) })
                            else if (saved.bigYear) dispatch({ type: 'bigYear', bigYear: undefined })
                          }}
                        />
                        <span className="eb-share-goalwords" aria-hidden="true">{gt.speciesIn}</span>
                        <span id={goalYearId} hidden>{gt.year}</span>
                        <MenuSelect<GoalYear>
                          labelledBy={goalYearId} menuLabel={gt.year} escapeRef={menuEsc} testId="share-goal-year"
                          options={[{ value: 'all', label: gt.allTime }, ...years.map((y) => ({ value: y, label: String(y) }))]}
                          value={goalYear} onChange={pickGoalYear}
                        />
                        <button type="button" className="eb-share-goalx" aria-label={gt.remove} onClick={removeGoal}>
                          <X aria-hidden="true" focusable="false" weight="bold" />
                        </button>
                      </span>
                    )}
                  </div>
                )}
                {rows.goal && goalOpen && targetBad && (
                  <p id={targetNoteId} className="eb-note eb-share-names-note">{fmt(gt.targetInvalid, { max: formatInt(TARGET_MAX, t.num) })}</p>
                )}

                {pair(
                  hasLatest && rows.latest && switchRow(showLatest, t.share.showLatest, () => setShowLatest((v) => !v)),
                  namesSwitch,
                )}
                {rows.names && namesUnavailableReason && (
                  <p id={namesNoteId} className="eb-note eb-share-names-note" data-testid="share-print-names-note">
                    {rich(namesUnavailableReason, {
                      batch: (chunk) => <button type="button" className="eb-textbtn eb-share-inline" onClick={openBulk}>{chunk}</button>,
                    })}
                  </p>
                )}
                {pair(
                  rows.lifersOnly && switchRow(treeMine, t.collage.controls.lifersOnly, () => setTreeMine(!treeMine), 'share-tree-mine'),
                  rows.hideTotals && switchRow(hideTotals, t.share.hideTotals, () => setHideTotals((v) => !v), 'share-hide-totals'),
                )}
                {pair(
                  switchRow(dark, t.share.dark, () => setDark((v) => !v), 'share-dark-switch'),
                  switchRow(transparent, t.share.transparent, () => setTransparent((v) => !v), 'share-transparent-switch'),
                )}
              </div>
              {bulkOn && (
                // Export in batches: its own box under the options, its name and a chevron; open, a ZIP of one image
                // (or, in the poster, one poster) per group.
                <div className="eb-share-bulk" data-testid="share-bulk">
                  <button
                    ref={bulkToggleRef} id={bulkToggleId} type="button" className="eb-share-opt eb-share-disclose"
                    aria-expanded={bulkShown} aria-controls={bulkShown ? bulkBodyId : undefined} onClick={() => setBulkOpen((v) => !v)}
                  >
                    <span>{pt.bulk.title}</span>
                    <CaretDown aria-hidden="true" focusable="false" weight="bold" />
                  </button>
                  {bulkShown && (
                    <section id={bulkBodyId} className="eb-share-bulk-body" aria-labelledby={bulkToggleId}>
                      <p className="eb-note">{pt.bulk.lede}</p>
                      <div className="eb-share-bulk-rows">
                        <div className="eb-share-opt">
                          <span id={bulkSplitId} className="eb-share-optlabel">{pt.bulk.splitLabel}</span>
                          <MenuSelect
                            labelledBy={bulkSplitId} menuLabel={pt.bulk.splitLabel} escapeRef={menuEsc} testId="bulk-split"
                            options={rows.splits.map((s) => ({ value: s, label: pt.bulk.splits[s] }))}
                            value={bulkSplit} onChange={setBulkSplit} disabled={!!bulkMakingNow}
                          />
                        </div>
                        {rows.batchSize && bulkSplit === 'batches' && (
                          <div className="eb-share-opt">
                            <span id={bulkSizeId} className="eb-share-optlabel">{perBatch}</span>
                            <MenuSelect<BulkBatch>
                              labelledBy={bulkSizeId} menuLabel={perBatch} escapeRef={menuEsc} testId="bulk-size"
                              options={BULK_BATCHES.map((b) => ({ value: b, label: b === 'all' ? pt.bulk.all : formatInt(b, t.num) }))}
                              value={bulkSize} onChange={setBulkSize} disabled={!!bulkMakingNow}
                            />
                          </div>
                        )}
                      </div>
                      <p className="eb-note eb-share-bulk-count" data-testid="bulk-count" aria-live="polite">
                        {bulkList.length > 0
                          ? plural(print ? pt.bulk.count : pt.bulk.countImages, bulkList.length, { n: formatInt(bulkList.length, t.num) })
                          : pt.bulk.empty}
                      </p>
                      {bulkMakingNow ? (
                        <div className="eb-share-progress" data-testid="bulk-progress">
                          <div
                            className="eb-share-bar" role="progressbar" aria-label={pt.bulk.makingNote}
                            aria-valuemin={0} aria-valuemax={bulkMakingNow.total} aria-valuenow={bulkMakingNow.done}
                          >
                            <span className="eb-share-bar-fill" style={{ width: `${bulkPct}%` }} />
                          </div>
                          <span className="eb-share-pct">
                            {fmt(print ? pt.bulk.progress : pt.bulk.progressImages, {
                              done: formatInt(Math.min(bulkMakingNow.done + 1, bulkMakingNow.total), t.num),
                              total: formatInt(bulkMakingNow.total, t.num),
                            })}
                          </span>
                          <button ref={bulkCancelRef} type="button" className="eb-btn eb-btn-quiet" onClick={cancelBulk}>{pt.cancel}</button>
                        </div>
                      ) : (
                        <div className="eb-share-row">
                          <button
                            ref={bulkPngRef}
                            type="button"
                            className="eb-btn eb-btn-quiet"
                            disabled={bulkList.length === 0 || !!makingNow}
                            onClick={() => void makeBulk('png')}
                          >
                            <DownloadSimple aria-hidden="true" focusable="false" />
                            {pt.bulk.png}
                          </button>
                          {print && !transparent && <button
                            ref={bulkPdfRef}
                            type="button"
                            className="eb-btn eb-btn-quiet"
                            disabled={bulkList.length === 0 || !!makingNow}
                            onClick={() => void makeBulk('pdf')}
                          >
                            <FilePdf aria-hidden="true" focusable="false" />
                            {pt.bulk.pdf}
                          </button>}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}
            </div>

            <div className="eb-share-actions">
              {print ? (
                <>
                  <div className="eb-share-duo">{primary}{beside && quietButton(beside)}</div>
                  {under.length > 0 && <div className="eb-share-row">{under.map(quietButton)}</div>}
                </>
              ) : (
                <>
                  {primary}
                  <div className="eb-share-row">{quiet.map(quietButton)}</div>
                </>
              )}
            </div>

            <p className={note?.error ? 'eb-error' : 'eb-note'} role="status" data-testid="share-note">{note?.text ?? ''}</p>
            {manual && (
              <input ref={manualRef} className="eb-share-input" type="text" readOnly value={manual} aria-label={t.share.linkField} onFocus={(e) => e.currentTarget.select()} />
            )}
            {fk && yearGoal === undefined && (
              <div className="eb-note eb-share-filters" data-testid="share-filters">
                <span>{label ? fmt(t.share.filters, { label }) : t.share.filtersNoLabel}</span>
                <button type="button" className="eb-textbtn" onClick={() => dispatch({ type: 'filter', filter: {} })}>{t.share.clearFilters}</button>
              </div>
            )}
            {/* Buy Me a Coffee's standard static button, self-hosted as on About (no script, nothing from their servers),
                at 32px tall in the column's bottom right corner; never on the images. */}
            <a className="eb-share-coffee" href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
              {/* A fixed static image: next/image has nothing to optimise here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/buy-me-a-coffee.png" width={114} height={32} alt={t.shell.footer.coffee} />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
