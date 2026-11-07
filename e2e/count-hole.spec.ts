import { mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The count in the middle of the collage (Tally: the number over "SPECIES") sits in the hole the packer keeps empty,
// sized from the shown count's own text (src/lib/layout/count-box.ts). A 1,089-species synthetic list, at a desktop and
// a phone width: no sticker's silhouette (its mask, scaled to the rendered tile) may paint inside the number's or the
// label's rendered box. COUNT_HOLE_SHOTS=<dir> saves a screenshot of the middle and the story share image there.
type Row = { code: string };
const SPECIES = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
const OUT = process.env.COUNT_HOLE_SHOTS;
const N = 1089;

async function seed(page: Page, n: number) {
  const step = SPECIES.length / n;
  const records = Array.from({ length: n }, (_, i) => ({ code: SPECIES[Math.floor(i * step)].code, source: "ebird", date: `20${10 + (i % 15)}-0${(i % 9) + 1}-1${i % 9}`, place: { country: "US" } }));
  const saved = { v: 1, records: { ebird: records, "ebird-list": [], inat: [], manual: [] }, unmatched: [], edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false }, savedAt: new Date().toISOString() };
  await page.goto("/about");
  await page.evaluate((s) => new Promise<void>((done, fail) => {
    const o = indexedDB.open("everybird");
    o.onupgradeneeded = () => o.result.createObjectStore("kv");
    o.onsuccess = () => { const tx = o.result.transaction("kv", "readwrite"); tx.objectStore("kv").put(s, "everybird:v1"); tx.oncomplete = () => done(); tx.onerror = () => fail(tx.error); };
    o.onerror = () => fail(o.error);
  }), saved);
}

/** Pixels of any rendered bird's silhouette inside the number's or the label's box (and the boxes, for the report). */
async function clashes(page: Page) {
  return page.evaluate(async () => {
    const stage = document.querySelector<HTMLElement>('[data-testid="collage-stage"]')!;
    const num = stage.querySelector<HTMLElement>(".eb-num")!.getBoundingClientRect();
    const label = stage.querySelector<HTMLElement>(".eb-mid .eb-mono")!.getBoundingClientRect();
    const species = (await (await fetch("/data/species.v1.json")).json()).species as { code: string; ord: string }[];
    const ordOf = new Map(species.map((s) => [s.code, s.ord]));
    const near = (r: DOMRect) => r.right > num.left - 200 && r.left < num.right + 200 && r.bottom > num.top - 200 && r.top < label.bottom + 200;
    const birds = [...stage.querySelectorAll<HTMLElement>(".eb-bird:not([data-off]):not([data-far])")]
      .map((el) => ({ code: el.dataset.code!, r: el.getBoundingClientRect() })).filter((b) => near(b.r));
    const tables = new Map<string, Record<string, [number, number, string]>>();
    for (const o of new Set(birds.map((b) => ordOf.get(b.code)!))) {
      const res = await fetch(`/data/masks/${o}.v1.json`);
      tables.set(o, res.ok ? await res.json() : {});
    }
    let px = 0;
    const hit: string[] = [];
    for (const { code, r } of birds) {
      const raw = tables.get(ordOf.get(code)!)?.[code];
      if (!raw) continue;
      const [mw, mh, b64] = raw;
      const bits = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      let mine = 0;
      for (const box of [num, label]) {
        const x0 = Math.max(box.left, r.left), x1 = Math.min(box.right, r.right), y0 = Math.max(box.top, r.top), y1 = Math.min(box.bottom, r.bottom);
        for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) {
          const u = (x + 0.5 - r.left) / r.width, v = (y + 0.5 - r.top) / r.height;
          if (u < 0 || v < 0 || u >= 1 || v >= 1 || x + 0.5 < box.left || x + 0.5 > box.right || y + 0.5 < box.top || y + 0.5 > box.bottom) continue;
          const i = Math.floor(v * mh) * mw + Math.floor(u * mw);
          if (bits[i >> 3] & (0x80 >> (i & 7))) mine++;
        }
      }
      if (mine) { px += mine; hit.push(code); }
    }
    const f = (r: DOMRect) => [r.width, r.height].map((v) => Math.round(v * 10) / 10);
    return { px, hit, checked: birds.length, num: f(num), label: f(label), text: stage.querySelector(".eb-num")!.textContent };
  });
}

for (const width of [1280, 390]) {
  test(`${N.toLocaleString("en-US")} species at ${width}px: no sticker paints over the count`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await seed(page, N);
    await page.goto("/");
    const stage = page.getByTestId("collage-stage");
    await expect(stage).toHaveAttribute("aria-label", new RegExp(`^Collage of ${N.toLocaleString("en-US")} species`), { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => {
      const L = document.querySelector<HTMLElement>(".eb-layer");
      return !!L && !L.style.opacity && L.getAnimations().length === 0 && document.querySelectorAll(".eb-tile").length > 0
        && [...document.querySelectorAll(".eb-tile")].every((t) => t.getAnimations().length === 0);
    }), { timeout: 60_000 }).toBe(true);
    await page.locator(".eb-num").scrollIntoViewIfNeeded();
    await page.evaluate(() => { const r = document.querySelector(".eb-num")!.getBoundingClientRect(); window.scrollBy(0, r.top - window.innerHeight / 2); });
    await expect(page.locator(".eb-num")).toHaveText(N.toLocaleString("en-US"), { timeout: 10_000 });
    await page.waitForTimeout(600);
    const res = await clashes(page);
    console.log(`[count-hole] ${width}px: number ${res.num.join("x")}, label ${res.label.join("x")}, ${res.checked} birds near, ${res.px} px over the text (${res.hit.join(", ")})`);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      const box = (await page.locator(".eb-num").boundingBox())!;
      const w = Math.min(width, 640), h = 420;
      await page.screenshot({ path: join(OUT, `collage-${width}.png`), clip: { x: Math.max(0, box.x + box.width / 2 - w / 2), y: Math.max(0, box.y + box.height / 2 - h / 2), width: w, height: h } });
    }
    expect(res.checked).toBeGreaterThan(5);
    expect(res.text).toBe(N.toLocaleString("en-US"));
    expect(res.px, `stickers over the count: ${res.hit.join(", ")}`).toBe(0);
  });
}

test(`${N.toLocaleString("en-US")} species: the story share image`, async ({ page }) => {
  test.skip(!OUT, "COUNT_HOLE_SHOTS saves the story image for a look");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page, N);
  await page.goto("/");
  await expect(page.getByTestId("collage-stage")).toHaveAttribute("aria-label", /^Collage of 1,089 species/, { timeout: 60_000 });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your collage" });
  await expect(dialog.getByRole("img", { name: "Preview of the story image" })).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
  mkdirSync(OUT!, { recursive: true });
  await dl.saveAs(join(OUT!, "story.png"));
});
