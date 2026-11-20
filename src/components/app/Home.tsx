'use client'
import { useState } from 'react'
import { AddBirdsDialog } from '@/components/import/AddBirdsDialog'
import { CollagePage } from './CollagePage'
import { useEverybirdContext } from './EverybirdProvider'
import { Landing } from './Landing'

/**
 * `/` (Collage): the birder's own collage when this device holds a list, else the landing with the sample collage.
 * Which one is known as soon as storage has been read, well before the bird data arrives. "Add birds" (the landing's
 * main button, the collage's head) opens one dialog, held here so it stays open while a first list turns the landing
 * into the collage behind it.
 */
export function Home() {
  const eb = useEverybirdContext()
  const [adding, setAdding] = useState(false)
  if (eb.mineSoon === null) return <main className="eb-page eb-page-collage" aria-busy="true"><div className="eb-stage-wait eb-sample-wait" aria-hidden="true" /></main>
  const add = () => setAdding(true)
  return (
    <>
      {eb.mineSoon ? <CollagePage onAdd={add} /> : <Landing onAdd={add} />}
      {adding && <AddBirdsDialog onClose={() => setAdding(false)} />}
    </>
  )
}
