import { redirect } from 'next/navigation'

/** Old address: Make yours moved to Settings. */
export default function Page() {
  redirect('/settings')
}
