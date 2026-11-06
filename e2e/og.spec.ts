import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeShare, type SharePayload } from "../src/lib/share/link";
import { OG_CACHE_COMPLETE } from "../src/lib/share/og";

// Synthetic list: 197 species with stickers, spread over the taxonomy, dated in 2026 (the last one is the latest lifer).
const species = (JSON.parse(readFileSync("public/data/species.v1.json", "utf8")) as { species: { code: string; st: boolean; com: string }[] }).species;
const linkCodes = new Set(JSON.parse(readFileSync("data/link-index.json", "utf8")) as string[]);
const pool = species.filter((s) => s.st && linkCodes.has(s.code));
const step = pool.length / 197;
const birds = Array.from({ length: 197 }, (_, i) => ({ code: pool[Math.floor(i * step)].code, ym: (2026 - 1900) * 12 + (i % 12) }));
const payload: SharePayload = { v: 1, name: "Test Birder", birds };
const { token } = encodeShare(payload);

function pngSize(buf: Buffer): [number, number] {
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test("a share link's preview image is a 1200x630 PNG within 4 s", async ({ request }) => {
  // Warm the route once (dev compile, fonts, masks); the budget is for a request after that.
  await request.get(`/s/${token}/opengraph-image`, { timeout: 60_000 });
  const t0 = Date.now();
  const res = await request.get(`/s/${token}/opengraph-image`);
  const ms = Date.now() - t0;
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  expect(pngSize(await res.body())).toEqual([1200, 630]);
  expect(ms).toBeLessThan(4000);
});

// A token is content-addressed (the link encodes the list), so a complete card is cached a year at the CDN. Next passes
// the ImageResponse's header through on both metadata-image routes (the twitter card re-exports the same image).
test("a complete preview is sent with the year-long cache header, on the og and the twitter image", async ({ request }) => {
  for (const route of ["opengraph-image", "twitter-image"]) {
    const res = await request.get(`/s/${token}/${route}`, { timeout: 60_000 });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"], `${route}: every font and sticker loaded, so the card is complete`).toBe(OG_CACHE_COMPLETE);
  }
});

test("a different, uncached list also renders in 4 s", async ({ request }) => {
  const other = encodeShare({ v: 1, birds: birds.slice(0, 40) }).token;
  const t0 = Date.now();
  const res = await request.get(`/s/${other}/opengraph-image`);
  expect(res.status()).toBe(200);
  expect(Date.now() - t0).toBeLessThan(4000);
});

test("a broken token gets a generic preview card, never a 500", async ({ request }) => {
  const res = await request.get("/s/garbage/opengraph-image");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  expect(pngSize(await res.body())).toEqual([1200, 630]);
});

test("the page head carries the per-person title, og:image and the large twitter card", async ({ page }) => {
  await page.goto(`/s/${token}`);
  const meta = (sel: string) => page.locator(sel).first().getAttribute("content");
  await expect(page).toHaveTitle("Test Birder's life list: 197 species");
  expect(await meta('meta[property="og:title"]')).toBe("Test Birder's life list: 197 species");
  expect(await meta('meta[name="description"]')).toBe("Everybird turns a birder's life list into a sticker collage.");
  expect(await meta('meta[property="og:image"]')).toContain(`/s/${token}/opengraph-image`);
  expect(await meta('meta[property="og:image:width"]')).toBe("1200");
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
});

test("a broken token's head is generic", async ({ page }) => {
  await page.goto("/s/garbage");
  await expect(page).toHaveTitle("Everybird");
  expect(await page.locator('meta[property="og:image"]').count()).toBeGreaterThan(0);
});
