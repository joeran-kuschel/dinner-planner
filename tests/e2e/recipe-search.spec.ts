import { expect, test } from "@/tests/e2e/support/test";
import {
  afterServerAction,
  createRecipe,
  dinnerField,
  expectAccessible,
  unique,
  uniqueWord,
} from "@/tests/e2e/support/helpers";

// The tests share one database, so each searches for a word of its own.

test.describe("recipe tags", () => {
  test("adds tags as chips in the form, and shows them on the recipe and in the list", async ({ page }) => {
    const name = unique("Tagged");
    const [first, second] = [uniqueWord("a"), uniqueWord("b")];
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);

    const tags = page.getByRole("combobox", { name: "Tags", exact: true });
    // Enter turns the text into a chip and does not send the form.
    await tags.fill(first);
    await tags.press("Enter");
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(page.getByRole("list", { name: "Tags of this recipe" })).toContainText(first);
    // A comma does the same, and a tag can be taken away again.
    await tags.fill(`${second}, `);
    await expect(page.getByRole("button", { name: `Remove tag ${second}` })).toBeVisible();
    await page.getByRole("button", { name: `Remove tag ${second}` }).click();
    await expect(page.getByRole("button", { name: `Remove tag ${second}` })).toHaveCount(0);
    // Text still in the field when the form is sent is not lost.
    await tags.fill(second.toUpperCase());
    await expectAccessible(page);
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    const shown = page.getByRole("list", { name: "Tags", exact: true });
    await expect(shown.getByRole("link")).toHaveText([first, second].sort());
    await expect(shown.getByRole("link", { name: first })).toHaveAttribute("href", `/recipes?tag=${first}`);

    await page.goto(`/recipes?tag=${first}`);
    await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
  });

  test("keeps the tags when the form is refused, and edits them", async ({ page }) => {
    const name = unique("Edited");
    const [keep, drop] = [uniqueWord("k"), uniqueWord("d")];
    const id = await createRecipe(page, { name, tags: [keep, drop] });

    await page.goto(`/recipes/${id}/edit`);
    await expect(page.getByRole("list", { name: "Tags of this recipe" })).toContainText(keep);
    await page.getByRole("button", { name: `Remove tag ${drop}` }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("");
    // Without a name the browser refuses first; clear the required check to reach the server.
    await page.getByRole("textbox", { name: "Name", exact: true }).evaluate((input: HTMLInputElement) => (input.required = false));
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Give the recipe a name.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Tags of this recipe" }).getByRole("listitem")).toHaveCount(1);

    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("list", { name: "Tags", exact: true }).getByRole("link")).toHaveText([keep]);
  });
});

