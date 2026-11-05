import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Pin the root: a stray package-lock.json higher up would otherwise confuse Next.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
