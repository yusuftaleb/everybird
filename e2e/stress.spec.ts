import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Viral-scale stress (opt-in: `npm run e2e:stress`, project "stress-chromium" / "stress-webkit"). Synthetic
// lists of 3,000, 6,000 and every species in the taxonomy (~11,000), at 390 and 1440 px, on a production build.
// Per case: the worker's layout time, no overlapping silhouettes and no sticker outside the stage (checked on
// the rendered page), the JS heap (Chromium), how many sticker images load (lazy: only those near the
// viewport), and the frame budget while scrolling and on a filter change (4x CPU in Chromium; WebKit has no
// CPU throttling, so it runs at 1x). The goal is the frame budget (no main-thread task over 100 ms, no frame over
// 50 ms; WebKit reports no long tasks); each case logs whether it met it. Asserted by default: the ceilings in
// CEILING (what the windowed collage keeps to, with headroom, so a regression fails). STRESS_STRICT=goal asserts the
// goal itself; STRESS_STRICT=0 only logs (a busy local machine). Numbers are logged as `[stress] ...` lines.
test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60_000);

type Row = { code: string; ord: string; st: boolean };
const SPECIES = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
const COUNTRIES = ["CA", "US", "EG", "GB", "ZA", "TR", "SA", "BY", "MX", "BR"];

