// Everybird's usage report, from the stats Worker's D1 database (workers/stats, table events: day, name, value,
// country, device, vid). Aggregates only: the table holds no names, species, places, IPs or cookies.
//
//   npm run stats                              the last 30 days (UTC)
//   npm run stats -- --since 2026-11-01        from a day on
//   npm run stats -- --top 10                  top 10 countries per event (default 5)
//   npm run stats -- --print-sql               print the SQL and the wrangler command, run nothing
//
// Runs `npx wrangler d1 execute everybird-events --remote --json --command <sql>` from workers/stats (so wrangler reads
// its wrangler.jsonc), which needs `npx wrangler login` once. vid is an anonymous id the Worker derives per UTC day, so
// a count of distinct vids over several days counts person-days: the same birder on two days is two.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DB = 'everybird-events'
export const EVENTS = ['visit', 'collage_made', 'image_downloaded', 'shared', 'link_copied'] as const
const TITLES: Record<string, string> = {
  visit: 'Page views (visit)',
  collage_made: 'Collages made (collage_made, by source)',
  image_downloaded: 'Images downloaded (image_downloaded, by format)',
  shared: 'Shared through the share sheet (shared)',
  link_copied: 'Links copied (link_copied, by level)',
}
/** The Worker's link_copied values, in the app's words (src/lib/analytics.ts WIRE_LEVEL). */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  link_copied: { full: 'full (regions)', compact: 'compact (countries)', minimal: 'minimal (dates)', species: 'species' },
}

export type Args = { since: string; top: number; printSql: boolean }

export function daysAgo(n: number, now = new Date()): string {
  return new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10)
}

export function parseArgs(argv: string[], now = new Date()): Args {
  const a: Args = { since: daysAgo(30, now), top: 5, printSql: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--since') a.since = argv[++i] ?? ''
    else if (k === '--top') a.top = Number(argv[++i])
    else if (k === '--print-sql' || k === '--dry-run') a.printSql = true
    else throw new Error(`Unknown option ${k}. Use --since YYYY-MM-DD, --top N, --print-sql.`)
  }
  // Both go into the SQL text (wrangler's --command takes no parameters), so only these exact shapes pass.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.since) || Number.isNaN(Date.parse(`${a.since}T00:00:00Z`))) throw new Error(`--since wants YYYY-MM-DD, got "${a.since}"`)
  if (!Number.isInteger(a.top) || a.top < 1 || a.top > 50) throw new Error('--top wants a whole number from 1 to 50')
  return a
}

export type QueryName = 'visitors' | 'visitsByDay' | 'byValue' | 'people' | 'byDevice' | 'countries'

/** The report's statements, in the order wrangler returns their results. */
export function buildQueries(since: string, top: number): { name: QueryName; sql: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('bad since')
  if (!Number.isInteger(top) || top < 1) throw new Error('bad top')
  const w = `day >= '${since}'`
  const vid = `NULLIF(vid, '')` // rows from before the Worker had ids carry ''
  return [
    { name: 'visitors', sql: `SELECT day, COUNT(DISTINCT ${vid}) AS visitors, COUNT(*) AS events FROM events WHERE ${w} GROUP BY day ORDER BY day` },
    { name: 'visitsByDay', sql: `SELECT day, value, COUNT(*) AS n FROM events WHERE ${w} AND name = 'visit' GROUP BY day, value ORDER BY day, value` },
    { name: 'byValue', sql: `SELECT name, value, COUNT(*) AS events, COUNT(DISTINCT ${vid}) AS people FROM events WHERE ${w} GROUP BY name, value ORDER BY name, events DESC` },
    {
      name: 'people',
      sql: `SELECT name, COUNT(*) AS people, SUM(c) AS events, SUM(CASE WHEN c >= 2 THEN 1 ELSE 0 END) AS repeat_people, MAX(c) AS max_events FROM (SELECT name, day, vid, COUNT(*) AS c FROM events WHERE ${w} AND vid <> '' GROUP BY name, day, vid) GROUP BY name ORDER BY name`,
    },
    { name: 'byDevice', sql: `SELECT name, value, device, COUNT(*) AS n FROM events WHERE ${w} GROUP BY name, value, device ORDER BY name, value, n DESC` },
    {
      name: 'countries',
      sql: `SELECT name, country, n, people FROM (SELECT name, country, COUNT(*) AS n, COUNT(DISTINCT ${vid}) AS people, ROW_NUMBER() OVER (PARTITION BY name ORDER BY COUNT(*) DESC, country) AS rk FROM events WHERE ${w} GROUP BY name, country) WHERE rk <= ${top} ORDER BY name, n DESC, country`,
    },
  ]
}

