import { HubConnection } from "@microsoft/signalr";
import * as vscode from "vscode";

import {
  AppLogView,
  ExecutionView,
  formatSeconds,
  meetPageUrl,
  PHONE_TYPES,
  Refusal,
  refusalOf,
  RunEndedView,
  RunKind,
  RunOutputView,
  RunStartedView,
  TestResultsView,
  toTerminalText,
} from "./execution";
import type { MeetPlace } from "./session";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/**
 * Run and Run tests in the meet's sandbox, from VS Code (V18): the same runs the web shows, so the interviewer sees
 * every run the candidate starts here and the candidate sees the interviewer's. Their output and test results go to a
 * Rallybeam terminal; an app's preview opens in VS Code's browser panel, with its dev server's log in a terminal of
 * its own. A phone stays on the meet's page.
 */
export class MeetRuns implements vscode.Disposable {
  public view: ExecutionView | undefined;

  private readonly runsTerminal = new OutputTerminal(vscode.l10n.t("Rallybeam runs"));

  private readonly appTerminal = new OutputTerminal(vscode.l10n.t("Rallybeam app"));

  private readonly handlers: Array<[string, (...args: never[]) => void]> = [];

  // The run this window started last, which Stop run stops.
  private ownRunId: string | undefined;

  private wantsPreview = false;

  private isDisposed = false;

  constructor(
    private readonly hub: HubConnection,
    private readonly place: MeetPlace,
    private readonly onChanged: () => void,
  ) {}

  public start = () => {
    this.on("ExecutionStateChanged", () => void this.loadAsync());
    this.on("ExecutionRunStarted", this.onRunStarted);
    this.on("ExecutionOutput", (output: RunOutputView) => this.runsTerminal.write(output.text));
    this.on("ExecutionTestResults", this.onTestResults);
    this.on("ExecutionRunEnded", this.onRunEnded);
    this.on("ExecutionAppLog", (log: AppLogView) => {
      if (log.taskPartId === this.view?.taskPartId) {
        this.appTerminal.write(log.text);
      }
    });
    void this.loadAsync();
  };

  public dispose = () => {
    this.isDisposed = true;
    this.handlers.forEach(([name, handler]) => this.hub.off(name, handler as (...args: unknown[]) => void));
    this.runsTerminal.dispose();
    this.appTerminal.dispose();
  };

  /** Reads the task's runs again, as after the hub reconnects. */
  public loadAsync = async () => {
    try {
      this.view = await this.hub.invoke<ExecutionView>("GetExecution");
    } catch {
      this.view = undefined;
    }
    if (this.isDisposed) {
      return;
    }
    this.onChanged();
    if (this.wantsPreview && this.view?.previewUrl) {
      this.wantsPreview = false;
      await showPreviewAsync(this.view.previewUrl);
    }
  };

  public get canRun(): boolean {
    return Boolean(this.view?.isAvailable && this.view.canRun);
  }

  public get isApp(): boolean {
    return this.view?.mode === "App";
  }

  /** Run in Rallybeam: a program's run, or an app's preview, started when it does not run yet. */
  public runAsync = async () => {
    if (!this.mayRun()) {
      return;
    }
    if (this.isApp) {
      await this.showAppAsync();
      return;
    }
    await this.startRunAsync("Run");
  };

  public runTestsAsync = async () => {
    if (this.mayRun()) {
      await this.startRunAsync("Tests");
    }
  };

  public stopRunAsync = async () => {
    if (!this.ownRunId) {
      void vscode.window.showInformationMessage(vscode.l10n.t("No run of yours is going."));
      return;
    }
    try {
      await this.hub.invoke("CancelRun", this.ownRunId);
    } catch (error) {
      showRefusal(refusalOf(error));
    }
  };

  public restartAppAsync = async () => {
    if (!this.mayRun() || !this.isApp) {
      return;
    }
    this.wantsPreview = true;
    await this.appTerminal.showAsync(() => this.appLogAsync());
    try {
      await this.hub.invoke("RestartApp");
    } catch (error) {
      showRefusal(refusalOf(error));
    }
  };

