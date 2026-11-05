import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The frozen fixture is a tiny list (5 birds); a generated one with dates and places is below.
const frozen = readFileSync("tests/fixtures/share/v1-frozen.txt", "utf8").trim();

test("a share link opens a read-only collage with the header, count and Make your own", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/s/${frozen}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ada Birder's Everybird" })).toBeVisible();
  await expect(page.getByText("5 species").first()).toBeVisible();
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  await expect(page.getByRole("link", { name: "Make your own" })).toHaveAttribute("href", "/");
  await expect(page.getByText("huashu-bird-sticker")).toBeVisible();
  // Read-only: none of the editing tools, and the visitor's own list is untouched.
  await expect(page.getByRole("button", { name: /forget|download|restore/i })).toHaveCount(0);
  expect(await page.evaluate(async () => (await indexedDB.databases?.())?.some((d) => d.name === "everybird") ?? false)).toBe(false);
  expect(errors).toEqual([]);
});

test("a broken link says so and points home", async ({ page }) => {
  await page.goto("/s/garbage");
  await expect(page.getByText("This link is broken or from a newer Everybird")).toBeVisible();
  await expect(page.getByRole("link", { name: "Make your own" })).toHaveAttribute("href", "/");
});

test("a link from a newer version is rejected", async ({ page }) => {
  await page.goto(`/s/2${frozen.slice(1)}`);
  await expect(page.getByText("This link is broken or from a newer Everybird")).toBeVisible();
});
