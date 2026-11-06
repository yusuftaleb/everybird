import { EverybirdProvider } from '@/components/app/EverybirdProvider'
import { SiteFooter } from '@/components/app/SiteFooter'
import '@/components/app/app.css'

/**
 * The birder's pages (/, /make, /my) share one store and the imports in flight: the provider sits above them, so
 * moving between them keeps an import running. /credits is in the group too; /s/[token] is outside.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <EverybirdProvider>
      {children}
      <SiteFooter />
    </EverybirdProvider>
  )
}
