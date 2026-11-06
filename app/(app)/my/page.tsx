import type { Metadata } from 'next'
import { MyPage } from '@/components/app/MyPage'

export const metadata: Metadata = { title: 'My collage · Everybird' }

export default function Page() {
  return <MyPage />
}
