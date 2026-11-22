import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The controls bar's panel buttons (Taxa, Display, Filters: one look, round 6) and their popovers. No browser, so these
// read app.css and filters.css as text.
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

  it("the panel buttons wrap to their own row under 820px of bar and share it on phones", () => {
    const two = block(css, /@container \(max-width: 819px\)/);
    expect(two).toMatch(/^\s*\.eb-dock \{ flex-wrap: wrap; row-gap: 4px; \}/);
    expect(two).toMatch(/\.eb-dock-filters\s*\{\s*order: 1; flex: 1 0 100%/);
    expect(block(css, /@container \(max-width: 599px\)/)).toMatch(/\.eb-dock-filters \.eb-dock-drop \{[^}]*flex: 1 1 auto; min-width: 0;/);
  });

  it("under 820px of bar the magnifier ends row one, apart from the views (the phone fixes, item 3)", () => {
    expect(block(css, /@container \(max-width: 819px\)/)).toMatch(/\.eb-dock-end \{ margin-left: auto; \}/);
  });

  it("on phones every view's row two shares its room evenly: List's two tools take two shares, one each (item 5)", () => {
    const phone = rules(css).filter((r) => r.at === "@container (max-width: 599px)");
    const body = (sel: string) => phone.find((r) => r.sel === sel)?.body ?? "";
    expect(body(".eb-dock-filters .eb-dock-drop")).toMatch(/flex: 1 1 auto/);
    expect(body(".eb-dock-tools")).toMatch(/flex: 2 1 auto/);
    expect(body(".eb-dock-tools > *, .eb-dock-sortwrap > .eb-dock-dir")).toMatch(/flex: 1 1 auto/);
  });

  it("a drop label can always shrink (outside every rule): it never pushes the magnifier", () => {
    const label = topLevelRule(css, ".eb-drop-label");
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/overflow:\s*hidden/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
    expect(topLevelRule(css, ".eb-dock-filters")).toMatch(/min-width:\s*0/);
    expect(topLevelRule(css, ".eb-dock-drop")).toMatch(/flex:\s*0 1 auto/);
  });

  it("nothing moves when a filter is set: one label weight, no count badge, the panel's head row Clear all's height", () => {
    // No held width (it left a gap before the caret) and no weight change: the label is "Filters" at one width.
    expect(css).not.toContain("data-reserve");
    expect(css).not.toMatch(/\.eb-drop-label::after/);
    expect(topLevelRule(css, ".eb-dock-drop[data-active]")).not.toMatch(/font-weight/);
    // No count on the buttons (round 6 polish): Accent text alone says something is chosen.
    expect(css).not.toContain(".eb-drop-badge");
    // The panel's head row is as tall as Clear all (.eb-textbtn) before it shows.
    const btn = topLevelRule(css, ".eb-textbtn").match(/min-height:\s*(\d+)px/)![1];
    expect(topLevelRule(filtersCss, ".eb-fpanel-headrow")).toMatch(new RegExp(`min-height:\\s*${btn}px`));
  });

  it("the drop glyph is 18px: its rule outweighs .eb-dock-tab svg's 20px, and leaves the 14px caret alone", () => {
    expect(topLevelRule(css, ".eb-dock-drop svg:not(.eb-drop-caret)")).toMatch(/width: 18px; height: 18px/);
    expect(topLevelRule(css, ".eb-dock-tab svg")).toMatch(/width: 20px/);
  });

  it("the Filters and Taxa popovers span the dock (the same in every view) and reach down to the window (--drop-max); each column scrolls one list, its last part", () => {
    const pop = topLevelRule(filtersCss, '.eb-drop[data-kind="filters"], .eb-drop[data-kind="taxa"]');
    expect(pop).toMatch(/left:\s*0;\s*right:\s*0;\s*width:\s*auto/);
    // DockPanel sets --drop-max (dropRoom, tests/dock-row.test.ts); before it is measured, at most 70vh.
    expect(topLevelRule(filtersCss, ".eb-drop")).toMatch(/max-height:\s*var\(--drop-max, min\(70vh, 560px\)\)/);
    // No scroll anchoring in the view: a chip row or a view changing height never scrolls the page under an open panel.
    expect(topLevelRule(css, ".eb-view")).toMatch(/overflow-anchor:\s*none/);
    // Every panel opens 6px under the dock's bottom edge (DockPanel sets --dock-bottom), over the chip row.
    expect(topLevelRule(filtersCss, ".eb-drop")).toMatch(/top:\s*calc\(var\(--dock-bottom, 100%\) \+ 6px\)/);
    const list = topLevelRule(filtersCss, '.eb-drop[data-kind="filters"] .eb-fpanel-row .eb-places-scroll,\n.eb-drop[data-kind="filters"] .eb-fpanel-row [data-sec="status"] .eb-checklist');
    expect(list).toMatch(/overscroll-behavior:\s*contain/);
    expect(list).toMatch(/overflow-y:\s*auto/);
    // No view narrows it: no rule for a view's own width.
    expect(filtersCss).not.toMatch(/data-view[^{]*\.eb-drop/);
  });

  it("the content under the dock dims to 30% while Filters is open, easing both ways, with no transition under reduced motion", () => {
    expect(topLevelRule(css, ".eb-view-below")).toMatch(/display:\s*contents/);
    expect(topLevelRule(css, ".eb-view-below[data-dim] > *")).toMatch(/opacity:\s*\.3/);
    // On the children at rest, not with the attribute: undimming eases too (AN2).
    expect(topLevelRule(css, ".eb-view-below > *")).toMatch(/transition:\s*opacity/);
    expect(topLevelRule(css, ".eb-view-below[data-dim] > *")).not.toMatch(/transition/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.eb-view-below > \*\s*\{\s*transition:\s*none/);
  });

  it("the Conservation status panel's long category names wrap rather than cut", () => {
    expect(topLevelRule(filtersCss, ".eb-status-row .eb-check-name")).toMatch(/white-space:\s*normal/);
  });
});

// Round 6 polish, item 7 (Yusuf, 2026-11-21): one even rhythm on the dock's right side. Every rule in app.css that
// touches a right-side item or group is read with the at-rule it sits in, so a per-item padding, a group's own gap or a
// margin between groups fails here at whichever breakpoint it is added.
type Rule = { at: string; sel: string; body: string };
function rules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const walk = (src: string, at: string) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open < 0) break;
      const head = src.slice(i, open).trim().split(";").pop()!.trim();
      let depth = 0, j = open;
      for (; j < src.length; j++) {
        if (src[j] === "{") depth++;
        if (src[j] === "}" && --depth === 0) break;
      }
      const inner = src.slice(open + 1, j);
      if (head.startsWith("@")) walk(inner, head);
      else out.push({ at, sel: head, body: inner });
      i = j + 1;
    }
  };
  walk(text, "top");
  return out;
}
const decl = (body: string, prop: string) => [...body.matchAll(new RegExp(`(?:^|;)\\s*(${prop})\\s*:\\s*([^;]+)`, "g"))].map((m) => [m[1], m[2].trim()]);
const RIGHT_ITEM = /\.eb-dock-(sw|dir|drop|find|sortwrap)\b|\.eb-dock-(tools|filters|end) \.eb-dock-tab\b/;
const RIGHT_GROUP = /^\.eb-dock-(tools|filters|end)$/;

