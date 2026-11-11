import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { BIRDS, TOTAL } from "../src/components/about/how-it-works-data";
import { pageTitle } from "../src/lib/list/title";
import { countParts, summaryLine, type RowCount, type SourceCounts } from "../src/lib/list/source-counts";
import { SHARE_ORIGIN } from "../src/lib/share/origin";

// share/image.ts's FOOTER_LINE (that module can't load here: it starts a worker with import.meta); the test checks its
// definition is still this.
const FOOTER_LINE = `${new URL(SHARE_ORIGIN).host} · stickers by huashu`;
const frozen = readFileSync("tests/fixtures/share/v1-frozen.txt", "utf8").trim();

test("/about says what Everybird is, what True size means, and credits the stickers (CC BY 4.0) and the taxonomy version", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "What True size means" })).toBeVisible();
  await expect(main.getByText(/cube root of mass/)).toBeVisible();
  await expect(main.getByText("Your list never leaves your browser.", { exact: false })).toBeVisible();
  await expect(main.getByText(/Cloudflare Web Analytics, anonymous and cookieless/)).toBeVisible();
  await expect(main.getByText(/daily-changing anonymous id/)).toBeVisible();
  await expect(main.getByText(/Vercel Analytics/)).toHaveCount(0);
  const credits = main.locator("#credits");
  await expect(credits.getByRole("link", { name: "Yusuf Taleb" })).toHaveAttribute("href", "https://www.yusuftaleb.com");
  await expect(credits.getByRole("link", { name: "life list on his site" })).toHaveAttribute("href", "https://www.yusuftaleb.com/lifelist");
  await expect(credits.locator('a[href="https://github.com/alchaincyf/huashu-bird-sticker"]').first()).toBeVisible();
  await expect(credits.getByText("CC BY 4.0").first()).toBeVisible();
  await expect(credits.locator('a[href="https://theodore.net/projects/AvianVisitors/"]')).toBeVisible();
  await expect(credits.getByText(/eBird\/Clements taxonomy, version 20\d\d/)).toBeVisible();
  await expect(credits.getByRole("link", { name: "Debian iso-codes" })).toHaveAttribute("href", "https://salsa.debian.org/iso-codes-team/iso-codes");
  await expect(credits.getByText("Region names · LGPL-2.1")).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
  expect(errors).toEqual([]);
});

test("old addresses redirect: /credits to /about#credits, /make to /settings, /my to /", async ({ page }) => {
  await page.goto("/credits");
  await expect(page).toHaveURL(/\/about#credits$/);
  await page.goto("/make");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.goto("/my");
  await expect(page).toHaveURL(/\/$/);
});

for (const [name, path] of [
  ["collage", "/"],
  ["settings", "/settings"],
  ["about", "/about"],
  ["shared view", `/s/${frozen}`],
] as const) {
  test(`the ${name} page has the top bar and the footer's credits link (no inline sticker line)`, async ({ page }) => {
    await page.goto(path);
    const bar = page.getByRole("banner");
    await expect(bar.getByRole("link", { name: "Everybird" })).toHaveAttribute("href", "/");
    for (const [label, href] of [["Collage", "/"], ["Settings", "/settings"], ["About", "/about"]]) {
      await expect(bar.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    }
    await expect(bar.getByRole("switch", { name: "Dark mode" })).toBeVisible();
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "huashu-bird-sticker" })).toHaveCount(0); // the credit lives on About#credits
    await expect(footer).not.toContainText("CC BY 4.0");
    await expect(footer.getByRole("link", { name: "All credits" })).toHaveAttribute("href", "/about#credits");
    await expect(footer.getByRole("link", { name: "Made by Yusuf Taleb" })).toHaveAttribute("href", "https://www.yusuftaleb.com");
    // The code on GitHub, at the row's right edge, with a 44px press
    const gh = footer.getByRole("link", { name: "Everybird on GitHub" });
    await expect(gh).toHaveAttribute("href", "https://github.com/yusuftaleb/everybird");
    await expect(gh).toHaveAttribute("target", "_blank");
    await expect(gh).toHaveAttribute("rel", "noopener noreferrer");
    const m = await gh.evaluate((el) => {
      const after = getComputedStyle(el, "::after");
      const r = el.getBoundingClientRect();
      const row = el.parentElement!.getBoundingClientRect();
      const inset = parseFloat(after.top);
      return { w: r.width - 2 * inset, h: r.height - 2 * inset, rightGap: row.right - r.right };
    });
    expect(m.w).toBeGreaterThanOrEqual(44);
    expect(m.h).toBeGreaterThanOrEqual(44);
    expect(m.rightGap).toBeLessThan(1);
  });
}

