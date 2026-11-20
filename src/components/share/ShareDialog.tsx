'use client'
// The share dialog: story, post or square image with a live preview (a Vertical | Horizontal switch above the format control
// swaps the formats: Story, Post, Square, or Desktop, Post (5:4), Square, and the landscape poster), the image options (the optional collage title,
// Saved.name verbatim, and the "Show latest lifer" switch, on at every open; off gives the row's room to the collage),
// four actions (Share image: the system share sheet when it takes files, else a download; Download image; Copy link;
// Print a poster) and last, in the bottom right corner, Buy Me a Coffee's static button (self-hosted, never on the images).
// The link encoder (and its ~111 KB species index) is a separate chunk, fetched when the dialog opens, so a Copy link
// click awaits nothing slow (iOS drops the clipboard permission once a click handler waits on the network).
// Share image and Download wait for the current render: they're disabled while it's busy, so a click has the PNG at hand.
// Every word is the UI language's (ui.share), the image's and the poster's too; the credit line, the share text
// (SHARE_CREDIT), the download names and the link stay the same in every language (a link carries no language).
// The "Dark image" switch (starts at the app's theme, then the dialog's own) sets the look of the share images and the
// poster alike. Print mode makes an A4 to A1 or a 12 × 18, 18 × 24 or 24 × 36 in poster (A2 to start): the preview is the poster's 1080-wide image, "Make poster" runs
// makePoster (its chunk is fetched when print mode opens) with progress and Cancel, then Download PNG and Download PDF
// serve the one encode. Changing the size, title or either switch, leaving print mode or closing the dialog cancels a make and
// drops a finished poster. Counted: poster_made (by size) when a make finishes, poster_downloaded (png|pdf) when a file is saved; link_copied isn't. "Share images" in the format control's place goes back.
// The actions: Share image over a row of three quiet buttons. Print mode keeps the same pattern.
import {
  ArrowClockwise, ArrowLeft, CaretDown, DeviceMobile, DownloadSimple, FilePdf, FrameCorners, LinkSimple, Monitor, Printer, ShareNetwork, Square, X, type Icon,
} from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { trapTab, useEscapeCapture, useFocusInAndBack, useHoldTopBar } from '@/components/dialog-utils'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { HTML_LANG } from '@/i18n/langs'
import { useI18n } from '@/i18n/I18nProvider'
import { countryName, regionsIn } from '@/lib/i18n-places'
import { track, type PosterSizeWire } from '@/lib/analytics'
import { currentTheme, type Theme } from '@/lib/theme'
import { useLiferMarks } from '@/lib/lifer-marks'
import { useArrangement } from '@/lib/arrangement'
import { COFFEE_URL } from '@/lib/site-meta'
import { downloadBlob } from '@/lib/download'
import { bulkGroups, bulkPackSpec, makeBulkZip, type BulkSplit } from '@/lib/share/bulk'
import type { Poster } from '@/lib/share/poster'
import { CAPTION_CAPS, PRINT_IN, PRINT_SIZES, captionMinPx, isUsSize, printCm, printDesign, printFileStem, printIn, printPackH, printPx, type PrintSize } from '@/lib/share/print'
import { planCaptions, type CaptionPlan } from '@/lib/share/captions'
import { goalBasis, goalYears, hasDates, isTarget, TARGET_MAX, yearFilter, yearList } from '@/lib/list/big-year'
import { applyFilter, filterKey } from '@/lib/list/filters'
import { groupName } from '@/lib/search/groups'
import type { Action, AppState } from '@/lib/list/store'
import {
  NAME_MAX_LEN, SHARE_CREDIT, abortError, IMAGE_SIZE, captionMeasurer, cardLayout, clearStickerCache, ensureCaptionFont, filterLabel as labelFor, fitCaptionPack, imagePackSpec, imageShape, isPrint, markedCodesOf, packForImage, renderShareImage,
  type CardFormat, type CountSize, type FormatSlot, type ImagePack, type Orientation,
} from '@/lib/share/image'
import type { ShareLevel } from '@/lib/share/link'
import type { makeShareLink as MakeShareLink } from '@/lib/share/make-link'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { Regions } from '@/lib/species/types'
import type { ViewKind } from '@/lib/view-resume'
import '@/components/app/app.css'
import '@/components/collage/collage.css'
import './share.css'

