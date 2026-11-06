import { expect, test } from "@playwright/test";

function watchConsole(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const bg = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT = "rgb(246, 244, 239)";
const DARK = "rgb(30, 30, 36)";

test("light mode paints the paper background, no console errors", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Everybird" })).toBeVisible();
  expect(await bg(page)).toBe(LIGHT);
  expect(errors).toEqual([]);
});

test("light by default even when the system is dark; the switch turns dark on, and the choice sticks on this device", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  const errors = watchConsole(page);
  await page.goto("/");
  expect(await bg(page)).toBe(LIGHT);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const sw = page.getByRole("contentinfo").getByRole("switch", { name: "Dark mode" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bg(page)).toBe(DARK);
  // Applied before the first paint on the next load (the inline script in <head> runs before <body> is parsed):
  // the body is already dark when the document finishes parsing, before any app code has run.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { __firstBg: string }).__firstBg = getComputedStyle(document.body).backgroundColor;
    });
  });
  await page.goto("/make");
  expect(await page.evaluate(() => (window as unknown as { __firstBg: string }).__firstBg)).toBe(DARK);
  await expect(page.getByRole("switch", { name: "Dark mode" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await page.reload();
  expect(await bg(page)).toBe(LIGHT);
  expect(errors).toEqual([]);
  await context.close();
});
