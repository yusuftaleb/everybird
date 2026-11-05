import { loadTaxonomy } from '@/lib/species/load'
import type { TaxonomyIndex } from '@/lib/species/resolve'
import type { ImportResult } from '@/lib/list/model'
import { parseEbirdLifeList } from './ebird-lifelist'
import { parseEbirdMyData } from './ebird-mydata'

export type ParseKind = 'ebird-lifelist' | 'ebird-mydata'
export type ParseRequest = { kind: ParseKind; file: File }
export type ParseResponse =
  | { type: 'progress'; rows: number }
  | { type: 'done'; result: ImportResult }
  | { type: 'error'; message: string }

const PROGRESS_MS = 100
const PROGRESS_ROWS = 5000

/** The worker's whole job, injectable for tests: load the taxonomy, dispatch to the parser, post messages. */
export async function handleParseMessage(
  msg: ParseRequest,
  post: (m: ParseResponse) => void,
  load: () => Promise<TaxonomyIndex> = loadTaxonomy,
): Promise<void> {
  try {
    const t = await load()
    let last = 0
    let lastRows = 0
    const onProgress = (rows: number) => {
      const now = Date.now()
      if (now - last >= PROGRESS_MS || rows - lastRows >= PROGRESS_ROWS) {
        last = now
        lastRows = rows
        post({ type: 'progress', rows })
      }
    }
    const result =
      msg.kind === 'ebird-mydata'
        ? await parseEbirdMyData(msg.file, t, onProgress)
        : parseEbirdLifeList(await msg.file.text(), t)
    post({ type: 'done', result })
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

declare const WorkerGlobalScope: unknown
// Only wire up the message listener inside a real worker (not in vitest or the main thread).
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof (WorkerGlobalScope as never)) {
  const scope = self as unknown as { onmessage: ((e: MessageEvent<ParseRequest>) => void) | null; postMessage: (m: ParseResponse) => void }
  scope.onmessage = (e) => void handleParseMessage(e.data, (m) => scope.postMessage(m))
}
