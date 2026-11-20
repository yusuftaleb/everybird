import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The controls bar with one Filters button. No browser, so these read app.css and filters.css as text.
const css = readFileSync(resolve(__dirname, "../src/components/app/app.css"), "utf8");

/** Body of the first block whose selector text matches `selector` (as tests/tokens.test.ts). */
function block(source: string, selector: RegExp): string {
  const m = selector.exec(source);
  if (!m) throw new Error(`selector not found: ${selector}`);
  const start = source.indexOf("{", m.index);
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start + 1, i);
  }
  throw new Error("unbalanced braces");
}

/** Body of the rule at the top level (outside every @media and @container) whose selector is exactly `selector`. */
function topLevelRule(source: string, selector: string): string {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) {
        const sel = text.slice(from, i).trim();
        if (sel === selector) return block(text.slice(i - 1), /./);
      }
      depth++;
    } else if (text[i] === "}") {
      if (--depth === 0) from = i + 1;
    } else if (depth === 0 && text[i] === ";") from = i + 1;
  }
  throw new Error(`no top-level rule ${selector}`);
}

const filtersCss = readFileSync(resolve(__dirname, "../src/components/filters/filters.css"), "utf8");

describe("the controls bar's CSS: one Filters button", () => {
  it("no three-drop rules are left", () => {
    expect(css).not.toContain("nth-child(3)");
    expect(css).not.toContain("@container (max-width: 1079px)");
    expect(css).not.toContain("@container (max-width: 319px)");
  });

  it("the one button wraps to its own row under 820px of bar and fills it on phones", () => {
    const two = block(css, /@container \(max-width: 819px\)/);
    expect(two).toMatch(/^\s*\.eb-dock \{ flex-wrap: wrap; row-gap: 4px; \}/);
    expect(two).toMatch(/\.eb-dock-filters\s*\{\s*order: 1; flex: 1 0 100%/);
    expect(block(css, /@container \(max-width: 599px\)/)).toMatch(/\.eb-dock-filters \.eb-dock-drop \{[^}]*flex: 1 1 0; min-width: 0;/);
  });

  it("a drop label can always shrink (outside every rule): it never pushes the magnifier", () => {
    const label = topLevelRule(css, ".eb-drop-label");
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/overflow:\s*hidden/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
    expect(topLevelRule(css, ".eb-dock-filters")).toMatch(/min-width:\s*0/);
    expect(topLevelRule(css, ".eb-dock-drop")).toMatch(/flex:\s*0 1 auto/);
  });

  it("nothing moves when a filter is set: one label weight, the count a badge placed on the glyph, the panel's head row Clear all's height", () => {
    // No held width (it left a gap before the caret) and no weight change: the label is "Filters" at one width.
    expect(css).not.toContain("data-reserve");
    expect(css).not.toMatch(/\.eb-drop-label::after/);
    expect(topLevelRule(css, ".eb-dock-drop[data-active]")).not.toMatch(/font-weight/);
    // The count sits on the glyph, out of the flow, so it changes no width; it takes no pointer.
    expect(topLevelRule(css, ".eb-drop-icon")).toMatch(/position:\s*relative/);
    const badge = topLevelRule(css, ".eb-drop-badge");
    expect(badge).toMatch(/position:\s*absolute/);
    expect(badge).toMatch(/pointer-events:\s*none/);
    // The panel's head row is as tall as Clear all (.eb-textbtn) before it shows.
    const btn = topLevelRule(css, ".eb-textbtn").match(/min-height:\s*(\d+)px/)![1];
    expect(topLevelRule(filtersCss, ".eb-fpanel-headrow")).toMatch(new RegExp(`min-height:\\s*${btn}px`));
  });

  it("the drop glyph is 18px: its rule outweighs .eb-dock-tab svg's 20px, and leaves the 14px caret alone", () => {
    expect(topLevelRule(css, ".eb-dock-drop svg:not(.eb-drop-caret)")).toMatch(/width: 18px; height: 18px/);
    expect(topLevelRule(css, ".eb-dock-tab svg")).toMatch(/width: 20px/);
  });

  it("the popover spans the dock (the same in every view) and caps at 70vh; each column scrolls one list, its last part", () => {
    const pop = topLevelRule(filtersCss, '.eb-drop[data-kind="filters"]');
    expect(pop).toMatch(/left:\s*0;\s*right:\s*0;\s*width:\s*auto/);
    expect(pop).toMatch(/max-height:\s*70vh/);
    const list = topLevelRule(filtersCss, '.eb-drop[data-kind="filters"] .eb-fpanel-row .eb-places-scroll,\n.eb-drop[data-kind="filters"] .eb-fpanel-row [data-sec="status"] .eb-checklist');
    expect(list).toMatch(/overscroll-behavior:\s*contain/);
    expect(list).toMatch(/overflow-y:\s*auto/);
    // No view narrows it: no rule for a view's own width.
    expect(filtersCss).not.toMatch(/data-view[^{]*\.eb-drop/);
  });

  it("the content under the dock dims to 30% while Filters is open, with no transition under reduced motion", () => {
    expect(topLevelRule(css, ".eb-view-below")).toMatch(/display:\s*contents/);
    expect(topLevelRule(css, ".eb-view-below[data-dim] > *")).toMatch(/opacity:\s*\.3/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.eb-view-below\[data-dim\] > \*\s*\{\s*transition:\s*none/);
  });

  it("the Conservation status panel's long category names wrap rather than cut", () => {
    expect(topLevelRule(filtersCss, ".eb-status-row .eb-check-name")).toMatch(/white-space:\s*normal/);
  });
});
