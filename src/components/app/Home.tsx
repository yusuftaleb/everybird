'use client'
import { CollagePage } from './CollagePage'
import { useEverybirdContext } from './EverybirdProvider'
import { Landing } from './Landing'

/**
 * `/` (Collage): the birder's own collage when this device holds a list, else the landing with the sample collage.
 * Which one is known as soon as storage has been read, well before the bird data arrives.
 */
export function Home() {
  const eb = useEverybirdContext()
  if (eb.mineSoon === null) return <main className="eb-page eb-page-collage" aria-busy="true"><div className="eb-stage-wait eb-sample-wait" aria-hidden="true" /></main>
  return eb.mineSoon ? <CollagePage /> : <Landing />
}
