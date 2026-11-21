'use client'
import { memo, useMemo, useState, type ReactNode } from 'react'
import type { ImportJobs } from '@/components/app/use-import-jobs'
import { useI18n } from '@/i18n/I18nProvider'
import { slotConnected, type SourceCounts } from '@/lib/list/source-counts'
import type { Action } from '@/lib/list/store'
import type { Slot } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import { AddPanels } from './add-panel'
import { EbirdDrop, type EbirdConnected } from './EbirdDrop'
import { InatForm } from './InatForm'
import { ObsOrgDrop, type ObsOrgConnected } from './ObsOrgDrop'
import { IgoterraDrop } from './IgoterraDrop'
import { ScythebillDrop } from './ScythebillDrop'
import { SheetDrop } from './SheetDrop'
import './import.css'

type Props = {
  saved: Saved
  dispatch: (a: Action) => void
  species: SpeciesIndex
  /** The imports in flight, kept above the routes (EverybirdProvider). */
  jobs: ImportJobs
  disabled?: boolean
  /** What each source brings to the collage (source-counts.ts), for each row's status. */
  counts: SourceCounts
  /** The Places panel's lifer-only note (placesNoteFor), so the eBird rows say the same. */
  placesNote?: 'add' | 'reimport'
}

const speciesIn = (records: { code: string }[]) => new Set(records.map((r) => r.code)).size

/** One source's group (the focus target after a Remove: way-ebird, way-inat, way-obsorg, …). It draws no box: its
 *  cells sit in the list's grid (import.css). */
function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="eb-srcgroup" id={id} tabIndex={-1} role="group" aria-label={label}>{children}</div>
}

/**
 * Settings > Your list and the Add birds dialog's "Import a file": the eight sources (eBird life list, MyEBirdData,
 * iNaturalist, the spreadsheet; then the observation.org life list and observations, Scythebill, iGoTerra) as a grid of
 * cells in one group (four columns on Settings' wide column, two, one on phones, in that order; import.css). A cell is
 * the source's name and status on two lines and its button, with a ⋯ menu once connected; adding opens the source's
 * panel (its guidance and how-to inside) under the whole grid, in a box of its own, its Add button pressed. One panel
 * is open at a time (`AddPanels`): opening one closes the other, though a read, a review or a fetch in progress keeps
 * its own open. They combine into one list; each import replaces only its own slot. The file groups read one file at a
 * time: while one reads, all are disabled, and any file lands in the row of its kind.
 */
