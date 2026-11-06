import type { Metadata } from 'next'
import { MakePage } from '@/components/app/MakePage'

export const metadata: Metadata = { title: 'Make yours · Everybird' }

export default function Page() {
  return <MakePage />
}
