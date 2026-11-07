import { expect, test } from "@playwright/test";
import { SAMPLE_COUNT } from "./sample";
import { readFileSync } from "node:fs";
import linkIndex from "../data/link-index.json";
import { encodeShare } from "../src/lib/share/link";

// The frozen fixture is a tiny list (5 birds); a generated one with dates and places is below.
const frozen = readFileSync("tests/fixtures/share/v1-frozen.txt", "utf8").trim();

test("a share link opens a read-only collage: whose list, what Everybird is and \"Make yours\" before the birds", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/s/${frozen}`);
  // The frozen link predates titles: its bare name reads "<name>'s life list", as it always did.
  await expect(page.getByRole("heading", { level: 1, name: "Ada Birder's life list" })).toBeVisible();
  await expect(page).toHaveTitle("Ada Birder's life list · Everybird");
  await expect(page.getByText("Everybird turns a birder's life list into a sticker collage.")).toBeVisible();
  await expect(page.getByTestId("collage-stats")).toHaveText(/^5 species/);
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  const make = page.getByRole("link", { name: /^Make yours/ });
  await expect(make).toHaveCount(2); // near the top and after the legend, with the landing's words and destination
  await expect(make.first()).toHaveAttribute("href", "/settings");
  expect((await make.first().boundingBox())!.y).toBeLessThan((await page.getByTestId("collage-stage").boundingBox())!.y);
  // The credits are one link away, as on every page (the shared view has the site footer too).
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "All credits" })).toHaveAttribute("href", "/about#credits");
  // Read-only: none of the editing tools, and the visitor's own list is untouched.
  await expect(page.getByRole("button", { name: /forget|download|restore/i })).toHaveCount(0);
  expect(await page.evaluate(async () => (await indexedDB.databases?.())?.some((d) => d.name === "everybird") ?? false)).toBe(false);
  // The token never leaves as a Referer (no analytics request carries a URL either: src/lib/analytics.ts).
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "strict-origin");
  expect(errors).toEqual([]);
});

test("a new link's collage title is the h1 verbatim, and the document title", async ({ page }) => {
  const codes = linkIndex as string[];
  const { token } = encodeShare({ v: 1, name: "Yusuf's Life List", titled: true, birds: [{ code: codes[0] }, { code: codes[5] }] });
  await page.goto(`/s/${token}`);
  await expect(page.getByRole("heading", { level: 1, name: "Yusuf's Life List" })).toBeVisible();
  await expect(page).toHaveTitle("Yusuf's Life List · Everybird");
});

test("the shared view loads no Cloudflare beacon, counts one 'shared' visit without the token, and leaves by full page loads", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __everybirdStats: (b: string) => void; __stats: string[] };
    w.__stats = [];
    w.__everybirdStats = (b) => { w.__stats.push(b); };
  });
  await page.goto(`/s/${frozen}`);
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stats: string[] }).__stats)).toEqual(['{"n":"visit","p":"shared"}']);
  await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(0);
  // Every way into the app (Make yours, the top bar, the footer) is a new document, never a client navigation, so
  // Cloudflare's beacon can't load in a document whose history holds the token (and report it on Back).
  for (const go of [
    () => page.getByRole("link", { name: /^Make yours/ }).first().click(),
    () => page.getByRole("banner").getByRole("link", { name: "About" }).click(),
    () => page.getByRole("contentinfo").getByRole("link", { name: "All credits" }).click(),
  ]) {
    await page.goto(`/s/${frozen}`);
    await expect(page.getByTestId("collage-stage")).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __sameDoc: boolean }).__sameDoc = true; });
    await go();
    await expect(page).not.toHaveURL(/\/s\//);
    await page.waitForLoadState("load");
    expect(await page.evaluate(() => (window as unknown as { __sameDoc?: boolean }).__sameDoc ?? false)).toBe(false);
  }
});

test("a broken link says so plainly, offers Make yours and still shows the sample collage", async ({ page }) => {
  await page.goto("/s/garbage");
  await expect(page.getByRole("heading", { level: 1, name: "This link didn't open" })).toBeVisible();
  await expect(page.getByText("It may be cut off, or made by a newer Everybird.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Make yours/ })).toHaveAttribute("href", "/settings");
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])")).toHaveCount(SAMPLE_COUNT);
});

test("a link from a newer version is rejected", async ({ page }) => {
  await page.goto(`/s/2${frozen.slice(1)}`);
  await expect(page.getByRole("heading", { level: 1, name: "This link didn't open" })).toBeVisible();
});
