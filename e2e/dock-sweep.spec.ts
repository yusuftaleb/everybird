import { expect, test, type Page } from "@playwright/test";

// The controls bar answers to its own width (container queries on .eb-dockwrap). Swept from 280 to 900px of bar in
// 4px steps, in collage view and list view: row one (the view tabs, the tools, the search) never breaks, and the search
// never spills out of the bar. Run at a desktop viewport so only the bar's own width decides.
test.use({ viewport: { width: 1280, height: 900 } });

/** Widths where row one breaks or the search overflows, as "w:reason". */
async function sweep(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>(".eb-dockwrap")!;
    const dock = wrap.querySelector<HTMLElement>(".eb-dock")!;
    const bad: string[] = [];
    for (let w = 280; w <= 900; w += 4) {
      wrap.style.width = `${w}px`;
      wrap.style.flex = "none";
      const top = (s: string) => Math.round(dock.querySelector<HTMLElement>(s)!.getBoundingClientRect().top);
      const tops = [top(".eb-dock-tabs"), top(".eb-dock-tools"), top(".eb-dock-end")];
      const d = dock.getBoundingClientRect(), end = dock.querySelector<HTMLElement>(".eb-dock-end")!.getBoundingClientRect();
      if (new Set(tops).size > 1) bad.push(`${w}:rows ${tops.join("/")}`);
      if (end.right > d.right - 1 + 0.5) bad.push(`${w}:search overflows ${Math.round(end.right - d.right)}`);
      if (dock.scrollWidth > dock.clientWidth) bad.push(`${w}:dock scrolls`);
    }
    wrap.style.width = "";
    wrap.style.flex = "";
    return bad;
  });
}

test("row one of the controls bar holds from 280 to 900px of bar, collage view and list view", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".eb-dock")).toBeVisible();
  expect.soft(await sweep(page), "collage view").toEqual([]);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Sorted by body mass/ })).toBeVisible();
  expect.soft(await sweep(page), "list view").toEqual([]);
});
