import http from "node:http";
import type { AddressInfo } from "node:net";

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

/** A local recipe "website": `/recipe` has a recipe, `/plain` has none, `/slow` never answers. */
export async function startRecipeSite() {
  const server = http.createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://x").pathname;
    if (path === "/recipe") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return response.end(recipePage());
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
