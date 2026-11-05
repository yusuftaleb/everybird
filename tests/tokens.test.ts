import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/styles/tokens.css"), "utf8");

const tokens: Record<string, [light: string, dark: string]> = {
  ink: ["#1e1e24", "#ffffff"],
  paper: ["#f6f4ef", "#1e1e24"],
  accent: ["#92140c", "#f06a5f"],
  muted: ["#5f5f69", "#a9a9b2"],
  line: ["#857f74", "#6e6e78"],
  hairline: ["#dedad2", "#3d3d45"],
  surface: ["#ebe8e1", "#28282f"],
};

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
const auto = block(css, /@media \(prefers-color-scheme: dark\)/);
const forcedLight = block(css, /:root\[data-theme=light\]\s*\{/);

describe("design tokens", () => {
  for (const [name, [l, d]] of Object.entries(tokens)) {
    it(`--${name} is ${l} in light and ${d} in dark`, () => {
      const re = (v: string) => new RegExp(`--${name}:\\s*${v}\\s*;`, "i");
      expect(light).toMatch(re(l));
      expect(forcedLight).toMatch(re(l));
      expect(dark).toMatch(re(d));
      expect(auto).toMatch(re(d));
    });
  }

  it("auto-dark is skipped when light is forced", () => {
    expect(css).toContain(":root:not([data-theme=light])");
  });

  it("declares the three font variables", () => {
    expect(css).toMatch(/--font-display:[^;]*Cabinet Grotesk/);
    expect(css).toMatch(/--font-body:[^;]*Satoshi/);
    expect(css).toMatch(/--font-mono:[^;]*Geist Mono/);
  });
});
