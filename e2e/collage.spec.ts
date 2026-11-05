import { expect, test } from "@playwright/test";

test("switching True size keeps every bird visible mid-transition", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("collage-stage");
  await expect(stage).toBeVisible();
  const birds = stage.locator("[data-code]:not([data-off])");
  await expect(birds.first()).toBeVisible();
  // Let the first appearance ripple finish (0–480ms delay + 480ms).
  await page.waitForTimeout(1200);
  const total = await birds.count();
  expect(total).toBeGreaterThan(0);

  await page.getByRole("switch", { name: "True size" }).click();
  await page.waitForTimeout(320);
  await page.screenshot({ path: "test-results/collage-true-size-320ms.png" });

  // Mid-morph: every bird is still shown (not hidden, not faded out) and still on the stage.
  const visibleNow = await stage.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [...el.querySelectorAll<HTMLElement>("[data-code]")].filter((b) => {
      if (b.hasAttribute("data-off")) return false;
      const cs = getComputedStyle(b);
      if (cs.visibility === "hidden" || Number(cs.opacity) < 0.5) return false;
      const br = b.getBoundingClientRect();
      return br.width > 0 && br.height > 0 && br.right > r.left && br.left < r.right && br.bottom > r.top && br.top < r.bottom;
    }).length;
  });
  expect(visibleNow).toBe(total);
  await expect(page.getByRole("switch", { name: "True size" })).toHaveAttribute("aria-checked", "true");
});
