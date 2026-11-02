import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { CodeProject, MAX_FILES } from "../src/project";

// A project as the web writes it: files under their ids, the type in front in meta.
const seed = (ydoc: Y.Doc, language: string, files: { id: string; path: string; text?: string; language?: string; hidden?: boolean }[]) => {
  ydoc.transact(() => {
    ydoc.getMap<string>("meta").set("language", language);
    for (const file of files) {
      const map = new Y.Map<string | boolean | Y.Text>([
        ["path", file.path],
        ["text", new Y.Text(file.text ?? "")],
      ]);
      if (file.language) {
        map.set("language", file.language);
      }
      if (file.hidden) {
        map.set("hidden", true);
      }
      ydoc.getMap("files").set(file.id, map);
    }
  });
};

describe("CodeProject", () => {
  it("mirrors only the type in front, never a hidden file, and the first of two equal paths", () => {
    const ydoc = new Y.Doc();
    seed(ydoc, "python", [
      { id: "a", path: "main.py", language: "python" },
      { id: "b", path: "Main.py", language: "python" },
      { id: "c", path: "index.ts", language: "typescript" },
      { id: "d", path: "notes.txt" },
      { id: "e", path: "secret.py", language: "python", hidden: true },
    ]);
    const project = new CodeProject(ydoc);

    expect(project.mirroredFiles().map((p) => p.id)).toEqual(["a", "d"]);
    expect(project.filesInFront().map((p) => p.path)).toEqual(["main.py", "Main.py", "notes.txt", "secret.py"]);
  });

  it("shows typescript when the project has no type yet", () => {
    expect(new CodeProject(new Y.Doc()).language).toBe("typescript");
  });

  it("creates a file of the type in front, in the web's shape", () => {
    const ydoc = new Y.Doc();
    seed(ydoc, "go", []);
    const project = new CodeProject(ydoc, () => "new-id");

    const { id } = project.createFile("cmd/main.go", "package main\n");

    expect(id).toBe("new-id");
    const file = ydoc.getMap<Y.Map<unknown>>("files").get("new-id")!;
    expect(file.get("path")).toBe("cmd/main.go");
    expect(file.get("language")).toBe("go");
    expect((file.get("text") as Y.Text).toString()).toBe("package main\n");
  });

  it("refuses paths the web refuses", () => {
    const ydoc = new Y.Doc();
    seed(ydoc, "python", [{ id: "a", path: "src/app.py" }]);
    const project = new CodeProject(ydoc);

    expect(project.checkPath("my file.py")).toBe("invalid");
    expect(project.checkPath("a/../b.py")).toBe("invalid");
    expect(project.checkPath("SRC/APP.py")).toBe("taken");
    expect(project.checkPath("src")).toBe("folder");
    expect(project.checkPath("src/app.py/x.py")).toBe("folder");
    expect(project.checkPath("src/app.py", "a")).toBeUndefined();
    expect(project.checkPath("tests/test_app.py")).toBeUndefined();
  });

  it("holds at most the web's number of files", () => {
    const ydoc = new Y.Doc();
    seed(ydoc, "python", Array.from({ length: MAX_FILES }, (_, i) => ({ id: `f${i}`, path: `f${i}.py` })));

    expect(new CodeProject(ydoc).createFile("one-more.py", "").problem).toBe("full");
  });

  it("renames and deletes files", () => {
    const ydoc = new Y.Doc();
    seed(ydoc, "python", [{ id: "a", path: "a.py" }, { id: "b", path: "b.py" }]);
    const project = new CodeProject(ydoc);

    expect(project.renameFile("a", "b.py")).toBe("taken");
    expect(project.renameFile("a", "lib/a.py")).toBeUndefined();
    project.deleteFile("b");

    expect(project.mirroredFiles().map((p) => p.path)).toEqual(["lib/a.py"]);
  });

  it("tells when files come, go or move, or the type changes, but not on typing", () => {
    const ydoc = new Y.Doc();
    seed(ydoc, "python", [{ id: "a", path: "a.py" }]);
    const project = new CodeProject(ydoc);
    const listener = vi.fn();
    const stop = project.onShapeChanged(listener);

    project.fileOf("a")!.text.insert(0, "print(1)");
    expect(listener).not.toHaveBeenCalled();

    project.renameFile("a", "b.py");
    ydoc.getMap<string>("meta").set("language", "go");
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    project.deleteFile("a");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
