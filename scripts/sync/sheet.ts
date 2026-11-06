// The before/after thumbnail sheet for a huashu sync PR: one row per changed sticker, its old and new 128 px file
// side by side (an empty cell for a new or removed sticker), the species name and code beside them. A PNG made with
// sharp; the workflow uploads it as an artifact (PR bodies can't take an uploaded image through the API).
import sharp, { type OverlayOptions } from 'sharp'

export type SheetRow = { code: string; com: string; kind: string; before: Buffer | null; after: Buffer | null }

const CELL = 136, LABEL = 420, PAD = 12, HEAD = 40
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function makeSheet(rows: readonly SheetRow[]): Promise<Buffer> {
  const W = PAD + LABEL + 2 * (CELL + PAD), H = HEAD + rows.length * (CELL + PAD) + PAD
  const texts: string[] = [
    `<text x="${PAD}" y="26" font-size="16" font-weight="700">Species</text>`,
    `<text x="${PAD + LABEL + CELL / 2}" y="26" font-size="16" font-weight="700" text-anchor="middle">Before</text>`,
    `<text x="${PAD + LABEL + CELL + PAD + CELL / 2}" y="26" font-size="16" font-weight="700" text-anchor="middle">After</text>`,
  ]
  const layers: OverlayOptions[] = []
  for (const [i, r] of rows.entries()) {
    const y = HEAD + i * (CELL + PAD)
    texts.push(
      `<rect x="${PAD + LABEL}" y="${y}" width="${CELL}" height="${CELL}" fill="#f1efe9"/>`,
      `<rect x="${PAD + LABEL + CELL + PAD}" y="${y}" width="${CELL}" height="${CELL}" fill="#f1efe9"/>`,
      `<text x="${PAD}" y="${y + CELL / 2 - 4}" font-size="17" font-weight="700">${xml(r.com)}</text>`,
      `<text x="${PAD}" y="${y + CELL / 2 + 20}" font-size="14" fill="#6b6860">${xml(r.code)} · ${xml(r.kind)}</text>`,
    )
    for (const [j, img] of [r.before, r.after].entries()) {
      if (!img) continue
      try {
        const fit = await sharp(img).resize(128, 128, { fit: 'inside' }).png().toBuffer()
        const m = await sharp(fit).metadata()
        const x = PAD + LABEL + j * (CELL + PAD)
        layers.push({ input: fit, left: x + Math.round((CELL - m.width!) / 2), top: y + Math.round((CELL - m.height!) / 2) })
      } catch { /* an undecodable file stays an empty cell */ }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" fill="#1d1c1a">${texts.join('')}</svg>`
  return sharp({ create: { width: W, height: H, channels: 4, background: '#ffffff' } })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }, ...layers])
    .png({ compressionLevel: 9 })
    .toBuffer()
}
