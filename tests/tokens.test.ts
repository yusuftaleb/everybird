import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/styles/tokens.css"), "utf8");

const tokens: Record<string, [light: string, dark: string]> = {
  ink: ["#1e1e24", "#ffffff"],
  paper: ["#f6f4ef", "#1e1e24"],
  accent: ["#92140c", "#f06a5f"],
  muted: ["#5f5f69", "#a9a9b2"],
  line: ["#857f74", "#76767f"],
  hairline: ["#dedad2", "#3d3d45"],
  surface: ["#ebe8e1", "#28282f"],
};

/** WCAG relative-luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Body of the first block whose selector text matches `selector`. */
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

const light = block(css, /:root\s*\{/);
const dark = block(css, /:root\[data-theme=dark\]\s*\{/);
const forcedLight = block(css, /:root\[data-theme=light\]\s*\{/);

describe("design tokens", () => {
  for (const [name, [l, d]] of Object.entries(tokens)) {
    it(`--${name} is ${l} in light and ${d} in dark`, () => {
      const re = (v: string) => new RegExp(`--${name}:\\s*${v}\\s*;`, "i");
      expect(light).toMatch(re(l));
      expect(forcedLight).toMatch(re(l));
      expect(dark).toMatch(re(d));
    });
  }

  // Line draws the borders that must be seen (fields, the switch's off track, checkboxes, the dropzone):
  // WCAG 1.4.11's 3:1 against both grounds it sits on, Paper and Surface, in both themes.
  for (const [i, theme] of ["light", "dark"].entries()) {
    for (const ground of ["paper", "surface"] as const) {
      it(`${theme}: Line on ${ground[0].toUpperCase() + ground.slice(1)} reaches 3:1`, () => {
        expect(contrast(tokens.line[i], tokens[ground][i])).toBeGreaterThanOrEqual(3);
      });
    }
  }
  it("the share image's colours are the tokens", () => {
    const image = readFileSync(resolve(__dirname, "../src/lib/share/image.ts"), "utf8");
    for (const [name, [l, d]] of Object.entries(tokens)) {
      expect(image).toMatch(new RegExp(`light: \\{[^}]*${name}: '${l}'`));
      expect(image).toMatch(new RegExp(`dark: \\{[^}]*${name}: '${d}'`));
    }
  });

  // DESIGN.md's Elevation: floating things (card, tooltip, results, toast, popovers, the share dialog) take one shadow;
  // the phone sheet its own upward one; everything else is an inset ring. (About's demo draws its own scene.)
  it("every app shadow is the one floating shadow, the sheet's, or an inset ring", () => {
    const FLOAT = "0 12px 32px rgb(0 0 0 / .08), 0 2px 6px rgb(0 0 0 / .04)";
    const SHEET = "0 -8px 32px rgb(0 0 0 / .12)";
    const css = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? css(join(dir, e.name)) : e.name.endsWith(".css") ? [join(dir, e.name)] : []);
    const files = [...css(resolve(__dirname, "../src")), ...css(resolve(__dirname, "../app"))].filter((f) => !/components\/about\//.test(f));
    const odd: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/box-shadow:\s*([^;}]+)/g)) {
        const v = m[1].trim();
        if (v !== FLOAT && v !== SHEET && !v.startsWith("inset") && v !== "none") odd.push(`${f.split("/src/").at(-1)}: ${v}`);
      }
    }
    expect(odd).toEqual([]);
  });

  it("light by default, even when the system is dark: no prefers-color-scheme rule, color-scheme light", () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(light).toMatch(/color-scheme:\s*light\s*;/);
  });

  it("declares the three font variables", () => {
    expect(css).toMatch(/--font-display:[^;]*Cabinet Grotesk/);
    expect(css).toMatch(/--font-body:[^;]*Satoshi/);
    expect(css).toMatch(/--font-mono:[^;]*Geist Mono/);
  });
});
