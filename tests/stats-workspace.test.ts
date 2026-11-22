import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { type Row } from '../workers/stats/src/dashboard'
import { DIMENSIONS, MEASURES, WORKSPACE_META, parseWorkspace, shapeWorkspace, workspaceStatements } from '../workers/stats/src/workspace'
import { workspaceChartRows, workspaceCsv, workspaceDefault, workspaceHash, workspaceObservation, workspaceQuery, workspaceRequestGate, workspaceSort, workspaceState, type WorkspaceState } from '../workers/stats/ui/src/lib/workspace'

type Db = { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): unknown; all(...a: unknown[]): Row[] } }
const sqlite = (() => { try { return createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (p: string) => Db } } catch { return null } })()
const today = '2026-11-24'
function params(q = '') {
  const p = parseWorkspace(new URLSearchParams('from=2026-11-20&to=2026-11-21&' + q), today)
  if (typeof p === 'string') throw new Error(p)
  return p
}
function fixture() {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(readFileSync('workers/stats/schema.sql', 'utf8'))
  const stmt = db.prepare('INSERT INTO events (day,name,value,country,device,vid,lang,received_at) VALUES (?,?,?,?,?,?,?,?)')
  const add = (day: string, event: string, value: string, vid: string, country = 'MX', device = 'iphone', hour: number | null = null, lang = '') => stmt.run(day,event,value,country,device,vid,lang,hour === null ? null : day + 'T' + String(hour + 7).padStart(2,'0') + ':00:00.000Z')
  add('2026-11-18','visit','landing','baseline')
  add('2026-11-20','visit','landing','a','MX','iphone',0,'en')
  add('2026-11-20','visit','settings','a','MX','iphone',0,'en')
  add('2026-11-20','collage_made','inat','a','MX','iphone',1)
  add('2026-11-20','collage_made','ebird','a','MX','iphone',2)
  add('2026-11-20','image_downloaded','story','a','MX','iphone',3)
  add('2026-11-20','poster_downloaded','pdf','a','US','mac',4)
  add('2026-11-20','shared','link','a','MX','iphone',5)
  add('2026-11-20','collage_made','sample','b','US','mac',6)
  add('2026-11-20','collage_made','restore','b','US','mac',7)
  add('2026-11-20','filter_used','place','b','US','mac',8)
  add('2026-11-20','collage_made','manual','','XX','other')
  add('2026-11-20','poster_downloaded','png','','XX','other')
  add('2026-11-21','visit','landing','a') // known id, no timestamp or browser language
  add('2026-11-21','collage_made','manual','c','XX','other')
  add('2026-11-21','poster_made','a3-l','c','XX','other',10)
  add('2026-11-21','search_applied','smart','c','XX','other')
  add('2026-11-21','ui_language','es','c','XX','other')
  add('2026-11-21','link_copied','full','c','XX','other')
  return db
}
function run(db: Db, p = params()) {
  return shapeWorkspace(p, workspaceStatements(p).map(s => {
    expect(s.sql.match(/\?/g)?.length ?? 0).toBe(s.binds.length)
    return db.prepare(s.sql).all(...s.binds)
  }), today, new Date('2026-11-24T12:00:00Z'))
}

describe('workspace validation and capability contract', () => {
  it('validates range, device and each field before SQL generation', () => {
    for (const query of ['measure=constructor', 'measure=__proto__', 'dimension=vid', "dimension=country;DROP TABLE events", 'device=robot', 'to=2027-01-01', 'f_vid=x', 'f_country=USA', 'f_day=2026-02-30', 'measure=downloads&f_language=en', 'measure=collages&f_source=sample', 'measure=visits&f_hour=24', 'measure=active&dimension=hour', 'from=2000-01-01']) {
      const q = new URLSearchParams('from=2026-11-20&to=2026-11-21'); new URLSearchParams(query).forEach((v,k) => q.set(k,v))
      expect(typeof parseWorkspace(q,today),query).toBe('string')
    }
    expect(typeof parseWorkspace(new URLSearchParams('junk='+'x'.repeat(5000)),today)).toBe('string')
  })
  it('offers every and only compatible measure/dimension pair', () => {
    for (const [measure, config] of Object.entries(MEASURES)) for (const dimension of Object.keys(DIMENSIONS)) {
      const p = parseWorkspace(new URLSearchParams({measure,dimension}),today)
      expect(typeof p !== 'string',measure+'/'+dimension).toBe((config.dimensions as readonly string[]).includes(dimension))
    }
    expect(params('measure=visits&dimension=language&f_language=').filters).toEqual({language:''})
    expect(params('measure=visits&dimension=language&f_language=zh-Hant').filters).toEqual({language:'zh-Hant'})
    expect(params('measure=visits&dimension=hour&f_hour=').filters).toEqual({hour:''})
    expect(params('country=mx')).toMatchObject({country:'MX'})
  })
})

