import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The collage's geometry is CSS px of its container only: the reader's text size (iOS Dynamic Type, Safari's aA
// "bigger text", a browser's default font size, all of which scale the root font size or text-size-adjust) never
// repacks it. The landing sample and a seeded 300-species list, at 390 and 1280, with the root font size at 100%,
// 150% and 200% (and -webkit-text-size-adjust 200% in WebKit): every bird's box relative to the stage and the stage's
// size are the same, and no sticker's silhouette paints over the count. TEXT_SIZE_SHOTS=<dir> saves screenshots.
type Row = { code: string };
const SPECIES = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
const OUT = process.env.TEXT_SIZE_SHOTS;
const N = 300;

type Size = { name: string; css: string };
const SIZES: Size[] = [
  { name: "100", css: "html { font-size: 100% !important; }" },
  { name: "150", css: "html { font-size: 150% !important; }" },
  { name: "200", css: "html { font-size: 200% !important; }" },
  { name: "adjust200", css: "html, body { -webkit-text-size-adjust: 200% !important; text-size-adjust: 200% !important; }" },
];

async function seed(page: Page, n: number, name?: string) {
  const step = SPECIES.length / n;
  const records = Array.from({ length: n }, (_, i) => ({ code: SPECIES[Math.floor(i * step)].code, source: "ebird", date: `20${10 + (i % 15)}-0${(i % 9) + 1}-1${i % 9}`, place: { country: "US" } }));
  const saved = { v: 1, ...(name ? { name } : {}), records: { ebird: records, "ebird-list": [], inat: [], manual: [] }, unmatched: [], edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false }, savedAt: new Date().toISOString() };
  await page.goto("/about");
  await page.evaluate((s) => new Promise<void>((done, fail) => {
    const o = indexedDB.open("everybird");
    o.onupgradeneeded = () => o.result.createObjectStore("kv");
    o.onsuccess = () => { const tx = o.result.transaction("kv", "readwrite"); tx.objectStore("kv").put(s, "everybird:v1"); tx.oncomplete = () => done(); tx.onerror = () => fail(tx.error); };
    o.onerror = () => fail(o.error);
  }), saved);
}

/** Adds the text-size style to every document before its own styles run (and keeps it last in <head>). */
async function textSize(page: Page, css: string) {
  await page.addInitScript((rule) => {
    const add = () => {
      const s = document.createElement("style");
      s.dataset.textSize = "";
      s.textContent = rule;
      (document.head ?? document.documentElement).appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add, { once: true });
  }, css);
}

async function settled(page: Page, count: number) {
  const stage = page.getByTestId("collage-stage");
  await expect(stage).toHaveAttribute("aria-label", new RegExp(`^Collage of ${count.toLocaleString("en-US")} species`), { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => {
    const L = document.querySelector<HTMLElement>('[data-testid="collage-stage"] .eb-layer');
    return !!L && !L.style.opacity && L.getAnimations().length === 0 && document.querySelectorAll(".eb-tile").length > 0
      && [...document.querySelectorAll(".eb-tile")].every((t) => t.getAnimations().length === 0);
  }), { timeout: 60_000 }).toBe(true);
  await expect(page.locator('[data-testid="collage-stage"] .eb-num')).toHaveText(count.toLocaleString("en-US"), { timeout: 10_000 });
  await page.waitForTimeout(700); // the stage height's ease
}

/** Every shown bird's box relative to the stage, rounded to 0.1 px; the stage's size; the root font size. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-testid="collage-stage"]')!;
    const s = stage.getBoundingClientRect();
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const boxes: Record<string, number[]> = {};
    for (const el of stage.querySelectorAll<HTMLElement>(".eb-bird:not([data-off])")) {
      // A windowed bird far from the viewport is not rendered: its box comes from its own variables (cqw of the stage).
      const st = getComputedStyle(el);
      const v = (n: string) => Number(st.getPropertyValue(n)) || 0;
      const k = s.width / 100;
      boxes[el.dataset.code!] = [r1(v("--x") * k), r1(v("--y") * k), r1(v("--w") * v("--k") * k), r1(v("--h") * v("--k") * k)];
    }
    return { stage: [r1(s.width), r1(s.height)], boxes, root: getComputedStyle(document.documentElement).fontSize, layout: stage.dataset.layout ?? null };
  });
}

/** Pixels of any rendered bird's silhouette inside the count's number or label box. */
async function clashes(page: Page) {
  return page.evaluate(async () => {
    const stage = document.querySelector<HTMLElement>('[data-testid="collage-stage"]')!;
    const num = stage.querySelector<HTMLElement>(".eb-num")!.getBoundingClientRect();
    const label = stage.querySelector<HTMLElement>(".eb-mid .eb-mono")!.getBoundingClientRect();
    const species = (await (await fetch("/data/species.v1.json")).json()).species as { code: string; ord: string }[];
    const ordOf = new Map(species.map((s) => [s.code, s.ord]));
    const birds = [...stage.querySelectorAll<HTMLElement>(".eb-bird:not([data-off]):not([data-far])")].map((el) => ({ code: el.dataset.code!, r: el.getBoundingClientRect() }));
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
    return { px, hit, num: f(num), label: f(label) };
  });
}

