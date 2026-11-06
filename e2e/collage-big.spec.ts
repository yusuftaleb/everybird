import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// A big (windowed) list moving between filters: 1,600 synthetic species, so the full collage fades through
// (data-fast: birds placed by left/top), then a family of one order travels (translate). Leaving data-fast must not
// make the kept birds fly in from the stage's top-left corner: each one glides from where it stood.
type Row = { code: string };
const SPECIES = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;

test("a big list: kept birds glide from where they stand when the filter narrows (never from the corner)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const n = 1600, step = SPECIES.length / n;
  const records = Array.from({ length: n }, (_, i) => ({ code: SPECIES[Math.floor(i * step)].code, source: "ebird", date: `20${10 + (i % 15)}-0${(i % 9) + 1}-1${i % 9}`, place: { country: "US" } }));
  const saved = { v: 1, records: { ebird: records, "ebird-list": [], inat: [], manual: [] }, unmatched: [], edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false }, savedAt: new Date().toISOString() };
  await page.goto("/about");
  await page.evaluate((s) => new Promise<void>((done, fail) => {
    const o = indexedDB.open("everybird");
    o.onupgradeneeded = () => o.result.createObjectStore("kv");
    o.onsuccess = () => { const tx = o.result.transaction("kv", "readwrite"); tx.objectStore("kv").put(s, "everybird:v1"); tx.oncomplete = () => done(); tx.onerror = () => fail(tx.error); };
    o.onerror = () => fail(o.error);
  }), saved);
  await page.goto("/");
  const stage = page.getByTestId("collage-stage");
  await expect(stage).toHaveAttribute("aria-label", /^Collage of 1,600 species/, { timeout: 60_000 });
  const settled = () => expect.poll(() => page.evaluate(() => {
    const L = document.querySelector<HTMLElement>(".eb-layer")!;
    return !L.style.opacity && !L.style.contentVisibility && L.getAnimations().length === 0 && document.querySelectorAll(".eb-tile").length > 0;
  }), { timeout: 30_000 }).toBe(true);
  await settled();
  // Big -> an order (a fade-through: data-fast on).
  await page.locator('[data-testid="filter-bar"] .eb-chip', { hasText: /Perching birds/ }).click();
  await expect(stage).toHaveAttribute("data-fast", "", { timeout: 30_000 });
  await settled();
  await page.waitForTimeout(800);
  // The order -> one of its families (a travel: data-fast off). Watch every rendered kept bird for a second.
  const codes = await page.locator('[data-testid="collage-stage"] .eb-tile:not([data-off])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.code!));
  await page.evaluate((codes) => {
    const w = window as unknown as { __track: Record<string, number[][]> };
    w.__track = {};
    const stage = document.querySelector<HTMLElement>('[data-testid="collage-stage"]')!;
    const t0 = performance.now();
    const tick = () => {
      const sr = stage.getBoundingClientRect();
      for (const c of codes) {
        const el = stage.querySelector<HTMLElement>(`.eb-bird[data-code="${c}"]`);
        if (!el || el.hasAttribute("data-off") || el.hasAttribute("data-far")) continue;
        const r = el.getBoundingClientRect();
        (w.__track[c] ??= []).push([r.left - sr.left, r.top - sr.top]);
      }
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, codes);
  await page.locator('[data-testid="filter-bar"] .eb-chip:not([data-selected])').first().click();
  await expect(stage).not.toHaveAttribute("data-fast", "", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const track = await page.evaluate(() => (window as unknown as { __track: Record<string, number[][]> }).__track);
  const kept = Object.values(track).filter((t) => t.length > 5);
  expect(kept.length).toBeGreaterThan(0);
  for (const t of kept) {
    const [x0, y0] = t[0], [x1, y1] = t[t.length - 1];
    const nearest = Math.min(...t.map(([x, y]) => x + y));
    // Never closer to the corner than both ends of its glide (a fly-in from 0,0 would pass near it).
    expect(nearest).toBeGreaterThanOrEqual(Math.min(x0 + y0, x1 + y1) - 4);
  }
});