for (const width of [320, 390]) {
  test(`the top bar is one row with no sideways scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/about");
    const m = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(".eb-topbar-in")!;
      const items = [...bar.children].map((c) => c.getBoundingClientRect());
      return { sw: document.documentElement.scrollWidth, tops: items.map((r) => Math.round(r.top + r.height / 2)) };
    });
    expect(m.sw).toBe(width);
    expect(new Set(m.tops).size).toBe(1);
  });
}

// ---- About's "How it works" figure (src/components/about): the static poster, the live stage, its labels ----

const SIZES = [
  { layout: "wide", width: 1280, height: 800 },
  { layout: "compact", width: 390, height: 844 },
] as const

for (const { layout, width, height } of SIZES) {
  test(`How it works: the poster is in the page's HTML, the ${layout} design filling its slot, before any script runs`, async ({ browser }) => {
    // No stored state: setting it would need a script (Firefox waits on it forever with scripts off)
    const ctx = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: false, storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    await page.goto("/about")
    const slot = page.getByTestId("howto-demo")
    const shown = slot.locator(`[data-poster="${layout}"]`)
    await expect(shown).toBeVisible()
    await expect(slot.locator(`[data-poster="${layout === "wide" ? "compact" : "wide"}"]`)).toBeHidden()
    await expect(shown.locator(".ebd-head-title")).toHaveText("My collage")
    await expect(shown.locator(".ebd-num")).toHaveText(String(TOTAL))
    await expect(shown.locator(".ebd-mid-label")).toHaveText("Species")
    const m = await page.evaluate((l) => {
      const s = document.querySelector('[data-testid="howto-demo"]')!.getBoundingClientRect()
      const st = document.querySelector(`[data-poster="${l}"] .ss-stage`)!.getBoundingClientRect()
      return { slotW: s.width, slotH: s.height, w: st.width, h: st.height, left: st.left - s.left }
    }, layout)
    // The stage's own scale (min(1, width / design width)) and height: the slot is never a blank box
    expect(Math.abs(m.h - m.slotH)).toBeLessThan(1.5)
    expect(m.w).toBeLessThanOrEqual(m.slotW + 1)
    expect(m.left).toBeGreaterThanOrEqual(-1)
    await ctx.close()
  })

  test(`How it works: with scripts the poster shows at once and its stickers as they load; in view, the stage takes over (${layout})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height } })
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()))
    page.on("pageerror", (e) => errors.push(e.message))
    await page.goto("/about", { waitUntil: "domcontentloaded" })
    const slot = page.getByTestId("howto-demo")
    const poster = slot.locator(`[data-poster="${layout}"]`)
    await expect(poster).toBeVisible({ timeout: 1000 })
    await expect(poster.locator(".ebd-num")).toHaveText(String(TOTAL), { timeout: 1000 })
    // Every collage sticker of the poster shows (data-ld), drawn once its file is in
    await expect(poster.locator(".ebd-collage img.ebd-st[data-ld]")).toHaveCount(BIRDS.length, { timeout: 15_000 })
    await slot.scrollIntoViewIfNeeded()
    await expect(slot).toHaveAttribute("data-live", "", { timeout: 15_000 })
    await expect(slot.getByTestId("howto-poster")).toHaveCount(0, { timeout: 3000 })
    const live = slot.locator(".ss-stage:not([data-still])")
    await expect(live).toHaveAttribute("data-layout", layout)
    await expect(live.locator(".ebd-h2")).toHaveText("Your list")
    expect(errors).toEqual([])
    await ctx.close()
  })

  test(`How it works: under reduced motion the poster is all there is, still (${layout})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })
    const page = await ctx.newPage()
    await page.goto("/about")
    const slot = page.getByTestId("howto-demo")
    await slot.scrollIntoViewIfNeeded()
    const poster = slot.locator(`[data-poster="${layout}"]`)
    await expect(poster.locator(".ebd-collage img.ebd-st[data-ld]")).toHaveCount(BIRDS.length, { timeout: 15_000 })
    const frame = () => page.evaluate((l) => [...document.querySelectorAll(`[data-poster="${l}"] .ebd-bird`)].map((b) => b.getBoundingClientRect().x).join(), layout)
    const a = await frame()
    await page.waitForTimeout(2500)
    expect(await frame()).toBe(a)
    await expect(slot).not.toHaveAttribute("data-live")
    await expect(slot.locator(".ss-stage")).toHaveCount(2) // the poster's two designs, and no live stage
    await expect(poster.locator(".ebd-num")).toHaveText(String(TOTAL))
    await ctx.close()
  })

  test(`How it works: the collage draws every bird it counts, each inside the window's visible part (${layout})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })
    const page = await ctx.newPage()
    await page.goto("/about")
    const poster = page.locator(`[data-poster="${layout}"]`)
    await expect(poster.locator(".ebd-num")).toHaveText(String(TOTAL))
    await expect(poster.locator(".ebd-collage .ebd-bird")).toHaveCount(TOTAL)
    // The part of the window the stage shows: the window's body clipped by the stage
    const out = await page.evaluate((l) => {
      const root = document.querySelector(`[data-poster="${l}"]`)!
      const st = root.querySelector(".ss-stage")!.getBoundingClientRect()
      const body = root.querySelector(".ss-window__body")!.getBoundingClientRect()
      const v = { l: Math.max(st.left, body.left), t: Math.max(st.top, body.top), r: Math.min(st.right, body.right), b: Math.min(st.bottom, body.bottom) }
      return [...root.querySelectorAll<HTMLElement>(".ebd-collage .ebd-bird")].flatMap((el) => {
        const r = el.getBoundingClientRect()
        return r.left >= v.l - 0.5 && r.top >= v.t - 0.5 && r.right <= v.r + 0.5 && r.bottom <= v.b + 0.5 ? [] : [`${el.dataset.code} ${[r.left, r.top, r.right, r.bottom].map(Math.round)} outside ${[v.l, v.t, v.r, v.b].map(Math.round)}`]
      })
    }, layout)
    expect(out).toEqual([])
    await ctx.close()
  })

  test(`How it works: no sticker paints on the count, in the collage and the share images (${layout})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })
    const page = await ctx.newPage()
    await page.goto("/about")
    const poster = page.locator(`[data-poster="${layout}"]`)
    await expect(poster.locator(".ebd-collage img.ebd-st[data-ld]")).toHaveCount(BIRDS.length, { timeout: 15_000 })
    // Each sticker's opaque pixels (its file's alpha, drawn where object-fit: contain puts it) against the count's text
    // boxes (the number's line box and the label's), in the collage and in each share image.
    const hits = await page.evaluate(async (l) => {
      const out: string[] = []
      const groups: [string, Element][] = []
      const root = document.querySelector(`[data-poster="${l}"]`)!
      groups.push(["collage", root.querySelector(".ebd-collage")!])
      root.querySelectorAll(".ebd-img").forEach((el) => groups.push([`share ${(el as HTMLElement).dataset.format}`, el]))
      for (const [name, g] of groups) {
        // The text's own advance (a range over it) across, its line box (the element) down
        const text = [...g.querySelectorAll(".ebd-num, .ebd-mid-label, .ebd-img-num, .ebd-img-label")].map((t) => {
          const range = document.createRange()
          range.selectNodeContents(t)
          const a = range.getBoundingClientRect(), b = t.getBoundingClientRect()
          return new DOMRect(a.x, b.y, a.width, b.height)
        })
        for (const img of g.querySelectorAll<HTMLImageElement>("img.ebd-st")) {
          if (img.closest(".ebd-img-latest")) continue
          const r = img.getBoundingClientRect()
          const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
          const dw = img.naturalWidth * k, dh = img.naturalHeight * k
          const d = { x: r.x + (r.width - dw) / 2, y: r.y + (r.height - dh) / 2, w: dw, h: dh }
          for (const t of text) {
            const x0 = Math.max(d.x, t.x), y0 = Math.max(d.y, t.y), x1 = Math.min(d.x + d.w, t.right), y1 = Math.min(d.y + d.h, t.bottom)
            if (x1 <= x0 || y1 <= y0) continue
            const bmp = await createImageBitmap(await (await fetch(img.src)).blob())
            const S = 4 // px per CSS px
            const c = new OffscreenCanvas(Math.ceil(d.w * S), Math.ceil(d.h * S))
            const ctx = c.getContext("2d")!
            ctx.drawImage(bmp, 0, 0, c.width, c.height)
            const px = ctx.getImageData(Math.floor((x0 - d.x) * S), Math.floor((y0 - d.y) * S), Math.max(1, Math.ceil((x1 - x0) * S)), Math.max(1, Math.ceil((y1 - y0) * S))).data
            let n = 0
            for (let i = 3; i < px.length; i += 4) if (px[i] > 40) n++
            if (n / (S * S) > 2) out.push(`${name}: ${img.src.split("/").pop()} paints ${(n / (S * S)).toFixed(1)} px² on the count`)
          }
        }
      }
      return out
    }, layout)
    expect(hits).toEqual([])
    await ctx.close()
  })
}

