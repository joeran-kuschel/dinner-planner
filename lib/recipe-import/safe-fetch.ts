import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { ImportError } from "@/lib/recipe-import/errors";
import { isPublicAddress, parseImportUrl } from "@/lib/recipe-import/address";

/**
 * The one place that fetches an address somebody typed. Every address is checked before and again when the
 * connection is made (so a name that resolves to a private address, or a redirect to one, fails too), the wait
 * and the size are limited, and only web pages come back. Nothing else in the app may fetch a user-supplied URL.
 */

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type FetchOptions = {
  /** Cancels the wait (the visitor pressed Cancel, or left). */
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  /** For tests against a local server only; the import itself never sets it. */
  allowPrivateAddresses?: boolean;
};

export type FetchedPage = { html: string; url: URL };

type Raw = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

/** The lookup the socket uses: resolves like normal, but refuses when any answer is not a public address. */
function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error, "", 0);
      if (!allowPrivate && addresses.some((entry) => !isPublicAddress(entry.address))) {
        return callback(new ImportError("blocked") as unknown as NodeJS.ErrnoException, "", 0);
      }
      if (options.all) return callback(null, addresses as never);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function decoderFor(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  switch ((encoding ?? "").toLowerCase().trim()) {
    case "":
    case "identity":
      return null;
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      throw new ImportError("unreachable");
  }
}

function requestOnce(url: URL, options: Required<Pick<FetchOptions, "maxBytes" | "allowPrivateAddresses">>, signal: AbortSignal): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        lookup: guardedLookup(options.allowPrivateAddresses),
        headers: {
          "user-agent": "DinnerPlanner/1.0 (personal recipe import)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-language": "en,de;q=0.8",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          return resolve({ status, headers: response.headers, body: Buffer.alloc(0) });
        }
        if (status < 200 || status >= 300) {
          response.resume();
          return reject(new ImportError("unreachable"));
        }
        const length = Number(response.headers["content-length"]);
        if (Number.isFinite(length) && length > options.maxBytes) {
          response.destroy();
          return reject(new ImportError("too-large"));
        }
        let decoder: ReturnType<typeof decoderFor>;
        try {
          decoder = decoderFor(response.headers["content-encoding"]);
        } catch (error) {
          response.destroy();
          return reject(error);
        }
        const body: Readable = decoder ? response.pipe(decoder) : response;
        const chunks: Buffer[] = [];
        let total = 0;
        body.on("data", (chunk: Buffer) => {
          total += chunk.length;
          // Counted after decompressing, so a small download cannot unpack into a large page.
          if (total > options.maxBytes) {
            response.destroy();
            request.destroy();
            return reject(new ImportError("too-large"));
          }
          chunks.push(chunk);
        });
        body.on("end", () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks) }));
        body.on("error", () => reject(new ImportError("unreachable")));
        response.on("error", () => reject(new ImportError("unreachable")));
      },
    );
    request.on("error", (error) => reject(error instanceof ImportError ? error : new ImportError("unreachable")));
    request.end();
  });
}

/** Where a redirect leads: checked like the first address, so a public page cannot send us to a private one. */
export function nextHop(current: URL, location: string, allowPrivateAddresses = false): URL {
  let target: string;
  try {
    target = new URL(location, current).href;
  } catch {
    throw new ImportError("unreachable");
  }
  return parseImportUrl(target, { allowPrivateAddresses });
}

/** The page's text, in the character set its header (or `<meta charset>`) names; UTF-8 when unsure. */
function decodePage(body: Buffer, contentType: string): string {
  const header = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const meta = body.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  for (const label of [header, meta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(body);
    } catch {
      // An unknown label: try the next one.
    }
  }
  return body.toString("utf8");
}

/** Fetch a web page at `rawUrl` within the limits above. Throws an `ImportError` for everything that goes wrong. */
export async function fetchPage(rawUrl: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const allowPrivateAddresses = options.allowPrivateAddresses ?? false;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const maxBytes = options.maxBytes ?? MAX_PAGE_BYTES;

  let url = parseImportUrl(rawUrl, { allowPrivateAddresses });
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await requestOnce(url, { maxBytes, allowPrivateAddresses }, signal);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location;
        if (!location) throw new ImportError("unreachable");
        url = nextHop(url, location, allowPrivateAddresses);
        continue;
      }
      const contentType = String(response.headers["content-type"] ?? "");
      if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType)) throw new ImportError("not-html");
      return { html: decodePage(response.body, contentType), url };
    }
    throw new ImportError("unreachable");
  } catch (error) {
    // An aborted request fails with whatever the socket says; what really happened is that the wait ended.
    if (options.signal?.aborted) throw new ImportError("cancelled");
    if (timeout.aborted) throw new ImportError("timeout");
    if (error instanceof ImportError) throw error;
    throw new ImportError("unreachable");
  }
}
