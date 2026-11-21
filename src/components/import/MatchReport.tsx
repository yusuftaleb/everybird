'use client'
import { CaretDown, Check, MagnifyingGlass } from '@phosphor-icons/react'
import { memo, useEffect, useRef, useState } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { unmatchedKey, type Unmatched } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import type { Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import { SpeciesSearch } from './SpeciesSearch'
import '@/components/filters/filters.css'
import './import.css'

type Props = { open: Unmatched[]; saved: Saved; species: SpeciesIndex; dispatch: (a: Action) => void }

const where = (u: Unmatched, t: Ui) => {
  const m = t.import.match
  if (u.source === 'obsorg') return fmt(u.slot === 'obsorg-list' ? t.import.obsorg.whereList : t.import.obsorg.whereRow, { row: u.row })
  if (u.source === 'sheet') return fmt(t.import.sheet.whereRow, { row: u.row })
  if (u.source === 'scythebill') return fmt(t.import.scythebill.whereRow, { row: u.row })
  if (u.source === 'igoterra') return fmt(t.import.igoterra.whereRow, { row: u.row })
  const at = u.source === 'inat' ? m.inatRow : u.slot === 'ebird-list' ? m.listRow : u.source === 'ebird' ? m.ebirdRow : m.row
  return fmt(at, { row: u.row })
}

/**
 * Rows that couldn't be matched to an eBird species (never dropped silently), as one line under the sources: the count
 * and "Fix them", which opens the rows, each with a one-tap fix when there is a likely species and a search to fix it
 * by hand. It opens by itself on arrival at /settings#match (the collage's "Fix it"). Fixes go to edits.fixes
 * (unmatchedKey, "slot:row" -> code). Each source's row counts these rows, with the non-species ones (sp., slashes,
 * hybrids, domestics), in its "· N skipped", whose "why?" says why and links here (NotCounted.tsx).
 */
export const MatchReport = memo(function MatchReport({ open, saved, species, dispatch }: Props) {
  const { t } = useI18n()
  const rows = open.filter((u) => u.reason === 'no-match')
  const [shown, setShown] = useState(() => typeof window !== 'undefined' && window.location.hash === '#match')
  useEffect(() => {
    const onHash = () => { if (window.location.hash === '#match') setShown(true) }
    // The collage's "Fix it" is a client navigation: the router writes the new URL during its commit, after this
    // component's first render read the old hash, and a router push fires no hashchange. Read it again once mounted.
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // A fixed row leaves the report: focus goes to the row that takes its place (the last one when it was last), or, with
  // none left, to Your list, never to the page's body.
  const list = useRef<HTMLUListElement>(null)
  const fixedAt = useRef<number | null>(null)
  useEffect(() => {
    const at = fixedAt.current
    if (at === null) return
    fixedAt.current = null
    const next = list.current?.children[Math.min(at, rows.length - 1)]
    const el = next?.querySelector<HTMLElement>('button') ?? document.getElementById('sources')
    el?.focus({ preventScroll: true })
  }, [rows.length])
  // Entries that aren't species (sp., slashes, hybrids) are counted in their own source's row ("· N skipped", NotCounted).
  if (!rows.length) return null
  const fix = (u: Unmatched, code: string) => {
    fixedAt.current = rows.indexOf(u)
    dispatch({ type: 'edit', edits: { ...saved.edits, fixes: { ...saved.edits.fixes, [unmatchedKey(u)]: code } } })
  }
  return (
    <section id="match" className="eb-matchbox" aria-labelledby="eb-match-h">
      <div className="eb-matchbox-head">
        <div className="eb-matchbox-text">
          <h3 id="eb-match-h" className="eb-src-title">{plural(t.collage.unmatched, rows.length, { n: formatInt(rows.length, t.num) })}</h3>
          <p className="eb-note">{t.import.match.note}</p>
        </div>
        <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm eb-disclose-btn" aria-expanded={shown} aria-controls="eb-match-rows" onClick={() => setShown((s) => !s)}>
          {plural(t.collage.fix, rows.length)}
          <CaretDown aria-hidden="true" focusable="false" weight="bold" />
        </button>
      </div>
      <ul ref={list} id="eb-match-rows" className="eb-match" hidden={!shown}>
        {rows.map((u) => <MatchRow key={unmatchedKey(u)} u={u} species={species} onFix={(code) => fix(u, code)} />)}
      </ul>
    </section>
  )
})

function MatchRow({ u, species, onFix }: { u: Unmatched; species: SpeciesIndex; onFix: (code: string) => void }) {
  const { t } = useI18n()
  const [searching, setSearching] = useState(false)
  useNames() // the suggestion's name follows the names file and the English switch
  const name = u.com ?? u.sci ?? where(u, t)
  const suggestion = u.suggestion ? species.byCode.get(u.suggestion) : undefined
  return (
    <li className="eb-match-row">
      <div className="eb-match-name">
        <span className="eb-match-com">{name}</span>
        {u.com && u.sci && <i className="eb-match-sci">{u.sci}</i>}
        <span className="eb-mono">{where(u, t)}</span>
      </div>
      <div className="eb-match-acts">
        {suggestion && (
          <button type="button" className="eb-chip" onClick={() => onFix(suggestion.code)}>
            <Check aria-hidden="true" focusable="false" className="eb-chip-icon" />
            <span className="eb-chip-label">{fmt(t.import.match.use, { name: displayName(suggestion) })}</span>
          </button>
        )}
        <button type="button" className="eb-chip" aria-expanded={searching} onClick={() => setSearching(!searching)}>
          <MagnifyingGlass aria-hidden="true" focusable="false" className="eb-chip-icon" />
          <span className="eb-chip-label">{t.import.match.byHand}</span>
        </button>
      </div>
      {searching && (
        <SpeciesSearch species={species} label={fmt(t.import.match.find, { name })} showLabel={false} autoFocus onPick={(r) => onFix(r.code)} />
      )}
    </li>
  )
}