export function wranglerArgs(sql: string): string[] {
  return ['wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql]
}

type Row = Record<string, string | number | null>
export type Results = Record<QueryName, Row[]>

/** wrangler's --json output: one { results } per statement, in order. */
export function parseWrangler(stdout: string, names: QueryName[]): Results {
  const out = JSON.parse(stdout) as { results?: Row[]; success?: boolean }[]
  if (!Array.isArray(out) || out.length !== names.length) throw new Error(`wrangler returned ${Array.isArray(out) ? out.length : 'no'} results for ${names.length} statements`)
  const r = {} as Results
  names.forEach((n, i) => { r[n] = out[i].results ?? [] })
  return r
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))

/** A plain aligned table: the first column left, the rest right. */
export function table(head: string[], rows: (string | number)[][]): string {
  const cells = [head, ...rows].map((r) => r.map(String))
  const width = head.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? '').length)))
  const line = (r: string[]) => r.map((c, i) => (i === 0 ? c.padEnd(width[i]) : c.padStart(width[i]))).join('  ').trimEnd()
  return [line(cells[0]), line(width.map((w) => '-'.repeat(w))), ...cells.slice(1).map(line)].join('\n')
}

/** Rows × columns of counts, columns ordered by their totals, with a total column. */
function pivot(rows: Row[], rowKey: string, colKey: string, valKey: string, rowOrder?: string[]): { cols: string[]; body: (string | number)[][] } {
  const colTotals = new Map<string, number>()
  const grid = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const rk = String(r[rowKey]), ck = String(r[colKey]), v = num(r[valKey])
    colTotals.set(ck, (colTotals.get(ck) ?? 0) + v)
    if (!grid.has(rk)) grid.set(rk, new Map())
    grid.get(rk)!.set(ck, (grid.get(rk)!.get(ck) ?? 0) + v)
  }
  const cols = [...colTotals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c)
  const keys = rowOrder ? rowOrder.filter((k) => grid.has(k)) : [...grid.keys()]
  return { cols, body: keys.map((k) => [k, ...cols.map((c) => grid.get(k)!.get(c) ?? 0)]) }
}

export function formatReport(r: Results, args: Pick<Args, 'since' | 'top'>): string {
  const out: string[] = [`Everybird stats since ${args.since} (UTC days). People are anonymous daily ids: over several days, person-days.`]

  // Visitors per day, with page views by page.
  const pages = ['landing', 'collage', 'settings', 'about', 'shared']
  const visits = new Map<string, Map<string, number>>()
  for (const v of r.visitsByDay) {
    if (!visits.has(String(v.day))) visits.set(String(v.day), new Map())
    visits.get(String(v.day))!.set(String(v.value), num(v.n))
  }
  out.push('', 'Visitors by day')
  if (!r.visitors.length) out.push('(no events)')
  else {
    const rows = r.visitors.map((d) => {
      const m = visits.get(String(d.day)) ?? new Map<string, number>()
      return [String(d.day), num(d.visitors), ...pages.map((p) => m.get(p) ?? 0), num(d.events)]
    })
    const total = ['total', '', ...pages.map((_, i) => rows.reduce((s, row) => s + num(row[i + 2]), 0)), rows.reduce((s, row) => s + num(row[row.length - 1]), 0)]
    out.push(table(['day', 'visitors', ...pages, 'all events'], [...rows, total]))
  }

  for (const name of EVENTS) {
    const values = r.byValue.filter((x) => x.name === name)
    out.push('', TITLES[name])
    if (!values.length) { out.push('(none)'); continue }
    const label = (v: string) => VALUE_LABELS[name]?.[v] ?? v
    const dev = pivot(r.byDevice.filter((x) => x.name === name), 'value', 'device', 'n', values.map((v) => String(v.value)))
    const byVal = new Map(values.map((v) => [String(v.value), v]))
    const rows = dev.body.map(([v, ...counts]) => [label(String(v)), num(byVal.get(String(v))?.events), num(byVal.get(String(v))?.people), ...counts])
    out.push(table(['value', 'events', 'people', ...dev.cols], rows))
    const p = r.people.find((x) => x.name === name)
    if (p && num(p.people) > 0) {
      out.push(`people ${num(p.people)} · events per person ${(num(p.events) / num(p.people)).toFixed(2)} · with 2+ ${num(p.repeat_people)} · most by one ${num(p.max_events)}`)
    }
    const c = r.countries.filter((x) => x.name === name)
    if (c.length) out.push(`top countries: ${c.map((x) => `${x.country} ${num(x.n)}`).join(', ')}`)
  }
  return out.join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const queries = buildQueries(args.since, args.top)
  const sql = queries.map((q) => `${q.sql};`).join('\n')
  const cwd = join(fileURLToPath(new URL('.', import.meta.url)), '../../workers/stats')
  if (args.printSql) {
    console.log(`# cd ${cwd} && npx ${wranglerArgs('<sql>').join(' ')}\n${sql}`)
    return
  }
  const run = spawnSync('npx', wranglerArgs(sql), { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (run.status !== 0) {
    console.error(run.stderr || run.stdout || `wrangler exited with ${run.status}`)
    process.exit(1)
  }
  console.log(formatReport(parseWrangler(run.stdout, queries.map((q) => q.name)), args))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
