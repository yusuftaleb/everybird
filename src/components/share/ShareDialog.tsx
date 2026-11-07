'use client'
// The share dialog: story, post or square image with a live preview, Share image (the system share sheet when it takes
// files, else a download), Download image, Copy link and the optional collage title (Saved.name, verbatim).
// The link encoder (and its ~111 KB species index) is a separate chunk, fetched when the dialog opens, so a Copy link
// click awaits nothing slow (iOS drops the clipboard permission once a click handler waits on the network).
// Share image and Download wait for the current render: they're disabled while it's busy, so a click has the PNG at hand.
import { DeviceMobile, DownloadSimple, FrameCorners, LinkSimple, ShareNetwork, Square, X, type Icon } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { trapTab, useEscapeCapture, useFocusInAndBack, useHoldTopBar } from '@/components/dialog-utils'
import { track } from '@/lib/analytics'
import { currentTheme, subscribeTheme, type Theme } from '@/lib/theme'
import { downloadBlob } from '@/lib/download'
import { stripBracket } from '@/lib/import/places'
import { applyFilter, filterKey } from '@/lib/list/filters'
import type { Action, AppState } from '@/lib/list/store'
import {
  IMAGE_SIZE, NAME_MAX_LEN, SHARE_CREDIT, abortError, clearStickerCache, filterLabel as labelFor, imagePackSpec, packForImage, renderShareImage, type ImageFormat, type ImagePack,
} from '@/lib/share/image'
import type { ShareLevel } from '@/lib/share/link'
import type { makeShareLink as MakeShareLink } from '@/lib/share/make-link'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import '@/components/app/app.css'
import './share.css'

type Props = { state: AppState; dispatch: (a: Action) => void; species: SpeciesIndex; regions: Regions; onClose: () => void }

const RENDER_DELAY_MS = 250
const FORMATS: { id: ImageFormat; label: string; hint: string; icon: Icon }[] = [
  { id: 'story', label: 'Story', hint: '9:16', icon: DeviceMobile },
  { id: 'post', label: 'Post', hint: '4:5', icon: FrameCorners },
  { id: 'square', label: 'Square', hint: '1:1', icon: Square },
]
type LinkResult = ReturnType<typeof MakeShareLink>
const loadLinkModule = () => import('@/lib/share/make-link')

const LEVEL_NOTE: Record<ShareLevel, string> = {
  regions: 'Link copied.',
  countries: 'Link copied. Your list is large, so the link carries countries instead of regions.',
  dates: 'Link copied. Your list is large, so the link carries dates but no places.',
  species: 'Link copied. Your list is large, so the link carries the species only, without dates or places.',
}

/** The page's current theme (light unless the visitor switched to dark): the image follows it. */
function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, currentTheme, () => 'light' as const)
}

