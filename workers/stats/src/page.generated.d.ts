// The type of the git-ignored page.generated.ts (it embeds fonts, so it is built, never committed: `npm --prefix
// workers/stats/ui run build`, which wrangler's build step runs before every deploy). Lets tsc check the Worker and the
// tests in a checkout that hasn't built the page; where the .ts exists, TypeScript reads it instead.
export declare const PAGE: string
