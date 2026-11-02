/**
 * The meet's runs as the API's meeting hub tells them (everest-api `MeetingHub.RunCode`, `IMeetingClient.Execution*`):
 * the same runs the web shows, started from VS Code or from the web. The shapes are the hub's views, with only the
 * fields the extension reads.
 */
export type RunKind = "Run" | "Tests";

export type ExecutionMode = "Program" | "App";

export type ExecutionAppState = "Stopped" | "Starting" | "Running" | "Exited";

/** Why the current task cannot run code (everest-api `ExecutionView.Reason`). */
export type UnavailableReason =
  | "disabled"
  | "meeting_not_found"
  | "meeting_ended"
  | "no_code_task"
  | "not_enabled_for_task"
  | "no_runner"
  | "unsupported_language"
  | "language_not_offered";

export interface ExecutionView {
  isAvailable: boolean;
  reason: UnavailableReason | null;
  environmentId: string | null;
  taskPartId: string | null;
  canRun: boolean;
  mode: ExecutionMode;
  previewUrl: string | null;
  appState: ExecutionAppState;
  phoneUrl?: string | null;
}

export interface RunStartedView {
  runId: string;
  kind: RunKind;
  hidden: boolean;
  participantId: string;
}

export interface RunOutputView {
  runId: string;
  stream: "Stdout" | "Stderr";
  text: string;
}

export interface TestCase {
  name: string;
  className: string | null;
  outcome: "Passed" | "Failed" | "Skipped";
  message: string | null;
}

export interface TestResultsView {
  runId: string;
  passed: number;
  failed: number;
  skipped: number;
  cases: TestCase[];
}

export interface RunEndedView {
  runId: string;
  outcome: "Completed" | "TimedOut" | "Cancelled" | "Failed";
  exitCode: number | null;
  truncated: boolean;
  seconds: number;
}

export interface AppLogView {
  taskPartId: string;
  text: string;
}

/** Why the hub refused a call (everest-api `ExecutionRefusedException`), as the web's ExecutionStore reads it. */
export type Refusal =
  | "not_allowed"
  | "execution_unavailable"
  | "unsupported_language"
  | "language_not_offered"
  | "no_runner"
  | "runner_unavailable"
  | "meeting_ended"
  | "invalid_run"
  | "no_sandbox"
  | "not_an_app"
  | "failed";

const REFUSALS: Refusal[] = [
  "not_allowed",
  "execution_unavailable",
  "unsupported_language",
  "language_not_offered",
  "no_runner",
  "runner_unavailable",
  "meeting_ended",
  "invalid_run",
  "no_sandbox",
  "not_an_app",
];

/** The refusal a failed hub call carries in its message, or "failed". */
export const refusalOf = (error: unknown): Refusal => {
  const text = error instanceof Error ? error.message : String(error);
  return REFUSALS.find((p) => text.includes(p)) ?? "failed";
};

/** The types that run on the meet's phone, which the web shows and VS Code cannot (everest-sandbox §5.7). */
export const PHONE_TYPES = new Set(["expo", "react-native", "kotlin-android"]);

/** Whether the task's app runs on the meet's phone. */
export const isPhoneView = (view: ExecutionView | undefined): boolean =>
  Boolean(view?.phoneUrl) || PHONE_TYPES.has(view?.environmentId ?? "");

/**
 * The preview VS Code opens by itself on joining: an app's, only when its dev server already runs, which it does once
 * the task's code is open on the web (the web's `ensureAppStartedAsync`). Joining never starts the app.
 */
export const joinPreviewOf = (view: ExecutionView | undefined): string | undefined =>
  view?.isAvailable && view.mode === "App" && view.appState === "Running" && view.previewUrl && !isPhoneView(view)
    ? view.previewUrl
    : undefined;

/** Output for a terminal, which needs CRLF to start each line at its left edge. */
export const toTerminalText = (text: string): string => text.replace(/\r?\n/g, "\r\n");

/** A run's length, as the web shows it. */
export const formatSeconds = (seconds: number): string =>
  seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;

/** The meet's page on the web, where the phone and the call are. */
export const meetPageUrl = (server: string, code: string): string => `${server.replace(/\/+$/, "")}/${code}`;