export const ImportPanel = memo(function ImportPanel({ saved, dispatch, species, jobs, disabled, counts, placesNote }: Props) {
  const { t } = useI18n()
  const ebirdConnected: EbirdConnected[] = (['ebird', 'ebird-list'] as const)
    .filter((slot) => slotConnected(saved, slot))
    .map((slot) => ({ slot, details: saved.sources?.[slot] }))
  const obsorgConnected: ObsOrgConnected[] = (['obsorg-list', 'obsorg'] as const)
    .filter((slot) => slotConnected(saved, slot))
    .map((slot) => ({ slot, details: saved.sources?.[slot] }))
  const inatOn = slotConnected(saved, 'inat')
  const sheetOn = slotConnected(saved, 'sheet')
  const scythebillOn = slotConnected(saved, 'scythebill')
  const igoterraOn = slotConnected(saved, 'igoterra')
  const focusWay = (id: string) => requestAnimationFrame(() => {
    const way = document.getElementById(id)
    way?.focus({ preventScroll: true })
    // A boxless (display: contents) group can't take focus in every browser: then its first button does.
    if (way && document.activeElement !== way) way.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  })
  const remove = (slot: Exclude<Slot, 'manual'>) => {
    dispatch({ type: 'remove-source', source: slot })
    focusWay(
      slot === 'inat'
        ? 'way-inat'
        : slot === 'obsorg' || slot === 'obsorg-list'
          ? 'way-obsorg'
          : slot === 'sheet'
            ? 'way-sheet'
            : slot === 'scythebill'
              ? 'way-scythebill'
              : slot === 'igoterra'
                ? 'way-igoterra'
                : 'way-ebird',
    )
  }
  // One file at a time across all file groups.
  const fileBusy = jobs.ebird.busy || jobs.obsorg.busy || jobs.sheet.busy || jobs.scythebill.busy || jobs.igoterra.busy
  // When a file last landed, in either group: the file groups fold their Add panels (an iNaturalist fetch, running
  // beside them, leaves an open panel alone).
  const [fileLandedAt, setFileLandedAt] = useState<number | undefined>(undefined)
  if (jobs.landed && jobs.landed.slot !== 'inat' && jobs.landed.at !== fileLandedAt) setFileLandedAt(jobs.landed.at)
  // The one open Add panel. A file landing, or a file source coming or going, folds a file source's panel (an open
  // iNaturalist panel stays); a fetch landing under a new username folds iNaturalist's.
  const [panel, setPanel] = useState<string | null>(null)
  const fileMark = `${[...ebirdConnected, ...obsorgConnected].map((c) => c.slot).join()}|${sheetOn}|${scythebillOn}|${igoterraOn}|${fileLandedAt ?? ''}`
  const inatMark = inatOn ? saved.sources?.inat?.user ?? '' : ''
  const [marks, setMarks] = useState({ fileMark, inatMark })
  if (marks.fileMark !== fileMark || marks.inatMark !== inatMark) {
    setMarks({ fileMark, inatMark })
    if (panel !== null && (panel === 'inat' ? marks.inatMark !== inatMark : marks.fileMark !== fileMark)) setPanel(null)
  }
  const shared = useMemo((): [string | null, typeof setPanel] => [panel, setPanel], [panel])
  return (
    <AddPanels.Provider value={shared}>
      <div className="eb-srclist">
        <Group id="way-ebird" label={t.import.ebirdGroup}>
          <EbirdDrop
            job={jobs.ebird}
            onFile={(f) => void jobs.readEbird(f)}
            disabled={disabled || fileBusy}
            connected={ebirdConnected}
            onRemove={remove}
            saved={saved}
            species={species}
            counts={counts}
            loaded={{ full: speciesIn(saved.records.ebird), quick: speciesIn(saved.records['ebird-list'] ?? []) }}
            placesNote={placesNote}
          />
        </Group>
        <Group id="way-inat" label="iNaturalist">
          <InatForm
            job={jobs.inat}
            onFetch={(u) => void jobs.fetchInat(u)}
            onCancel={jobs.cancelInat}
            disabled={disabled}
            replaces={inatOn}
            details={saved.sources?.inat}
            onRemove={() => remove('inat')}
            saved={saved}
            counts={counts.rows.inat}
          />
        </Group>
        <Group id="way-sheet" label={t.import.sheet.title}>
          <SheetDrop
            job={jobs.sheet}
            onFile={(f) => void jobs.readSheet(f)}
            onPaste={(text) => void jobs.parsePaste(text)}
            review={jobs.sheetReview}
            onConfirm={jobs.confirmSheet}
            onCancel={jobs.cancelSheet}
            species={species}
            disabled={disabled || fileBusy}
            connected={sheetOn}
            details={saved.sources?.sheet}
            onRemove={() => remove('sheet')}
            saved={saved}
            counts={counts.rows.sheet}
            landedAt={fileLandedAt}
          />
        </Group>
        <Group id="way-obsorg" label={t.import.obsorg.group}>
          <ObsOrgDrop
            job={jobs.obsorg}
            onFile={(f) => void jobs.readObsOrg(f)}
            disabled={disabled || fileBusy}
            connected={obsorgConnected}
            onRemove={remove}
            saved={saved}
            counts={counts}
          />
        </Group>
        <Group id="way-scythebill" label={t.import.scythebill.title}>
          <ScythebillDrop
            job={jobs.scythebill}
            onFile={(f) => void jobs.readScythebill(f)}
            disabled={disabled || fileBusy}
            connected={scythebillOn}
            details={saved.sources?.scythebill}
            onRemove={() => remove('scythebill')}
            saved={saved}
            counts={counts.rows.scythebill}
          />
        </Group>
        <Group id="way-igoterra" label={t.import.igoterra.title}>
          <IgoterraDrop
            job={jobs.igoterra}
            onFile={(f) => void jobs.readIgoterra(f)}
            disabled={disabled || fileBusy}
            connected={igoterraOn}
            details={saved.sources?.igoterra}
            onRemove={() => remove('igoterra')}
            saved={saved}
            counts={counts.rows.igoterra}
          />
        </Group>
      </div>
    </AddPanels.Provider>
  )
})
