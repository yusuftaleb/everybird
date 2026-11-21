import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The first-visit welcome over the landing's sample (src/components/app/Welcome.tsx). Every other spec starts with it
// closed (playwright.config.ts seeds "everybird:welcomed"); this one starts from an empty device.
// WELCOME_PNG_DIR (optional) saves screenshots of the card and the sheet in both themes there.
test.use({ storageState: { cookies: [], origins: [] } });

const LINE = "Your life list as a sticker collage. It stays in your browser.";
const welcome = (page: Page) => page.getByRole("dialog", { name: LINE });
const frozen = readFileSync("tests/fixtures/share/v1-frozen.txt", "utf8").trim();
const OUT = process.env.WELCOME_PNG_DIR;

test("a first visit shows the welcome over the sample, focus on Make mine and kept inside", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const d = welcome(page);
  await expect(d).toBeVisible();
  await expect(d).toHaveAttribute("aria-modal", "true");
  const make = d.getByRole("button", { name: /^Make mine/ });
  await expect(make).toBeFocused();
  await expect(make).toHaveAttribute("aria-haspopup", "dialog"); // the Add birds dialog, as the hero's Make yours
  // The sample stays on show behind it.
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  // Tab and Shift+Tab stay inside: Make mine, Explore the sample, Close, and round again.
  await page.keyboard.press("Tab");
  await expect(d.getByRole("button", { name: "Explore the sample" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(d.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(make).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(d.getByRole("button", { name: "Close" })).toBeFocused();
  expect(errors).toEqual([]);
});

for (const [how, close] of [
  ["Explore the sample", (page: Page) => welcome(page).getByRole("button", { name: "Explore the sample" }).click()],
  ["the ✕", (page: Page) => welcome(page).getByRole("button", { name: "Close" }).click()],
  ["Escape", (page: Page) => page.keyboard.press("Escape")],
  ["a press outside", (page: Page) => page.mouse.click(8, 300)],
] as const) {
  test(`${how} closes it, focus goes back to the page, and it stays closed after a reload`, async ({ page }) => {
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();
    await expect(page.getByTestId("collage-stage")).toBeVisible(); // the sample is there to return to
    await close(page);
    await expect(welcome(page)).toHaveCount(0);
    if (how === "Explore the sample") {
      // Explore starts the tour on the sample (Tour.tsx): its first note, the only dialog, takes focus; Skip tour ends it.
      const tour = page.getByTestId("tour");
      await expect(tour).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(tour).toBeFocused();
      await tour.getByRole("button", { name: "Skip tour" }).click();
      await expect(tour).toHaveCount(0);
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0); // a press outside opened nothing underneath
      // Focus returns to the sample's controls, not lost on the body.
      await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".eb-view"))).toBe(true);
    }
    expect(await page.evaluate(() => localStorage.getItem("everybird:welcomed"))).toBe("1");
    await page.reload();
    await expect(page.getByTestId("collage-stage")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });
}

test("Make mine opens the Add birds dialog on the landing, counts as closed, and gives focus back to Make yours", async ({ page }) => {
  await page.goto("/");
  await welcome(page).getByRole("button", { name: /^Make mine/ }).click();
  await expect(page).toHaveURL(/\/$/);
  const add = page.getByRole("dialog", { name: "Add birds" });
  await expect(add).toBeVisible();
  await expect(add.getByTestId("ebird-drop")).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(add).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Make yours/ })).toBeFocused();
  await page.goto("/");
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
});

test("never with a list on the device, on Settings, About or a shared view", async ({ page }) => {
  for (const path of ["/settings", "/about", `/s/${frozen}`, "/s/garbage"]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(welcome(page), path).toHaveCount(0);
  }
  // Restore a backup (as the other specs do): the collage opens on / with no welcome, and still none after a reload.
  const backup = JSON.stringify({
    v: 1,
    records: { ebird: [{ code: "mallar3", date: "2024-03", source: "ebird" }], inat: [], manual: [] },
    unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} },
    rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: "2026-11-05T00:00:00.000Z",
  });
  await page.goto("/settings");
  await page.locator('input[type="file"][accept*="json"]').first().setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("collage-stats")).toHaveText(/^1 species/);
  await expect(welcome(page)).toHaveCount(0);
  await page.waitForTimeout(1000); // the save lands in IndexedDB (WebKit commits it a moment later)
  await page.reload();
  await expect(page.getByTestId("collage-stats")).toHaveText(/^1 species/);
  await page.waitForTimeout(300);
  await expect(welcome(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("everybird:welcomed"))).toBeNull();
});

test("storage that throws doesn't break the page: the welcome shows and closes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
  });
  await page.goto("/");
  await expect(welcome(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  expect(errors).toEqual([]);
});

test("phones get a bottom sheet, wider screens a small card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const box = (await welcome(page).boundingBox())!;
  // The sheet spans the scrim less its 8px insets (the card would leave 16px a side). The scrim is the window less the
  // page's stable scrollbar gutter (html's scrollbar-gutter: 15px with desktop scrollbars, none with a phone's).
  const scrim = (await page.locator(".eb-welcome-scrim").boundingBox())!;
  expect(scrim.width).toBeGreaterThanOrEqual(390 - 15);
  expect(Math.abs(box.width - (scrim.width - 16))).toBeLessThanOrEqual(1);
  expect(844 - (box.y + box.height)).toBeLessThanOrEqual(12);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await welcome(page).boundingBox())!.width).toBeLessThanOrEqual(400);
  const card = (await welcome(page).boundingBox())!;
  // Centred in the window less the stable scrollbar gutter.
  const wide = (await page.locator(".eb-welcome-scrim").boundingBox())!;
  expect(wide.width).toBeGreaterThanOrEqual(1280 - 15);
  expect(Math.abs(card.x + card.width / 2 - (wide.x + wide.width / 2))).toBeLessThan(2);
});

test("screenshots: the card and the sheet, light and dark", async ({ page, browserName }) => {
  test.skip(!OUT || browserName !== "chromium", "set WELCOME_PNG_DIR to save them");
  for (const theme of ["light", "dark"]) {
    for (const [width, height] of [[390, 844], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      await page.addInitScript((t) => { try { localStorage.setItem("everybird:theme", t); } catch {} }, theme);
      await page.goto("/");
      await expect(welcome(page)).toBeVisible();
      await expect(page.getByTestId("collage-stage").locator("img").first()).toBeVisible();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(OUT!, `welcome-${width}-${theme}.png`) });
    }
  }
});