const CASES = [
  { name: "the landing sample", list: false },
  { name: `a ${N}-species list`, list: true },
];
const countOf = (list: boolean) => list ? N : (JSON.parse(readFileSync(resolve(__dirname, "../public/data/sample.v1.json"), "utf8")) as { birds: unknown[] }).birds.length;

type Run = { size: string; g: Awaited<ReturnType<typeof geometry>> };
/** One fresh page: the text size or page zoom, the list, settled; checks the count's hole and sideways scroll. */
async function run(browser: import("@playwright/test").Browser, browserName: string, c: (typeof CASES)[number], o: { width: number; size: string; css?: string; zoom?: number }): Promise<Run> {
  const z = o.zoom ?? 1;
  // Page zoom (Safari's aA, a browser's Cmd +) is CSS px getting bigger: the viewport is width / z CSS px at z times the
  // pixel ratio.
  const ctx = await browser.newContext({
    viewport: { width: Math.round(o.width / z), height: Math.round(900 / z) }, deviceScaleFactor: z === 1 ? 1 : 2 * z,
    storageState: { cookies: [], origins: [{ origin: new URL(test.info().project.use.baseURL!).origin, localStorage: [{ name: "everybird:welcomed", value: "1" }] }] },
  });
  const page = await ctx.newPage();
  if (o.css) await textSize(page, o.css);
  const count = countOf(c.list);
  if (c.list) await seed(page, N);
  await page.goto("/");
  await settled(page, count);
  const g = await geometry(page);
  const hole = await clashes(page);
  console.log(`[text-size] ${browserName} ${c.list ? "list" : "sample"} ${o.width}px ${o.size} (root ${g.root}): stage ${g.stage.join("x")}, ${Object.keys(g.boxes).length} birds, number ${hole.num.join("x")}, label ${hole.label.join("x")}, ${hole.px} px over the count`);
  if (OUT && o.width === 390 && browserName === "webkit" && (o.size === "100%" || o.size === "200%" || o.size === "zoom 200%")) {
    mkdirSync(OUT, { recursive: true });
    await page.evaluate(() => { const r = document.querySelector(".eb-num")!.getBoundingClientRect(); window.scrollBy(0, r.top - innerHeight / 2); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `${c.list ? "list" : "sample"}-${o.width}-${o.size.replace(/[ %]/g, "")}.png`) });
  }
  expect(hole.px, `stickers over the count at ${o.size}: ${hole.hit.join(", ")}`).toBe(0);
  if (z === 1) {
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways, `the page scrolls sideways at ${o.size}`).toBeLessThanOrEqual(0);
  }
  expect(Object.keys(g.boxes).length).toBe(count);
  await ctx.close();
  return { size: o.size, g };
}

/** Birds whose boxes differ by more than tol (each value divided by `per`, the stage width or 1). */
function moved(a: Run["g"], b: Run["g"], tol: number, rel: boolean) {
  const pa = rel ? a.stage[0] : 1, pb = rel ? b.stage[0] : 1;
  return Object.keys(a.boxes).filter((k) => !b.boxes[k] || a.boxes[k].some((v, i) => Math.abs(v / pa - b.boxes[k][i] / pb) > tol))
    .map((k) => `${k} ${a.boxes[k]} -> ${b.boxes[k]}`);
}

for (const c of CASES) {
  for (const width of [390, 1280]) {
    test(`${c.name} at ${width}px: the same collage at every text size`, async ({ browser, browserName }) => {
      test.setTimeout(240_000);
      const sizes = SIZES.filter((s) => s.name !== "adjust200" || browserName === "webkit");
      const seen: Run[] = [];
      for (const size of sizes) seen.push(await run(browser, browserName, c, { width, size: size.name === "adjust200" ? "text-size-adjust 200%" : `${size.name}%`, css: size.css }));
      const base = seen[0].g;
      for (const { size, g } of seen.slice(1)) {
        expect(g.stage, `stage size at ${size}`).toEqual(base.stage);
        const m = moved(base, g, 0.15, false); // 0.1 px: the seed and the worker's layout round a few sizes apart
        expect(m.length, `birds moved at ${size}: ${m.slice(0, 5).join("; ")}`).toBe(0);
      }
    });
  }
  test(`${c.name} at 390px: page zoom (Safari's aA) scales the collage and keeps the count in its hole`, async ({ browser, browserName }) => {
    test.setTimeout(240_000);
    const seen: Run[] = [];
    for (const zoom of [1, 1.25, 1.5, 2]) seen.push(await run(browser, browserName, c, { width: 390, size: `zoom ${zoom * 100}%`, zoom }));
    const base = seen[0].g;
    for (const { size, g } of seen.slice(1)) {
      // A zoomed page is narrower in CSS px: the same narrow layout, so every box is the same share of the stage.
      expect(g.layout ?? "narrow").toBe(base.layout ?? "narrow");
      expect(Math.abs(g.stage[1] / g.stage[0] - base.stage[1] / base.stage[0]), `stage aspect at ${size}`).toBeLessThan(0.01);
      const m = moved(base, g, 0.0015, true);
      expect(m.length, `birds moved at ${size}: ${m.slice(0, 5).join("; ")}`).toBe(0);
    }
  });
}

