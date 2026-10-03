import { describe, expect, it } from "vitest";
import { isPublicAddress, parseImportUrl } from "@/lib/recipe-import/address";
import { ImportError } from "@/lib/recipe-import/errors";

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof ImportError ? error.code : "other";
  }
  return null;
};

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.63.255.255", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"])(
    "accepts the public address %s",
    (address) => expect(isPublicAddress(address)).toBe(true),
  );

  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
  ])("refuses the private or reserved IPv4 address %s", (address) => expect(isPublicAddress(address)).toBe(false));

  it.each(["::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "fec0::1", "2001:10::1", "2001:20::1"])(
    "refuses the private or reserved IPv6 address %s",
    (address) => expect(isPublicAddress(address)).toBe(false),
  );

  it.each([
    ["an IPv4-mapped loopback", "::ffff:127.0.0.1"],
    ["an IPv4-mapped private address", "::ffff:10.0.0.1"],
    ["the same in hex", "::ffff:7f00:1"],
    ["an IPv4-compatible loopback", "::127.0.0.1"],
    ["a NAT64 address of the metadata service", "64:ff9b::a9fe:a9fe"],
    ["a 6to4 address of a private network", "2002:c0a8:0101::1"],
  ])("sees through %s", (_label, address) => expect(isPublicAddress(address)).toBe(false));

  it("accepts a mapped public address", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it.each(["", "localhost", "example.com", "1.2.3", "999.1.1.1", "1::2::3", "::g"])("refuses what is no IP address: %j", (value) =>
    expect(isPublicAddress(value)).toBe(false),
  );
});

describe("parseImportUrl", () => {
  it("accepts http and https and drops the fragment", () => {
    expect(parseImportUrl("  https://example.com/recipes/pie?x=1#comments  ").href).toBe("https://example.com/recipes/pie?x=1");
    expect(parseImportUrl("http://example.com").href).toBe("http://example.com/");
  });

  it.each(["", "   ", "not a link", "example.com/recipe", "ftp://example.com/x", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi"])(
    "refuses %j as no web address",
    (value) => expect(codeOf(() => parseImportUrl(value))).toBe("invalid-url"),
  );

  it("refuses an address with credentials, and one that is too long", () => {
    expect(codeOf(() => parseImportUrl("https://user:secret@example.com/"))).toBe("invalid-url");
    expect(codeOf(() => parseImportUrl(`https://example.com/${"a".repeat(2100)}`))).toBe("invalid-url");
  });

  it.each([
    "http://127.0.0.1/",
    "http://localhost:3000/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "https://example.com:8443/",
    "http://example.com:5432/",
  ])("refuses %s as unreachable by design", (value) => expect(codeOf(() => parseImportUrl(value))).toBe("blocked"));

  it("accepts the web's own ports", () => {
    expect(parseImportUrl("https://example.com:443/x").href).toBe("https://example.com/x");
    expect(parseImportUrl("http://example.com:80/x").href).toBe("http://example.com/x");
  });

  it("lets private addresses through only when told to (tests of the fetcher)", () => {
    expect(parseImportUrl("http://127.0.0.1:4000/page", { allowPrivateAddresses: true }).port).toBe("4000");
  });
});