test("How it works: the scene's labels are the product's (Settings rows, summary, page head, share formats, image footer)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/about")
  const scene = page.locator('[data-poster="wide"]')
  const src = (f: string) => readFileSync(f, "utf8")
  // Settings: the heads and the four source rows, as SourceRow draws them
  await expect(scene.locator(".ebd-h1")).toHaveText("Settings")
  expect(src("src/components/app/SettingsPage.tsx")).toContain('<PageHead title="Settings" />')
  await expect(scene.locator(".ebd-h2")).toHaveText("Your list")
  expect(src("src/components/import/ImportPanel.tsx")).toContain('>Your list</h2>')
  const titles = await scene.locator(".ebd-src-title").evaluateAll((els) => els.map((e) => e.firstChild!.textContent))
  expect(titles).toEqual(["eBird life list", "MyEBirdData", "iNaturalist", "Ticked by hand"])
  for (const t of titles.slice(0, 2)) expect(src("src/components/import/EbirdDrop.tsx")).toContain(`title: '${t}'`)
  expect(src("src/components/import/InatForm.tsx")).toContain('title="iNaturalist"')
  expect(src("src/components/import/ImportPanel.tsx")).toContain('title="Ticked by hand"')
  // The connected row's status and the summary line, from the product's own functions
  const status = (await scene.locator(".ebd-src-full .ebd-src-meta > .ebd-swap > .ebd-swap-b").textContent())!
  // Before the import: "Not added", then the reading line in its place (the product's .eb-status wording)
  await expect(scene.locator(".ebd-src-full .ebd-src-meta > .ebd-swap > .ebd-swap-a .ebd-swap-a")).toHaveText("Not added")
  await expect(scene.locator(".ebd-src-full .ebd-src-meta > .ebd-swap > .ebd-swap-a .ebd-swap-b")).toHaveText(/^Reading your file… [\d,]+ rows$/)
  expect(status).toMatch(new RegExp(`^${countParts({ species: TOTAL, only: 0 } as RowCount).join(" · ")} · 3 skipped why\\? · Imported \\d{1,2} [A-Z][a-z]{2}$`))
  const sum = summaryLine({ total: TOTAL, parts: [{ group: "ebird", n: TOTAL }] } as unknown as SourceCounts)!
  await expect(scene.locator(".ebd-sum .ebd-swap-b")).toHaveText(`${sum} See my collage`)
  await expect(scene.locator(".ebd-sum .ebd-swap-a")).toHaveText("Combine any of these into one list.")
  expect(src("src/components/import/ImportPanel.tsx")).toContain("Combine any of these into one list.")
  // The collage page: the title as the product shows an untitled collage, and the taxonomy labels
  await expect(scene.locator(".ebd-head-title")).toHaveText(pageTitle(undefined))
  await expect(scene.locator(".ebd-chips-label")).toHaveText("Orders")
  await expect(scene.locator(".ebd-path-link").first()).toHaveText("All birds")
  await expect(page.locator('[data-poster="compact"] .ebd-pick-label')).toHaveText("Choose an order")
  // The share dialog: its title, Story / Post / Square with their ratios, and each image's footer line
  await expect(scene.locator(".ebd-share-title")).toHaveText("Share your collage")
  const formats = [...src("src/components/share/ShareDialog.tsx").matchAll(/\{ id: '\w+', label: '(\w+)', hint: '([\d:]+)'/g)].map((x) => `${x[1]}${x[2]}`)
  expect(formats).toEqual(["Story9:16", "Post4:5", "Square1:1"])
  expect(await scene.locator(".ebd-seg-btn").allTextContents()).toEqual(formats)
  expect(await scene.locator(".ebd-img-line").allTextContents()).toEqual([FOOTER_LINE, FOOTER_LINE, FOOTER_LINE])
  expect(src("src/lib/share/image.ts")).toContain("export const FOOTER_LINE = `${SITE_LABEL} · stickers by huashu`")
  expect(src("src/lib/share/image.ts")).toContain("export const SITE_LABEL = new URL(SHARE_ORIGIN).host")
  expect(FOOTER_LINE).toBe("everybird.yusuftaleb.com · stickers by huashu")
  expect(await scene.locator(".ebd-img-mark").allTextContents()).toEqual(["Everybird", "Everybird", "Everybird"])
  // Nothing from the old scene, no credit line inside the image (the footer carries it), no "seen" for the list
  const all = (await scene.textContent())!
  expect(all).not.toContain("Stickers: huashu")
  expect(all).not.toMatch(/\bseen\b/i)
  expect(all).not.toContain("Yusuf")
})
