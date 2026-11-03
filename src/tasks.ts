/**
 * The meet's tasks as VS Code follows them (V23). Each task has its own code document on the relay, which serves the
 * current task's to a socket when it opens (everest-api CanvasRelay, PRD D63), so a task switch means joining again.
 * Each task's files live in a folder of their own inside the meet's folder; the earlier tasks' folders stay as they were
 * left, read-only.
 */
export type TaskState = "Pending" | "Current" | "Done";

/** A task as the meet's view and the hub's `TasksChanged` give it (everest-api `TaskView`), with what VS Code reads. */
export interface TaskSummary {
  id: string;
  order: number;
  title: string | null;
  state: TaskState;
}

/** One of the task's goals or questions, as the candidate sees it: only those the interviewer revealed. */
export interface TaskItem {
  index: number;
  text: string;
  isRevealed: boolean;
}

/** The task's text for this participant (everest-api `TaskContentView`), filtered by the server for their role. */
export interface TaskContent {
  taskId: string;
  title: string | null;
  description: string | null;
  items: TaskItem[];
}

const MAX_SLUG = 40;

/** The tasks in their order. */
export const inOrder = (tasks: readonly TaskSummary[]): TaskSummary[] => [...tasks].sort((a, b) => a.order - b.order);

/** The task the relay serves: the current one, or the first while none is current. */
export const currentTaskOf = (tasks: readonly TaskSummary[]): TaskSummary | undefined => {
  const ordered = inOrder(tasks);
  return ordered.find((p) => p.state === "Current") ?? ordered[0];
};

/** The task's place among the meet's tasks, counted from 1. */
export const taskNumberOf = (tasks: readonly TaskSummary[], taskId: string): number =>
  inOrder(tasks).findIndex((p) => p.id === taskId) + 1;

/**
 * A task's folder name: its number and a short form of its title, such as `2-react-counter`, safe on every file
 * system. Given once per task, so a renamed task keeps its folder.
 */
export const taskFolderName = (number: number, title: string | null): string => {
  const slug = (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  return slug ? `${number}-${slug}` : `${number}-task`;
};

/** The `files.readonlyInclude` setting: every task folder but the current one is read-only. */
export const readonlyFolders = (folders: Readonly<Record<string, string>>, currentTaskId: string): Record<string, boolean> =>
  Object.fromEntries(
    Object.entries(folders)
      // The meet's own folder ("") holds the files of a meet joined before its tasks were known: never all of it.
      .filter(([taskId, folder]) => taskId !== currentTaskId && folder !== "")
      .map(([, folder]) => [`${folder}/**`, true]),
  );

/** The brief as markdown: the task's title and description, then the goals the interviewer revealed. */
export const briefMarkdown = (content: TaskContent, revealedHeading: string, emptyText: string): string => {
  const parts = [`# ${content.title?.trim() || emptyText}`];
  if (content.description?.trim()) {
    parts.push(content.description.trim());
  }
  const revealed = content.items.filter((p) => p.isRevealed && p.text.trim());
  if (revealed.length > 0) {
    parts.push(`## ${revealedHeading}`, revealed.map((p) => `- ${p.text.trim().replace(/\n+/g, " ")}`).join("\n"));
  }
  return `${parts.join("\n\n")}\n`;
};
