import { describe, expect, it } from "vitest";

import { briefMarkdown, currentTaskOf, readonlyFolders, taskFolderName, taskNumberOf, TaskSummary } from "../src/tasks";

const tasks: TaskSummary[] = [
  { id: "t2", order: 1, title: "React counter", state: "Pending" },
  { id: "t1", order: 0, title: "Two sum", state: "Done" },
  { id: "t3", order: 2, title: null, state: "Current" },
];

describe("tasks", () => {
  it("finds the current task, or the first while none is current", () => {
    expect(currentTaskOf(tasks)?.id).toBe("t3");
    expect(currentTaskOf(tasks.map((p) => ({ ...p, state: "Pending" as const })))?.id).toBe("t1");
    expect(currentTaskOf([])).toBeUndefined();
  });

  it("numbers the tasks in their order", () => {
    expect(taskNumberOf(tasks, "t1")).toBe(1);
    expect(taskNumberOf(tasks, "t3")).toBe(3);
  });

  it("names a task's folder by its number and title, safely", () => {
    expect(taskFolderName(2, "React counter")).toBe("2-react-counter");
    expect(taskFolderName(1, "  Šifra: ćevapi & C#!  ")).toBe("1-sifra-cevapi-c");
    expect(taskFolderName(3, null)).toBe("3-task");
    expect(taskFolderName(4, "???")).toBe("4-task");
    expect(taskFolderName(5, "a".repeat(80))).toBe(`5-${"a".repeat(40)}`);
  });

  it("makes every task folder but the current one read-only, never the meet's own folder", () => {
    expect(readonlyFolders({ t1: "1-two-sum", t2: "2-react-counter", "": "" }, "t2")).toEqual({ "1-two-sum/**": true });
    expect(readonlyFolders({ t1: "1-two-sum" }, "t1")).toEqual({});
  });

  it("writes the brief with the goals the interviewer revealed", () => {
    const text = briefMarkdown(
      {
        taskId: "t1",
        title: "Two sum",
        description: "Find two numbers.\n",
        items: [
          { index: 0, text: "Handle\nduplicates", isRevealed: true },
          { index: 1, text: "Hidden", isRevealed: false },
        ],
      },
      "Goals",
      "The task",
    );
    expect(text).toBe("# Two sum\n\nFind two numbers.\n\n## Goals\n\n- Handle duplicates\n");
    expect(briefMarkdown({ taskId: "t1", title: null, description: null, items: [] }, "Goals", "The task")).toBe("# The task\n");
  });
});