/** The first n species at an even stride through the taxonomy (n >= the taxonomy: all of it). */
function syntheticSaved(n: number) {
  const step = SPECIES.length / Math.min(n, SPECIES.length);
  const rows = Array.from({ length: Math.min(n, SPECIES.length) }, (_, i) => SPECIES[Math.floor(i * step)]);
  const records = rows.map((s, i) => ({
    code: s.code,
    source: "ebird",
    date: `${2000 + (i % 25)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
    place: { country: COUNTRIES[i % COUNTRIES.length] },
  }));
  return {
    v: 1,
    records: { ebird: records, "ebird-list": [], inat: [], manual: [] },
    unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} },
    rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}

/** Time every layout-worker request on the page (posted -> answered), before the app loads. */
async function timeWorker(page: Page) {
  await page.addInitScript(() => {
    const W = window.Worker;
    const log: { type: string; key?: string; ms: number; n?: number }[] = [];
    (window as unknown as { __workerLog: typeof log }).__workerLog = log;
    window.Worker = class extends W {
      private sent = new Map<number, { t: number; type: string; key?: string; n?: number }>();
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        this.addEventListener("message", (e: MessageEvent) => {
          const s = this.sent.get(e.data?.id);
          if (s) { log.push({ type: s.type, key: s.key, n: s.n, ms: performance.now() - s.t }); this.sent.delete(e.data.id); }
        });
      }
      postMessage(m: unknown, t?: unknown) {
        const msg = m as { id?: number; type?: string; key?: string; codes?: string[]; entries?: unknown[] };
        if (msg && typeof msg.id === "number") this.sent.set(msg.id, { t: performance.now(), type: msg.type ?? "?", key: msg.key, n: (msg.codes ?? msg.entries)?.length });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super.postMessage(m, t as any);
      }
    } as typeof Worker;
  });
}

async function seedList(page: Page, n: number) {
  await page.goto("/about");
  await page.evaluate(
    (saved) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open("everybird");
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(saved, "everybird:v1");
          tx.oncomplete = () => done();
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    syntheticSaved(n),
  );
}

async function startProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __probe: { long: number[]; frames: number[]; stop: () => void } };
    const long: number[] = [];
    const frames: number[] = [];
    let po: PerformanceObserver | null = null;
    try {
      po = new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(e.duration)));
      po.observe({ entryTypes: ["longtask"] });
    } catch { po = null; } // WebKit: no long tasks, frames only
    let last = performance.now();
    let on = true;
    const tick = (t: number) => { frames.push(t - last); last = t; if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    w.__probe = { long, frames, stop: () => { on = false; po?.disconnect(); } };
  });
}
async function stopProbe(page: Page) {
  return page.evaluate(() => {
    const p = (window as unknown as { __probe: { long: number[]; frames: number[]; stop: () => void } }).__probe;
    p.stop();
    const f = p.frames.slice(1).sort((a, b) => a - b);
    return { long: Math.max(0, ...p.long), frame: f[f.length - 1] ?? 0, p95: f[Math.floor(f.length * 0.95)] ?? 0, frames: f.length };
  });
}

/**
 * Rasterise every shown bird's silhouette (its mask, scaled to its rendered rect) at one CSS px and count pixels
 * claimed by two birds, and birds whose rect leaves the stage. Species without a mask (drawn as an icon) are
 * left out of the raster but still checked against the stage.
 */
async function checkGeometry(page: Page) {
  return page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const stage = document.querySelector<HTMLElement>('[data-testid="collage-stage"]')!;
    const species = (await (await fetch("/data/species.v1.json")).json()).species as { code: string; ord: string }[];
    const ordOf = new Map(species.map((s) => [s.code, s.ord]));
    const vh = window.innerHeight;
    // Shown stickers within one screen of the viewport (the most the collage may have asked for at rest).
    let near = 0;
    for (const el of stage.querySelectorAll<HTMLElement>(".eb-bird:not([data-off]):not([data-far])")) {
      const r = el.getBoundingClientRect();
      if (el.querySelector("img") && r.bottom > -vh && r.top < 2 * vh) near++;
    }
    // Big lists render only the birds near the viewport (the others are data-far, display: none, and their DOM may
    // be behind): read every bird where it is really drawn, a screen at a time down the stage.
    const seen = new Map<string, { code: string; x: number; y: number; w: number; h: number }>();
    const y0 = window.scrollY;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const stageH = stage.getBoundingClientRect().height;
    for (let y = Math.max(0, top - vh); ; y += Math.floor(vh * 0.8)) {
      window.scrollTo(0, y);
      // The collage shows the birds near the viewport over a few budgeted frames: wait until it stops changing.
      for (let last = -1, same = 0, k = 0; same < 4 && k < 240; k++) {
        await frame();
        let n = 0; // rendered birds in the viewport: it grows as the viewport fills in
        for (const el of stage.querySelectorAll<HTMLElement>(".eb-bird:not([data-far])")) {
          const r = el.getBoundingClientRect();
          if (r.bottom > 0 && r.top < vh) n++;
        }
        same = n === last ? same + 1 : 0;
        last = n;
      }
      const sr = stage.getBoundingClientRect();
      for (const el of stage.querySelectorAll<HTMLElement>(".eb-bird:not([data-off]):not([data-far])")) {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < vh) seen.set(el.dataset.code!, { code: el.dataset.code!, x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
      }
      if (y >= top + stageH || window.scrollY + vh >= document.documentElement.scrollHeight - 1) break;
    }
    window.scrollTo(0, y0);
    await frame();
    const sr = stage.getBoundingClientRect();
    const shown = stage.querySelectorAll(".eb-bird:not([data-off])").length;
    const birds = [...seen.values()];
    const tables = new Map<string, Record<string, [number, number, string]>>();
    for (const o of new Set(birds.map((b) => ordOf.get(b.code)!))) {
      const res = await fetch(`/data/masks/${o}.v1.json`);
      tables.set(o, res.ok ? await res.json() : {});
    }
    const W = Math.ceil(sr.width) + 2, H = Math.ceil(sr.height) + 2;
    const own = new Int32Array(W * H).fill(-1);
    let outside = 0, clashes = 0, rastered = 0;
    const clashBirds = new Set<number>();
    birds.forEach((b, id) => {
      if (b.x < -1 || b.y < -1 || b.x + b.w > sr.width + 1 || b.y + b.h > sr.height + 1) outside++;
      const raw = tables.get(ordOf.get(b.code)!)?.[b.code];
      if (!raw) return;
      rastered++;
      const [mw, mh, b64] = raw;
      const bits = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      for (let py = Math.floor(b.y); py < Math.ceil(b.y + b.h); py++) {
        for (let px = Math.floor(b.x); px < Math.ceil(b.x + b.w); px++) {
          const u = (px + 0.5 - b.x) / b.w, v = (py + 0.5 - b.y) / b.h;
          if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
          const i = Math.floor(v * mh) * mw + Math.floor(u * mw);
          if (!(bits[i >> 3] & (0x80 >> (i & 7)))) continue;
          const k = (py + 1) * W + (px + 1);
          if (k < 0 || k >= own.length) continue;
          if (own[k] !== -1 && own[k] !== id) { clashes++; clashBirds.add(id); }
          own[k] = id;
        }
      }
    });
    return { shown, drawn: birds.length, near, rastered, outside, clashes, clashBirds: clashBirds.size, stageW: sr.width, stageH: sr.height };
  });
}

async function heapMB(page: Page, browserName: string) {
  if (browserName !== "chromium") return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  return usedSize / 1048576;
}

const SIZES: [string, number][] = [["3,000", 3000], ["6,000", 6000], ["all", SPECIES.length]];
const WIDTHS = [390, 1440];
// [longest task, longest frame] in ms. GOAL: the frame budget (filters.spec.ts). CEILING: asserted by default, for
// 3,000 and 6,000 species (big) and the whole taxonomy (all); see the P4 report for the numbers measured.
const GOAL = { scroll: [100, 50], filter: [100, 50] };
const CEILING = { big: { scroll: [100, 100], filter: [150, 200] }, all: { scroll: [150, 150], filter: [250, 350] } };
// Worker budget for the first full collage (setList + the even layout), unthrottled.
const LAYOUT_BUDGET_MS: Record<number, number> = { 3000: 20_000, 6000: 40_000, [SPECIES.length]: 90_000 };

for (const [label, n] of SIZES) {
  for (const width of WIDTHS) {
    test(`${label} species at ${width}px`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      const stickerReqs = new Set<string>();
      page.on("request", (r) => { if (/\/v1\/(128|384)\//.test(r.url())) stickerReqs.add(r.url()); });
      page.on("crash", () => console.log(`[stress] ${browserName} ${width}px ${n} species: THE PAGE CRASHED`));
      await timeWorker(page);
      await seedList(page, n);
      const t0 = Date.now();
      await page.goto("/");
      const stage = page.getByTestId("collage-stage");
      const count = Math.min(n, SPECIES.length);
      await expect(stage).toBeVisible({ timeout: LAYOUT_BUDGET_MS[n] * 2 });
      await expect.poll(() => stage.locator(".eb-bird:not([data-off])").count(), { timeout: LAYOUT_BUDGET_MS[n] * 2 }).toBe(count);
      const firstMs = Date.now() - t0;
      const log = await page.evaluate(() => (window as unknown as { __workerLog: { type: string; key?: string; ms: number; n?: number }[] }).__workerLog);
      const setList = log.find((l) => l.type === "setList")?.ms ?? NaN;
      const fullEven = log.find((l) => l.type === "layout" && l.key?.endsWith("|even|"))?.ms ?? NaN;
      await page.waitForTimeout(3000); // the first ripple, then idle prefetches may start
      const imgsAtRest = stickerReqs.size; // (before the check: it scrolls the whole stage)
      const geo = await checkGeometry(page);
      const heap = await heapMB(page, browserName);
      console.log(`[stress] ${browserName} ${width}px ${count} species: collage in ${firstMs} ms (setList ${setList.toFixed(0)} ms, full even layout ${fullEven.toFixed(0)} ms), stage ${geo.stageW.toFixed(0)}x${geo.stageH.toFixed(0)} px, ${geo.rastered}/${geo.shown} silhouettes checked, ${geo.clashes} clashing px (${geo.clashBirds} birds), ${geo.outside} outside, ${imgsAtRest} sticker requests at rest (${geo.near} stickers within a screen of the viewport), heap ${heap?.toFixed(0) ?? "n/a"} MB`);
      expect(geo.shown).toBe(count);
      expect(geo.drawn, "every shown bird is drawn where the viewport reaches it").toBe(count);
      expect(geo.outside).toBe(0);
      expect(geo.clashes).toBe(0);
      expect(fullEven).toBeLessThan(LAYOUT_BUDGET_MS[n]);
      // Deferred images: at rest only the stickers within a screen of the viewport have loaded (a little slack
      // for birds that passed through the margin during the first ripple).
      expect(imgsAtRest).toBeLessThanOrEqual(Math.ceil(geo.near * 1.1) + 30);
      if (heap !== null) expect(heap).toBeLessThan(400);

      // Scroll the whole stage (4x CPU in Chromium).
      const cdp = browserName === "chromium" ? await page.context().newCDPSession(page) : null;
      await cdp?.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await startProbe(page);
      // The whole stage, in both engines. (WebKit under Playwright used to deadlock here, in the inspector's network
      // instrumentation, with thousands of sticker requests in flight; Sticker now caps them at MAX_LOADS.)
      const steps = Math.min(40, Math.ceil(geo.stageH / 600));
      for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(80); }
      await page.waitForTimeout(800);
      const scroll = await stopProbe(page);
      const imgsScrolled = stickerReqs.size;
      const large = [...stickerReqs].filter((u) => u.includes("/384/")).length;
      // Stickers far from the viewport let go of their image: at most those within the release margin hold one.
      const held = await page.evaluate(() => document.querySelectorAll('[data-testid="collage-stage"] .eb-bird img[src]').length);
      console.log(`[stress] ${browserName} ${width}px ${count} species: scroll ${steps}x600px${cdp ? " at 4x CPU" : ""}: longest task ${scroll.long.toFixed(0)} ms, longest frame ${scroll.frame.toFixed(1)} ms, p95 frame ${scroll.p95.toFixed(1)} ms; ${imgsScrolled} sticker requests after scrolling (${large} of them 384 px), ${held} images held at the bottom`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // A filter change: the first order (1440: its chip; 390: from the picker sheet).
      await startProbe(page);
      const t1 = Date.now();
      if (width < 600) {
        await page.getByTestId("picker-order").click();
        const dlg = page.locator('.eb-sheet[role="dialog"]');
        await dlg.locator(".eb-chip:not([data-selected])").first().click();
        await expect(dlg).toHaveCount(0);
      } else {
        await page.locator('[data-testid="filter-bar"] .eb-chip:not([data-selected])').first().click();
      }
      await expect(page.getByTestId("collage-stats")).toContainText(" of ", { timeout: 120_000 });
      // Settled: the collage shows the count the stats give, and the bird layer is back (no fade-through under
      // way). Every shown bird drawn where it belongs is checked below (checkGeometry: a big list renders only the
      // birds near the viewport, so the DOM of the others may be behind).
      const stats = await page.getByTestId("collage-stats").innerText();
      const m = /([\d,]+)\s+of\s/i.exec(stats);
      if (!m) throw new Error(`unexpected stats: ${JSON.stringify(stats)}`);
      const want = Number(m[1].replace(/,/g, ""));
      await expect(stage).toHaveAttribute("aria-label", new RegExp(`^Collage of ${want.toLocaleString("en-US")} species`), { timeout: 120_000 });
      await expect.poll(() => page.evaluate(() => {
        const L = document.querySelector<HTMLElement>(".eb-layer")!;
        return !L.style.opacity && !L.style.contentVisibility && L.getAnimations().length === 0;
      }), { timeout: 120_000 }).toBe(true);
      const filterMs = Date.now() - t1;
      await page.waitForTimeout(1500);
      const filt = await stopProbe(page);
      await cdp?.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      console.log(`[stress] ${browserName} ${width}px ${count} species: filter (first order)${cdp ? " at 4x CPU" : ""}: shown after ${filterMs} ms, longest task ${filt.long.toFixed(0)} ms, longest frame ${filt.frame.toFixed(1)} ms, p95 frame ${filt.p95.toFixed(1)} ms`);
      const geo2 = await checkGeometry(page);
      expect(geo2.drawn, "every shown bird is drawn").toBe(want);
      expect(geo2.outside).toBe(0);
      expect(geo2.clashes).toBe(0);
      const met = (r: { long: number; frame: number }) => r.long <= 100 && r.frame <= 50;
      console.log(`[stress] ${browserName} ${width}px ${count} species: frame budget (100 ms task, 50 ms frame): scroll ${met(scroll) ? "met" : "missed"}, filter ${met(filt) ? "met" : "missed"}`);
      const strict = process.env.STRESS_STRICT ?? "1";
      if (strict !== "0") {
        const c = strict === "goal" ? GOAL : n >= SPECIES.length ? CEILING.all : CEILING.big;
        expect.soft(scroll.long, "longest task while scrolling").toBeLessThanOrEqual(c.scroll[0]);
        expect.soft(scroll.frame, "longest frame while scrolling").toBeLessThanOrEqual(c.scroll[1]);
        expect.soft(filt.long, "longest task on a filter change").toBeLessThanOrEqual(c.filter[0]);
        expect.soft(filt.frame, "longest frame on a filter change").toBeLessThanOrEqual(c.filter[1]);
      }
    });
  }
}
