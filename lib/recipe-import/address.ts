import net from "node:net";
import { ImportError } from "@/lib/recipe-import/errors";

/**
 * Where a pasted link may lead. The app runs inside the cluster, so a link to `10.x`, `localhost` or the node's
 * metadata service would otherwise reach things that were never meant to be reachable from a web form.
 */

const blocked = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2001:10::", 28], // ORCHID (deprecated)
  ["2001:20::", 28], // ORCHIDv2
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** The eight 16-bit groups of an IPv6 address, or `null` when it is not one. */
function ipv6Groups(address: string): number[] | null {
  let text = address.split("%")[0].toLowerCase();
  // A dotted IPv4 tail ("::ffff:1.2.3.4") stands for the last two groups.
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const octets = tail[1].split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    text = text.slice(0, -tail[1].length) + ((octets[0] << 8) | octets[1]).toString(16) + ":" + ((octets[2] << 8) | octets[3]).toString(16);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN,
  );
  return groups.length === 8 && groups.every((group) => !Number.isNaN(group)) ? groups : null;
}

/** The IPv4 address an IPv6 one carries inside it (mapped, compatible, NAT64 or 6to4), if any. */
function embeddedIpv4(groups: number[]): string | null {
  const dotted = (high: number, low: number) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  const leadingZeros = groups.slice(0, 5).every((group) => group === 0);
  if (leadingZeros && groups[5] === 0xffff) return dotted(groups[6], groups[7]);
  if (leadingZeros && groups[5] === 0) return dotted(groups[6], groups[7]);
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    return dotted(groups[6], groups[7]);
  }
  if (groups[0] === 0x2002) return dotted(groups[1], groups[2]);
  return null;
}

/** Whether an address belongs to the public internet. Anything that is not an IP address is not public. */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const groups = ipv6Groups(address);
    if (!groups) return false;
    const inner = embeddedIpv4(groups);
    if (inner !== null && !isPublicAddress(inner)) return false;
    return !blocked.check(address, "ipv6");
  }
  return false;
}

const MAX_URL_LENGTH = 2048;

/**
 * A pasted link as a URL we are willing to fetch: http or https, on the ports of the web, without credentials, and
 * not an IP address of a private network. A name that resolves to one is caught when the connection is made.
 */
export function parseImportUrl(raw: string, options: { allowPrivateAddresses?: boolean } = {}): URL {
  const text = raw.trim();
  if (!text || text.length > MAX_URL_LENGTH) throw new ImportError("invalid-url");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ImportError("invalid-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImportError("invalid-url");
  if (url.username || url.password || !url.hostname) throw new ImportError("invalid-url");
  if (!options.allowPrivateAddresses) {
    if (url.port && url.port !== "80" && url.port !== "443") throw new ImportError("blocked");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) throw new ImportError("blocked");
  }
  url.hash = "";
  return url;
}
