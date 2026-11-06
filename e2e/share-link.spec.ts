import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The frozen fixture is a tiny list (5 birds); a generated one with dates and places is below.
const frozen = readFileSync("tests/fixtures/share/v1-frozen.txt", "utf8").trim();

test("a share link opens a read-only collage: whose list, what Everybird is and \"Make yours\" before the birds", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/s/${frozen}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ada Birder's life list" })).toBeVisible();
  await expect(page.getByText("Everybird turns a birder's life list into a sticker collage.")).toBeVisible();
  await expect(page.getByTestId("collage-stats")).toHaveText(/^5 species/);
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  const make = page.getByRole("link", { name: /^Make yours/ });
  await expect(make).toHaveCount(2); // near the top and after the legend, with the landing's words and destination
  await expect(make.first()).toHaveAttribute("href", "/settings");
  expect((await make.first().boundingBox())!.y).toBeLessThan((await page.getByTestId("collage-stage").boundingBox())!.y);
  await expect(page.getByText("huashu-bird-sticker")).toBeVisible();
  // Read-only: none of the editing tools, and the visitor's own list is untouched.
  await expect(page.getByRole("button", { name: /forget|download|restore/i })).toHaveCount(0);
  expect(await page.evaluate(async () => (await indexedDB.databases?.())?.some((d) => d.name === "everybird") ?? false)).toBe(false);
  // The token never leaves as a Referer (analytics also redacts it from URLs: src/lib/analytics.ts).
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "strict-origin");
  expect(errors).toEqual([]);
});

test("a broken link says so plainly, offers Make yours and still shows the sample collage", async ({ page }) => {
  await page.goto("/s/garbage");
  await expect(page.getByRole("heading", { level: 1, name: "This link didn't open" })).toBeVisible();
  await expect(page.getByText("It may be cut off, or made by a newer Everybird.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Make yours/ })).toHaveAttribute("href", "/settings");
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])")).toHaveCount(197);
});

test("a link from a newer version is rejected", async ({ page }) => {
  await page.goto(`/s/2${frozen.slice(1)}`);
  await expect(page.getByRole("heading", { level: 1, name: "This link didn't open" })).toBeVisible();
});
