import { describe, expect, it } from "vitest";
import { groupShelf, markOnShelf, MAX_SHELF_NAME, normalizeShelfName, type ShelfEntry } from "@/lib/shelf";

function entry(overrides: Partial<ShelfEntry> & Pick<ShelfEntry, "id" | "label">): ShelfEntry {
  return {
    name: normalizeShelfName(overrides.label),
    quantity: null,
    unit: null,
    category: "OTHER",
    boughtOn: "2026-10-01",
    fromList: false,
    ...overrides,
  };
}

describe("normalizeShelfName", () => {
  it("is the pantry staple's normalisation", () => {
    expect(normalizeShelfName("  Olive   OIL ")).toBe("olive oil");
    expect(MAX_SHELF_NAME).toBeGreaterThan(0);
  });
});

describe("groupShelf", () => {
  it("makes one group per name with the purchases newest first", () => {
    const sections = groupShelf(
      [
        entry({ id: "a", label: "Milk", category: "DAIRY_EGGS", boughtOn: "2026-10-01", quantity: 1, unit: "l" }),
        entry({ id: "b", label: "milk", category: "DAIRY_EGGS", boughtOn: "2026-10-12", quantity: 2, unit: "l" }),
        entry({ id: "c", label: "MILK", category: "DAIRY_EGGS", boughtOn: "2026-10-05" }),
      ],
      [],
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].groups).toHaveLength(1);
    expect(sections[0].groups[0].entries.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("puts a group in the section of its newest purchase", () => {
    const [section] = groupShelf(
      [
        entry({ id: "old", label: "Yogurt", category: "OTHER", boughtOn: "2026-09-01" }),
        entry({ id: "new", label: "Yogurt", category: "DAIRY_EGGS", boughtOn: "2026-10-01" }),
      ],
      [],
    );
    expect(section.category).toBe("DAIRY_EGGS");
  });

  it("orders the sections like the grocery list, Other last, and the names alphabetically", () => {
    const sections = groupShelf(
      [
        entry({ id: "1", label: "Wine", category: "DRINKS" }),
        entry({ id: "2", label: "Napkins" }),
        entry({ id: "3", label: "Carrots", category: "PRODUCE" }),
        entry({ id: "4", label: "Apples", category: "PRODUCE" }),
      ],
      [],
    );
    expect(sections.map((section) => section.category)).toEqual(["PRODUCE", "DRINKS", "OTHER"]);
    expect(sections[0].groups.map((group) => group.label)).toEqual(["Apples", "Carrots"]);
  });

  it("marks a staple, with its purchases, and lists one without a purchase under Other", () => {
    const sections = groupShelf(
      [entry({ id: "1", label: "Salt", category: "HERBS_SPICES" })],
      [
        { id: "s1", name: "salt" },
        { id: "s2", name: "olive oil" },
      ],
    );
    const salt = sections.find((s) => s.category === "HERBS_SPICES")!.groups[0];
    expect(salt.staple).toEqual({ id: "s1" });
    expect(salt.entries).toHaveLength(1);
    const oil = sections.find((s) => s.category === "OTHER")!.groups[0];
    expect(oil).toMatchObject({ name: "olive oil", label: "olive oil", staple: { id: "s2" }, entries: [] });
  });

  it("is empty with nothing on the shelf", () => {
    expect(groupShelf([], [])).toEqual([]);
  });
});

describe("markOnShelf", () => {
  const lines = [
    { label: "Milk", manual: false },
    { label: "Rice", manual: false },
    { label: "milk", manual: true },
  ];

  it("marks the lines from the plan whose name is on the shelf, whatever the case", () => {
    expect(markOnShelf(lines, ["milk"])).toEqual([
      { label: "Milk", manual: false, onShelf: true },
      { label: "Rice", manual: false },
      { label: "milk", manual: true },
    ]);
  });

  it("marks nothing with an empty shelf", () => {
    expect(markOnShelf(lines, [])).toEqual(lines);
  });
});