export default function ShareDialog({ state, species, regions, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const nameId = useId()
  useEscapeCapture(onClose)
  useFocusInAndBack(ref)
  useHoldTopBar()

  const { list, filter, saved, seen } = state
  const [format, setFormat] = useState<ImageFormat>('story')
  const [name, setName] = useState(saved.name ?? '') // starts from Settings > Name your collage
  const theme = useTheme()

  // What the image shows: the current view (the filter applied), and the filter in words.
  const known = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  const fk = filterKey(filter)
  const shown = useMemo(() => (fk ? applyFilter(known, filter, species, seen) : known), [known, filter, fk, species, seen])
  const label = useMemo(
    () => labelFor(filter, { species, countryName: (iso) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso) }),
    [filter, species, regions],
  )
  const hasLatest = useMemo(() => shown.some((e) => e.date), [shown])

  // One pack per format and name-or-not while the dialog is open (the view can't change underneath it; a name takes a
  // line off the collage, so it gets its own pack); workers end on close.
  const life = useRef<AbortController | null>(null)
  useEffect(() => {
    const c = new AbortController()
    life.current = c
    return () => { c.abort(); clearStickerCache() }
  }, [])
  const packFor = useMemo(() => {
    const packs = new Map<string, Promise<ImagePack>>()
    return (f: ImageFormat, named: boolean) => {
      const k = `${f}|${named}`
      let p = packs.get(k)
      if (!p) {
        const spec = imagePackSpec(f, { name: named, filter: !!label, latest: hasLatest, count: shown.length })
        p = packForImage(shown, species, spec, life.current?.signal)
        packs.set(k, p)
        p.catch(() => packs.delete(k))
      }
      return p
    }
  }, [shown, species, label, hasLatest])

  // The image: re-rendered (debounced) when the format, name or theme changes. `current` is the newest render;
  // a render superseded before it starts rejects with an AbortError.
  const [preview, setPreview] = useState<{ url: string; format: ImageFormat; key: string } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const current = useRef<Promise<Blob> | null>(null)
  /** The finished PNG for `key`, so Share and Download can use it without awaiting anything. */
  const ready = useRef<{ key: string; blob: Blob } | null>(null)
  const previewUrl = useRef<string | null>(null)
  const first = useRef(true)
  const trimmed = name.trim()
  const key = `${format}|${trimmed}|${theme}`
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
      .then(() => packFor(format, !!trimmed))
      .then((pack) => renderShareImage({ format, entries: shown, species, filterLabel: label, name: trimmed || undefined, theme, pack, signal: life.current?.signal }))
    current.current = job
    job.then(
      (blob) => {
        if (!live) return
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
        ready.current = { key, blob }
        previewUrl.current = URL.createObjectURL(blob)
        setPreview({ url: previewUrl.current, format, key })
      },
      (e: unknown) => {
        if (!live || (e as Error)?.name === 'AbortError') return
        console.warn('Everybird share image failed:', e)
        setFailedKey(key)
      },
    )
    return () => { live = false; cancel() }
  }, [key, format, trimmed, theme, packFor, shown, species, label])
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current) }, [])

  // The link module starts loading as soon as the dialog opens (still out of the main bundle).
  const linkModule = useRef<ReturnType<typeof loadLinkModule> | null>(null)
  useEffect(() => {
    const p = loadLinkModule()
    p.catch(() => { if (linkModule.current === p) linkModule.current = null }) // retried on the click
    linkModule.current = p
  }, [])

  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const manualRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (manual) manualRef.current?.select() }, [manual])

  const fileName = `everybird-${format}.png`
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
    if (!blob) return setNote({ text: 'Couldn’t make the image. Try again.', error: true })
    downloadBlob(blob, fileName)
    track('image_downloaded', { format })
    setNote({ text: `Saved ${fileName}.` })
  }
  const share = async () => {
    const blob = await getBlob()
    if (!blob) return setNote({ text: 'Couldn’t make the image. Try again.', error: true })
    const file = new File([blob], fileName, { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      try {
        // The image says "stickers by huashu"; the post's text carries the full CC BY 4.0 credit and its link.
        await nav.share({ files: [file], title: 'Everybird', text: SHARE_CREDIT })
        track('shared', { via: format })
        return
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return // the birder closed the share sheet: not shared, nothing sent
        // Any other failure: nothing counted as shared; the download below is counted as a download.
      }
    }
    downloadBlob(blob, fileName)
    track('image_downloaded', { format })
    setNote({ text: `Saved ${fileName}. Post it from your photos or files.` })
  }
  const copyLink = async () => {
    setManual(null)
    const mod = (linkModule.current ??= loadLinkModule())
    const making: Promise<LinkResult> = mod.then((m) => m.makeShareLink(list, regions, trimmed || undefined, window.location.origin))
    // Where the clipboard takes a promised item (Safari, Chromium), hand it over now, inside the click, and let the
    // link arrive later. Otherwise writeText after the (normally already loaded) module, then the manual field.
    let copied: Promise<boolean> = Promise.resolve(false)
    const clip = navigator.clipboard
    if (typeof ClipboardItem === 'function' && typeof clip?.write === 'function') {
      try {
        const item = new ClipboardItem({ 'text/plain': making.then((l) => new Blob([l.url], { type: 'text/plain' })) })
        copied = clip.write([item]).then(() => true, () => false)
      } catch {
        // An old ClipboardItem that refuses promises: fall through to writeText.
      }
    }
    let link: LinkResult
    try {
      link = await making
    } catch (e) {
      if ((e as Error)?.name === 'ShareTooLarge') return setNote({ text: 'This list is too large for a link. Share the image instead.', error: true })
      console.warn('Everybird share link failed:', e)
      return setNote({ text: 'Couldn’t make the link. Try again.', error: true })
    }
    const { url, level, dropped } = link
    // Counted once the link exists, whether the clipboard takes it or the birder copies it by hand.
    track('link_copied', { level })
    const missing = dropped ? ` ${dropped === 1 ? '1 bird is' : `${dropped} birds are`} too new for links and left out.` : ''
    let ok = await copied
    if (!ok && typeof clip?.writeText === 'function') ok = await clip.writeText(url).then(() => true, () => false)
    if (ok) return setNote({ text: LEVEL_NOTE[level] + missing })
    setManual(url)
    setNote({ text: `${level === 'regions' ? '' : `${LEVEL_NOTE[level].replace('Link copied. ', '')} `}${missing.trim()}${missing ? ' ' : ''}Copy this link:` })
  }

  const [w, h] = IMAGE_SIZE[preview?.format ?? format]
  return (
    <div className="eb-share-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        className="eb-share"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => trapTab(e, ref.current)}
      >
        <div className="eb-share-head">
          <h2 id={titleId} className="eb-share-title">Share your collage</h2>
          <button type="button" className="eb-share-close" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" focusable="false" weight="bold" />
          </button>
        </div>

        <div className="eb-share-body">
          {/* One box for every format (share.css): the image is letterboxed in it, so the controls never move. */}
          <div className="eb-share-preview" aria-busy={busy} data-testid="share-preview">
            {preview && (
              // A blob URL of the rendered PNG: next/image has nothing to optimise here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} width={w} height={h} alt={`Preview of the ${preview.format} image`} />
            )}
            {busy && <span className="eb-share-spin" aria-hidden="true" />}
            {failed && !busy && <p className="eb-error eb-share-failed">Couldn&apos;t make the image.</p>}
          </div>

          <div className="eb-share-controls">
            <div className="eb-seg" role="group" aria-label="Image format">
              {FORMATS.map(({ id, label: text, hint, icon: Glyph }) => (
                <button key={id} type="button" className="eb-seg-btn" aria-pressed={format === id} onClick={() => setFormat(id)}>
                  <Glyph aria-hidden="true" focusable="false" />
                  <span className="eb-seg-text">
                    <span className="eb-seg-label">{text}</span>
                    <span className="eb-share-hint">{hint}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="eb-share-field">
              <label htmlFor={nameId} className="eb-share-label">Collage title</label>
              <input
                id={nameId}
                className="eb-share-input"
                type="text"
                autoComplete="off"
                maxLength={NAME_MAX_LEN}
                placeholder="Optional, shown on the image"
                value={name}
                onChange={(e) => setName(e.target.value)} // this share only: Settings > Name your collage stays as it is
              />
            </div>

            <div className="eb-share-actions">
              <button type="button" className="eb-btn" disabled={busy} onClick={() => void share()}>
                <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
                Share image
              </button>
              <button type="button" className="eb-btn eb-btn-quiet" disabled={busy} onClick={() => void download()}>
                <DownloadSimple aria-hidden="true" focusable="false" />
                Download image
              </button>
              <button type="button" className="eb-btn eb-btn-quiet" onClick={() => void copyLink()}>
                <LinkSimple aria-hidden="true" focusable="false" />
                Copy link
              </button>
            </div>

            <p className={note?.error ? 'eb-error' : 'eb-note'} role="status" data-testid="share-note">{note?.text ?? ''}</p>
            {manual && (
              <input ref={manualRef} className="eb-share-input" type="text" readOnly value={manual} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
            )}
            <p className="eb-note">
              {fk ? 'The image shows the current filter. ' : ''}The link opens your whole collage, with first months and regions, never towns or coordinates.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
