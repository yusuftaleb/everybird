import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The top bar's headroom (src/lib/headroom.ts): it slides up out of view while the page scrolls down past it and back in
// on any upward scroll; it stays shown at the top, while a dialog, sheet or popover is open, and while focus is inside
// it. Runs in Chromium and WebKit.

type Row = { code: string };
/** A synthetic 300-species list (every third species in the taxonomy), tall enough to scroll at every width. */
function syntheticSaved() {
  const species = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
  const records = Array.from({ length: 300 }, (_, i) => ({
    code: species[i * 3].code, source: "ebird", date: `${2016 + (i % 9)}-${String((i % 12) + 1).padStart(2, "0")}-10`,
    place: { country: i % 4 ? "CA" : "EG" },
  }));
  return {
    v: 1, records: { ebird: records, inat: [], manual: [] }, unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}

async function seed(page: Page) {
  await page.goto("/about");
  await page.evaluate(
    (saved) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open("everybird");
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(saved, "everybird:v1");
          tx.oncomplete = () => { open.result.close(); done(); };
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    syntheticSaved(),
  );
  await page.goto("/");
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])")).toHaveCount(300);
  await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === "running").length === 0, null, { timeout: 15_000 });
}

const bar = (page: Page) => page.getByTestId("topbar");
/** The bar's bottom edge on screen once its slide has finished: 0 or less when hidden, its height when shown. */
const barBottom = (page: Page) =>
  page.evaluate(async () => {
    const el = document.querySelector<HTMLElement>("[data-testid=topbar]")!;
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));
    return el.getBoundingClientRect().bottom;
  });
/** Scroll the window to y and let the headroom's frame run. */
const scrollTo = (page: Page, y: number) =>
  page.evaluate(
    (y) => new Promise<void>((done) => { window.scrollTo(0, y); requestAnimationFrame(() => requestAnimationFrame(() => done())); }),
    y,
  );
const hidden = (page: Page) => expect(bar(page)).toHaveAttribute("data-hidden", "");
const shown = (page: Page) => expect(bar(page)).not.toHaveAttribute("data-hidden");
/** The element at (x, y) is not the bar or inside it: something is drawn above it there. */
const coveredAt = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => !document.elementFromPoint(x, y)?.closest("[data-testid=topbar]"), [x, y]);

test("scrolling down past the threshold hides the bar; a small scroll doesn't toggle; scrolling up and the top show it", async ({ page }) => {
  await seed(page);
  const h = await barBottom(page);
  expect(h).toBeGreaterThan(50);
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);

  await scrollTo(page, 400);
  await hidden(page);
  expect(await barBottom(page)).toBeLessThanOrEqual(0);
  // Hiding is a transform only: the page keeps its height and its place.
  expect(await page.evaluate(() => [document.documentElement.scrollHeight, window.scrollY])).toEqual([docH, 400]);

  await scrollTo(page, 395); // 5px up: under the threshold
  await hidden(page);
  await scrollTo(page, 401); // 6px down
  await hidden(page);
  await scrollTo(page, 395); // 6px up
  await hidden(page);
  await scrollTo(page, 390); // 11px up in a row
  await shown(page);
  expect(await barBottom(page)).toBeCloseTo(h, 0);

  await scrollTo(page, 395); // 5px down: stays shown
  await shown(page);
  await scrollTo(page, 700);
  await hidden(page);
  await scrollTo(page, 0);
  await shown(page);
  expect(await barBottom(page)).toBeCloseTo(h, 0);
});