test.describe("recipe search", () => {
  test("finds recipes by name, tag or ingredient and by tags together", async ({ page }) => {
    const word = uniqueWord("s");
    const [both, only] = [uniqueWord("t"), uniqueWord("u")];
    const soup = `${word} soup`;
    const stew = unique("Stew");
    const salad = unique("Salad");
    await createRecipe(page, { name: soup, tags: [both, only] });
    await createRecipe(page, { name: stew, tags: [both], ingredients: [{ name: `${word}root` }] });
    await createRecipe(page, { name: salad, tags: [word] });

    const cards = page.getByRole("heading", { level: 2 });
    await page.goto("/recipes");
    await expect(page.getByRole("search")).toBeVisible();
    await expectAccessible(page);

    // A word in a name, a tag and an ingredient finds three different recipes.
    await page.getByRole("combobox", { name: "Search recipes" }).fill(word.toUpperCase());
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`q=${word.toUpperCase()}`));
    await expect(cards).toHaveText([salad, soup, stew].sort());
    await expect(page.getByText(/^3 of \d+ recipes$/)).toBeVisible();

    // Tags narrow the result down; every chosen tag has to match.
    await page.getByText("Tags", { exact: true }).click();
    await page.getByRole("checkbox", { name: both }).check();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(cards).toHaveText([soup, stew].sort());
    await page.getByRole("checkbox", { name: only }).check();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(cards).toHaveText([soup]);
    await expect(page.getByRole("checkbox", { name: only })).toBeChecked();
    await expectAccessible(page);

    // The result has an address of its own.
    await page.goto(`/recipes?tag=${both}&tag=${only}`);
    await expect(cards).toHaveText([soup]);

    await page.getByRole("link", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.getByRole("link", { name: "Clear" })).toHaveCount(0);
  });

  test("suggests names, tags and ingredients from the third letter and searches for a picked one", async ({ page }) => {
    const word = uniqueWord("q");
    const name = `${word} pie`;
    await createRecipe(page, { name, tags: [`${word}tag`], ingredients: [{ name: `${word}spice` }] });

    await page.goto("/recipes");
    const box = page.getByRole("combobox", { name: "Search recipes" });
    await expect(page.getByText("Suggestions appear after 3 letters.")).toBeVisible();

    // Two letters are too few, three are enough.
    await box.pressSequentially(word.slice(0, 2));
    await expect(page.getByRole("option")).toHaveCount(0);
    await box.fill("");
    await box.pressSequentially(word);
    await expect(page.getByRole("option")).toHaveText([`${name}recipe`, `${word}tagtag`, `${word}spiceingredient`]);
    await expectAccessible(page);

    // Picking one runs the search for it.
    await page.getByRole("option", { name: new RegExp(`${word}spice`) }).click();
    await expect(page).toHaveURL(new RegExp(`q=${word}spice`));
    await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();

    // Enter with nothing highlighted searches for what is typed, even with the list open.
    await box.fill("");
    await box.pressSequentially(word);
    await expect(page.getByRole("option").first()).toBeVisible();
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`q=${word}$`));
  });

  test("says when nothing matches and offers to start over", async ({ page }) => {
    await page.goto(`/recipes?q=${uniqueWord("none")}`);
    await expect(page.getByText("No recipe matches.", { exact: false })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "Clear" }).click();
    await expect(page.getByText("No recipe matches.", { exact: false })).toHaveCount(0);
  });

  test("folds the tag list away until a tag filters, and sends the ticked tags from a closed list", async ({ page }) => {
    const [first, second] = [uniqueWord("f"), uniqueWord("g")];
    await createRecipe(page, { name: unique("Foldable"), tags: [first, second] });

    // Closed by default; the summary names the list.
    await page.goto("/recipes");
    const tags = page.locator("details");
    const summary = tags.locator("summary");
    await expect(tags).not.toHaveAttribute("open", "");
    await expect(summary).toHaveText("Tags");
    await expect(page.getByRole("checkbox", { name: first })).toBeHidden();

    // It opens with the keyboard, and a ticked tag is sent with the search.
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("checkbox", { name: first })).toBeVisible();
    await page.getByRole("checkbox", { name: first }).check();
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // A filter keeps it open and counts what is selected.
    await expect(page).toHaveURL(new RegExp(`tag=${first}`));
    await expect(tags).toHaveAttribute("open", "");
    await expect(summary).toHaveText("Tags (1 selected)");
    await page.getByRole("checkbox", { name: second }).check();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(summary).toHaveText("Tags (2 selected)");
    await expectAccessible(page);

    // Folded away again, the ticked tags still count when the form is sent.
    await summary.click();
    await expect(page.getByRole("checkbox", { name: first })).toBeHidden();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`tag=${first}&tag=${second}`));
  });

  test("keeps a tag from the address that no recipe has as a checkbox to untick", async ({ page }) => {
    const gone = uniqueWord("gone");
    await page.goto(`/recipes?tag=${gone}`);
    await expect(page.getByText("No recipe matches.", { exact: false })).toBeVisible();
    const box = page.getByRole("checkbox", { name: gone });
    await expect(box).toBeChecked();
    await box.uncheck();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes(\?q=)?$/);
    await expect(page.getByText("No recipe matches.", { exact: false })).toHaveCount(0);
  });

  test("survives a NUL character in the address", async ({ page }) => {
    const response = await page.goto("/recipes?q=%00&tag=%00");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
  });

  test("searches for the characters of a pattern as they are", async ({ page }) => {
    await page.goto("/recipes?q=%25");
    await expect(page.getByText(/\d+ of \d+ recipes/)).toBeVisible();
    // No recipe of these tests has a % in its name, tag or ingredients.
    await expect(page.getByText("No recipe matches.", { exact: false })).toBeVisible();
  });

  test("works in German", async ({ browser }) => {
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();
    await page.goto(`/recipes?q=${uniqueWord("none")}`);
    await expect(page.getByRole("combobox", { name: "Rezepte suchen" })).toBeVisible();
    await expect(page.getByText("Kein Rezept passt.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zurücksetzen" })).toBeVisible();
    await page.goto(`/recipes?tag=${uniqueWord("x")}`);
    await expect(page.locator("details summary")).toHaveText("Tags (1 ausgewählt)");
    await context.close();
  });
});

test.describe("finding a dinner by tag", () => {
  test("the dinner field suggests a recipe by its tag and plans it", async ({ page }) => {
    const name = unique("Zuppa");
    const tag = uniqueWord("x");
    await createRecipe(page, { name, tags: [tag] });

    await page.goto("/?week=2027-09-20");
    await dinnerField(page, "Monday").fill(tag);
    const option = page.getByRole("option", { name: new RegExp(`^${name}\\s*tag ${tag}$`) });
    await expect(option).toBeVisible();
    await afterServerAction(page, () => option.click());
    // The field shows the recipe's name, not the tag.
    await expect(dinnerField(page, "Monday")).toHaveValue(name);
  });
});
