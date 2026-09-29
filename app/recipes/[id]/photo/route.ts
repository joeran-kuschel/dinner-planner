import { prisma } from "@/lib/db";

// A photo can change at any time, and a deleted recipe's photo must be gone at once.
export const dynamic = "force-dynamic";

/** Whether an `If-None-Match` header names this ETag: a list is allowed, `W/` is ignored (weak comparison) and `*` matches. */
function matchesEtag(header: string | null, etag: string): boolean {
  return (header ?? "")
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .some((candidate) => candidate === "*" || candidate === etag);
}

/**
 * A recipe's photo: `?size=thumb` for the card in the recipe list, the full image
 * otherwise. The bytes were made by lib/recipe-photo.ts (always WebP), never taken
 * from an upload as they came in, so the content type is fixed and `nosniff`.
 *
 * With `?v=` (the photo's last change, as the pages put it in the address) the
 * answer can be kept for good: a new photo has a new address. Without it, the
 * browser asks again each time and gets a cheap 304 through the ETag.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const size = searchParams.get("size") === "thumb" ? "thumb" : "full";

  const photo = await prisma.recipePhoto.findUnique({
    where: { recipeId: id },
    select: { full: size === "full", thumb: size === "thumb", updatedAt: true },
  });
  const bytes = size === "thumb" ? photo?.thumb : photo?.full;
  if (!photo || !bytes) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const etag = `"${photo.updatedAt.getTime()}-${size}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (matchesEtag(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });

  return new Response(new Uint8Array(bytes), {
    headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.length) },
  });
}
