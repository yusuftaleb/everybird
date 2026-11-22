// Transferred RGBA strips are acknowledged only after deflate accepts them. All messages run in arrival order.
//
// Errors: replies carry no sequence number, so an `error` cannot be matched to the request that caused it, and the
// messages queued behind it still run against an encoder that may have failed. The first `error` is therefore fatal:
// the client must stop sending, terminate this worker and start a new one for the next poster. A `begin` while a
// poster is still open is refused (an error) rather than silently dropping the open one.
import { PosterEncoder } from './poster-encoder'

export type PrintWorkerRequest =
  | { type: 'begin'; width: number; height: number; alpha?: boolean }
  | { type: 'strip'; rgba: ArrayBuffer; rows: number }
  | { type: 'end' }
  | { type: 'file'; kind: 'png' | 'pdf'; page: [number, number] }

export type PrintWorkerReply =
  | { type: 'took'; rows: number }
  | { type: 'encoded'; bytes: number }
  | { type: 'file'; kind: 'png' | 'pdf'; blob: Blob }
  | { type: 'error'; message: string }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PrintWorkerRequest>) => void) | null
  postMessage(reply: PrintWorkerReply): void
}
let encoder: PosterEncoder | null = null
let queue: Promise<void> = Promise.resolve()
scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    if (data.type === 'begin') {
      if (encoder?.open) throw new Error('a poster is already open: end it, or terminate the worker')
      encoder = new PosterEncoder(data.width, data.height, { alpha: data.alpha })
      return
    }
    if (!encoder) throw new Error('begin the poster before sending strips or requesting files')
    switch (data.type) {
      case 'strip':
        await encoder.strip(new Uint8ClampedArray(data.rgba), data.rows)
        scope.postMessage({ type: 'took', rows: data.rows })
        break
      case 'end':
        await encoder.end()
        scope.postMessage({ type: 'encoded', bytes: encoder.bytes })
        break
      case 'file':
        scope.postMessage({ type: 'file', kind: data.kind, blob: encoder.file(data.kind, data.page) })
        break
      default:
        throw new Error('unknown print worker request')
    }
  }).catch((e: unknown) => {
    scope.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  })
}
