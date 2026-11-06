'use client'
import { ArrowRight } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ImportPanel } from '@/components/import/ImportPanel'
import { MatchReport } from '@/components/import/MatchReport'
import { RulesSwitches } from '@/components/import/RulesSwitches'
import type { Slot } from '@/lib/list/model'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import { PageHead } from './PageHead'
import { RestoreBackup } from './RestoreBackup'
import './app.css'

const FROM: Record<Slot, string> = { ebird: 'your eBird export', 'ebird-list': 'your eBird life list', inat: 'iNaturalist', manual: 'your list' }

/** `/make`: the three ways in, the privacy line, the match report and counting rules for what's been imported. */
export function MakePage() {
  const eb = useEverybirdContext()
  const { state, dispatch, data, mine, jobs } = eb
  const router = useRouter()
  const landed = jobs.landed
  const count = state.list.length
  return (
    <main className="eb-page">
      <PageHead
        title={mine ? 'Add another source' : 'Make yours'}
        lede={mine ? 'Bring in another record. Each bird keeps its earliest date.' : 'Start from any of these, and combine them if you keep more than one record.'}
        actions={mine ? <Link href="/my" className="eb-btn eb-btn-quiet">My collage<ArrowRight aria-hidden="true" focusable="false" /></Link> : undefined}
      />
      <AppNotices eb={eb} />
      {mine && (landed || count > 0) && (
        <div className="eb-made" role="status" data-testid="see-collage">
          <p>
            {landed ? `Added ${landed.species.toLocaleString('en-US')} species from ${FROM[landed.slot]}. ` : ''}
            Your collage has {count.toLocaleString('en-US')} species.
          </p>
          <Link href="/my" className="eb-btn">See my collage<ArrowRight aria-hidden="true" focusable="false" weight="bold" /></Link>
        </div>
      )}
      {data ? (
        <ImportPanel saved={state.saved} dispatch={dispatch} species={data.species} regions={data.regions} jobs={jobs} />
      ) : (
        !eb.failed && <div className="eb-ways-wait" aria-hidden="true" />
      )}
      {!mine && (
        <div className="eb-tools">
          <span className="eb-note">Moving from another device?</span>
          <RestoreBackup onRestore={(s) => { dispatch({ type: 'restore', saved: s }); router.push('/my') }} disabled={!data} />
        </div>
      )}
      {data && <MatchReport open={state.openUnmatched} saved={state.saved} species={data.species} dispatch={dispatch} />}
      {mine && <RulesSwitches rules={state.saved.rules} dispatch={dispatch} />}
    </main>
  )
}
