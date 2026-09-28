import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone: a self-contained server with only the traced
  // dependencies, which is what the container image runs. Without this the
  // image would need the whole node_modules tree.
  output: "standalone",
};

export default nextConfig;
