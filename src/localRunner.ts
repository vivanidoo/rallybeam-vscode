import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";
import * as vscode from "vscode";

import { expoMetroConfig, localPaths, LocalRun, localRunFor } from "./localRuns";
import { PackageSetup } from "./packageSetup";
import { showPreviewAsync } from "./preview";
import { CodeProject } from "./project";

const PREVIEW_WAIT_MS = 120_000;

/**
 * Run and Run tests on the candidate's own computer (V19), in VS Code's terminal, as a developer runs any project:
 * the type's commands from localRuns.ts, with the packages from the editor setup. An app's preview opens in VS Code's
 * browser panel once its dev server answers. Nobody else in the meet sees these runs; Run in Rallybeam is for that.
 */
export class LocalRunner implements vscode.Disposable {
  private readonly executions = new Map<"run" | "test", vscode.TaskExecution>();

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    // The task's folder, where the runs start.
    private readonly folder: vscode.Uri,
    // The folder with the packages, above the meet's (environments.ts).
    private readonly packagesRoot: string,
    private readonly project: CodeProject,
    private readonly packages: PackageSetup,
  ) {
    this.disposables.push(
      vscode.tasks.onDidEndTask((event) => {
        for (const [kind, execution] of this.executions) {
          if (execution === event.execution) {
            this.executions.delete(kind);
          }
        }
      }),
    );
  }

  public dispose = () => {
    this.disposables.forEach((p) => p.dispose());
  };

  /** Whether the type in front runs on this computer. */
  public get canRun(): boolean {
    return localRunFor(this.project.language)?.run !== undefined;
  }

  public runAsync = async () => {
    const local = await this.prepareAsync("run");
    if (!local?.run) {
      return;
    }
    const paths = this.paths();
    const url = local.port === undefined ? undefined : `http://localhost:${local.port}`;
    // An app that already runs is shown again, not started twice.
    if (this.executions.has("run") && url && (await answers(url))) {
      await showPreviewAsync(url);
      return;
    }
    this.executions.get("run")?.terminate();
    if (local.isPhone) {
      await this.writeMetroConfigAsync(paths.root);
      void vscode.window.showInformationMessage(
        vscode.l10n.t("Scan the QR code in the terminal with the Expo Go app on your phone, on the same network as this computer."),
      );
    }
    const execution = await this.startAsync("run", vscode.l10n.t("Run"), local.run(paths), local.env);
    if (url) {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Starting the app on this computer…") },
        async () => {
          if (await waitForAsync(url, () => this.executions.get("run") === execution)) {
            await showPreviewAsync(url);
          }
        },
      );
    }
  };

  public testAsync = async () => {
    const local = await this.prepareAsync("test");
    if (!local?.test) {
      return;
    }
    this.executions.get("test")?.terminate();
    await this.startAsync("test", vscode.l10n.t("Tests"), local.test(this.paths()), local.env);
  };

  // The type's local run, its packages installed and its settings written; undefined when it cannot run here.
  private prepareAsync = async (kind: "run" | "test"): Promise<LocalRun | undefined> => {
    const local = localRunFor(this.project.language);
    if (!local?.[kind]) {
      const shared = vscode.l10n.t("Run in Rallybeam");
      const answer = await vscode.window.showInformationMessage(
        kind === "run"
          ? vscode.l10n.t("This project type does not run on your computer yet. Run in Rallybeam runs it in the meet.")
          : vscode.l10n.t("This project type's tests do not run on your computer yet. Run tests in Rallybeam runs them in the meet."),
        shared,
      );
      if (answer === shared) {
        await vscode.commands.executeCommand(kind === "run" ? "rallybeam.run" : "rallybeam.runTests");
      }
      return undefined;
    }
    if (!(await this.packages.readyAsync())) {
      return undefined;
    }
    const paths = this.paths();
    const files = local.configFiles?.(paths) ?? {};
    await fs.mkdir(paths.config, { recursive: true });
    await Promise.all(Object.entries(files).map(([name, text]) => fs.writeFile(path.join(paths.config, name), text)));
    return local;
  };

  private paths = () => {
    const type = this.project.language;
    const mainId = this.project.meta.get(`mainFile:${type}`);
    const main = (mainId ? this.project.fileOf(mainId)?.path : undefined) ?? localRunFor(type)?.defaultMain ?? "index.js";
    return localPaths(this.packagesRoot, type, main);
  };

  private startAsync = async (kind: "run" | "test", name: string, args: string[], env?: Record<string, string>) => {
    const task = new vscode.Task(
      { type: "rallybeam", kind },
      vscode.TaskScope.Workspace,
      name,
      "Rallybeam",
      new vscode.ProcessExecution("node", args, { cwd: this.folder.fsPath, env }),
    );
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
    const execution = await vscode.tasks.executeTask(task);
    this.executions.set(kind, execution);
    return execution;
  };

  private writeMetroConfigAsync = async (root: string) => {
    const file = path.join(this.folder.fsPath, "metro.config.js");
    try {
      await fs.writeFile(file, expoMetroConfig(root), { flag: "wx" });
    } catch {
      // The project has its own, which Metro reads instead.
    }
  };
}

const answers = (url: string): Promise<boolean> =>
  new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(2000, () => {
      request.destroy();
      resolve(false);
    });
  });

// Waits until the dev server answers, while it still runs.
const waitForAsync = async (url: string, isRunning: () => boolean): Promise<boolean> => {
  const until = Date.now() + PREVIEW_WAIT_MS;
  while (Date.now() < until && isRunning()) {
    if (await answers(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};
