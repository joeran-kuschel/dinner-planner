import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportError, type ImportErrorCode } from "@/lib/recipe-import/errors";
import { fetchPage, nextHop } from "@/lib/recipe-import/safe-fetch";

// A small web server on this machine. The fetcher refuses private addresses unless a test says otherwise.
let server: http.Server;
let base: string;

const HTML = "<html><head><title>Ok</title></head><body>hello</body></html>";

beforeAll(async () => {
  server = http.createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://x").pathname;
    const html = (body: string, type = "text/html; charset=utf-8") => {
      response.writeHead(200, { "content-type": type });
      response.end(body);
    };
    switch (path) {
      case "/page":
        return html(HTML);
      case "/redirect":
        response.writeHead(302, { location: "/page" });
        return response.end();
      case "/redirect-chain-4":
        response.writeHead(302, { location: "/redirect-chain-3" });
        return response.end();
      case "/redirect-chain-3":
        response.writeHead(302, { location: "/redirect-chain-2" });
        return response.end();
      case "/redirect-chain-2":
        response.writeHead(302, { location: "/redirect" });
        return response.end();
      case "/loop":
        response.writeHead(302, { location: "/loop" });
        return response.end();
      case "/redirect-nowhere":
        response.writeHead(302);
        return response.end();
      case "/redirect-ftp":
        response.writeHead(302, { location: "ftp://example.com/x" });
        return response.end();
      case "/redirect-private":
        response.writeHead(302, { location: "http://169.254.169.254/latest" });
        return response.end();
      case "/json":
        return html('{"a":1}', "application/json");
      case "/pdf":
        return html("%PDF", "application/pdf");
      case "/missing":
        response.writeHead(404, { "content-type": "text/html" });
        return response.end("nope");
      case "/error":
        response.writeHead(500);
        return response.end();
      case "/gzip":
        response.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        return response.end(zlib.gzipSync(HTML));
      case "/brotli":
        response.writeHead(200, { "content-type": "text/html", "content-encoding": "br" });
        return response.end(zlib.brotliCompressSync(HTML));
      case "/deflate":
        response.writeHead(200, { "content-type": "text/html", "content-encoding": "deflate" });
        return response.end(zlib.deflateSync(HTML));
      case "/unknown-encoding":
        response.writeHead(200, { "content-type": "text/html", "content-encoding": "compress" });
        return response.end("x");
      case "/bomb":
        // 3 MB of one letter packs into a few kilobytes.
        response.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        return response.end(zlib.gzipSync("a".repeat(3 * 1024 * 1024)));
      case "/big-header":
        response.writeHead(200, { "content-type": "text/html", "content-length": String(3 * 1024 * 1024) });
        return response.end("a");
      case "/big-stream":
        response.writeHead(200, { "content-type": "text/html" });
        return response.end("a".repeat(3 * 1024 * 1024));
      case "/latin1":
        response.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" });
        return response.end(Buffer.from("Gemüse süß", "latin1"));
      case "/meta-charset":
        response.writeHead(200, { "content-type": "text/html" });
        return response.end(Buffer.from('<meta charset="iso-8859-1">Gemüse', "latin1"));
      case "/bad-charset":
        return html("Gemüse", "text/html; charset=nonsense-9");
      case "/xhtml":
        return html("<html/>", "application/xhtml+xml");
      case "/slow":
        return; // never answers
      case "/headers":
        return html(JSON.stringify(request.headers));
      default:
        response.writeHead(404);
        return response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const allow = { allowPrivateAddresses: true };
const codeOf = async (promise: Promise<unknown>): Promise<ImportErrorCode | "resolved" | "other"> => {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error instanceof ImportError ? error.code : "other";
  }
};

describe("fetchPage", () => {
  it("returns the page's text and its address", async () => {
    const page = await fetchPage(`${base}/page`, allow);
    expect(page.html).toBe(HTML);
    expect(page.url.href).toBe(`${base}/page`);
  });

  it("accepts XHTML", async () => {
    expect((await fetchPage(`${base}/xhtml`, allow)).html).toBe("<html/>");
  });

  it("introduces itself and asks for web pages", async () => {
    const headers = JSON.parse((await fetchPage(`${base}/headers`, allow)).html);
    expect(headers["user-agent"]).toContain("DinnerPlanner");
    expect(headers.accept).toContain("text/html");
    expect(headers["accept-encoding"]).toContain("gzip");
    // Nothing of the visitor's goes along.
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });

  describe("redirects", () => {
    it("follows one, and reports the address it ended at", async () => {
      const page = await fetchPage(`${base}/redirect`, allow);
      expect(page.html).toBe(HTML);
      expect(page.url.pathname).toBe("/page");
    });

    it("follows up to three", async () => {
      expect((await fetchPage(`${base}/redirect-chain-3`, allow)).url.pathname).toBe("/page");
    });

    it("gives up after more than three, and on a loop", async () => {
      expect(await codeOf(fetchPage(`${base}/redirect-chain-4`, allow))).toBe("unreachable");
      expect(await codeOf(fetchPage(`${base}/loop`, allow))).toBe("unreachable");
    });

    it("fails on a redirect without a target or to something that is no web address", async () => {
      expect(await codeOf(fetchPage(`${base}/redirect-nowhere`, allow))).toBe("unreachable");
      expect(await codeOf(fetchPage(`${base}/redirect-ftp`, allow))).toBe("invalid-url");
    });
  });

  describe("nextHop", () => {
    const here = new URL("https://example.com/a/b");

    it("resolves a relative address against the page", () => {
      expect(nextHop(here, "/c?x=1").href).toBe("https://example.com/c?x=1");
      expect(nextHop(here, "d").href).toBe("https://example.com/a/d");
      expect(nextHop(here, "https://other.example.org/z#frag").href).toBe("https://other.example.org/z");
    });

    it.each([
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1/",
      "http://localhost:3000/",
      "http://10.0.0.5/admin",
      "http://[::1]/",
      "https://example.com:8443/",
    ])("refuses a redirect to %s even from a public page", (target) => {
      expect(() => nextHop(here, target)).toThrowError(expect.objectContaining({ code: "blocked" }));
    });

    it("refuses a redirect to something that is no web address", () => {
      expect(() => nextHop(here, "ftp://example.com/x")).toThrowError(expect.objectContaining({ code: "invalid-url" }));
      expect(() => nextHop(here, "javascript:alert(1)")).toThrowError(expect.objectContaining({ code: "invalid-url" }));
    });

    it("lets a private target through only with the test switch", () => {
      expect(nextHop(here, "http://127.0.0.1:4000/x", true).port).toBe("4000");
    });
  });

  describe("what comes back", () => {
    it("refuses what is not a web page", async () => {
      expect(await codeOf(fetchPage(`${base}/json`, allow))).toBe("not-html");
      expect(await codeOf(fetchPage(`${base}/pdf`, allow))).toBe("not-html");
    });

    it("fails on an error status, whatever the body says", async () => {
      expect(await codeOf(fetchPage(`${base}/missing`, allow))).toBe("unreachable");
      expect(await codeOf(fetchPage(`${base}/error`, allow))).toBe("unreachable");
    });

    it.each(["gzip", "brotli", "deflate"])("unpacks %s", async (kind) => {
      expect((await fetchPage(`${base}/${kind}`, allow)).html).toBe(HTML);
    });

    it("fails on a compression it does not know", async () => {
      expect(await codeOf(fetchPage(`${base}/unknown-encoding`, allow))).toBe("unreachable");
    });

    it("reads the character set from the header, then from a meta tag, then falls back to UTF-8", async () => {
      expect((await fetchPage(`${base}/latin1`, allow)).html).toBe("Gemüse süß");
      expect((await fetchPage(`${base}/meta-charset`, allow)).html).toContain("Gemüse");
      expect((await fetchPage(`${base}/bad-charset`, allow)).html).toBe("Gemüse");
    });
  });

  describe("limits", () => {
    it("refuses a page that says it is too large, and one that turns out to be", async () => {
      expect(await codeOf(fetchPage(`${base}/big-header`, allow))).toBe("too-large");
      expect(await codeOf(fetchPage(`${base}/big-stream`, allow))).toBe("too-large");
    });

    it("counts a download after unpacking it, so a small file cannot unpack into a large page", async () => {
      expect(await codeOf(fetchPage(`${base}/bomb`, allow))).toBe("too-large");
    });

    it("takes a size of the caller's choosing", async () => {
      expect(await codeOf(fetchPage(`${base}/page`, { ...allow, maxBytes: 10 }))).toBe("too-large");
    });

    it("gives up waiting after the time limit", async () => {
      const started = Date.now();
      expect(await codeOf(fetchPage(`${base}/slow`, { ...allow, timeoutMs: 300 }))).toBe("timeout");
      expect(Date.now() - started).toBeLessThan(3000);
    });

    it("stops when the visitor cancels", async () => {
      const controller = new AbortController();
      const result = codeOf(fetchPage(`${base}/slow`, { ...allow, signal: controller.signal }));
      setTimeout(() => controller.abort(), 100);
      expect(await result).toBe("cancelled");
    });

    it("does not even start when already cancelled", async () => {
      expect(await codeOf(fetchPage(`${base}/page`, { ...allow, signal: AbortSignal.abort() }))).toBe("cancelled");
    });
  });

  describe("where it may go", () => {
    it("refuses this machine and private networks by default", async () => {
      expect(await codeOf(fetchPage(`${base}/page`))).toBe("blocked");
      expect(await codeOf(fetchPage("http://169.254.169.254/latest/meta-data/"))).toBe("blocked");
    });

    it("refuses a name that resolves to a private address, when the connection is made", async () => {
      // `localhost` has a public-looking name and port 80; only the address it resolves to gives it away.
      expect(await codeOf(fetchPage("http://localhost/"))).toBe("blocked");
    });

    it("refuses what is no web address before any request", async () => {
      expect(await codeOf(fetchPage("ftp://example.com/"))).toBe("invalid-url");
      expect(await codeOf(fetchPage("not a url"))).toBe("invalid-url");
    });

    it("reports an unreachable host as unreachable", async () => {
      expect(await codeOf(fetchPage("http://127.0.0.1:1/", allow))).toBe("unreachable");
    });
  });
});
