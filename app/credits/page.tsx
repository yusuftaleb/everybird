import { redirect } from 'next/navigation'

/** Old address: The credits are on About. */
export default function Page() {
  redirect('/about#credits')
}
