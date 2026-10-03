import http from "node:http";
import type { AddressInfo } from "node:net";
import { testImage } from "@/tests/support/images";

/** A page with a schema.org Recipe, the way recipe sites publish one. */
export const SAMPLE_RECIPE = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Lemon pancakes",
  description: "Thin pancakes with lemon.",
  recipeYield: "4 servings",
  prepTime: "PT20M",
  keywords: "breakfast, quick",
  recipeIngredient: ["200 g flour", "2 eggs", "300 ml milk", "1 pinch of salt"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Whisk everything." },
    { "@type": "HowToStep", text: "Fry in a hot pan." },
  ],
};

export const recipePage = (recipe: object = SAMPLE_RECIPE) =>
  `<html><head><title>Recipe</title><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body><h1>Recipe</h1></body></html>`;

/** A recipe page that names its picture the way sites do: a plain address, an object with a `url`, or a list of those. */
export const recipePageWithImage = (image: unknown) => recipePage({ ...SAMPLE_RECIPE, image });

/** A local recipe "website": `/recipe` has a recipe, `/plain` has none, `/slow` never answers. */
export async function startRecipeSite() {
  const pictures = {
    "/photo.jpg": { type: "image/jpeg", bytes: await testImage("jpeg", 1200, 800) },
    "/photo.png": { type: "image/png", bytes: await testImage("png", 600, 400) },
    "/photo.webp": { type: "image/webp", bytes: await testImage("webp", 600, 400) },
    // A picture type the app does not keep, and things that only claim to be pictures.
    "/photo.gif": { type: "image/gif", bytes: await testImage("gif", 100, 100) },
    "/fake.jpg": { type: "image/jpeg", bytes: Buffer.from("<html><script>alert(1)</script></html>") },
    "/vector.svg": { type: "image/svg+xml", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') },
    "/too-big.jpg": { type: "image/jpeg", bytes: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(6 * 1024 * 1024)]) },
  } as const;
  const server = http.createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://x").pathname;
    if (path === "/recipe") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return response.end(recipePage());
    }
    const picture = pictures[path as keyof typeof pictures];
    if (picture) {
      response.writeHead(200, { "content-type": picture.type });
      return response.end(picture.bytes);
    }
    if (path === "/photo-moved") {
      response.writeHead(302, { location: "/photo.jpg" });
      return response.end();
    }
    const withImage: Record<string, unknown> = {
      "/recipe-photo": "/photo.jpg",
      "/recipe-photo-object": { "@type": "ImageObject", url: "/photo.png" },
      "/recipe-photo-list": [{ "@type": "ImageObject", contentUrl: "photo.webp" }, "/photo.jpg"],
      "/recipe-photo-redirect": "/photo-moved",
      "/recipe-photo-fake": "/fake.jpg",
      "/recipe-photo-svg": "/vector.svg",
      "/recipe-photo-gif": "/photo.gif",
      "/recipe-photo-missing": "/nothing-here.jpg",
      "/recipe-photo-too-big": "/too-big.jpg",
      "/recipe-photo-private": "http://169.254.169.254/latest/meta-data/photo.jpg",
      "/recipe-photo-slow": "/slow",
    };
    if (path in withImage) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return response.end(recipePageWithImage(withImage[path]));
    }
    if (path === "/plain") {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end("<html><body>Nothing to cook here.</body></html>");
    }
    if (path === "/moved") {
      response.writeHead(301, { location: "/recipe" });
      return response.end();
    }
    if (path === "/slow") return;
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
