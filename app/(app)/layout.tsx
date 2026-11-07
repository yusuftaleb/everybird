import { CloudflareBeacon } from '@/components/app/CloudflareBeacon'
import { EverybirdProvider } from '@/components/app/EverybirdProvider'
import { SiteFooter } from '@/components/app/SiteFooter'
import { TopBar } from '@/components/app/TopBar'
import { VisitTracker } from '@/components/app/VisitTracker'
import '@/components/app/app.css'

/**
 * The birder's pages (/ Collage, /settings, /about) share one store and the imports in flight: the provider sits above
 * them, so moving between them keeps an import running. /s/[token] is outside (its own top bar, no store).
 * Analytics live here, not in the root layout: Cloudflare Web Analytics only in production (never on /s/<token>, whose
 * token is the birder's list), and one anonymous `visit` per page view (src/lib/analytics.ts).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <EverybirdProvider>
      <TopBar />
      {children}
      <SiteFooter />
      <VisitTracker />
      {process.env.VERCEL_ENV === 'production' ? <CloudflareBeacon /> : null}
    </EverybirdProvider>
  )
}
