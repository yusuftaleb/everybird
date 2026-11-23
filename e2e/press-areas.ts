import type { Page } from "@playwright/test";

/**
 * Controls whose press area is under 44px, and how far the page scrolls sideways. A control's press area counts an
 * absolutely placed ::after (the hit areas drawn smaller pills and underlines carry). Exempt: stickers (sized by mass,
 * reached by keyboard too), links inside running text (WCAG 2.5.8's inline exception), a checkbox inside its row's
 * label (the 44px row is the target), file inputs behind their buttons, visually hidden controls (.eb-sr, such as the
 * bird card's Close: for screen readers and the keyboard, no pointer target), the small source buttons and the share
 * dialog's controls and Add by hand's group rows (its When and where row too, the same .eb-tickgroup) on a fine pointer (40px and 36px rows for a mouse, 44px for touch:
 * share.css, import.css, DESIGN.md, AGENTS.md; flows.spec.ts's
 * touch test holds the source buttons to 44px), and the width of the share dialog's segments (adjacent 28px segments
 * whose touch press is 44px tall across the segment's own width: share.css's `.eb-share-seg`).
 */
export async function pressAreas(page: Page) {
  return page.evaluate(() => {
    const small: string[] = [];
    const fine = matchMedia("(pointer: fine)").matches;
    const sel = 'a[href], button, [role="button"], [role="switch"], [role="option"], [role="slider"], input, select, summary';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest("[inert], [aria-hidden=true]") || el.closest(".eb-bird, .ebd")) continue;
      if (el.matches('input[type="file"]') || (el.matches('input[type="checkbox"]') && el.closest("label"))) continue;
      if (fine && (el.matches(".eb-btn-sm, .eb-tickgroup") || el.closest(".eb-share"))) continue;
      if (el.matches(".eb-sr:not(:focus-visible)")) continue;
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      if (cs.visibility === "hidden" || b.width === 0 || b.height === 0) continue;
      if (el.tagName === "A" && cs.display === "inline" && /^(P|LI|SPAN|SMALL|FIGCAPTION|DD)$/.test(el.parentElement?.tagName ?? "")) continue;
      let w = b.width, h = b.height;
      const af = getComputedStyle(el, "::after");
      if (af.content !== "none" && af.position === "absolute") {
        const t = parseFloat(af.top), l = parseFloat(af.left);
        if (t < 0) h = b.height - 2 * t;
        if (l < 0) w = b.width - 2 * l;
        w = Math.max(w, parseFloat(af.width) || 0);
        h = Math.max(h, parseFloat(af.height) || 0);
      }
      if (el.closest(".eb-share-seg")) w = 44; // a segment's press is the row's height across its own width
      if (Math.round(w) < 44 || Math.round(h) < 44) small.push(`${(el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40)} ${Math.round(w)}x${Math.round(h)}`);
    }
    return { small, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}
