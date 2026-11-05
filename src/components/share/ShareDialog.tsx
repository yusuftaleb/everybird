'use client'
// The share dialog: story or post image with a live preview, Share image (the system share sheet when it takes
// files, else a download), Download image, Copy link and the optional display name (Saved.name).
// The link encoder (and its ~111 KB species index) loads only when "Copy link" is pressed.
import { DeviceMobile, DownloadSimple, FrameCorners, LinkSimple, ShareNetwork, X } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { trapTab, useEscapeCapture, useFocusInAndBack } from '@/components/dialog-utils'
import { downloadBlob } from '@/lib/download'
import { stripBracket } from '@/lib/import/places'
import { applyFilter, filterKey } from '@/lib/list/filters'
import type { Action, AppState } from '@/lib/list/store'
import {
  IMAGE_SIZE, NAME_MAX_LEN, clearStickerCache, collageAspect, filterLabel as labelFor, packForImage, renderShareImage, type ImageFormat, type ImagePack,
} from '@/lib/share/image'
import type { ShareLevel } from '@/lib/share/link'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import '@/components/app/app.css'
import './share.css'

type Props = { state: AppState; dispatch: (a: Action) => void; species: SpeciesIndex; regions: Regions; onClose: () => void }
type Theme = 'light' | 'dark'
const abortError = () => Object.assign(new Error('superseded'), { name: 'AbortError' })

const RENDER_DELAY_MS = 250
const FORMATS: { id: ImageFormat; label: string; hint: string }[] = [
  { id: 'story', label: 'Story', hint: '9:16' },
  { id: 'post', label: 'Post', hint: '4:5' },
]
const LEVEL_NOTE: Record<ShareLevel, string> = {
  regions: 'Link copied.',
  countries: 'Link copied. Your list is large, so the link carries countries instead of regions.',
  dates: 'Link copied. Your list is large, so the link carries dates but no places.',
  species: 'Link copied. Your list is large, so the link carries the species only, without dates or places.',
}

/** The page's theme: [data-theme] on <html> when set, else the system's. */
function readTheme(): Theme {
  const t = document.documentElement.dataset.theme
  if (t === 'light' || t === 'dark') return t
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
    const read = () => setTheme(readTheme())
    mq?.addEventListener?.('change', read)
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { mq?.removeEventListener?.('change', read); mo.disconnect() }
  }, [])
  return theme
}

export default function ShareDialog({ state, dispatch, species, regions, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const nameId = useId()
  useEscapeCapture(onClose)
  useFocusInAndBack(ref)

  const { list, trips, filter, saved } = state
  const [format, setFormat] = useState<ImageFormat>('story')
  const [name, setName] = useState(saved.name ?? '')
  const theme = useTheme()

  // What the image shows: the current view (the filter applied), and the filter in words.
  const known = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  const fk = filterKey(filter)
  const shown = useMemo(() => (fk ? applyFilter(known, filter, species, trips) : known), [known, filter, fk, species, trips])
  const label = useMemo(
    () => labelFor(filter, { species, trips, countryName: (iso) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso) }),
    [filter, species, trips, regions],
  )
  const hasLatest = useMemo(() => shown.some((e) => e.date), [shown])

  // One pack per format while the dialog is open (the view can't change underneath it); workers end on close.
  const life = useRef<AbortController | null>(null)
  useEffect(() => {
    const c = new AbortController()
    life.current = c
    return () => { c.abort(); clearStickerCache() }
  }, [])
  const packFor = useMemo(() => {
    const packs = new Map<ImageFormat, Promise<ImagePack>>()
    return (f: ImageFormat) => {
      let p = packs.get(f)
      if (!p) {
        p = packForImage(shown, species, collageAspect(f, !!label, hasLatest), life.current?.signal)
        packs.set(f, p)
        p.catch(() => packs.delete(f))
      }
      return p
    }
  }, [shown, species, label, hasLatest])

  // The image: re-rendered (debounced) when the format, name or theme changes. `current` is the newest render;
  // a render superseded before it starts rejects with an AbortError.
  const [preview, setPreview] = useState<{ url: string; format: ImageFormat; key: string } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const current = useRef<Promise<Blob> | null>(null)
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
      cancel = () => { clearTimeout(t); reject(abortError()) }
    })
      .then(() => packFor(format))
      .then((pack) => renderShareImage({ format, entries: shown, species, filterLabel: label, name: trimmed || undefined, theme, pack, signal: life.current?.signal }))
    current.current = job
    job.then(
      (blob) => {
        if (!live) return
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
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

  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const manualRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (manual) manualRef.current?.select() }, [manual])

  const fileName = `everybird-${format}.png`
  /** The newest render's PNG (waiting for it), or null if it failed. */
  const getBlob = async (): Promise<Blob | null> => {
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
    setNote({ text: `Saved ${fileName}.` })
  }
  const share = async () => {
    const blob = await getBlob()
    if (!blob) return setNote({ text: 'Couldn’t make the image. Try again.', error: true })
    const file = new File([blob], fileName, { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'Everybird' })
        return
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return // the birder closed the share sheet
      }
    }
    downloadBlob(blob, fileName)
    setNote({ text: `Saved ${fileName}. Post it from your photos or files.` })
  }
  const copyLink = async () => {
    setManual(null)
    let url: string
    let level: ShareLevel
    try {
      const [{ encodeShare, URL_BUDGET }, { payloadFromList }] = await Promise.all([import('@/lib/share/link'), import('@/lib/share/convert')])
      const prefix = `${window.location.origin}/s/`
      const enc = encodeShare(payloadFromList(list, regions, trimmed || undefined), URL_BUDGET - prefix.length)
      url = prefix + enc.token
      level = enc.level
    } catch (e) {
      if ((e as Error)?.name === 'ShareTooLarge') return setNote({ text: 'This list is too large for a link. Share the image instead.', error: true })
      console.warn('Everybird share link failed:', e)
      return setNote({ text: 'Couldn’t make the link. Try again.', error: true })
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setNote({ text: LEVEL_NOTE[level] })
    } catch {
      setManual(url)
      setNote({ text: level === 'regions' ? 'Copy this link:' : `${LEVEL_NOTE[level].replace('Link copied. ', '')} Copy this link:` })
    }
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
          <div className="eb-share-preview" style={{ aspectRatio: `${w} / ${h}` }} aria-busy={busy} data-testid="share-preview">
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
              {FORMATS.map((f) => (
                <button key={f.id} type="button" className="eb-seg-btn" aria-pressed={format === f.id} onClick={() => setFormat(f.id)}>
                  {f.id === 'story' ? <DeviceMobile aria-hidden="true" focusable="false" /> : <FrameCorners aria-hidden="true" focusable="false" />}
                  {f.label}
                  <span className="eb-share-hint">{f.hint}</span>
                </button>
              ))}
            </div>

            <div className="eb-share-field">
              <label htmlFor={nameId} className="eb-share-label">Your name (optional)</label>
              <input
                id={nameId}
                className="eb-share-input"
                type="text"
                autoComplete="name"
                maxLength={NAME_MAX_LEN}
                placeholder="Shown as “Ada’s Everybird”"
                value={name}
                onChange={(e) => { setName(e.target.value); dispatch({ type: 'name', name: e.target.value }) }}
              />
            </div>

            <div className="eb-share-actions">
              <button type="button" className="eb-btn" onClick={() => void share()}>
                <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
                Share image
              </button>
              <button type="button" className="eb-btn eb-btn-quiet" onClick={() => void download()}>
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
