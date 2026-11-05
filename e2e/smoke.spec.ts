import { expect, test } from "@playwright/test";

function watchConsole(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const bg = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("light mode paints the paper background, no console errors", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Everybird" })).toBeVisible();
  expect(await bg(page)).toBe("rgb(246, 244, 239)");
  expect(errors).toEqual([]);
});

test("dark mode paints the dark paper background", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  const errors = watchConsole(page);
  await page.goto("/");
  expect(await bg(page)).toBe("rgb(30, 30, 36)");
  expect(errors).toEqual([]);
  await context.close();
});
