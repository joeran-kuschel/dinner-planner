import { transformAsync } from "@babel/core";
import type { Plugin } from "vite";

/**
 * Compiles Lingui's macros for Vitest. Next.js does this with the SWC plugin;
 * here the Babel one does the same job, and only on files that import a macro.
 */
export function linguiMacro(): Plugin {
  return {
    name: "lingui-macro",
    enforce: "pre",
    async transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes("node_modules") || !code.includes("/macro\"")) return;
      const result = await transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: { plugins: ["typescript", "jsx"] },
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      });
      return result?.code ? { code: result.code, map: result.map } : undefined;
    },
  };
}
