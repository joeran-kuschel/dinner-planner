import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, fillIngredients, unique } from "@/tests/e2e/support/helpers";
import { MAX_PHOTO_BYTES } from "@/lib/recipe-photo-shared";
import { testImage } from "@/tests/support/images";

/** A real image, as the file field's upload: 2400x1600, so the server has to scale it down. */
async function photoUpload(name = "soup.jpg") {
  return { name, mimeType: "image/jpeg", buffer: await testImage("jpeg", 2400, 1600) };
}

/** Create a recipe through the form with a photo chosen; leaves the page on the recipe. */
async function createWithPhoto(page: Page, name: string, alt = "A bowl of soup") {
  await page.goto("/recipes/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await fillIngredients(page, [{ quantity: "1", name: "Leek" }]);
  await page.getByLabel("Photo file").setInputFiles(await photoUpload());
  await page.getByLabel("Description of the photo").fill(alt);
  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** The recipe's card in the list. */
const card = (page: Page, name: string) => page.getByRole("link").filter({ has: page.getByRole("heading", { name, exact: true }) });

/** Whether the image has really loaded, and at what width. */
const loadedWidth = (image: ReturnType<Page["locator"]>) =>
  image.evaluate((element: HTMLImageElement) => (element.complete ? element.naturalWidth : 0));

test.describe("recipe photos", () => {
  test("a photo chosen in the form is scaled down, shown on the recipe and on its card", async ({ page }) => {
    const name = unique("Photo soup");
    const id = await createWithPhoto(page, name);

    const photo = page.getByRole("img", { name: "A bowl of soup" });
    await expect(photo).toBeVisible();
    await expect.poll(() => loadedWidth(photo)).toBe(1200);
    await expectAccessible(page);

    await page.goto("/recipes");
    const thumb = card(page, name).getByRole("img", { name: "A bowl of soup" });
    await expect(thumb).toBeVisible();
    await expect.poll(() => loadedWidth(thumb)).toBe(480);
    await expectAccessible(page);

    const response = await page.request.get(`/recipes/${id}/photo?size=thumb`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("keeps a photo for good under its versioned address", async ({ page }) => {
    const name = unique("Cached soup");
    const id = await createWithPhoto(page, name);

    const src = await page.getByRole("img", { name: "A bowl of soup" }).getAttribute("src");
    expect(src).toMatch(new RegExp(`^/recipes/${id}/photo\\?size=full&v=\\d+$`));
    const response = await page.request.get(src!);
    expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test("a recipe without a photo has no image on its card or page, and no photo to fetch", async ({ page }) => {
    const name = unique("Plain soup");
    await page.goto("/recipes/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await fillIngredients(page, [{ quantity: "1", name: "Leek" }]);
    await page.getByRole("button", { name: "Create recipe" }).click();
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    const id = new URL(page.url()).pathname.split("/").pop()!;

    await expect(page.getByRole("img")).toHaveCount(0);
    await page.goto("/recipes");
    await expect(card(page, name).getByRole("img")).toHaveCount(0);
    expect((await page.request.get(`/recipes/${id}/photo`)).status()).toBe(404);
  });

  // The bug that lost photos: the form is refused for one field, the photo is thrown away
  // with the reset, and the retry saves the recipe without it.
  test("a refused form keeps the chosen photo: fixing the one field and retrying uploads it", async ({ page }) => {
    const name = unique("Retried soup");
    await page.goto("/recipes/new");
    // Blank in the server's eyes, yet it passes the browser's own "required" check.
    await page.getByLabel("Name", { exact: true }).fill("   ");
    await fillIngredients(page, [{ quantity: "1", name: "Leek" }]);
    await page.getByLabel("Photo file").setInputFiles(await photoUpload("soup.jpg"));
    await page.getByLabel("Description of the photo").fill("Soup after a retry");
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Give the recipe a name.");
    await expectAccessible(page);
    // Nothing was thrown away: not the photo, not the description.
    expect(await page.getByLabel("Photo file").evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("soup.jpg");
    await expect(page.getByLabel("Description of the photo")).toHaveValue("Soup after a retry");

    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    const photo = page.getByRole("img", { name: "Soup after a retry" });
    await expect(photo).toBeVisible();
    await expect.poll(() => loadedWidth(photo)).toBe(1200);
  });

  test("the photo also survives a refused edit", async ({ page }) => {
    const name = unique("Refused edit soup");
    const id = await createWithPhoto(page, name, "Before");

    await page.goto(`/recipes/${id}/edit`);
    await page.getByLabel("Name", { exact: true }).fill("   ");
    await page.getByLabel("Replace photo").setInputFiles({ ...(await photoUpload("new.png")), buffer: await testImage("png", 900, 900) });
    await page.getByLabel("Description of the photo").fill("After");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Give the recipe a name.");

    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Save changes" }).click();
    const photo = page.getByRole("img", { name: "After" });
    await expect(photo).toBeVisible();
    await expect.poll(() => loadedWidth(photo)).toBe(900);
  });

  test("the browser asks for the description before sending a photo, and keeps the photo", async ({ page }) => {
    const name = unique("Undescribed soup");
    await page.goto("/recipes/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Photo file").setInputFiles(await photoUpload());
    await page.getByRole("button", { name: "Create recipe" }).click();

    // Blocked in the browser: still on the form, the description is what is missing, the file is still chosen.
    await expect(page).toHaveURL("/recipes/new");
    expect(await page.getByLabel("Description of the photo").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    expect(await page.getByLabel("Photo file").evaluate((input: HTMLInputElement) => input.files?.length)).toBe(1);

    await page.getByLabel("Description of the photo").fill("Now described");
    await page.getByRole("button", { name: "Create recipe" }).click();
    await expect(page.getByRole("img", { name: "Now described" })).toBeVisible();
  });

  test("the server refuses a photo without a description too, and the photo is still there for the retry", async ({
    page,
  }) => {
    const name = unique("Server checked soup");
    await page.goto("/recipes/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Photo file").setInputFiles(await photoUpload());
    // As if the browser did not check: a script, or a browser that skips validation.
    await page.getByRole("main").locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Describe the photo in a few words, for people who cannot see it.",
    );
    expect(await page.getByLabel("Photo file").evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("soup.jpg");

    await page.getByLabel("Description of the photo").fill("Described at last");
    await page.getByRole("button", { name: "Create recipe" }).click();
    await expect(page.getByRole("img", { name: "Described at last" })).toBeVisible();
  });

  test("a file that is no image is refused, and the recipe is not created", async ({ page }) => {
    const name = unique("Fake photo soup");
    await page.goto("/recipes/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Photo file").setInputFiles({ name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("just text") });
    await page.getByLabel("Description of the photo").fill("Not a photo");
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText("The photo could not be read. Choose another image.");
    await page.goto("/recipes");
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
  });

  test("a photo over the size limit is refused in the browser, naming the limit, and nothing is sent", async ({ page }) => {
    const image = await testImage("png", 100, 100);
    const tooBig = Buffer.concat([image, Buffer.alloc(MAX_PHOTO_BYTES + 1 - image.length)]);
    const posts: string[] = [];
    page.on("request", (request) => request.method() === "POST" && posts.push(request.url()));

    await page.goto("/recipes/new");
    await page.getByLabel("Name", { exact: true }).fill(unique("Huge photo soup"));
    await page.getByLabel("Photo file").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: tooBig });
    await page.getByLabel("Description of the photo").fill("Too big");
    await page.getByRole("button", { name: "Create recipe" }).click();

    expect(await page.getByLabel("Photo file").evaluate((input: HTMLInputElement) => input.validationMessage)).toBe(
      "The photo is too large: 5 MB at most.",
    );
    await expect(page).toHaveURL("/recipes/new");
    expect(posts).toEqual([]);
  });

  test("edits a recipe's photo: only the description, then a new photo, then removes it", async ({ page }) => {
    const name = unique("Edited soup");
    const id = await createWithPhoto(page, name, "First description");

    await page.goto(`/recipes/${id}/edit`);
    await expect(page.getByRole("img", { name: "First description" })).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel("Description of the photo").fill("Second description");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("img", { name: "Second description" })).toBeVisible();

    await page.goto(`/recipes/${id}/edit`);
    await page.getByLabel("Replace photo").setInputFiles({ ...(await photoUpload("new.jpg")), buffer: await testImage("png", 900, 900) });
    await page.getByLabel("Description of the photo").fill("A square photo");
    await page.getByRole("button", { name: "Save changes" }).click();
    const photo = page.getByRole("img", { name: "A square photo" });
    await expect(photo).toBeVisible();
    await expect.poll(() => loadedWidth(photo)).toBe(900);

    await page.goto(`/recipes/${id}/edit`);
    await page.getByRole("checkbox", { name: "Remove photo" }).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(0);
    expect((await page.request.get(`/recipes/${id}/photo`)).status()).toBe(404);
  });

  test("deleting a recipe takes its photo with it", async ({ page }) => {
    const name = unique("Deleted soup");
    const id = await createWithPhoto(page, name);
    expect((await page.request.get(`/recipes/${id}/photo`)).status()).toBe(200);

    await page.locator("summary", { hasText: /^Delete$/ }).click();
    await page.getByRole("button", { name: "Delete recipe", exact: true }).click();
    await expect(page).toHaveURL("/recipes");

    expect((await page.request.get(`/recipes/${id}/photo`)).status()).toBe(404);
  });
});
