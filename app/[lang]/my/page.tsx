import { redirect } from 'next/navigation'

/** Old address: My collage is now the My birds page (/). */
// Only the layout's four languages exist: any other first segment (/nope) is the static 404, never a render.
export const dynamicParams = false

export default function Page() {
  redirect('/')
}