describe.skipIf(!sqlite)('workspace SQL and numbers', () => {
  it('separates event totals, daily identities, demo/restore and reach', () => {
    const d = run(fixture())
    expect(d.summary).toMatchObject({active:4,collages:4,downloads:3,shares:1,demos:1,restores:1,missingIdentity:2,makers:2,downloaders:1,sharers:1,visits:3,posters:1,images:1,posterDownloads:2,links:1,searches:1,filters:1})
    expect(d.daily.map(x => [x.day,x.active,x.collages])).toEqual([['2026-11-20',2,3],['2026-11-21',2,1]])
    expect(d.explore.total).toBe(4)
    expect(d.explore.rows).toEqual([{key:'2026-11-20',value:2},{key:'2026-11-21',value:2}])
    expect(d.range.compareAvailable).toBe(false) // baseline starts on the first, possibly partial collection day
  })
  it('applies country and device to all ordinary sections, while naming lifetime totals separately', () => {
    const d=run(fixture(),params('country=MX&device=iphone'))
    expect(d.summary).toMatchObject({active:2,collages:2,downloads:1,demos:0,restores:0})
    expect(d.countries).toEqual([{key:'MX',value:2}]); expect(d.devices).toEqual([{key:'iphone',value:2}])
    expect(d.explore.total).toBe(2)
    expect(d.lifetime).toMatchObject({collages:4,downloads:3})
    expect(d.countryOptions).toEqual(['MX','US','XX']) // picker options intentionally independent of filters
  })
  it('does not fabricate unique people by adding overlapping category reach', () => {
    const d=run(fixture(),params('dimension=country'))
    expect(d.explore.overlapping).toBe(true)
    expect(d.explore.total).toBe(4)
    expect(d.explore.rows.reduce((s,r)=>s+r.value,0)).toBe(5)
    expect(d.explore.rows).toContainEqual({key:'XX',value:1}) // blank ids do not add a person-day
  })
  it('counts Other as distinct reach of the complement, not summed reach', () => {
    const db=fixture(),ins=db.prepare('INSERT INTO events (day,name,value,country,device,vid) VALUES (?,?,?,?,?,?)')
    // The same id appears in every country. Two low-volume categories share the same complement id.
    for(const code of ['AA','AB','AC','AD','AE','AF','AG','AH','AI','AJ','AK','AL'])ins.run('2026-11-20','visit','landing',code,'other','overlap')
    const d=run(db,params('dimension=country'))
    const remaining=d.explore.rows.slice(10)
    expect(remaining.length).toBeGreaterThan(1)
    expect(d.explore.other).toBe(2) // remaining countries contain c and overlap; each counted once
    expect(d.explore.other).toBeLessThan(remaining.reduce((s,r)=>s+r.value,0))
  })
  it('keeps unknown times and languages distinct from zero counts', () => {
    const db=fixture(),h=run(db,params('measure=visits&dimension=hour'))
    expect(h.explore.total).toBe(3);expect(h.explore.unknown).toBe(1)
    expect(h.explore.rows).toHaveLength(25);expect(h.explore.rows.find(r=>r.key==='0')?.value).toBe(2)
    expect(h.hourly.withoutTime).toBe(1)
    expect(run(db,params('measure=visits&dimension=day&f_hour=')).explore.total).toBe(1)
    expect(run(db,params('measure=visits&dimension=language')).explore.rows).toEqual([{key:'en',value:2},{key:'',value:1}])
    expect(run(db,params('measure=visits&dimension=day&f_language=')).explore.total).toBe(1)
  })
  it('applies drill-down filters to Explore only, and supports changing the breakdown afterwards', () => {
    const d=run(fixture(),params('measure=collages&dimension=country&f_source=inat'))
    expect(d.explore.total).toBe(1);expect(d.explore.rows).toEqual([{key:'MX',value:1}])
    expect(d.summary.collages).toBe(4)
    expect(d.explore.filters).toEqual({source:'inat'})
    expect(run(fixture(),params('measure=downloads&dimension=day&f_event=poster_downloaded')).explore.total).toBe(2)
  })
  it('executes every supported pair with aggregate-only output and additive event totals', () => {
    const db=fixture()
    for(const [measure,config] of Object.entries(MEASURES)) for(const dimension of config.dimensions){
      const d=run(db,params('measure='+measure+'&dimension='+dimension))
      if(measure!=='active'||dimension==='day')expect(d.explore.rows.reduce((s,r)=>s+r.value,0),measure+'/'+dimension).toBe(d.explore.total)
      expect(JSON.stringify(d)).not.toMatch(/"vid"|"received_at"|"baseline"/)
    }
  })
  it('applies every supported category filter before regrouping, including missing-value categories', () => {
    const db=fixture()
    for(const [measure,config] of Object.entries(MEASURES)) for(const dimension of config.dimensions){
      const original=run(db,params('measure='+measure+'&dimension='+dimension))
      for(const row of original.explore.rows.filter(r=>r.value>0)){
        const q=new URLSearchParams({measure,dimension:'day',['f_'+dimension]:row.key})
        const filtered=run(db,params(q.toString()))
        expect(filtered.explore.total,measure+'/'+dimension+'/'+row.key).toBe(row.value)
        expect(filtered.explore.rows.reduce((s,r)=>s+r.value,0)).toBe(row.value)
        expect(filtered.summary).toEqual(original.summary)
      }
    }
  })
  it('returns explicit zero days, safe empty results and no fake missing-id users', () => {
    const db=new sqlite!.DatabaseSync(':memory:');db.exec(readFileSync('workers/stats/schema.sql','utf8'))
    expect(run(db).daily.map(x=>x.active)).toEqual([0,0]);expect(run(db).explore.total).toBe(0)
    db.prepare('INSERT INTO events (day,name,value,country,device) VALUES (?,?,?,?,?)').run('2026-11-20','collage_made','manual','MX','other')
    expect(run(db).summary).toMatchObject({active:0,makers:0,collages:1,missingIdentity:1})
    expect(run(db).warnings.join(' ')).toContain('lack a daily identity')
  })
  it('excludes dates before collection from averages and distinguishes uncollected history from zero activity', () => {
    const db=fixture(),p={...params(),from:'2026-11-01'}
    const d=run(db,p)
    expect(d.range).toMatchObject({from:'2026-11-18',days:4,compareAvailable:false})
    expect(d.coverage).toEqual({first:'2026-11-18',available:true})
    expect(d.warnings.join(' ')).toContain('Dates before collection are excluded')
    const before=run(db,{...p,to:'2026-11-10'})
    expect(before.coverage.available).toBe(false)
    expect(before.warnings.join(' ')).toContain('no collection coverage')
    expect(run(db,params('country=CA')).coverage.available).toBe(true) // zero activity under a valid filter, not absent collection
  })
  it('marks partial days and the historical cutover, and enables only complete comparison ranges', () => {
    const db=fixture(),p={...params(),from:'2026-11-22',to:'2026-11-23'}
    expect(run(db,p).range).toMatchObject({compareAvailable:true,prevFrom:'2026-11-20',prevTo:'2026-11-21'})
    expect(run(db,{...p,to:today}).range.compareAvailable).toBe(false)
    const cut=run(db,{...p,from:'2026-11-16',to:'2026-11-16'})
    expect(cut.warnings.join(' ')).toContain('31 hours');expect(cut.range.compareAvailable).toBe(false)
    const all=params('all=1');expect(run(db,all).range).toMatchObject({from:'2026-11-18',to:today,compareAvailable:false})
  })
  it('uses receipt-time midnight boundaries and never infers time from a stored day', () => {
    const db=fixture(),ins=db.prepare('INSERT INTO events (day,name,value,country,device,vid,received_at) VALUES (?,?,?,?,?,?,?)')
    ins.run('2026-11-21','visit','about','MX','iphone','z','2026-11-22T06:59:59.999Z')
    ins.run('2026-11-22','visit','about','MX','iphone','z','2026-11-22T07:00:00.000Z')
    const d=run(db,params('measure=visits&dimension=hour'))
    expect(d.explore.rows.find(r=>r.key==='23')?.value).toBe(1)
    expect(d.explore.rows.find(r=>r.key==='0')?.value).toBe(2) // next day's midnight excluded by the day filter
  })
})

