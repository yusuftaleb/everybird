import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    // Default is node; component tests opt in with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // English for components rendered without the root layout's I18nProvider (it has no default in production).
    setupFiles: ["tests/setup-i18n.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
