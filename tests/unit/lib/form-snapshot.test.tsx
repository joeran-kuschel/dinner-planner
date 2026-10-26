import { describe, expect, it } from "vitest";
import { snapshotForm } from "@/lib/form-snapshot";

function form(html: string): HTMLFormElement {
  document.body.innerHTML = `<form>${html}</form>`;
  return document.querySelector("form")!;
}

describe("snapshotForm", () => {
  it("is the same for the same fields, and changes with any value", () => {
    const f = form('<input name="name" value="Soup"><textarea name="m">Chop</textarea><select name="u"><option value="a">a</option><option value="b" selected>b</option></select>');
    const before = snapshotForm(f);
    expect(snapshotForm(f)).toBe(before);

    (f.elements.namedItem("name") as HTMLInputElement).value = "Stew";
    expect(snapshotForm(f)).not.toBe(before);
    (f.elements.namedItem("name") as HTMLInputElement).value = "Soup";
    expect(snapshotForm(f)).toBe(before);
  });

  it("sees a checkbox and a radio, and fields that come and go", () => {
    const f = form('<input type="checkbox" name="remove" value="1">');
    const before = snapshotForm(f);
    (f.elements.namedItem("remove") as HTMLInputElement).checked = true;
    expect(snapshotForm(f)).not.toBe(before);
    (f.elements.namedItem("remove") as HTMLInputElement).checked = false;

    f.insertAdjacentHTML("beforeend", '<input type="hidden" name="tag" value="soup">');
    expect(snapshotForm(f)).not.toBe(before);
  });

  it("is the same every time for a file field with nothing chosen (its empty file has a date of \"now\")", async () => {
    const f = form('<input type="file" name="photo">');
    const first = snapshotForm(f);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(snapshotForm(f)).toBe(first);
    expect(first).toContain("file:");
  });

  it("leaves out the field 'Save and leave' fills in, and buttons", () => {
    const f = form('<input name="name" value="Soup"><input type="hidden" name="next" value=""><button type="button" name="x">x</button>');
    const before = snapshotForm(f);
    (f.elements.namedItem("next") as HTMLInputElement).value = "/recipes";
    expect(snapshotForm(f)).toBe(before);
    expect(before).not.toContain("next");
  });

  it("keeps the order of repeated fields, so rows swapped are a change", () => {
    const f = form('<input name="row" value="a"><input name="row" value="b">');
    const before = snapshotForm(f);
    const [one, two] = Array.from(f.querySelectorAll<HTMLInputElement>("input"));
    one.value = "b";
    two.value = "a";
    expect(snapshotForm(f)).not.toBe(before);
  });
});
