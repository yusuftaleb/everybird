import { expect, type Page } from "@playwright/test";

// The birder's own collage keeps its finished layouts on the device (src/lib/layout/layout-store.ts: IndexedDB
// 'everybird-layouts', one idb-keyval store 'kv', `l:<id>` the layout and `m:<id>` its LRU entry). Forget clears it.

/** How many layouts are stored (`l:` keys). Opening first creates the store as idb-keyval would, so the app's own open
 *  still finds it. */
export function storedLayouts(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((done, fail) => {
    const r = indexedDB.open("everybird-layouts");
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => fail(r.error);
    r.onsuccess = () => {
      const k = r.result.transaction("kv").objectStore("kv").getAllKeys();
      k.onsuccess = () => { r.result.close(); done(k.result.filter((x) => String(x).startsWith("l:")).length); };
      k.onerror = () => { r.result.close(); fail(k.error); };
    };
  }));
}

/** A list of PROVISIONAL_FROM (600) species or more first shows a one-pass provisional collage, and the final one
 *  replaces it (layout-client.ts, provisional.ts). Only the final full collage is stored, as it lands, so the first stored
 *  layout marks the swap; then wait for the birds' travel to it to end. */
export async function finalCollage(page: Page) {
  await expect.poll(() => storedLayouts(page), { timeout: 120_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => {
    const L = document.querySelector<HTMLElement>(".eb-layer");
    return !!L && !L.style.opacity && !L.style.contentVisibility && L.getAnimations().length === 0
      && [...document.querySelectorAll(".eb-tile")].every((t) => t.getAnimations().length === 0);
  }), { timeout: 60_000 }).toBe(true);
}