describe("the dock's right side: one padding, one gap, at every breakpoint", () => {
  const all = rules(css);

  it("no right-side item sets its own side padding: only `.eb-dock-filters .eb-dock-tab` (var(--dock-px)) and the 44px magnifier's 0", () => {
    const bad = all.flatMap((r) => r.sel.split(",").map((s) => s.trim()).filter((s) => RIGHT_ITEM.test(s)).flatMap((s) =>
      decl(r.body, "padding(?:-inline|-left|-right)?").filter(() => !(s === ".eb-dock-filters .eb-dock-tab" && r.at === "top") && !(s === ".eb-dock-find" && r.at === "top"))
        .map(([p, v]) => `${r.at} ${s} { ${p}: ${v} }`)));
    expect(bad).toEqual([]);
    expect(topLevelRule(css, ".eb-dock-filters .eb-dock-tab")).toMatch(/^\s*padding-inline: var\(--dock-px\);\s*$/);
    // The magnifier: 44px with its 20px glyph leaves 12px a side, the wide bar's --dock-px.
    expect(topLevelRule(css, ".eb-dock-find")).toMatch(/padding: 0; width: 44px/);
    expect(topLevelRule(css, ".eb-dock-tab svg")).toMatch(/width: 20px/);
  });

  it("the groups' gaps are var(--dock-gap), the dock's column gap too, and no margin sits between groups", () => {
    const bad = all.flatMap((r) => r.sel.split(",").map((s) => s.trim()).flatMap((s) => {
      const out: string[] = [];
      if (RIGHT_GROUP.test(s) || s === ".eb-dock") {
        for (const [p, v] of decl(r.body, "(?:column-)?gap")) if (v !== "var(--dock-gap)" && !(s === ".eb-dock" && p === "gap" && v === "4px")) out.push(`${r.at} ${s} { ${p}: ${v} }`);
      }
      // The one exception: under 820px of bar the magnifier is on row one with the views, pushed to its right end.
      const searchRight = (at: string, p: string, v: string) => s === ".eb-dock-end" && at === "@container (max-width: 819px)" && p === "margin-left" && v === "auto";
      if (/^\.eb-dock-(tools|end)$/.test(s)) for (const [p, v] of decl(r.body, "margin(?:-left|-right|-inline)?")) if (!searchRight(r.at, p, v)) out.push(`${r.at} ${s} { ${p}: ${v} }`);
      return out;
    }));
    expect(bad).toEqual([]);
    expect(topLevelRule(css, ".eb-dock-tools, .eb-dock-filters, .eb-dock-end")).toMatch(/gap: var\(--dock-gap\)/);
  });

  it("the breakpoints change only the two variables, on .eb-dock alone: 12/4, then 8/4 under 600px, then 4/2 under 330px", () => {
    const set = all.flatMap((r) => decl(r.body, "--dock-(?:px|gap)").map(([p, v]) => ({ at: r.at, sel: r.sel, p, v })));
    expect(set.every((d) => d.sel === ".eb-dock")).toBe(true);
    const table = Object.fromEntries([...new Set(set.map((d) => d.at))].map((at) => [at, Object.fromEntries(set.filter((d) => d.at === at).map((d) => [d.p, d.v]))]));
    expect(table).toEqual({
      top: { "--dock-px": "12px", "--dock-gap": "4px" },
      "@container (max-width: 599px)": { "--dock-px": "8px" },
      "@media (max-width: 600px)": { "--dock-px": "8px" },
      "@container (max-width: 540px)": { "--dock-px": "8px" },
      "@container (max-width: 330px)": { "--dock-px": "4px", "--dock-gap": "2px" },
    });
  });
});