  // An app runs as long as its sandbox does; this starts it when it does not run, then shows its preview.
  private showAppAsync = async () => {
    await this.appTerminal.showAsync(() => this.appLogAsync());
    if (this.isPhone()) {
      const open = vscode.l10n.t("Open the meet");
      const answer = await vscode.window.showInformationMessage(
        vscode.l10n.t("The app runs on the meet's phone, which shows on the meet's page in your browser. Its log is in the Rallybeam app terminal."),
        open,
      );
      if (answer === open) {
        void vscode.env.openExternal(vscode.Uri.parse(meetPageUrl(this.place.server, this.place.code)));
      }
    }
    if (this.view?.appState === "Running" && this.view.previewUrl) {
      if (!this.isPhone()) {
        await showPreviewAsync(this.view.previewUrl);
      }
      return;
    }
    this.wantsPreview = !this.isPhone();
    try {
      await this.hub.invoke("StartApp");
    } catch (error) {
      this.wantsPreview = false;
      showRefusal(refusalOf(error));
    }
  };

  private startRunAsync = async (kind: RunKind) => {
    this.runsTerminal.show();
    try {
      this.ownRunId = await this.hub.invoke<string>("RunCode", kind);
    } catch (error) {
      showRefusal(refusalOf(error));
    }
  };

  private appLogAsync = async (): Promise<string> => {
    try {
      return await this.hub.invoke<string>("GetAppLog");
    } catch {
      return "";
    }
  };

  private mayRun = (): boolean => {
    if (!this.view) {
      void vscode.window.showWarningMessage(vscode.l10n.t("Rallybeam is still connecting to the meet. Try again in a moment."));
      return false;
    }
    if (!this.view.isAvailable) {
      void vscode.window.showInformationMessage(unavailableText(this.view.reason));
      return false;
    }
    if (!this.view.canRun) {
      void vscode.window.showInformationMessage(vscode.l10n.t("You watch this meet's runs; you cannot start one."));
      return false;
    }
    return true;
  };

  private isPhone = (): boolean =>
    Boolean(this.view?.phoneUrl) || PHONE_TYPES.has(this.view?.environmentId ?? "");

  private onRunStarted = (run: RunStartedView) => {
    const isMine = run.participantId === this.place.participant.id;
    const what = run.kind === "Tests" ? vscode.l10n.t("Tests") : vscode.l10n.t("Run");
    const who = isMine ? "" : ` ${DIM}${vscode.l10n.t("(started by someone else in the meet)")}${RESET}`;
    if (!isMine && this.ownRunId === undefined && !this.runsTerminal.isCreated) {
      // Someone else's run is shown too, without taking the focus from the editor.
      this.runsTerminal.show(true);
    }
    this.runsTerminal.write(`\n${BOLD}▶ ${what}${RESET}${who}\n`);
  };

  private onTestResults = (results: TestResultsView) => {
    const lines = [
      `\n${GREEN}${vscode.l10n.t("{0} passed", results.passed)}${RESET}, ` +
        `${results.failed > 0 ? RED : ""}${vscode.l10n.t("{0} failed", results.failed)}${RESET}, ` +
        vscode.l10n.t("{0} skipped", results.skipped),
      ...results.cases
        .filter((p) => p.outcome === "Failed")
        .map((p) => `${RED}✖ ${p.className ? `${p.className} › ` : ""}${p.name}${RESET}${p.message ? `\n  ${p.message}` : ""}`),
    ];
    this.runsTerminal.write(`${lines.join("\n")}\n`);
  };

  private onRunEnded = (end: RunEndedView) => {
    if (end.runId === this.ownRunId) {
      this.ownRunId = undefined;
    }
    const outcomes: Record<RunEndedView["outcome"], string> = {
      Completed: vscode.l10n.t("Finished in {0}, exit code {1}", formatSeconds(end.seconds), String(end.exitCode ?? "-")),
      TimedOut: vscode.l10n.t("Stopped after {0}: it ran too long", formatSeconds(end.seconds)),
      Cancelled: vscode.l10n.t("Stopped after {0}", formatSeconds(end.seconds)),
      Failed: vscode.l10n.t("The run could not start or finish"),
    };
    const truncated = end.truncated ? ` ${DIM}${vscode.l10n.t("(output cut short)")}${RESET}` : "";
    const color = end.outcome === "Completed" && end.exitCode === 0 ? GREEN : RED;
    this.runsTerminal.write(`\n${color}■ ${outcomes[end.outcome]}${RESET}${truncated}\n`);
  };

