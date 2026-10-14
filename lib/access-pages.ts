/**
 * The two pages the access gate serves itself, as plain HTML with inline styling: the proxy answers before the app's
 * own layout, scripts and assets are reachable, so these need none of them. Server only. Text is translated like
 * the rest of the app (`t(i18n)`); the language comes from the `locale` cookie, else `Accept-Language`.
 */
import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { CATALOGS } from "@/lib/i18n/catalogs";
import { createI18n, isLocale, negotiateLocale, type Locale } from "@/lib/i18n/config";

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The visitor's language, from the request alone: the picked language's cookie, else the browser's. */
export function requestLocale(headers: Headers, cookieValue: string | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : negotiateLocale(headers.get("accept-language"));
}

export function gateI18n(locale: Locale): I18n {
  return createI18n(locale, CATALOGS[locale]);
}

// Colours that keep AA contrast in both schemes; the page has no other styling to share.
const STYLE = `
  :root { color-scheme: light dark; --bg: #faf7f2; --fg: #2a1f16; --muted: #5c4d40; --card: #fff; --line: #d9cfc2; --accent: #8f3a1f; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1d1814; --fg: #f3ece3; --muted: #cbbfb0; --card: #272019; --line: #4a3f35; --accent: #f0a58a; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--fg); font: 1.0625rem/1.5 system-ui, sans-serif; }
  main { max-width: 32rem; background: var(--card); border: 1px solid var(--line); border-radius: 1rem; padding: 1.5rem; }
  h1 { margin: 0 0 .75rem; font-size: 1.5rem; line-height: 1.25; }
  p { margin: .5rem 0 0; } .muted { color: var(--muted); } .error { color: var(--accent); font-weight: 600; }
  code { font-family: ui-monospace, monospace; background: var(--bg); border: 1px solid var(--line); border-radius: .25rem; padding: 0 .25rem; }`;

function page(locale: Locale, title: string, body: string, script = ""): string {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>${script}
</body>
</html>`;
}

const COMMAND = "npm run k8s:access-link";

/** A translated sentence, escaped, with the command in it shown as code. The command is a message value, so a language can place it where its sentence needs it. */
const withCode = (sentence: string) => escape(sentence).replace(escape(COMMAND), `<code>${escape(COMMAND)}</code>`);

/** What a browser without the cookie sees (answered with 401). */
export function accessRequiredPage(i18n: I18n, locale: Locale): string {
  const title = t(i18n)`This planner needs its access link`;
  return page(
    locale,
    title,
    `<h1>${escape(title)}</h1>
<p>${escape(t(i18n)`Open the link you got when the planner was set up, once on each device.`)}</p>
<p class="muted">${withCode(t(i18n)`If you have lost it, print it again on the computer that runs the planner with ${COMMAND}.`)}</p>`,
  );
}

/**
 * The page behind the private link: its script takes the key from the address after `#` (which no server ever
 * sees), removes it from the address bar, posts it to `/access` once and goes on to the planner.
 */
export function accessPage(i18n: I18n, locale: Locale): string {
  const title = t(i18n)`Opening the planner`;
  const failed = t(i18n)`That link is not valid. Print the current one with ${COMMAND}.`;
  const wait = t(i18n)`Checking the access link…`;
  const noscript = t(i18n)`This one-time step needs JavaScript. Turn it on for this page and open the link again.`;
  return page(
    locale,
    title,
    `<h1>${escape(title)}</h1>
<p id="status" role="status" class="muted">${escape(wait)}</p>
<p id="error" role="alert" class="error" hidden>${withCode(failed)}</p>
<noscript><p class="error">${escape(noscript)}</p></noscript>`,
    `
<script>
(function () {
  var key = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  try { key = decodeURIComponent(key); } catch (e) { /* a mangled link: the key is refused below */ }
  if (!key) { location.replace("/"); return; }
  fetch("/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: key }) })
    .then(function (response) {
      if (response.ok) { location.replace("/"); return; }
      throw new Error("refused");
    })
    .catch(function () {
      document.getElementById("status").hidden = true;
      document.getElementById("error").hidden = false;
    });
})();
</script>`,
  );
}