describe("round 6 design proposals: the panels' CSS (AU4, AN5, AD1, H11)", () => {
  const cardCss = readFileSync(resolve(__dirname, "../src/components/collage/card-list.css"), "utf8");
  it("every breadcrumb step, the Taxa path's too, has a 44px press", () => {
    expect(topLevelRule(filtersCss, ".eb-path button")).toMatch(/position:\s*relative/);
    expect(topLevelRule(filtersCss, ".eb-path button::after")).toMatch(/height:\s*44px/);
  });
  it("a popover rises 4px from its button, with no transform left once it lands, and none under reduced motion", () => {
    const drop = topLevelRule(filtersCss, ".eb-drop");
    expect(drop).toMatch(/animation:\s*eb-rise\s[^;]*backwards/);
    expect(filtersCss).toMatch(/@keyframes eb-rise \{ from \{ opacity: 0; transform: translateY\(-4px\); \} \}/);
    expect(block(filtersCss, /@media \(prefers-reduced-motion: reduce\) \{\n  \.eb-chip/)).toMatch(/\.eb-drop \{ animation: none; \}/);
  });
  it("under 760px of bar Conservation status stacks under Places", () => {
    const stacked = block(filtersCss, /@container \(max-width: 759px\)/);
    expect(stacked).toMatch(/\.eb-fpanel-row \{ flex-direction: column;/);
    expect(stacked).toMatch(/\[data-sec="status"\] \{ border-left: 0;[^}]*border-top: 1px solid var\(--hairline\)/);
  });
  it("long compound names hyphenate before they break mid-word", () => {
    expect(topLevelRule(filtersCss, ".eb-check-name")).toMatch(/hyphens:\s*auto/);
    for (const sel of [".eb-card-name", ".eb-lhead-name", ".eb-row-primary"]) expect(topLevelRule(cardCss, sel)).toMatch(/hyphens:\s*auto/);
  });
});

describe("round 6 design proposals: the dock's motion (AN8, AU16) and the list rows' hover (P6)", () => {
  const cardCss = readFileSync(resolve(__dirname, "../src/components/collage/card-list.css"), "utf8");
  it("a panel button's Accent text eases in, as its fill does; the theme and language buttons ease their fill", () => {
    expect(topLevelRule(css, ".eb-dock-tab")).toMatch(/transition:[^;]*color \.15s/);
    expect(topLevelRule(css, ".eb-theme")).toMatch(/transition:\s*background-color \.15s/);
  });
  it("under reduced motion the panel buttons' caret turns at once, and the theme button's fill too", () => {
    const reduced = block(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.eb-btn, \.eb-dock-tab/);
    expect(reduced).toMatch(/\.eb-dock-drop \.eb-drop-caret/);
    expect(reduced).toMatch(/\.eb-theme \{ transition: none; \}|\.eb-theme[^{]*\{ transition: none; \}/);
  });
  it("list rows show a Surface band on hover, fine pointers only", () => {
    expect(block(cardCss, /@media \(hover: hover\) and \(pointer: fine\) \{\n  \.eb-row-btn \{/)).toMatch(/\.eb-row-btn:hover \{ background: var\(--surface\); \}/);
  });
});

describe("the Display panel's segments on a phone (the phone fixes, item 4)", () => {
  const shareCss = readFileSync(resolve(__dirname, "../src/components/share/share.css"), "utf8");
  const tokens = readFileSync(resolve(__dirname, "../src/styles/tokens.css"), "utf8");
  it("are the share dialog's touch height (one token, --seg-touch: 32px), with a 44px press through ::after", () => {
    expect(tokens).toMatch(/--seg-touch: 32px;/);
    const all = rules(css), share = rules(shareCss);
    const body = (list: Rule[], at: string, sel: string) => list.find((r) => r.at === at && r.sel === sel)?.body ?? "";
    for (const [at, pre] of [["@media (pointer: coarse)", ""], ["top", ".eb-drop-sheet "]] as const) {
      expect(body(all, at, `${pre}.eb-disp .eb-seg-btn`)).toMatch(/min-height: var\(--seg-touch\)/);
      expect(body(all, at, `${pre}.eb-disp .eb-seg-btn::after`)).toMatch(/inset: calc\(\(var\(--seg-touch\) - 44px\) \/ 2\) 0/);
    }
    expect(body(all, "top", ".eb-disp .eb-seg-btn::after")).toMatch(/content: ''; position: absolute/);
    expect(body(share, "@media (pointer: coarse)", ".eb-share .eb-share-seg .eb-seg-btn")).toMatch(/min-height: var\(--seg-touch\)/);
    expect(body(share, "@media (pointer: coarse)", ".eb-share .eb-share-seg .eb-seg-btn::after")).toMatch(/inset: calc\(\(var\(--seg-touch\) - 44px\) \/ 2\) 0/);
  });
});
