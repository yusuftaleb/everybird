import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
