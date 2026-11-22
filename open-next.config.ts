// OpenNext for Cloudflare Workers (`npm run cf:build`). The Vercel build never reads this file.
// The incremental cache (ISR and fetch cache entries) lives in the existing R2 bucket `everybird-opennext-cache`,
// bound as NEXT_INC_CACHE_R2_BUCKET in wrangler.jsonc. Stickers and data stay on R2 under their own domain.
// The regional cache (audit 17) keeps those entries in each data centre's Cache API, so a page is read from R2 once
// per region rather than on every request: long-lived holds an SSG page up to 30 minutes, keyed by build, so a deploy
// never serves the previous build's pages.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
});