/** How long the preview's frame eases to a new shape and the images cross-fade (share.css, as the photo lightbox). */
const PREVIEW_EASE_MS = 420

/** `view`: the view Share was pressed in. Every view shares the birds on screen (the filter applied). */
type Props = { state: AppState; dispatch: (a: Action) => void; species: SpeciesIndex; regions: Regions; view?: ViewKind; onClose: () => void }

/** The one place a view supplies its own image (the map's and the tree's are a later task): unset, a view shares the
 *  collage image of the birds on screen. */
const VIEW_IMAGE: Partial<Record<ViewKind, typeof renderShareImage>> = {}

const RENDER_DELAY_MS = 250
/** The format buttons: each slot's ratio and icon in each orientation (the square is square in both). */
const FORMATS: { id: FormatSlot; hint: Record<Orientation, string>; icon: Record<Orientation, Icon> }[] = [
  { id: 'story', hint: { vertical: '9:16', horizontal: '16:9' }, icon: { vertical: DeviceMobile, horizontal: Monitor } },
  { id: 'post', hint: { vertical: '4:5', horizontal: '5:4' }, icon: { vertical: FrameCorners, horizontal: FrameCorners } },
  { id: 'square', hint: { vertical: '1:1', horizontal: '1:1' }, icon: { vertical: Square, horizontal: Square } },
]
const ORIENTATIONS: Orientation[] = ['vertical', 'horizontal']
const COUNT_SIZES: CountSize[] = ['small', 'medium', 'large', 'hide']
const BULK_SPLITS: BulkSplit[] = ['batches', 'family', 'order', 'country', 'continent', 'province', 'year']
type LinkResult = ReturnType<typeof MakeShareLink>
const loadLinkModule = () => import('@/lib/share/make-link')
type PosterModule = typeof import('@/lib/share/poster')

/** A quiet action: a full label (its accessible name), a shorter one for the row, an icon. */
type QuietAction = { label: string; short?: string; icon: Icon; onClick: () => void; disabled?: boolean; ref?: RefObject<HTMLButtonElement | null> }

/** Why a link carries less than the regions (a large list), or nothing for a full link. */
const levelReason = (level: ShareLevel, t: ReturnType<typeof useI18n>['t']) => (level === 'regions' ? '' : t.share.level[level])

