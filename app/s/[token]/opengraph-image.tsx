import { ImageResponse } from 'next/og'
import { loadBirds } from '@/lib/layout/layout.worker'
import { LAYOUTS } from '@/lib/layout/constants'
import { packBest, type Box } from '@/lib/layout/pack'
import { latestLifer } from '@/lib/list/build-list'
import type { ListEntry } from '@/lib/list/model'
import { SHARE_COLORS, SITE_LABEL, STICKER_CREDIT, shareCardText } from '@/lib/share/image'
import { ymToDate } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'
import { OG_COLLAGE, OG_SIZE, ogName, pickOgBirds, tryDecodeShare, OG_DESCRIPTION } from '@/lib/share/og'
import { fetchStickers, ogFonts, serverMasks, serverSpecies } from '@/lib/share/og-server'

export const alt = "An Everybird: every bird you've ever seen"
export const size = OG_SIZE
export const contentType = 'image/png'
export const runtime = 'nodejs'

const C = SHARE_COLORS.light
const CABINET = '"Cabinet Grotesk", sans-serif'
const SATOSHI = 'Satoshi, sans-serif'
const MONO = '"Geist Mono", monospace'

type Placed = { code: string; box: Box; src: string }

/** Up to 60 birds of the list, packed with the wide layout into the collage area, with their stickers. */
async function collage(payload: SharePayload, species: Awaited<ReturnType<typeof serverSpecies>>): Promise<Placed[]> {
  const known = payload.birds.flatMap((b) => { const row = species.get(b.code); return row ? [row] : [] })
  const picked = pickOgBirds(known)
  if (!picked.length) return []
  const wide = LAYOUTS.find((l) => l.name === 'wide')!
  const birds = await loadBirds(picked.map((r) => ({ code: r.code, mass: r.g, ord: r.ord })), serverMasks)
  const list = [...birds.entries()]
  const r = packBest(list.map(([, b]) => b), wide, 'even', { fixedStage: [OG_COLLAGE.w, OG_COLLAGE.h], hole: [0, 0] })
  const stickers = await fetchStickers(list.map(([c]) => c))
  const placed: Placed[] = []
  for (const [code, b] of list) {
    const box = r.boxes.get(b.id)
    const src = stickers.get(code)
    if (box && src && species.get(code)?.st) placed.push({ code, box, src })
  }
  return placed
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
  let placed: Placed[] = [], latest: ReturnType<typeof shareCardText>['latest']
  if (payload) {
    try {
      const species = await serverSpecies()
      placed = await collage(payload, species)
      const entries: ListEntry[] = payload.birds.map((b) => ({
        code: b.code, date: b.ym === undefined ? undefined : ymToDate(b.ym, b.yearOnly), heard: false, dead: false, media: false, sources: [],
      }))
      const top = latestLifer(entries, (c) => species.get(c)?.to ?? 0)
      const row = top && species.get(top.code)
      if (top && row) latest = shareCardText(payload.birds.length, { com: row.com, date: top.date }).latest
    } catch (e) {
      console.warn('og image: collage unavailable, rendering the text card', e) // still a valid image
    }
  }
  const name = payload ? ogName(payload) : 'Everybird'
  const count = payload ? shareCardText(payload.birds.length).count.split(' ') : null

  const credit = (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: MONO, fontSize: 15, color: C.muted, gap: 4 }}>
      <div style={{ display: 'flex' }}>{SITE_LABEL}</div>
      <div style={{ display: 'flex' }}>{STICKER_CREDIT}</div>
    </div>
  )
  const body = (
    <>
      {placed.length > 0 && (
        <div style={{ display: 'flex', position: 'relative', width: OG_COLLAGE.w, height: OG_COLLAGE.h, margin: '35px 0 35px 20px' }}>
          {/* satori draws these <img> elements; alt text is moot (there is no DOM) */}
          {placed.map((p) => (
            <img key={p.code} alt="" src={p.src} width={Math.round(p.box[2])} height={Math.round(p.box[3])}
              style={{ position: 'absolute', left: Math.round(p.box[0]), top: Math.round(p.box[1]), objectFit: 'contain' }} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: placed.length ? 480 : 1200, height: '100%', padding: placed.length ? '48px 0 40px 20px' : '56px 64px 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontFamily: CABINET, fontWeight: 700, fontSize: name.length > 22 ? 36 : 46, lineHeight: 1.1, letterSpacing: -1 }}>{name}</div>
          {count ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
              <div style={{ display: 'flex', fontFamily: CABINET, fontWeight: 700, fontSize: 120, lineHeight: 1, letterSpacing: -3, color: C.accent }}>{count[0]}</div>
              <div style={{ display: 'flex', fontSize: 34, fontWeight: 500, marginTop: 4 }}>{count[1]}</div>
              {latest && <div style={{ display: 'flex', fontSize: 22, fontWeight: 500, color: C.muted, marginTop: 28, lineHeight: 1.3 }}>{latest}</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 500, color: C.muted, marginTop: 24 }}>{OG_DESCRIPTION}</div>
          )}
        </div>
        {credit}
      </div>
    </>
  )
  return new ImageResponse(frame(body), { ...OG_SIZE, fonts: await fonts, headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' } })
}
