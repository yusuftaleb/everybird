import { expect, test, type Page } from "@playwright/test";
import { en } from "../src/i18n/messages/en";
import { es } from "../src/i18n/messages/es";
import { encodeShare } from "../src/lib/share/link";

// The language rewrites (src/i18n/routes.ts, next.config.ts): the unprefixed URLs serve the page prerendered for the
// cookie's language, else Accept-Language's first tag (Playwright's `locale` sets both it and navigator.language),
// else English. Chromium. Written for Yusuf's runs.
const PAGES = ["/", "/settings", "/about"] as const;
const { token } = encodeShare({ v: 1, name: "Test Birder", birds: [{ code: "ostric2", ym: 1500 }] });

/** Fails the test on any hydration error printed while `run` loads pages. */
async function noHydrationErrors(page: Page, run: () => Promise<void>) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Hydration|did not match|hydrat/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => {
    if (/Hydration|did not match/i.test(e.message)) errors.push(e.message);
  });
  await run();
  expect(errors).toEqual([]);
}

const nav = (page: Page) => page.getByTestId("topbar").getByRole("navigation");

test.describe("a Spanish browser", () => {
  test.use({ locale: "es-ES" });

  test("every page is Spanish, with the Spanish top bar", async ({ page }) => {
    await noHydrationErrors(page, async () => {
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", "es");
        await expect(nav(page).getByRole("link", { name: es.ui.shell.nav.settings })).toBeVisible();
        await expect(nav(page).getByRole("link", { name: es.ui.shell.nav.about })).toBeVisible();
        await expect(page.getByRole("switch", { name: es.ui.shell.darkMode })).toBeVisible();
      }
    });
  });

  test("a soft navigation through the nav stays Spanish", async ({ page }) => {
    await noHydrationErrors(page, async () => {
      await page.goto("/about");
      const settings = nav(page).getByRole("link", { name: es.ui.shell.nav.settings });
      await settings.hover(); // IntentLink prefetches on hover
      await settings.click();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(settings).toHaveAttribute("aria-current", "page");
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(nav(page).getByRole("link", { name: es.ui.shell.nav.about })).toBeVisible();
    });
  });

  test("the cookie everybird-lang=en wins over the browser", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "everybird-lang", value: "en", url: baseURL! }]);
    await noHydrationErrors(page, async () => {
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expect(nav(page).getByRole("link", { name: en.ui.shell.nav.settings })).toBeVisible();
      }
    });
  });

  test("a shared view is Spanish and its og:image is the Spanish image's own URL", async ({ page }) => {
    await page.goto(`/s/${token}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(og).toContain(`/es/s/${token}/opengraph-image`);
  });
});

for (const [locale, lang] of [["pt-BR", "pt-BR"], ["nl-BE", "nl"], ["en-US", "en"]] as const) {
  test.describe(`a ${locale} browser`, () => {
    test.use({ locale });
    test(`gets <html lang="${lang}">`, async ({ page }) => {
      await noHydrationErrors(page, async () => {
        for (const path of PAGES) {
          await page.goto(path);
          await expect(page.locator("html")).toHaveAttribute("lang", lang);
        }
      });
    });
  });
}

test.describe("files and unknown paths", () => {
  test.use({ locale: "es-ES" });

  test("static files are served as they are", async ({ request }) => {
    // /og/<lang>.jpg: the site's link preview per language, a static file chosen by the page's metadata, never rewritten
    for (const path of ["/data/species.v1.json", "/icons/icon-192.png", "/og/es.jpg", "/robots.txt", "/manifest.webmanifest"]) {
      const res = await request.get(path, { headers: { "accept-language": "es-ES", cookie: "everybird-lang=es" } });
      expect(res.status(), path).toBe(200);
    }
  });

  test("an unknown path is the global not-found page", async ({ page }) => {
    const res = await page.goto("/nope");
    expect(res?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "This page isn't here" })).toBeVisible();
  });

  test("an old image URL is the English image, whatever the browser says", async ({ request }) => {
    const a = await request.get(`/s/${token}/opengraph-image`, { headers: { "accept-language": "es-ES" }, timeout: 60_000 });
    const b = await request.get(`/s/${token}/opengraph-image`, { headers: { "accept-language": "pt-BR" }, timeout: 60_000 });
    expect(a.status()).toBe(200);
    expect(b.status()).toBe(200);
    expect(Buffer.compare(await a.body(), await b.body())).toBe(0);
  });
});
