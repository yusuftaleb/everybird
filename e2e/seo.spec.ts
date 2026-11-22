import { expect, test } from "@playwright/test";
import { LANGS } from "../src/i18n/langs";
import { en } from "../src/i18n/messages/en";
import { es } from "../src/i18n/messages/es";
import { encodeShare } from "../src/lib/share/link";

// What a search engine sees: robots.txt, the sitemap, and each page's <head>. Requests only (no rendering), Chromium.
const ORIGIN = "https://everybird.yusuftaleb.com";
const { token } = encodeShare({ v: 1, name: "Test Birder", birds: [{ code: "ostric2", ym: 1500 }] });

const page = async (request: import("@playwright/test").APIRequestContext, path: string, headers?: Record<string, string>) => {
  const res = await request.get(path, { timeout: 60_000, headers });
  expect(res.status(), path).toBe(200);
  return res.text();
};
const head = async (request: import("@playwright/test").APIRequestContext, path: string, headers?: Record<string, string>) => {
  const html = await page(request, path, headers);
  return html.slice(0, html.indexOf("</head>"));
};
const meta = (h: string, attr: "name" | "property", key: string) =>
  h.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];
const canonical = (h: string) => h.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

test("robots.txt allows the site, disallows /s/ and names the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/^User-Agent: \*$/m);
  expect(body).toMatch(/^Allow: \/$/m);
  expect(body).toMatch(/^Disallow: \/s\/$/m);
  expect(body).toMatch(/^Disallow: \/c\/$/m);
  for (const lang of LANGS) {
    expect(body).toMatch(new RegExp(`^Disallow: /${lang}/s/$`, "m"));
    expect(body).toMatch(new RegExp(`^Disallow: /${lang}/c/$`, "m"));
  }
  expect(body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
});

test("sitemap.xml lists only the landing page and /about", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const locs = [...(await res.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toEqual([`${ORIGIN}/`, `${ORIGIN}/about`]);
});

for (const [path, url] of [["/", `${ORIGIN}/`], ["/about", `${ORIGIN}/about`], ["/settings", `${ORIGIN}/settings`]]) {
  test(`${path} has its own canonical, Open Graph and Twitter card, and no noindex`, async ({ request }) => {
    const h = await head(request, path);
    // The root's URL comes out with or without its trailing slash (Next drops it once metadataBase is set).
    const same = (u?: string) => (u === `${ORIGIN}` ? `${ORIGIN}/` : u);
    expect(same(canonical(h))).toBe(url);
    expect(same(meta(h, "property", "og:url"))).toBe(url);
    expect(meta(h, "property", "og:title")).toBe(h.match(/<title>([^<]*)<\/title>/)?.[1]);
    expect(meta(h, "property", "og:description")).toBe(meta(h, "name", "description"));
    // The site's link preview in the page's language (public/og/<lang>.jpg, src/lib/site-meta.ts pageSeo); the manifest
    // and the favicons keep the icon.
    expect(meta(h, "property", "og:image")).toMatch(/\/og\/en\.jpg$/);
    expect(meta(h, "property", "og:image:width")).toBe("1200");
    expect(meta(h, "property", "og:image:height")).toBe("630");
    expect(meta(h, "property", "og:image:alt")).toBe(en.page.meta.imageAlt);
    expect(meta(h, "name", "twitter:card")).toBe("summary_large_image");
    expect(meta(h, "name", "twitter:image")).toMatch(/\/og\/en\.jpg$/);
    expect(meta(h, "name", "robots")).toBeUndefined();
  });
}

test("a Spanish page previews the Spanish card, with its alt in Spanish", async ({ request }) => {
  const h = await head(request, "/about", { cookie: "everybird-lang=es" });
  expect(meta(h, "property", "og:image")).toMatch(/\/og\/es\.jpg$/);
  expect(meta(h, "property", "og:image:alt")).toBe(es.page.meta.imageAlt);
  expect(meta(h, "name", "twitter:image")).toMatch(/\/og\/es\.jpg$/);
});

test("the home page names the site in WebSite JSON-LD, with Everybird app as its alternate name", async ({ request }) => {
  const html = await page(request, "/");
  const ld = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1];
  expect(ld).toBeDefined();
  expect(JSON.parse(ld!)).toEqual({ "@context": "https://schema.org", "@type": "WebSite", name: "Everybird", alternateName: "Everybird app", url: `${ORIGIN}/` });
});

for (const t of [token, "not-a-token"]) {
  test(`a shared view (${t === token ? "valid" : "broken"} token) is noindex with no canonical or og:url`, async ({ request }) => {
    const h = await head(request, `/s/${t}`);
    expect(meta(h, "name", "robots")).toBe("noindex, nofollow");
    expect(canonical(h)).toBeUndefined();
    expect(meta(h, "property", "og:url")).toBeUndefined();
    // The token appears only in the preview images' own URLs, which link previews have to fetch.
    const tagsWithToken = (h.match(/<(meta|link)[^>]*>/g) ?? []).filter((tag) => tag.includes(t));
    for (const tag of tagsWithToken) expect(tag).toMatch(/<meta (property="og:image(:[a-z]+)?"|name="twitter:image(:[a-z]+)?") content="[^"]*\/s\/[^"]*\/(opengraph|twitter)-image[^"]*"/);
  });
}
