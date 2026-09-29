import type { NextConfig } from "next";
import { linguiMacroSwcPlugin } from "@lingui/swc-plugin/options";

const nextConfig: NextConfig = {
  // Emits .next/standalone: a self-contained server with only the traced
  // dependencies, which is what the container image runs. Without this the
  // image would need the whole node_modules tree.
  output: "standalone",
  experimental: {
    // Compiles Lingui's translation macros. The plugin is Wasm built against
    // one SWC version, so it is pinned to the release that matches this
    // Next.js; check it again on every Next.js upgrade (see
    // documentation/backend/i18n.md).
    swcPlugins: [linguiMacroSwcPlugin()],
  },
};

export default nextConfig;
