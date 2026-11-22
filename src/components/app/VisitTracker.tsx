'use client'

import { useAppPath } from '@/i18n/path'
import { useEffect, useRef } from 'react'
import { track, type VisitPage } from '@/lib/analytics'
import { useEverybirdContext } from './EverybirdProvider'

/** The visit value for an app page: "/" is the landing without a list and the collage with one (null until storage is read). */
export function visitPageFor(path: string, mineSoon: boolean | null): VisitPage | null {
  if (path === '/') return mineSoon === null ? null : mineSoon ? 'collage' : 'landing'
  if (path === '/settings') return 'settings'
  if (path === '/about') return 'about'
  if (path === '/compare') return 'compare'
  return null
}

/** One `visit` per page view of Collage, Settings, About and Compare (app/[lang]/(app)/layout.tsx). Sends the page's name only. */
export function VisitTracker() {
  const path = useAppPath()
  const { mineSoon } = useEverybirdContext()
  const sent = useRef<string | null>(null)
  const page = visitPageFor(path, mineSoon)
  useEffect(() => {
    if (!page || sent.current === path) return
    sent.current = path
    track('visit', { page })
  }, [path, page])
  return null
}

/** One `visit` for a page outside the app's store: the shared view, as 'shared', or a comparison link, as 'compare-shared' (never the token). */
export function TrackVisit({ page }: { page: VisitPage }) {
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    track('visit', { page })
  }, [page])
  return null
}