export default function ShareDialog({ state, dispatch, species, regions, view, onClose }: Props) {
  const renderImage = (view && VIEW_IMAGE[view]) || renderShareImage
  const names = useNames()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const nameId = useId()
  const optionalId = useId()
  const countSizeId = useId()
  const yearId = useId()
  const targetId = useId()
  const targetNoteId = useId()
  const bulkSplitId = useId()
  const namesNoteId = useId()
  useEscapeCapture(onClose)
  useFocusInAndBack(ref)
  useHoldTopBar()
  const { lang, t } = useI18n()
  const pt = t.share.print
  const sizeName = (s: PrintSize) => (isUsSize(s) ? fmt(pt.inches, { w: PRINT_IN[s][0], h: PRINT_IN[s][1] }) : s)
  /** After a make: ready, then (when some did) the soft stickers, then the ones that didn't load. */
  const readyNote = (p: Poster) =>
    [fmt(pt.ready, { size: sizeName(p.size) }), p.namesDropped ? pt.namesDropped : '', p.soft > 0 ? pt.soft : '', p.missing > 0 ? plural(pt.missing, p.missing, { n: formatInt(p.missing, t.num) }) : ''].filter(Boolean).join(' ')

  const { list, filter, saved, seen } = state
  const [format, setFormat] = useState<FormatSlot>('story')
  // The orientation flips every format at once (Square stays square; its switch is off). It holds while the dialog is open.
  const [orientation, setOrientation] = useState<Orientation>('vertical')
  const landscape = orientation === 'horizontal'
  /** The share image's shape: the slot in this orientation (story is desktop, post is wide when horizontal). */
  const shape = imageShape(format, orientation)
  const [mode, setMode] = useState<'share' | 'print'>('share')
  const [size, setSize] = useState<PrintSize>('A2')
  const print = mode === 'print'
  // Square is the same in both orientations (its image doesn't change; the dialog keeps its narrow layout for it).
  const squareShare = !print && format === 'square'
  // Horizontal (a desktop or wide image, or a landscape poster) lays out wide: the dialog widens and the preview takes
  // the width left beside the controls' column (share.css, data-layout). Vertical keeps its narrower dialog.
  const wideLayout = landscape && !squareShare
  const lastWide = useRef(wideLayout)
  const [name, setName] = useState(saved.name ?? '') // starts from Settings > Name your collage
  const [countSize, setCountSize] = useState<CountSize>('medium')
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
  const showBigYear = useMemo(() => hasDates(known, seen), [known, seen])
  const years = useMemo(() => {
    const ys = goalYears(known)
    const sy = saved.bigYear?.year
    if (sy && !ys.includes(sy)) ys.push(sy)
    return ys.sort((a, b) => b - a)
  }, [known, saved.bigYear?.year])
  const [bigYearOn, setBigYearOn] = useState(false)
  const [goalYear, setGoalYear] = useState(() => saved.bigYear?.year ?? new Date().getFullYear())
  const [goalTarget, setGoalTarget] = useState(() => (saved.bigYear ? String(saved.bigYear.target) : ''))
  /** The target field was left holding something that isn't a whole number from 1 to TARGET_MAX (the saved goal stays). */
  const [targetBad, setTargetBad] = useState(false)
  const parsedTarget = /^\d+$/.test(goalTarget.trim()) ? Number(goalTarget.trim()) : undefined
  const validTarget = isTarget(parsedTarget) ? parsedTarget : undefined
  const bigYearActive = bigYearOn && showBigYear
  const cardEntries = useMemo(() => (bigYearActive ? yearList(known, goalYear, species, seen) : shown), [bigYearActive, known, goalYear, species, seen, shown])
  const cardGoal = useMemo(() => (bigYearActive ? { year: goalYear, target: validTarget, basis: goalBasis(seen) } : undefined), [bigYearActive, goalYear, validTarget, seen])
  const cardLabel = bigYearActive ? undefined : label
  const hasLatest = useMemo(() => cardEntries.some((e) => e.date), [cardEntries])
  const withLatest = hasLatest && showLatest
  const liferMarks = useLiferMarks()
  // The collage's arrangement (Packed, By family, By colour): the images and the poster are packed the same way.
  const arrangement = useArrangement()
  const cardFormat: CardFormat = print ? (landscape ? 'printLandscape' : 'print') : shape
  const trimmed = name.trim()
  const hasTitle = !!trimmed
  const hasFilter = !!(cardLabel || cardGoal)
  const goalKey = cardGoal ? `by:${cardGoal.year}:${cardGoal.target ?? ''}:${cardGoal.basis}` : ''
  const overCap = cardEntries.length > CAPTION_CAPS[size]
  const markedCodes = useMemo(
    () => markedCodesOf(cardEntries, species, { newest: liferMarks.newest, first: liferMarks.first }),
    [cardEntries, species, liferMarks.newest, liferMarks.first],
  )
  useEffect(() => {
    if (!print || overCap || typeof document === 'undefined' || !document.fonts) return
    let live = true
    const sample = cardEntries.map((e) => {
      const r = species.byCode.get(e.code)
      return r ? displayName(r) : ''
    }).join('')
    void ensureCaptionFont(captionMinPx(size), sample).then(() => {
      if (live) setFontsTick((n) => n + 1)
    })
    return () => { live = false }
  }, [print, overCap, size, cardEntries, species, lang, names])
  const captionPlan = useMemo(() => {
    if (!print || overCap) return null
    const L = cardLayout(cardFormat, { name: hasTitle, filter: hasFilter, latest: true, count: cardEntries.length, target: cardGoal?.target, countSize }, printDesign(size, landscape))
    return planCaptions(cardEntries, species, size, L.collage.w, displayName, captionMeasurer(), markedCodes)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names`, `lang`, `fontsTick` trigger recheck for `displayName` and loaded Satoshi metrics
  }, [print, overCap, cardFormat, hasTitle, hasFilter, cardEntries, cardGoal?.target, countSize, size, landscape, species, names, lang, markedCodes, fontsTick])
  const namesCheckKey = `${cardFormat}|${size}|${hasTitle}|${hasFilter}|${cardEntries.length}|${cardGoal?.target ?? ''}|${countSize}|${liferMarks.newest}|${liferMarks.first}|${lang}|${names}|${fk}|${goalKey}|${fontsTick}`
  const namesFitFailed = namesFitFailKey === namesCheckKey
  const namesAvailable = !overCap && !!captionPlan?.ok && !namesFitFailed
  const effectiveShowNames = print && showNames && namesAvailable
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
    if (!print || overCap || !captionPlan?.ok) return
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
        size, captionPlan, markedCodes,
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
  }, [print, overCap, captionPlan, namesCheckKey, packFor, cardFormat, hasTitle, size, countSize, cardEntries, hasFilter, cardGoal?.target, markedCodes])

  // The image: re-rendered (debounced) when the format, name, theme or the latest lifer switch changes. `current` is the newest render;
  // a render superseded before it starts rejects with an AbortError. In print mode it is the poster's preview (the
  // size instead of the format).
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
  const key = `${print ? `print|${size}|${landscape}|${effectiveShowNames}` : shape}|${trimmed}|${theme}|${withLatest}|${liferMarks.newest}|${liferMarks.first}|${lang}|${names}|${fk}|${goalKey}|${countSize}|${transparent}`
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
      .then(() => packFor(cardFormat, !!trimmed, size, countSize, effectiveShowNames && captionPlan?.ok ? captionPlan : null))
      .then((pack) => renderImage({
        format: cardFormat, ...(print ? { printSize: size, showNames: effectiveShowNames } : {}), entries: cardEntries, species, filterLabel: cardLabel, goal: cardGoal, name: trimmed || undefined,
        theme, transparent, pack, latest: withLatest, markNewest: liferMarks.newest, markFirst: liferMarks.first, countSize, strings: t, nameOf: displayName, signal: life.current?.signal,
      }))
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
  }, [key, print, size, cardFormat, trimmed, theme, transparent, withLatest, liferMarks.newest, liferMarks.first, packFor, cardEntries, species, cardLabel, cardGoal, countSize, t, effectiveShowNames, captionPlan, renderImage])
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

  // The poster: one make at a time, for `posterKey`. A new key, leaving print mode or closing the dialog cancels the
  // make and drops the poster (its encoder ends with it).
  const posterKey = `print|${size}|${landscape}|${effectiveShowNames}|${trimmed}|${theme}|${withLatest}|${liferMarks.newest}|${liferMarks.first}|${lang}|${names}|${fk}|${goalKey}|${countSize}|${transparent}`
  const [poster, setPoster] = useState<{ key: string; p: Poster } | null>(null)
  const [making, setMaking] = useState<{ key: string; done: number; total: number } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSplit, setBulkSplit] = useState<BulkSplit>('batches')
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
  }, [posterKey, print])
  const posterNow = print && poster?.key === posterKey ? poster.p : null
  const makingNow = print && making?.key === posterKey ? making : null
  const bulkMakingNow = print && bulkMaking?.key === posterKey ? bulkMaking : null
  const bulkList = useMemo(() => {
    if (!print || !bulkOpen) return []
    const named = regionsIn(regions, lang)
    return bulkGroups(bulkSplit, cardEntries, {
      species,
      regions: named,
      seen,
      filter: bigYearActive ? yearFilter(goalYear, seen) : filter,
      continents: t.places.continents,
      batchLabel: (n) => fmt(pt.bulk.batch, { n: formatInt(n, t.num) }),
      familyLabel: familyName,
      orderLabel: (ord) => t.orders[ord as keyof typeof t.orders] ?? ord,
      locale: HTML_LANG[lang],
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  }, [print, bulkOpen, bulkSplit, cardEntries, species, regions, lang, seen, bigYearActive, goalYear, filter, t, pt.bulk.batch, names])

  // Where focus goes once the button that had it is gone (only if it fell to the page or the dialog itself).
  const backRef = useRef<HTMLButtonElement>(null)
  const entryRef = useRef<HTMLButtonElement>(null)
  const makeRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const pngRef = useRef<HTMLButtonElement>(null)
  const bulkPngRef = useRef<HTMLButtonElement>(null)
  const bulkPdfRef = useRef<HTMLButtonElement>(null)
  const bulkCancelRef = useRef<HTMLButtonElement>(null)
  /** The ZIP button that started the make: focus comes back to it when the make ends. */
  const bulkKind = useRef<'png' | 'pdf'>('png')
  const focusNext = useRef<'back' | 'entry' | 'make' | 'cancel' | 'png' | 'bulkPng' | 'bulkPdf' | 'bulkCancel' | null>(null)
  useEffect(() => {
    const want = focusNext.current
    if (!want) return
    focusNext.current = null
    const el = { back: backRef, entry: entryRef, make: makeRef, cancel: cancelRef, png: pngRef, bulkPng: bulkPngRef, bulkPdf: bulkPdfRef, bulkCancel: bulkCancelRef }[want].current
    const active = document.activeElement
    if (el && (!active || active === document.body || active === ref.current)) el.focus()
  })

  const switchMode = (m: 'share' | 'print') => {
    if (m === mode) return
    setMode(m)
    setNote(null)
    focusNext.current = m === 'print' ? 'back' : 'entry'
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
      const pack = await packFor(landscape ? 'printLandscape' : 'print', !!trimmed, size, countSize, effectiveShowNames && captionPlan?.ok ? captionPlan : null)
      if (ctl.signal.aborted) return
      const p = await mod.makePoster(
        { size, landscape, showNames: effectiveShowNames, entries: cardEntries, species, filterLabel: cardLabel, goal: cardGoal, name: trimmed || undefined, pack, latest: withLatest, markNewest: liferMarks.newest, markFirst: liferMarks.first, countSize, theme, transparent, strings: t, nameOf: displayName, signal: ctl.signal },
        (done, total) => { if (!ctl.signal.aborted) setMaking({ key: forKey, done, total }) },
      )
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
    try {
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
      const { blob, namesDropped } = await makeBulkZip({
        groups: bulkList,
        kind,
        species,
        poster: {
          size,
          landscape,
          showNames: effectiveShowNames,
          name: trimmed || undefined,
          filterLabel: cardLabel,
          goal: cardGoal,
          latest: withLatest,
          markNewest: liferMarks.newest,
          markFirst: liferMarks.first,
          countSize,
          theme,
          transparent,
          strings: t,
          nameOf: displayName,
          signal: ctl.signal,
        },
        packSpec: (entries) => bulkPackSpec(entries, {
          size, landscape, named: !!trimmed, countSize, target: cardGoal?.target, showNames: effectiveShowNames, species, nameOf: displayName, measure,
          marks: { newest: liferMarks.newest, first: liferMarks.first }, arrangement,
        }),
        onProgress: (done, count) => {
          if (!ctl.signal.aborted) setBulkMaking({ key: forKey, done, total: count })
        },
        deps: { makePoster: mod.makePoster },
      })
      if (ctl.signal.aborted) return
      bulkCtl.current = null
      setBulkMaking(null)
      const file = `${printFileStem(size, landscape)}-bulk.zip`
      downloadBlob(blob, file)
      const dropped = namesDropped > 0 ? plural(pt.bulk.namesDropped, namesDropped, { n: formatInt(namesDropped, t.num) }) : ''
      setNote({ text: [plural(pt.bulk.ready, total, { file, n: formatInt(total, t.num) }), dropped].filter(Boolean).join(' '), print: true })
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
        // The image says "stickers by huashu"; the post's text carries the full CC BY 4.0 credit and its link.
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
  const quiet: QuietAction[] = !print
    ? [
        { label: t.share.download, short: t.share.downloadShort, icon: DownloadSimple, disabled: busy, onClick: () => void download() },
        copy,
        { label: pt.entry, short: pt.print, icon: Printer, ref: entryRef, onClick: () => switchMode('print') },
      ]
    : [
        ...(posterNow && !transparent ? [{ label: pt.pdf, icon: FilePdf, onClick: () => void savePoster('pdf') }] : []),
        copy,
        ...(posterNow && posterNow.missing > 0 ? [{ label: pt.again, icon: ArrowClockwise, onClick: remake }] : []),
      ]
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
  return (
    <div className="eb-share-scrim" data-layout={wideLayout ? 'wide' : 'side'} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        className="eb-share"
        data-mode={mode}
        data-layout={wideLayout ? 'wide' : 'side'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => trapTab(e, ref.current)}
      >
        <div className="eb-share-head">
          <h2 id={titleId} className="eb-share-title">{t.share.title}</h2>
          <button type="button" className="eb-share-close" aria-label={t.collage.close} onClick={onClose}>
            <X aria-hidden="true" focusable="false" weight="bold" />
          </button>
        </div>

        <div className="eb-share-body">
          {/* Its own column on top of the controls beside the preview; above the preview on phones (share.css). In print
              mode the way back to the share images takes its place. */}
          <div className="eb-share-formats">
            {print ? (
              <button ref={backRef} type="button" className="eb-btn eb-btn-quiet" onClick={() => switchMode('share')}>
                <ArrowLeft aria-hidden="true" focusable="false" />
                {t.share.print.back}
              </button>
            ) : null}
            <div className="eb-seg eb-share-orient" role="group" aria-label={t.share.orientation.group}>
              {ORIENTATIONS.map((o) => (
                <button
                  key={o} type="button" className="eb-seg-btn" aria-pressed={orientation === o}
                  onClick={() => setOrientation(o)}
                >
                  {t.share.orientation[o]}
                </button>
              ))}
            </div>
            {!print && (
              <div className="eb-seg" role="group" aria-label={t.share.formats}>
                {FORMATS.map(({ id, hint, icon }) => {
                  // Horizontal, the story is the desktop wallpaper: its name and icon change, the post keeps its name.
                  const name = landscape && id === 'story' ? t.share.format.desktop : t.share.format[id]
                  const Glyph = icon[orientation]
                  return (
                    <button key={id} type="button" className="eb-seg-btn" aria-label={hint[orientation] ? fmt(t.share.formatName, { name, ratio: hint[orientation] }) : name} aria-pressed={format === id} onClick={() => setFormat(id)}>
                      <Glyph aria-hidden="true" focusable="false" />
                      <span className="eb-seg-text">
                        <span className="eb-seg-label">{name}</span>
                        {hint[orientation] && <span className="eb-share-hint">{hint[orientation]}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
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
            {/* The image options: in print mode the size first, then the title and the two switches. */}
            <div className="eb-share-options">
              {print && (
                <div className="eb-share-field">
                  <div className="eb-seg eb-share-sizes" role="group" aria-label={t.share.print.size}>
                    {PRINT_SIZES.map((s, i) => [
                      isUsSize(s) && !isUsSize(PRINT_SIZES[i - 1]) && <span key="us" className="eb-share-sizes-break" aria-hidden="true" />,
                      <button key={s} type="button" className="eb-seg-btn" aria-pressed={size === s} onClick={() => setSize(s)}>
                        <span className="eb-seg-label">{sizeName(s)}</span>
                      </button>,
                    ])}
                  </div>
                  <p className="eb-note">{sizeLine}</p>
                </div>
              )}

              <div className="eb-share-box">
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
                    aria-describedby={optionalId}
                    value={name}
                    onChange={(e) => setName(e.target.value)} // this share only: Settings > Name your collage stays as it is
                  />
                </div>

                <div className="eb-share-switches" data-testid="share-switches">
                  {hasLatest && (
                    <button type="button" role="switch" aria-checked={showLatest} className="eb-switch eb-share-switch" onClick={() => setShowLatest((v) => !v)}>
                      <span>{t.share.showLatest}</span>
                      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
                    </button>
                  )}

                  <button type="button" role="switch" aria-checked={dark} className="eb-switch eb-share-switch" onClick={() => setDark((v) => !v)}>
                    <span>{t.share.dark}</span>
                    <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
                  </button>

                  <button type="button" role="switch" aria-checked={transparent} className="eb-switch eb-share-switch" data-testid="share-transparent-switch" onClick={() => setTransparent((v) => !v)}>
                    <span>{t.share.transparent}</span>
                    <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
                  </button>

                  {showBigYear && (
                    <button type="button" role="switch" aria-checked={bigYearOn} className="eb-switch eb-share-switch" data-testid="share-big-year-switch" onClick={() => setBigYearOn((v) => !v)}>
                      <span>{t.share.bigYear.label}</span>
                      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
                    </button>
                  )}

                  {print && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showNames && namesAvailable}
                      disabled={!namesAvailable}
                      aria-describedby={namesUnavailableReason ? namesNoteId : undefined}
                      className="eb-switch eb-share-switch"
                      data-testid="share-print-names-switch"
                      onClick={() => setShowNames((v) => !v)}
                    >
                      <span>{pt.showNames}</span>
                      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
                    </button>
                  )}
                </div>

                {print && namesUnavailableReason && (
                  <p id={namesNoteId} className="eb-note eb-share-names-note" data-testid="share-print-names-note">{namesUnavailableReason}</p>
                )}

                <div className="eb-share-field">
                  <span id={countSizeId} className="eb-share-label">{t.share.countSize.label}</span>
                  <div className="eb-seg eb-share-count-size" role="group" aria-labelledby={countSizeId} data-testid="share-count-size">
                    {COUNT_SIZES.map((cs) => (
                      <button
                        key={cs}
                        type="button"
                        className="eb-seg-btn"
                        aria-pressed={countSize === cs}
                        onClick={() => setCountSize(cs)}
                      >
                        <span className="eb-seg-label">{t.share.countSize[cs]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {bigYearActive && (
                  <div className="eb-share-goal" data-testid="share-big-year-fields">
                    <div className="eb-share-field">
                      <label htmlFor={yearId} className="eb-share-label">{t.share.bigYear.year}</label>
                      <select
                        id={yearId}
                        className="eb-share-input"
                        value={goalYear}
                        onChange={(e) => {
                          const y = Number(e.target.value)
                          setGoalYear(y)
                          if (validTarget !== undefined) dispatch({ type: 'bigYear', bigYear: { year: y, target: validTarget } })
                        }}
                      >
                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="eb-share-field">
                      <label htmlFor={targetId} className="eb-share-label">{t.share.bigYear.target}</label>
                      <input
                        id={targetId}
                        className="eb-share-input"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={TARGET_MAX}
                        step={1}
                        placeholder={t.share.bigYear.targetPlaceholder}
                        value={goalTarget}
                        aria-invalid={targetBad || undefined}
                        aria-describedby={targetBad ? targetNoteId : undefined}
                        onChange={(e) => setGoalTarget(e.target.value)}
                        onBlur={(e) => {
                          // Saved once the field is left. A number field reads "" for "-" or "1e" (badInput): that keeps the
                          // saved goal, as 0, negatives and values over TARGET_MAX do; only a field left empty clears it.
                          const v = e.currentTarget.value.trim()
                          const n = /^\d+$/.test(v) ? Number(v) : undefined
                          if (e.currentTarget.validity?.badInput || (v !== '' && !isTarget(n))) return setTargetBad(true)
                          setTargetBad(false)
                          if (isTarget(n)) dispatch({ type: 'bigYear', bigYear: { year: goalYear, target: n } })
                          else if (saved.bigYear) dispatch({ type: 'bigYear', bigYear: undefined })
                        }}
                      />
                    </div>
                  </div>
                )}
                {bigYearActive && targetBad && (
                  <p id={targetNoteId} className="eb-note eb-share-names-note">{fmt(t.share.bigYear.targetInvalid, { max: formatInt(TARGET_MAX, t.num) })}</p>
                )}
              </div>
            </div>

            <div className="eb-share-actions">
              {primary}
              <div className="eb-share-row">{quiet.map(quietButton)}</div>
            </div>

            {print && (
              <div className="eb-share-bulk" data-testid="share-bulk">
                <button
                  type="button"
                  className="eb-share-bulk-toggle"
                  aria-expanded={bulkOpen}
                  onClick={() => setBulkOpen((v) => !v)}
                >
                  <span>{pt.bulk.title}</span>
                  <CaretDown aria-hidden="true" focusable="false" className="eb-share-bulk-caret" />
                </button>
                {bulkOpen && (
                  <div className="eb-share-bulk-body">
                    <div className="eb-share-field">
                      <label htmlFor={bulkSplitId} className="eb-share-label">{pt.bulk.splitLabel}</label>
                      <select
                        id={bulkSplitId}
                        className="eb-share-input"
                        value={bulkSplit}
                        disabled={!!bulkMakingNow}
                        onChange={(e) => setBulkSplit(e.target.value as BulkSplit)}
                      >
                        {BULK_SPLITS.map((s) => (
                          <option key={s} value={s}>{pt.bulk.splits[s]}</option>
                        ))}
                      </select>
                    </div>
                    <p className="eb-note" data-testid="bulk-count">
                      {bulkList.length > 0
                        ? plural(pt.bulk.count, bulkList.length, { n: formatInt(bulkList.length, t.num) })
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
                          {fmt(pt.bulk.progress, {
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
                        {!transparent && <button
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
                  </div>
                )}
              </div>
            )}

            <p className={note?.error ? 'eb-error' : 'eb-note'} role="status" data-testid="share-note">{note?.text ?? ''}</p>
            {manual && (
              <input ref={manualRef} className="eb-share-input" type="text" readOnly value={manual} aria-label={t.share.linkField} onFocus={(e) => e.currentTarget.select()} />
            )}
            {fk && !bigYearActive && (
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