// Safari's aA bigger text is page zoom: a 390px phone at 150% / 200% lays the page out at 260 / 195 CSS px. No page
// scrolls sideways there (the top bar puts its nav on a second row under 300px; Places and Time drop their glyphs).
for (const width of [195, 260] as const) {
  test(`at ${width} CSS px (a 390px phone at aA ${width === 195 ? 200 : 150}%), no page scrolls sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/", "/settings", "/about"]) {
      await page.goto(path);
      await expect(page.getByTestId("topbar")).toBeVisible();
      await page.waitForTimeout(800);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, `${path} at ${width}px`).toBeLessThanOrEqual(width);
      for (const name of ["Collage", "Settings", "About"]) {
        const box = await page.getByTestId("topbar").getByRole("link", { name, exact: true }).boundingBox();
        expect(box!.x + box!.width, `${path}: ${name} on screen`).toBeLessThanOrEqual(width + 0.5);
      }
    }
  });
}

// Yusuf's phone at a large text size (2026-11-07): the page head squeezed "Yusuf's Life List" beside its buttons into a
// column a few letters wide, breaking every word. The title's words stay whole (the buttons wrap under it instead), and
// Settings' source rows keep their text readable beside or above their buttons.
for (const [width, css] of [[195, ""], [260, ""], [300, ""], [390, "html { font-size: 200% !important; }"]] as const) {
  test(`at ${width} CSS px${css ? " with a 200% root font size" : ""}, the collage title's words stay whole and Settings' rows stay readable`, async ({ page }) => {
    if (css) await textSize(page, css);
    await page.setViewportSize({ width, height: 800 });
    await seed(page, 40, "Yusuf's Life List");
    await page.goto("/");
    const h1 = page.locator("h1.eb-pagehead-title");
    await expect(h1).toHaveText("Yusuf's Life List");
    const broken = await h1.evaluate((el) => {
      const node = el.firstChild as Text, text = node.textContent ?? "", out: string[] = [];
      const re = /\S+/g;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
        const tops = new Set([...r.getClientRects()].map((b) => Math.round(b.top)));
        if (tops.size > 1) out.push(m[0]);
      }
      return out;
    });
    expect(broken, "words split across lines").toEqual([]);
    await page.goto("/settings");
    await expect(page.getByTestId("source-ebird")).toBeVisible();
    const squeezed = await page.locator(".eb-src-main").evaluateAll((rows) => rows.map((row) => {
      const text = row.querySelector(".eb-src-text")!.getBoundingClientRect(), acts = row.querySelector(".eb-src-acts")?.getBoundingClientRect();
      const ok = !acts || text.width >= row.getBoundingClientRect().width * 0.5 - 32 || acts.top >= text.bottom - 1;
      return ok ? null : `${Math.round(text.width)}px of ${Math.round(row.getBoundingClientRect().width)}`;
    }).filter(Boolean));
    expect(squeezed, "source rows squeezed").toEqual([]);
  });
}






// Under 300px of page the controls bar is a grid (app.css): never a control alone on a row, and the magnifier still
// opens the full-width "Find a bird" field.
for (const width of [195, 260] as const) {
  test(`at ${width} CSS px the controls bar keeps the magnifier beside other controls, and search opens inside the page`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await seed(page, 40);
    await page.goto("/");
    const rows = await page.locator(".eb-dock").evaluate((dock) => {
      const groups = [".eb-dock-tabs", ".eb-dock-tools", ".eb-dock-filters", ".eb-dock-end"].map((q) => dock.querySelector<HTMLElement>(q)!.getBoundingClientRect());
      const byTop = new Map<number, number>();
      for (const g of groups) byTop.set(Math.round(g.top / 4), (byTop.get(Math.round(g.top / 4)) ?? 0) + 1);
      const end = groups[3];
      return { endShares: [...byTop.entries()].some(([t, n]) => t === Math.round(end.top / 4) && n > 1), right: Math.max(...groups.map((g) => g.right)) };
    });
    expect(rows.endShares, "the magnifier shares its row").toBe(true);
    expect(rows.right).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Find a bird" }).click();
    const field = page.getByRole("combobox", { name: "Find a bird" });
    await expect(field).toBeVisible();
    const b = await field.boundingBox();
    expect(b!.x + b!.width).toBeLessThanOrEqual(width + 0.5);
    await page.keyboard.press("Escape");
    await expect(field).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
