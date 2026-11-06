import { EverybirdProvider } from '@/components/app/EverybirdProvider'
import { SiteFooter } from '@/components/app/SiteFooter'
import { TopBar } from '@/components/app/TopBar'
import '@/components/app/app.css'

/**
 * The birder's pages (/ Collage, /settings, /about) share one store and the imports in flight: the provider sits above
 * them, so moving between them keeps an import running. /s/[token] is outside (its own top bar, no store).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <EverybirdProvider>
      <TopBar />
      {children}
      <SiteFooter />
    </EverybirdProvider>
  )
}
