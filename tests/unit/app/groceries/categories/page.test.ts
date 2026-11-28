import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { formData } from "@/tests/support/db";

const request = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "locale" ? { value: request.locale } : undefined) }),
  headers: async () => new Headers(),
}));

const { default: Page, generateMetadata } = await import("@/app/groceries/categories/page");
const { CategoryManager } = await import("@/components/category-manager");

type Params = Record<string, string | string[] | undefined>;

/** The element of `type` somewhere in what the page returns. */
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (!isValidElement(node)) return Array.isArray(node) ? node.map((child) => find(child, type)).find(Boolean) : undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.type === type ? (element as ReactElement<Record<string, unknown>>) : find(element.props.children, type);
}

/** The props the page gives the manager for a given address. */
async function managerProps(searchParams: Params = {}) {
  const manager = find(await Page({ searchParams: Promise.resolve(searchParams) } as never), CategoryManager);
  expect(manager).toBeDefined();
  return manager!.props as { categories: { id: string; ingredients: number; entries: number }[]; error: string | null; refusal: Record<string, string | undefined> };
}

describe("the categories page", () => {
  it("titles itself like its heading", async () => {
    expect(await generateMetadata()).toEqual({ title: "Grocery categories" });
    request.locale = "de";
    expect((await generateMetadata()).title).not.toBe("Grocery categories");
    request.locale = "en";
  });

  it("gives the manager every section in shop order with how many ingredients and list entries are filed under it", async () => {
    await prisma.recipe.create({
      data: { name: "Bread", ingredients: { create: [{ name: "Flour", categoryId: "cat_bakery" }, { name: "Yeast", position: 1, categoryId: "cat_bakery" }] } },
    });
    await prisma.groceryEntry.create({ data: { weekStart: new Date("2026-09-28T00:00:00Z"), key: "buns|", label: "Buns", manual: true, categoryId: "cat_bakery" } });

    const { categories } = await managerProps();

    expect(categories.map((category) => category.id)).toEqual(["cat_produce", "cat_bakery", "cat_meat_fish", "cat_dairy_eggs", "cat_pasta_rice", "cat_pantry", "cat_herbs_spices", "cat_frozen", "cat_drinks", "cat_other"]);
    expect(categories.find((category) => category.id === "cat_bakery")).toMatchObject({ ingredients: 2, entries: 1 });
    expect(categories.find((category) => category.id === "cat_produce")).toMatchObject({ ingredients: 0, entries: 0 });
    expect(categories[0]).not.toHaveProperty("_count");
  });

  it("shows no error without one in the address", async () => {
    expect((await managerProps()).error).toBeNull();
  });

  it.each(["empty", "long", "duplicate", "limit"])("passes the known error %s on", async (error) => {
    expect((await managerProps({ error })).error).toBe(error);
  });

  it.each([
    ["an unknown value", "banana"],
    ["markup", "<script>alert(1)</script>"],
    ["a known value in another case", "EMPTY"],
    ["a list (the parameter given twice)", ["empty", "long"]],
    ["an empty list", []],
    ["an empty value", ""],
    ["a prototype name", "constructor"],
  ])("passes no error on for %s", async (_label, error) => {
    expect((await managerProps({ error })).error).toBeNull();
  });

  it("passes on the section, the typed name and the nonce of a refusal, as text", async () => {
    const { refusal } = await managerProps({ error: "duplicate", id: "cat_bakery", name: "Pet food", n: "1700000000000" });
    expect(refusal).toEqual({ id: "cat_bakery", name: "Pet food", nonce: "1700000000000" });
  });

  it("drops a refusal value that is repeated, and keeps the rest", async () => {
    const { refusal } = await managerProps({ error: "empty", id: ["a", "b"], name: ["x"], n: "5" });
    expect(refusal).toEqual({ id: undefined, name: undefined, nonce: "5" });
  });

  it("cuts a typed name from the address to 100 characters", async () => {
    const { refusal } = await managerProps({ error: "long", name: "n".repeat(5000) });
    expect(refusal.name).toHaveLength(100);
  });

  it("leaves the refusal empty without one", async () => {
    expect((await managerProps()).refusal).toEqual({ id: undefined, name: undefined, nonce: undefined });
  });

  it("reads the sections fresh: a section added is there on the next render", async () => {
    const { addGroceryCategory } = await import("@/app/actions/grocery-categories");
    await addGroceryCategory(formData({ name: "Pet food" })).catch(() => undefined);
    expect((await managerProps()).categories).toHaveLength(11);
  });
});
