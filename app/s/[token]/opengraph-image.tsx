import { ImageResponse } from 'next/og'
import { loadBirds } from '@/lib/layout/layout.worker'
import { EXP, LAYOUTS } from '@/lib/layout/constants'
import { packBest, relSizes, type Box } from '@/lib/layout/pack'
import { latestLifer } from '@/lib/list/build-list'
import type { ListEntry } from '@/lib/list/model'
import { formatDate } from '@/lib/format'
import { OG_COUNT_MAX, SHARE_COLORS, FOOTER_LINE, countLayout, type CountLayout } from '@/lib/share/image'
import { ymToDate } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'
import { OG_COLLAGE, OG_SIZE, ogName, ogResponseOptions, pickOgStickers, tryDecodeShare, OG_DESCRIPTION } from '@/lib/share/og'
import { OG_LARGE_TILE, fetchStickers, ogFonts, serverMasks, serverSpecies } from '@/lib/share/og-server'

export const alt = "A birder's life list as a sticker collage, on Everybird"
export const size = OG_SIZE
export const contentType = 'image/png'
export const runtime = 'nodejs'

const C = SHARE_COLORS.light
const CABINET = '"Cabinet Grotesk", sans-serif'
const SATOSHI = 'Satoshi, sans-serif'
const MONO = '"Geist Mono", monospace'

type Placed = { code: string; box: Box; src: string }

/** The count in the collage's middle, as the share images: at most OG_COUNT_MAX px on this smaller card. */
const ogCount = (n: number): CountLayout => countLayout(OG_COUNT_MAX, n, OG_COLLAGE.w)

/**
 * Up to 60 birds of the list that have stickers, packed with the wide layout into the collage area around the count's
 * hole (the stage is drawn 1:1, so the hole is in px), with their stickers.
 */
async function collage(payload: SharePayload, species: Awaited<ReturnType<typeof serverSpecies>>): Promise<{ placed: Placed[]; expected: number }> {
  const known = payload.birds.flatMap((b) => { const row = species.get(b.code); return row ? [row] : [] })
  const picked = pickOgStickers(known)
  if (!picked.length) return { placed: [], expected: 0 }
  const wide = LAYOUTS.find((l) => l.name === 'wide')!
  const birds = await loadBirds(picked.map((r) => ({ code: r.code, mass: r.g, ord: r.ord })), serverMasks)
  const list = [...birds.entries()]
  const pack = list.map(([, b]) => b)
  // A short list: no sticker taller than 40% of the collage (one ostrich shouldn't fill the card).
  const maxRel = Math.max(...relSizes(pack, EXP).values())
  const r = packBest(pack, wide, 'even', { fixedStage: [OG_COLLAGE.w, OG_COLLAGE.h], hole: ogCount(payload.birds.length).hole, maxBase: (0.4 * OG_COLLAGE.h) / maxRel })
  // Tiles drawn past OG_LARGE_TILE get the 384 px file, so a short list's big birds stay sharp.
  const large = new Set(list.flatMap(([c, b]) => { const box = r.boxes.get(b.id); return box && Math.max(box[2], box[3]) > OG_LARGE_TILE ? [c] : [] }))
  const stickers = await fetchStickers(list.map(([code]) => ({ code, sv: species.get(code)?.sv })), undefined, large)
  const placed: Placed[] = []
  for (const [code, b] of list) {
    const box = r.boxes.get(b.id)
    const src = stickers.get(code)
    if (box && src) placed.push({ code, box, src })
  }
  return { placed, expected: picked.length }
}