test("Places opened after scrolling: the bar shows and covers neither the controls bar nor the panel", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) <= 600, "phones get the bottom sheet");
  await seed(page);
  const dockTop = await page.locator(".eb-dockwrap").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await scrollTo(page, dockTop - 12); // the controls bar just under where the shown bar would be
  await hidden(page);
  await page.getByTestId("filter-tab-places").click();
  const panel = page.getByTestId("filter-panel-places");
  await expect(panel).toBeVisible();
  await shown(page);
  const b = await barBottom(page);
  const dock = await page.locator(".eb-dockwrap").boundingBox();
  const p = await panel.boundingBox();
  expect(dock!.y).toBeGreaterThanOrEqual(b);
  expect(p!.y).toBeGreaterThanOrEqual(b);
  // Held while open: scrolling down doesn't hide it.
  await scrollTo(page, (await page.evaluate(() => window.scrollY)) + 200);
  await shown(page);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("the bird card's sheet at 390px and the share dialog sit above the bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await scrollTo(page, 300);
  await hidden(page);
  const bird = page.getByTestId("collage-stage").locator(".eb-bird").first();
  await bird.focus();
  await page.keyboard.press("Enter");
  const card = page.locator(".eb-card[role=dialog]");
  await expect(card).toHaveAttribute("data-variant", "sheet");
  await shown(page); // held while the card is open
  expect(await coveredAt(page, 195, 20)).toBe(true); // the card's scrim is over the bar
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your collage" });
  await expect(dialog).toBeVisible();
  await shown(page);
  expect(await coveredAt(page, 640, 20)).toBe(true); // the share dialog's scrim is over the bar
  const z = await page.evaluate(() => [".eb-topbar", ".eb-share-scrim"].map((s) => Number(getComputedStyle(document.querySelector(s)!).zIndex)));
  expect(z[1]).toBeGreaterThan(z[0]);
});

test("focus moving into the hidden bar shows it, and it stays while focus is inside", async ({ page }) => {
  await seed(page);
  await scrollTo(page, 400);
  await hidden(page);
  // From the page, Shift+Tab back to the bar's last control (the theme switch).
  await page.getByRole("link", { name: "Add birds" }).evaluate((el: HTMLElement) => el.focus({ preventScroll: true }));
  const theme = page.getByRole("switch", { name: "Dark mode" });
  for (let i = 0; i < 6 && !(await theme.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Shift+Tab");
  await expect(theme).toBeFocused();
  await shown(page);
  expect(await page.evaluate(() => window.scrollY), "focusing the sticky bar doesn't scroll the page").toBe(400);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(400);
  expect(await barBottom(page)).toBeGreaterThan(50);
  // A scroll down while focus is inside keeps it.
  const y = await page.evaluate(() => window.scrollY);
  await scrollTo(page, y + 300);
  await shown(page);
});

test("reduced motion: the bar hides and shows without a transition", async ({ page }) => {
  await seed(page);
  const dur = () => bar(page).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(await dur()).toBe("0.2s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await dur()).toBe("0s");
  await scrollTo(page, 400);
  await hidden(page);
  expect(await bar(page).evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
});

test("anchor jumps land below the bar: /about#credits and /settings#sources", async ({ page }) => {
  for (const [url, id] of [["/about#credits", "credits"], ["/settings#sources", "sources"]] as const) {
    await page.goto(url);
    const target = page.locator(`#${id}`);
    await expect(target).toBeVisible();
    if (id === "credits") await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0); // About is taller than a screen
    await page.waitForTimeout(300);
    const top = await target.evaluate((el) => el.getBoundingClientRect().top);
    const shownBottom = await bar(page).evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(top, `${url}: the target clears the bar's place`).toBeGreaterThanOrEqual(shownBottom - 1);
  }
});

// Only keyboard focus holds the bar: Chromium focuses a link on a mouse click, and the bar outlives client navigation,
// so a clicked "Collage" used to pin the bar until the next click elsewhere (review, 2026-11-06).
test("a mouse click in the bar doesn't pin it: after navigating, scrolling down still hides it", async ({ page }) => {
  await seed(page);
  await page.goto("/settings");
  await bar(page).getByRole("link", { name: "Collage" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  for (const y of [200, 500, 900]) await scrollTo(page, y);
  await hidden(page);
});
