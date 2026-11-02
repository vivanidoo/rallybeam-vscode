import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { applyChanges, diffTexts, replaceText, toLf } from "../src/textDiff";

describe("diffTexts", () => {
  it("finds the one place two texts differ", () => {
    expect(diffTexts("hello world", "hello brave world")).toEqual({ offset: 6, length: 0, text: "brave " });
    expect(diffTexts("hello brave world", "hello world")).toEqual({ offset: 6, length: 6, text: "" });
    expect(diffTexts("abc", "aXc")).toEqual({ offset: 1, length: 1, text: "X" });
    expect(diffTexts("same", "same")).toBeUndefined();
  });

  it("handles repeated characters without overlapping its start and end", () => {
    const change = diffTexts("aaa", "aaaa")!;
    expect("aaa".slice(0, change.offset) + change.text + "aaa".slice(change.offset + change.length)).toBe("aaaa");
  });

  it("keeps a surrogate pair whole", () => {
    const change = diffTexts("a😀b", "a😃b")!;
    expect(change).toEqual({ offset: 1, length: 2, text: "😃" });
  });
});

describe("applyChanges", () => {
  it("applies an editor event's changes, whose offsets are of the text before it", () => {
    const ydoc = new Y.Doc();
    const text = ydoc.getText("t");
    text.insert(0, "one two three");

    applyChanges(text, [
      { offset: 0, length: 3, text: "1" },
      { offset: 8, length: 5, text: "3" },
    ]);

    expect(text.toString()).toBe("1 two 3");
  });

  it("marks the changes with their origin", () => {
    const ydoc = new Y.Doc();
    const text = ydoc.getText("t");
    const origins: unknown[] = [];
    ydoc.on("afterTransaction", (transaction) => origins.push(transaction.origin));
    const origin = Symbol("local");

    replaceText(text, "abc", origin);

    expect(text.toString()).toBe("abc");
    expect(origins).toEqual([origin]);
  });
});

describe("toLf", () => {
  it("turns Windows and old Mac line endings into LF", () => {
    expect(toLf("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });
});