function frame(children: React.ReactNode) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: C.paper, color: C.ink, fontFamily: SATOSHI }}>
      {children}
    </div>
  )
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const [payload, fonts] = [tryDecodeShare((await params).token), ogFonts()]
  let placed: Placed[] = [], expected = 0, failed = false, latest: { name: string; date?: string } | undefined
  if (payload) {
    try {
      const species = await serverSpecies()
      ;({ placed, expected } = await collage(payload, species))
      const entries: ListEntry[] = payload.birds.map((b) => ({
        code: b.code, date: b.ym === undefined ? undefined : ymToDate(b.ym, b.yearOnly), heard: false, dead: false, media: false, sources: [],
      }))
      const top = latestLifer(entries, (c) => species.get(c)?.to ?? 0)
      const row = top && species.get(top.code)
      // The latest lifer row: a mono label with the month over the bird's name, as the share images.
      if (top && row) latest = { name: row.com, date: formatDate(top.date) || undefined }
    } catch (e) {
      failed = true // the text card stands in: cached briefly, not for a year
      console.warn('og image: collage unavailable, rendering the text card', e) // still a valid image
    }
  }
  const name = payload ? ogName(payload) : 'Everybird'
  const K = payload ? ogCount(payload.birds.length) : null

  // The footer, as the share images': the wordmark and one quiet line, the site and the sticker credit ("… · stickers by
  // huashu"). Beside the wordmark on the wide text card; under it beside the collage, where the column is too narrow.
  const credit = (
    <div style={{ display: 'flex', flexDirection: placed.length ? 'column' : 'row', alignItems: placed.length ? 'flex-start' : 'baseline', gap: placed.length ? 8 : 12 }}>
      <div style={{ display: 'flex', fontFamily: CABINET, fontWeight: 700, fontSize: 24 }}>Everybird</div>
      <div style={{ display: 'flex', fontFamily: MONO, fontSize: placed.length ? 14 : 16, color: C.muted, whiteSpace: 'nowrap' }}>{FOOTER_LINE}</div>
    </div>
  )
  // The count in the middle of the collage, as the share images and the app's Tally: the number over a mono label.
  const middle = K && (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: OG_COLLAGE.w, height: OG_COLLAGE.h, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: K.gap * 0.6 }}>
        <div style={{ display: 'flex', fontFamily: CABINET, fontWeight: 700, fontSize: K.size, lineHeight: 0.85, letterSpacing: -0.02 * K.size }}>{K.number}</div>
        <div style={{ display: 'flex', fontFamily: MONO, fontSize: K.labelSize, letterSpacing: 0.06 * K.labelSize, color: C.muted }}>{K.label}</div>
      </div>
    </div>
  )
  const body = (
    <>
      {placed.length > 0 && (
        <div style={{ display: 'flex', position: 'relative', width: OG_COLLAGE.w, height: OG_COLLAGE.h, margin: '35px 0 35px 40px' }}>
          {/* satori draws these <img> elements; alt text is moot (there is no DOM) */}
          {placed.map((p) => (
            <img key={p.code} alt="" src={p.src} width={Math.round(p.box[2])} height={Math.round(p.box[3])}
              style={{ position: 'absolute', left: Math.round(p.box[0]), top: Math.round(p.box[1]), objectFit: 'contain' }} />
          ))}
          {middle}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: placed.length ? 460 : 1200, height: '100%', padding: placed.length ? '64px 56px 48px 24px' : '56px 64px 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontFamily: CABINET, fontWeight: 700, fontSize: name.length > 26 ? 34 : name.length > 16 ? 40 : 52, lineHeight: 1.05, letterSpacing: -1 }}>{name}</div>
          {K && !placed.length && (
            // No collage (a hiccup or no stickers): the count leads the text card instead.
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 28 }}>
              <div style={{ display: 'flex', fontFamily: CABINET, fontWeight: 700, fontSize: 112, lineHeight: 1, letterSpacing: -3 }}>{K.number}</div>
              <div style={{ display: 'flex', fontFamily: MONO, fontSize: 24, letterSpacing: 1.4, color: C.muted }}>{K.label}</div>
            </div>
          )}
          {!K && <div style={{ display: 'flex', fontSize: 34, fontWeight: 500, color: C.muted, marginTop: 24 }}>{OG_DESCRIPTION}</div>}
          {latest && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, gap: 8 }}>
              <div style={{ display: 'flex', fontFamily: MONO, fontSize: 15, letterSpacing: 0.9, color: C.muted }}>
                {`LATEST LIFER${latest.date ? ` · ${latest.date.toUpperCase()}` : ''}`}
              </div>
              <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, lineHeight: 1.2 }}>{latest.name}</div>
            </div>
          )}
        </div>
        {credit}
      </div>
    </>
  )
  return new ImageResponse(frame(body), { ...OG_SIZE, ...ogResponseOptions(await fonts, { placed: placed.length, expected, failed, broken: !payload }) })
}
