import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/access/route";
import { ACCESS_COOKIE, nowSeconds, verifySession } from "@/lib/access";

const KEY = "r".repeat(43);

function post(body: unknown, headers: Record<string, string> = {}, raw?: string) {
  return new Request("https://dinner.local/access", {
    method: "POST",
    headers: { "content-type": "application/json", host: "dinner.local", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}

/** Settles a request that waits out the delay after a wrong key. */
async function settled(request: Request) {
  const answer = POST(request);
  await vi.advanceTimersByTimeAsync(1000);
  return answer;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /access", () => {
  it("serves the page behind the private link, never cached, in the visitor's language", async () => {
    const response = await GET(new Request("https://dinner.local/access", { headers: { "accept-language": "de-DE" } }));

    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await response.text();
    expect(html).toContain("Der Planer wird geöffnet");
    expect(html).toContain("location.hash");
  });

  it("prefers the language cookie to the browser's", async () => {
    const response = await GET(
      new Request("https://dinner.local/access", { headers: { "accept-language": "de-DE", cookie: "a=b; locale=en" } }),
    );

    expect(await response.text()).toContain("Opening the planner");
  });
});

describe("POST /access with a key set", () => {
  beforeEach(() => vi.stubEnv("ACCESS_KEY", KEY));

  it("answers the right key with a cookie that is genuine, HttpOnly and Lax, and does not contain the key", async () => {
    const response = await POST(post({ key: KEY }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get("set-cookie")!;
    const [pair, ...attributes] = cookie.split("; ");
    expect(pair.startsWith(`${ACCESS_COOKIE}=`)).toBe(true);
    expect(attributes).toEqual(expect.arrayContaining(["Path=/", "Max-Age=31536000", "HttpOnly", "SameSite=Lax"]));
    expect(attributes).not.toContain("Secure");
    expect(cookie).not.toContain(KEY);
    expect(verifySession(pair.slice(ACCESS_COOKIE.length + 1), KEY, nowSeconds()).valid).toBe(true);
  });

  it("marks the cookie Secure when the ingress says the request came in over HTTPS", async () => {
    const response = await POST(post({ key: KEY }, { "x-forwarded-proto": "https" }));

    expect(response.headers.get("set-cookie")).toContain("; Secure");
  });

  it.each([["a wrong key", { key: "wrong" }], ["no key", {}], ["a key that is no string", { key: 12345 }], ["an empty key", { key: "" }]])(
    "answers %s with 403 after a short wait, and no cookie",
    async (_label, body) => {
      const answer = POST(post(body));
      let done = false;
      void answer.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);

      const response = await answer;
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false });
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("refuses a request from another website, even with the right key", async () => {
    const fromElsewhere: Record<string, string>[] = [{ "sec-fetch-site": "cross-site" }, { origin: "https://evil.example" }];
    for (const headers of fromElsewhere) {
      const response = await POST(post({ key: KEY }, headers));
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("wants JSON, so a form post from another page cannot be used", async () => {
    const response = await POST(post({ key: KEY }, { "content-type": "application/x-www-form-urlencoded" }));

    expect(response.status).toBe(403);
  });

  it("refuses a body that declares itself too big before reading it", async () => {
    const request = post({ key: KEY }, { "content-length": "100000" });
    const read = vi.spyOn(request, "text");

    expect((await POST(request)).status).toBe(413);
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a body that is too big (413) or not JSON (400)", async () => {
    expect((await POST(post(null, {}, JSON.stringify({ key: "x".repeat(600) })))).status).toBe(413);
    expect((await settled(post(null, {}, "not json"))).status).toBe(400);
  });
});

describe("POST /access without a gate", () => {
  it("says yes without a cookie where there is no key (dev, tests)", async () => {
    const response = await POST(post({ key: "anything" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("says 503 in production without a key", async () => {
    vi.stubEnv("NODE_ENV", "production");

    expect((await POST(post({ key: "anything" }))).status).toBe(503);
  });
});
