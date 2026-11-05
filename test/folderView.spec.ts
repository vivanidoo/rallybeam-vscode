import { describe, expect, it } from "vitest";

import { hasOpenFileIn, withSettingsHidden } from "../src/folderView";

describe("folderView", () => {
  it("hides .vscode next to the candidate's own exclude rules", () => {
    expect(withSettingsHidden(undefined)).toEqual({ ".vscode": true });
    expect(withSettingsHidden({ "**/*.log": true })).toEqual({ "**/*.log": true, ".vscode": true });
  });

  it("keeps a .vscode rule already in the folder, even one that shows it", () => {
    expect(withSettingsHidden({ ".vscode": true })).toBeUndefined();
    expect(withSettingsHidden({ ".vscode": false })).toBeUndefined();
  });

  it("finds a tab open in the task's folder, not in a folder that only starts with its name", () => {
    const folder = "file:///meets/AB12/1-task";
    expect(hasOpenFileIn(["file:///meets/AB12/1-task/index.ts"], folder)).toBe(true);
    expect(hasOpenFileIn(["file:///meets/AB12/1-task/src/a.ts"], `${folder}/`)).toBe(true);
    expect(hasOpenFileIn(["file:///meets/AB12/1-task-old/index.ts"], folder)).toBe(false);
    expect(hasOpenFileIn([], folder)).toBe(false);
  });
});
