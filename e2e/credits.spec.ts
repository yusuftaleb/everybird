import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const frozen = readFileSync("tests/fixtures/share/v1-frozen.txt", "utf8").trim();

test("/credits credits the stickers (CC BY 4.0, linked) and the eBird taxonomy version", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/credits");
  await expect(page.getByRole("heading", { level: 1, name: "Credits" })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.locator('a[href="https://github.com/alchaincyf/huashu-bird-sticker"]').first()).toBeVisible();
  await expect(main.getByText("CC BY 4.0").first()).toBeVisible();
  await expect(main.locator('a[href="https://theodore.net/projects/AvianVisitors/"]')).toBeVisible();
  await expect(main.getByText(/eBird\/Clements taxonomy, version 20\d\d/)).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [name, path] of [
  ["home", "/"],
  ["credits", "/credits"],
  ["shared view", `/s/${frozen}`],
] as const) {
  test(`the ${name} page footer links to /credits`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Credits" })).toHaveAttribute("href", "/credits");
  });
}
