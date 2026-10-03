// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { attachFile } from "@/lib/attach-file";

describe("attachFile", () => {
  it("puts the file in the field as if it was chosen, and tells the form", () => {
    // jsdom has no DataTransfer; this one holds files the way a browser's does.
    const held: File[] = [];
    vi.stubGlobal(
      "DataTransfer",
      class {
        items = { add: (file: File) => held.push(file) };
        get files() {
          return held as unknown as FileList;
        }
      },
    );
    const input = document.createElement("input");
    input.type = "file";
    let assigned: unknown;
    Object.defineProperty(input, "files", { configurable: true, set: (value) => (assigned = value), get: () => assigned });
    const onChange = vi.fn();
    document.body.addEventListener("change", onChange);
    document.body.append(input);

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    attachFile(input, file);

    expect(held).toEqual([file]);
    expect(assigned).toBe(held);
    // The event bubbles, which is what React's onChange listens for.
    expect(onChange).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("change", onChange);
    input.remove();
    vi.unstubAllGlobals();
  });
});