type State=WorkspaceState
type Data=ReturnType<typeof shapeWorkspace>
// The console's state/query/export module (workers/stats/ui/src/lib/workspace.ts), imported directly.
const lib={workspaceDefault,workspaceState,workspaceHash,workspaceQuery,workspaceSort,workspaceChartRows,workspaceCsv,workspaceObservation,workspaceRequestGate}
describe('workspace state, displays and export contract',()=>{
  it('discards delayed responses after a newer request, a return to cached data, or navigation away',async()=>{
    const gate=lib.workspaceRequestGate(),old=gate.begin();
    let resolve!:()=>void;const delayed=new Promise<void>(r=>{resolve=r;});let displayed='cached A';
    const pending=delayed.then(()=>{if(gate.current(old))displayed='late B';});
    const cachedNavigation=gate.begin();resolve();await pending;expect(displayed).toBe('cached A');expect(gate.current(cachedNavigation)).toBe(true);
    const newer=gate.begin();expect(gate.current(cachedNavigation)).toBe(false);expect(gate.current(newer)).toBe(true);
    gate.begin();expect(gate.current(newer)).toBe(false);
  });
  it('defaults to completed days and restores all fields, including empty unknown-category filters',()=>{
    const s:State={...lib.workspaceDefault(),view:'explore',preset:'custom',from:'2026-11-20',to:'2026-11-21',measure:'visits',dimension:'language',country:'MX',device:'iphone',filters:{language:''},sort:'value',descending:true,compare:false}
    expect(lib.workspaceState(lib.workspaceHash(s),WORKSPACE_META)).toEqual(s)
    const q=new URLSearchParams(lib.workspaceQuery(lib.workspaceDefault(),today));expect(q.get('from')).toBe('2026-11-10');expect(q.get('to')).toBe('2026-11-23')
    expect(lib.workspaceState('#r=7&c=mx&m=collages',WORKSPACE_META)).toMatchObject({preset:'7',country:'MX',trend:'collages'})
  })
  it('normalizes corrupt saved/URL state and incompatible chart selections',()=>{
    const s=lib.workspaceState('#measure=constructor&dimension=vid&view=nope&device=robot&country=USA&preset=custom&from=2026-02-30&to=2026-12-31&display=line',WORKSPACE_META)
    expect(s).toMatchObject({measure:'active',dimension:'day',view:'overview',device:'',country:'',preset:'14'})
    expect(lib.workspaceState('#dimension=country&display=line',WORKSPACE_META).display).toBe('bar')
    expect(lib.workspaceState('#f_language=en&f_vid=no',WORKSPACE_META).filters).toEqual({})
  })
  it('orders numeric hours with unknown last and uses exact Other reach for overlapping categories',()=>{
    const rows=[{key:'10',value:3},{key:'2',value:1},{key:'',value:4}]
    expect(lib.workspaceSort(rows,'key',false,'hour').map(x=>x.key)).toEqual(['2','10',''])
    expect(rows[0].key).toBe('10') // sorting never mutates the query response
    const result={dimension:'country',overlapping:true,other:2,rows:Array.from({length:12},(_,i)=>({key:String(i),value:10-i/2}))} as Data['explore']
    expect(lib.workspaceChartRows(result).at(-1)).toEqual({key:'__other',value:2})
  })
  it.skipIf(!sqlite)('exports the complete displayed aggregate with units, scope, filters, coverage and safe spreadsheet cells',()=>{
    const d=run(fixture(),params('measure=visits&dimension=hour')),s=lib.workspaceDefault(),csv=lib.workspaceCsv(d,s)
    expect(csv.split('\n')).toHaveLength(27) // header, 25 data rows, final newline
    expect(csv).toContain('deduplicated visits');expect(csv).toContain('2026-11-20,2026-11-21,all,all')
    expect(csv).toContain('missing_category');expect(csv).toContain('missing_identity');expect(csv).toContain('Receipt hour')
    d.explore.rows=[{key:'=SUM(A1)',value:3},{key:'a,"b"',value:2}]
    const safe=lib.workspaceCsv(d,s);expect(safe).toContain("'=SUM(A1)");expect(safe).toContain('"a,""b"""')
    const total=d.explore.total;lib.workspaceCsv(d,s);expect(d.explore.total).toBe(total)
  })
  it.skipIf(!sqlite)('suppresses unsuitable observations and states a zero baseline without infinity',()=>{
    const d=run(fixture());expect(lib.workspaceObservation(d,'active',true)).toBe('')
    d.range.compareAvailable=true;d.previous=d.previous.map(row=>({...row,active:0}))
    expect(lib.workspaceObservation(d,'active',true)).toBe('No previous activity in the comparison period.')
    d.previous[0].active=2;expect(lib.workspaceObservation(d,'active',true)).toContain('4 versus 2')
    expect(lib.workspaceObservation(d,'active',false)).toBe('')
  })
})
