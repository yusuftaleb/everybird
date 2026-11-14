// Not a spec: counts the requests a first visit sends to the app's own origin (the Vercel deployment), by page.
// Run: npx tsx scripts/validate/vercel-requests.ts (BASE_URL=<url> for another deployment; VERBOSE=1 lists every request).
// "Reach Vercel": same-origin requests not answered from Cloudflare's cache (cf-cache-status other than HIT).
import { chromium, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE_URL || "https://everybird.yusuftaleb.com").replace(/\/+$/, "");
const origin = new URL(BASE).origin;
const VERBOSE = !!process.env.VERBOSE;

// A synthetic 300-species eBird life list: every 30th species of the taxonomy (no personal data).
function lifeList(): string {
  const { species } = JSON.parse(readFileSync("public/data/species.v1.json", "utf8")) as { species: { com: string; sci: string; to: number }[] };
  const pick = species.filter((_, i) => i % 36 === 0).slice(0, 300);
  const head = "Row #,Taxon Order,Category,Common Name,Scientific Name,Count,Location,S/P,Date,LocID,SubID,Exotic,Countable";
  return [head, ...pick.map((s, i) => `${i + 1},${s.to},species,"${s.com}",${s.sci},1,Test Park,CA-BC,03 Mar 2024,L1,S${i},,1`)].join("\n");
}

async function visit(ctx: BrowserContext, path: string, label: string) {
  const page = await ctx.newPage();
  const seen: { url: string; vercel: boolean; cf: string }[] = [];
  const r2: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.startsWith("https://stickers.yusuftaleb.com/data/")) r2.push(`${u.slice(31)} ${r.status()}`);
    if (!u.startsWith(origin)) return;
    const h = r.headers();
    const path = u.slice(origin.length);
    // Reaches Vercel: not Cloudflare's own /cdn-cgi, and not answered from Cloudflare's cache.
    const cf = h["cf-cache-status"] || "-";
    seen.push({ url: path, vercel: !path.startsWith("/cdn-cgi/") && cf !== "HIT", cf });
  });
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(6000);
  const vercel = seen.filter((s) => s.vercel);
  const toVercel = new Map<string, number>();
  for (const s of vercel) { const k = s.url.split("?")[0].replace(/\/_next\/static\/immutable\/chunks\/.*/, "/_next/static chunks") + ` [${s.cf}]`; toVercel.set(k, (toVercel.get(k) || 0) + 1); }
  const groups = new Map<string, number>();
  for (const s of seen) {
    const k = s.url.startsWith("/_next/static/chunks") ? "/_next/static/chunks/*" : s.url.startsWith("/_next/static/media") ? "/_next/static/media/*" : s.url.startsWith("/data/masks/") ? "/data/masks/*" : s.url.split("?")[0].startsWith("/") && s.url.includes("_rsc") ? "RSC prefetch " + s.url.split("?")[0] : s.url.split("?")[0];
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  console.log(`\n${label}: ${seen.length} same-origin requests, ${vercel.length} reach Vercel`);
  for (const [k, n] of [...groups].sort((a, b) => b[1] - a[1])) if (VERBOSE) console.log(`  ${String(n).padStart(3)}  ${k}`);
  console.log(`  data from R2: ${r2.length ? r2.join(", ") : "none"}`);
  console.log("  reaching Vercel:");
  for (const [k, n] of [...toVercel].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
  await page.close();
  return { total: seen.length, vercel: vercel.length };
}

(async () => {
  const browser = await chromium.launch();
  const state = { cookies: [], origins: [{ origin, localStorage: [{ name: "everybird:welcomed", value: "1" }] }] };
  const out: Record<string, { total: number; vercel: number }> = {};
  out.landing = await visit(await browser.newContext({ storageState: state }), "/", "Landing /");
  out.about = await visit(await browser.newContext({ storageState: state }), "/about", "About /about");
  // Make a list in one context, then visit / fresh (empty HTTP cache) with that context's storage.
  const make = await browser.newContext({ storageState: state });
  const p = await make.newPage();
  await p.goto(BASE + "/settings");
  await p.getByTestId("ebird-input").setInputFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(lifeList()) });
  await p.getByTestId("see-collage").waitFor({ timeout: 30000 });
  await p.waitForTimeout(1000);
  const saved = await make.storageState();
  await make.close();
  out.collage = await visit(await browser.newContext({ storageState: saved }), "/", "Collage / (300-species list)");
  console.log("\nSUMMARY", JSON.stringify(out));
  await browser.close();
})();
