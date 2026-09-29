import { defineConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

// Messages are written in English in the source (Lingui's `t` / `<Trans>`
// macros); `npm run i18n:extract` collects them into one gettext catalog per
// language, `npm run i18n:compile` turns those into the modules the app loads.
// See documentation/backend/i18n.md.
export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "de"],
  catalogs: [{ path: "<rootDir>/locales/{locale}/messages", include: ["app", "components", "lib"] }],
  // Line numbers would churn the catalogs on every unrelated edit.
  format: formatter({ lineNumbers: false }),
});