  private on = <T>(name: string, handler: (arg: T) => void) => {
    this.hub.on(name, handler);
    this.handlers.push([name, handler as (...args: never[]) => void]);
  };
}

/** A terminal that only shows what the meet sends: VS Code draws its colours and progress as a real terminal would. */
class OutputTerminal implements vscode.Disposable {
  private readonly written = new vscode.EventEmitter<string>();

  private terminal: vscode.Terminal | undefined;

  private isOpen = false;

  private pending: string[] = [];

  constructor(private readonly name: string) {}

  public get isCreated(): boolean {
    return this.terminal !== undefined;
  }

  public show = (preserveFocus = false) => {
    this.ensure().show(preserveFocus);
  };

  /** Shows the terminal, first filling a new one with what came before it. */
  public showAsync = async (history: () => Promise<string>) => {
    const isNew = !this.terminal;
    this.show();
    if (isNew) {
      this.write(await history());
    }
  };

  public write = (text: string) => {
    if (!text) {
      return;
    }
    const lines = toTerminalText(text);
    if (this.isOpen) {
      this.written.fire(lines);
    } else if (this.terminal) {
      this.pending.push(lines);
    }
  };

  public dispose = () => {
    this.terminal?.dispose();
    this.written.dispose();
  };

  private ensure = (): vscode.Terminal => {
    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal({
        name: this.name,
        iconPath: new vscode.ThemeIcon("play-circle"),
        pty: {
          onDidWrite: this.written.event,
          open: () => {
            this.isOpen = true;
            this.pending.forEach((p) => this.written.fire(p));
            this.pending = [];
          },
          close: () => {
            this.isOpen = false;
            this.terminal = undefined;
          },
        },
      });
    }
    return this.terminal;
  };
}

// The preview in VS Code's own browser panel, beside the code; the system browser when the editor has no such panel.
const showPreviewAsync = async (url: string) => {
  try {
    await vscode.commands.executeCommand("simpleBrowser.show", url);
  } catch {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }
};

const showRefusal = (refusal: Refusal) => {
  const texts: Record<Refusal, string> = {
    not_allowed: vscode.l10n.t("You cannot do that in this meet."),
    execution_unavailable: vscode.l10n.t("This task cannot run code."),
    unsupported_language: vscode.l10n.t("This project type cannot run yet."),
    language_not_offered: vscode.l10n.t("This task does not offer this project type, so it cannot run here."),
    no_runner: vscode.l10n.t("Code execution is not reachable right now. Try again in a moment."),
    runner_unavailable: vscode.l10n.t("The environment is reconnecting. Try again in a moment."),
    meeting_ended: vscode.l10n.t("The meet has ended."),
    invalid_run: vscode.l10n.t("That run has already ended."),
    no_sandbox: vscode.l10n.t("Run the code first."),
    not_an_app: vscode.l10n.t("This task runs as a program, not as an app."),
    failed: vscode.l10n.t("Rallybeam could not start the run. Try again."),
  };
  void vscode.window.showWarningMessage(texts[refusal]);
};

const unavailableText = (reason: ExecutionView["reason"]): string => {
  switch (reason) {
    case "meeting_ended":
      return vscode.l10n.t("The meet has ended.");
    case "no_code_task":
    case "not_enabled_for_task":
      return vscode.l10n.t("This task does not run code.");
    case "no_runner":
      return vscode.l10n.t("Code execution is not reachable right now. Try again in a moment.");
    case "unsupported_language":
    case "language_not_offered":
      return vscode.l10n.t("This project type cannot run here.");
    default:
      return vscode.l10n.t("Running code is not available in this meet.");
  }
};
