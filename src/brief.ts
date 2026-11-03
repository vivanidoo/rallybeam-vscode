import * as vscode from "vscode";

import { briefMarkdown, TaskContent } from "./tasks";

const SCHEME = "rallybeam-brief";

/**
 * The current task's brief (V23), as the web's task panel shows it to the candidate: its description and the goals the
 * interviewer revealed. A read-only document shown in VS Code's markdown preview, never a file, so it cannot reach the
 * meet's project; it is read again when the interviewer reveals something.
 */
export class TaskBrief implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();

  public readonly onDidChange = this.changed.event;

  private readonly texts = new Map<string, string>();

  private readonly disposables: vscode.Disposable[];

  // The brief last read, by task, so a reveal can be told apart from a reread.
  private lastShown: TaskContent | undefined;

  constructor(private readonly load: () => Promise<TaskContent | undefined>) {
    this.disposables = [this.changed, vscode.workspace.registerTextDocumentContentProvider(SCHEME, this)];
  }

  public provideTextDocumentContent = (uri: vscode.Uri): string => this.texts.get(uri.toString()) ?? "";

  /** Reads the brief and opens it beside the code. */
  public showAsync = async () => {
    const content = await this.load();
    if (!content) {
      void vscode.window.showWarningMessage(vscode.l10n.t("Rallybeam could not read the task's brief. Try again in a moment."));
      return;
    }
    const uri = this.write(content);
    try {
      await vscode.commands.executeCommand("markdown.showPreviewToSide", uri);
    } catch {
      await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true });
    }
  };

  /**
   * The interviewer revealed something in the current task: the brief is read again, and a candidate who has not
   * opened it is told what is new.
   */
  public onChangedAsync = async () => {
    const before = this.lastShown;
    const content = await this.load();
    if (!content) {
      return;
    }
    this.write(content);
    const known = new Set(before?.taskId === content.taskId ? before.items.filter((p) => p.isRevealed).map((p) => p.index) : []);
    if (content.items.some((p) => p.isRevealed && !known.has(p.index))) {
      const open = vscode.l10n.t("Open the brief");
      const answer = await vscode.window.showInformationMessage(vscode.l10n.t("The interviewer revealed more of the task."), open);
      if (answer === open) {
        await this.showAsync();
      }
    }
  };

  public dispose = () => {
    this.disposables.forEach((p) => p.dispose());
  };

  private write = (content: TaskContent): vscode.Uri => {
    const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${content.taskId}/${vscode.l10n.t("Brief")}.md` });
    const text = briefMarkdown(content, vscode.l10n.t("Goals"), vscode.l10n.t("The task"));
    this.lastShown = content;
    if (this.texts.get(uri.toString()) !== text) {
      this.texts.set(uri.toString(), text);
      this.changed.fire(uri);
    }
    return uri;
  };
}
