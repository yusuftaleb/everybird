import { EverybirdProvider } from '@/components/app/EverybirdProvider'
import { SiteFooter } from '@/components/app/SiteFooter'
import '@/components/app/app.css'

/**
 * The birder's pages (/, /make, /my) share one store and the imports in flight: the provider sits above them, so
 * moving between them keeps an import running. /s/[token] and /credits are outside this group.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <EverybirdProvider>
      {children}
      <SiteFooter />
    </EverybirdProvider>
  )
}
