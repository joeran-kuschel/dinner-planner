import { describe, expect, it } from "vitest";
import { GET } from "@/app/recipes/[id]/photo/route";
import { prisma } from "@/lib/db";
import { processPhoto } from "@/lib/recipe-photo";
import { asFile, testImage } from "@/tests/support/images";

async function recipeWithPhoto() {
  const result = await processPhoto(asFile(await testImage("jpeg", 2400, 1600)));
  if (!("photo" in result)) throw new Error("test image rejected");
  const { photo } = result;
  return prisma.recipe.create({
    data: {
      name: "Soup",
      photo: {
        create: {
          full: new Uint8Array(photo.full),
          fullWidth: photo.fullWidth,
          fullHeight: photo.fullHeight,
          thumb: new Uint8Array(photo.thumb),
          alt: "Soup",
        },
      },
    },
    include: { photo: true },
  });
}

const get = (id: string, query = "", headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/recipes/${id}/photo${query}`, { headers }), { params: Promise.resolve({ id }) });

describe("GET /recipes/[id]/photo", () => {
  it("serves the full image as WebP", async () => {
    const recipe = await recipeWithPhoto();
    const response = await get(recipe.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(Buffer.from(recipe.photo!.full))).toBe(true);
    expect(response.headers.get("Content-Length")).toBe(String(body.length));
  });

  it("serves the thumbnail with ?size=thumb, which is the smaller image", async () => {
    const recipe = await recipeWithPhoto();
    const response = await get(recipe.id, "?size=thumb");

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(Buffer.from(recipe.photo!.thumb))).toBe(true);
    expect(body.length).toBeLessThan(recipe.photo!.full.length);
  });

  it("falls back to the full image for any other size", async () => {
    const recipe = await recipeWithPhoto();
    const body = Buffer.from(await (await get(recipe.id, "?size=huge")).arrayBuffer());
    expect(body.equals(Buffer.from(recipe.photo!.full))).toBe(true);
  });

  it("never lets the browser guess a content type", async () => {
    const recipe = await recipeWithPhoto();
    expect((await get(recipe.id)).headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("keeps a versioned address for good", async () => {
    const recipe = await recipeWithPhoto();
    const response = await get(recipe.id, `?size=thumb&v=${recipe.photo!.updatedAt.getTime()}`);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("makes the browser ask again for an address without a version", async () => {
    const recipe = await recipeWithPhoto();
    expect((await get(recipe.id)).headers.get("Cache-Control")).toBe("no-cache");
  });

  it("answers 304 with no body when the ETag is still current", async () => {
    const recipe = await recipeWithPhoto();
    const etag = (await get(recipe.id)).headers.get("ETag")!;

    const response = await get(recipe.id, "", { "If-None-Match": etag });
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe(etag);
  });

  it("gives the two sizes different ETags, so one is never taken for the other", async () => {
    const recipe = await recipeWithPhoto();
    const full = (await get(recipe.id)).headers.get("ETag");
    const thumb = (await get(recipe.id, "?size=thumb")).headers.get("ETag");

    expect(full).not.toBe(thumb);
    expect((await get(recipe.id, "?size=thumb", { "If-None-Match": full! })).status).toBe(200);
  });

  it("sends the image again once the photo has changed", async () => {
    const recipe = await recipeWithPhoto();
    const etag = (await get(recipe.id)).headers.get("ETag")!;
    await prisma.recipePhoto.update({ where: { recipeId: recipe.id }, data: { alt: "Changed" } });

    const response = await get(recipe.id, "", { "If-None-Match": etag });
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).not.toBe(etag);
  });

  it("answers 404, never cached, for a recipe without a photo", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "No photo" } });
    const response = await get(recipe.id);

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 404 for a recipe that does not exist", async () => {
    expect((await get("no-such-recipe")).status).toBe(404);
  });

  it("answers 404 once the recipe is deleted", async () => {
    const recipe = await recipeWithPhoto();
    await prisma.recipe.delete({ where: { id: recipe.id } });
    expect((await get(recipe.id)).status).toBe(404);
  });
});
