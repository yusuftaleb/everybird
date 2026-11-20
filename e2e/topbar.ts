import { expect, type BrowserContext, type Page } from "@playwright/test";

// The top bar's rows per preview variant (lang:a|b|c) and language, as app.css lays them out (tests/topbar-fit.test.ts
// models the same thresholds with the fonts' advances). Shared by text-size.spec.ts and responsive.spec.ts.

export type TopbarVariant = "a" | "b" | "c";
export type TopbarLang = "en" | "es" | "pt" | "nl";

/** Whether the nav has its own second row: a under 430px; b under 384px (es, nl) or 366px (en, pt); c under 310px. */
export function navSplits(variant: TopbarVariant, _lang: TopbarLang, width: number): boolean {
  if (variant === "a") return width < 620;
  if (variant === "b") return width < 572;
  return width < 620;
}

/** The nav labels per language (src/i18n/messages, ui.shell.nav). */
export const NAV: Record<TopbarLang, [string, string, string]> = {
  en: ["My birds", "Settings", "About"],
  es: ["Mis aves", "Ajustes", "Acerca de"],
  pt: ["Minhas aves", "Ajustes", "Sobre"],
  nl: ["Mijn vogels", "Instellingen", "Over"],
};
const BUTTON: Record<TopbarLang, string> = { en: "Language: English", es: "Idioma: Español", pt: "Idioma: Português", nl: "Taal: Nederlands" };

export async function useLang(context: BrowserContext, baseURL: string, lang: TopbarLang) {
  if (lang !== "en") await context.addCookies([{ name: "everybird-lang", value: lang, url: baseURL }]);
}

/** Opens `path` under the variant and checks the bar's rows: row one is the wordmark, the language button (a, c) and
 *  the theme switch, all inside the bar's gutter; the nav shares it or has row two to itself; in c under 480px the
 *  Collage link is gone; nothing scrolls sideways; the bar's height is --topbar-h. */
export async function checkTopbar(page: Page, path: string, variant: TopbarVariant, lang: TopbarLang, width: number) {
  await page.goto(`${path}${path.includes("?") ? "&" : "?"}v=lang:${variant}`);
  const bar = page.getByTestId("topbar");
  await expect(bar).toBeVisible();
  await expect(page.locator(`html[data-topbar="${variant}"]`)).toHaveCount(1);
  const theme = bar.getByRole("switch");
  const btn = bar.getByRole("button", { name: BUTTON[lang] });
  if (variant === "b") await expect(btn).toHaveCount(0);
  else await expect(btn).toBeVisible();
  const inner = await bar.locator(".eb-topbar-in").evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) };
  });
  const [t, w] = await Promise.all([theme.boundingBox(), bar.locator(".eb-wordmark").boundingBox()]);
  // The last control ends inside the gutter (a row that overflows eats the gutter first, still "on screen").
  expect(t!.x + t!.width, `${path}: the theme switch inside the gutter`).toBeLessThanOrEqual(inner.right + 0.5);
  expect(t!.y, `${path}: the theme switch in row one`).toBeLessThan(w!.y + w!.height);
  if (variant !== "b") {
    const b = (await btn.boundingBox())!;
    expect(Math.abs(b.y - t!.y), `${path}: the language button and the theme switch share a row`).toBeLessThan(1);
    expect(b.x + b.width, `${path}: the language button comes first`).toBeLessThanOrEqual(t!.x + 0.5);
  }
  const split = navSplits(variant, lang, width);
  const hidden = variant === "c" && width < 480;
  for (const [i, name] of NAV[lang].entries()) {
    const link = bar.getByRole("link", { name, exact: true });
    if (i === 0 && hidden) {
      await expect(link, `${path}: Collage hidden in c under 480px`).toBeHidden();
      continue;
    }
    const l = (await link.boundingBox())!;
    expect(l.x, `${path}: ${name} inside the gutter`).toBeGreaterThanOrEqual(inner.left - 0.5);
    expect(l.x + l.width, `${path}: ${name} inside the gutter`).toBeLessThanOrEqual(inner.right + 0.5);
    if (split) expect(l.y, `${path}: ${name} on row two`).toBeGreaterThanOrEqual(t!.y + t!.height - 1);
    else expect(l.y, `${path}: ${name} in row one`).toBeLessThan(w!.y + w!.height);
  }
  // The gutter is the page's: 16px from 360px to 719px, split or not (32px from 720px).
  if (width >= 360 && width < 720) expect(inner.left, `${path}: 16px gutter`).toBeCloseTo(16, 0);
  // --topbar-h follows the rows (a one-row bar never gets the two-row offset).
  const [h, token] = await Promise.all([
    bar.evaluate((el) => el.getBoundingClientRect().height),
    page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h"))),
  ]);
  expect(Math.abs(h - token), `${path}: bar ${h}px, --topbar-h ${token}px`).toBeLessThan(1);
  expect(token, `${path}: --topbar-h`).toBe(split ? 93 : width >= 720 ? 65 : 61);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, `${path} at ${width}px`).toBeLessThanOrEqual(width);
}
