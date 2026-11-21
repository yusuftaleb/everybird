// One poster's state: ordered RGBA strips -> one zlib stream -> either download format.
import { createZlibSink, filterUp, pdfParts, pngParts, type ZlibSink } from './png-pdf'

export class PosterEncoder {
  private readonly sink: ZlibSink
  private prev: Uint8Array | null = null
  private rows = 0
  private tail: Promise<void> = Promise.resolve()
  private state: 'open' | 'ending' | 'done' | 'failed' = 'open'
  private chunks: Uint8Array[] | null = null
  /** The PNG's parts, built once: its chunk CRCs run over the whole payload, so repeat downloads reuse them. */
  private png: Uint8Array[] | null = null

  /** RGBA: the PNG keeps the alpha channel (a transparent poster); a PDF is refused. */
  private readonly alpha: boolean

  constructor(private readonly width: number, private readonly height: number, opts?: { native?: boolean; alpha?: boolean }) {
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) throw new Error('invalid poster dimensions')
    this.alpha = !!opts?.alpha
    this.sink = createZlibSink(opts)
  }

  async strip(rgba: Uint8ClampedArray, rows: number): Promise<void> {
    if (this.state !== 'open') throw new Error('poster encoder is closed or ended')
    if (!Number.isSafeInteger(rows) || rows <= 0 || this.rows + rows > this.height) throw new Error('poster rows exceed height or are invalid')
    if (rgba.length !== this.width * rows * 4) throw new Error('invalid poster strip length')
    this.rows += rows
    // Reserve rows synchronously, then serialize filtering so concurrent callers share the right previous row.
    const pending = this.tail.then(async () => {
      const { out, last } = filterUp(rgba, this.width, rows, this.prev, this.alpha)
      await this.sink.push(out)
      this.prev = last
    })
    this.tail = pending
    try { await pending } catch (e) { this.state = 'failed'; throw e }
  }

  async end(): Promise<void> {
    if (this.state !== 'open') throw new Error('poster encoder is closed or ended')
    if (this.rows !== this.height) throw new Error('poster rows do not match height')
    this.state = 'ending'
    try {
      await this.tail
      this.chunks = await this.sink.end()
      this.prev = null
      this.state = 'done'
    } catch (e) { this.state = 'failed'; throw e }
  }

  /** True from construction until end() resolves or anything fails. */
  get open(): boolean { return this.state === 'open' || this.state === 'ending' }

  /** Compressed zlib payload bytes, excluding either file format's wrapper. */
  get bytes(): number {
    if (this.state !== 'done' || !this.chunks) throw new Error('poster must end before bytes are ready')
    return this.chunks.reduce((n, b) => n + b.length, 0)
  }

  file(kind: 'png' | 'pdf', page: readonly [number, number]): Blob {
    if (this.state !== 'done' || !this.chunks) throw new Error('poster must end before a file is ready')
    if (kind === 'pdf' && this.alpha) throw new Error('a transparent poster has no PDF')
    const parts = kind === 'png' ? (this.png ??= pngParts(this.width, this.height, this.chunks, 150, this.alpha)) : pdfParts(this.width, this.height, page, this.chunks)
    // Both compressors and the wrappers allocate ordinary ArrayBuffers, never SharedArrayBuffers.
    return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: kind === 'png' ? 'image/png' : 'application/pdf' })
  }
}
