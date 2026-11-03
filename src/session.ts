import { HubConnection, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import * as vscode from "vscode";

import { MeetSummary, meetSummaryAsync, ParticipantView, readTasks, taskContentAsync } from "./api";
import { LocalRunner } from "./localRunner";
import { Manifest } from "./mirror";
import { PackageSetup } from "./packageSetup";
import { People } from "./people";
import { MeetRuns } from "./runs";
import { TaskCode } from "./taskCode";
import { currentTaskOf, readonlyFolders, TaskContent, taskFolderName, taskNumberOf, TaskSummary } from "./tasks";

// The longest wait between tries to read the meet after the code's socket dropped.
const RECONNECT_MAX_MS = 15_000;

/** One meet this window is in. */
export interface MeetPlace {
  server: string;
  code: string;
  participant: ParticipantView;
}

/** What the session shows in the status bar. */
export type SessionState = "connecting" | "lobby" | "syncing" | "live" | "offline" | "moved" | "ended";

/** A task's folder inside the meet's, and the meet's files it holds; "" is the meet's own folder. */
export interface StoredTask {
  folder: string;
  manifest: Manifest;
}

/** The tasks this meet's folder holds, by task id; "" while the meet's tasks were not known. */
export type StoredTasks = Record<string, StoredTask>;

interface MeetingStateView {
  state: string;
  isInLobby: boolean;
}

interface MeetingSnapshot extends MeetingStateView {
  participantId: string;
}

/**
 * This window in a meet: the meeting hub tells when the lobby is over, when the interviewer moves to another task and
 * when the meet ends, and from then on the current task's code is joined on the relay and mirrored to its folder
 * (TaskCode). On a task switch the old task's folder stays as it was left, read-only, and the new task's comes in
 * front (V23).
 */
export class MeetSession implements vscode.Disposable {
  public state: SessionState = "connecting";

  /** Run and Run tests in the meet's sandbox, once the lobby is over. */
  public runs: MeetRuns | undefined;

  /** The meet's title, company and tasks, once read. */
  public summary: MeetSummary | undefined;

  /** The meet's tasks, in the hub's latest word. */
  public tasks: TaskSummary[] = [];

  private hub: HubConnection | undefined;

  private code: TaskCode | undefined;

  // Task switches and joins, one after another.
  private queue: Promise<void> = Promise.resolve();

  private isDisposed = false;

  constructor(
    public readonly place: MeetPlace,
    private readonly token: string,
    private readonly folder: vscode.Uri,
    private readonly stored: StoredTasks,
    private readonly saveStored: (stored: StoredTasks) => void,
    private readonly onState: (state: SessionState) => void,
    private readonly output: vscode.OutputChannel,
    private readonly onTaskSwitched: (task: TaskSummary) => void,
    private readonly onBriefChanged: () => void,
  ) {}

  /** Who has which file in front, once the code is here. */
  public get people(): People | undefined {
    return this.code?.people;
  }

  /** The packages of the type in front, for the editor, once the code is here. */
  public get packages(): PackageSetup | undefined {
    return this.code?.packages;
  }

  /** Run and Run tests on this computer, once the code is here. */
  public get local(): LocalRunner | undefined {
    return this.code?.local;
  }

  /** The task whose code this window has, once the lobby is over and the tasks are known. */
  public get currentTask(): TaskSummary | undefined {
    const taskId = this.code?.taskId;
    return taskId ? this.tasks.find((p) => p.id === taskId) : undefined;
  }

  public startAsync = async () => {
    const hub = new HubConnectionBuilder()
      .withUrl(`${this.place.server}/hubs/meeting`, { accessTokenFactory: () => this.token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    this.hub = hub;
    hub.on("MeetingStateChanged", (state: MeetingStateView) => this.follow(state));
    hub.on("TasksChanged", (tasks: unknown) => this.enqueue(() => this.onTasksAsync(readTasks(tasks))));
    // A goal revealed in the task's brief.
    hub.on("TaskContentChanged", (taskId: string) => {
      if (taskId === this.code?.taskId) {
        this.onBriefChanged();
      }
    });
    // A newer editor of the same person took the meet, such as another VS Code window; the browser never does
    // (everest-api MeetingHub, V22). This window stops until the candidate takes the meet back.
    hub.on("MovedElsewhere", () => {
      if (!this.isDisposed) {
        this.setState("moved");
        this.dispose();
      }
    });
    hub.onreconnecting(() => this.setState("offline"));
    hub.onreconnected(() => {
      void this.joinHubAsync();
      void this.runs?.loadAsync();
      // A task switch while the hub was away is read again.
      this.enqueue(async () => {
        await this.loadSummaryAsync();
        await this.onTasksAsync(this.tasks);
      });
    });
    await Promise.all([this.loadSummaryAsync(), hub.start()]);
    await this.joinHubAsync();
  };

  /** The current task's brief, as the server gives it to this participant. */
  public loadBriefAsync = async (): Promise<TaskContent | undefined> => {
    const taskId = this.code?.taskId;
    return taskId ? taskContentAsync(this.place.server, this.place.code, taskId, this.token) : undefined;
  };

  public dispose = () => {
    this.isDisposed = true;
    this.runs?.dispose();
    this.code?.dispose();
    void this.hub?.stop();
  };

  private loadSummaryAsync = async () => {
    const summary = await meetSummaryAsync(this.place.server, this.place.code);
    if (summary && !this.isDisposed) {
      this.summary = summary;
      this.tasks = summary.tasks;
      this.onState(this.state);
    }
  };

  private joinHubAsync = async () => {
    const snapshot = await this.hub!.invoke<MeetingSnapshot>("Join");
    this.follow(snapshot);
  };

  private follow = (state: MeetingStateView) => {
    if (this.isDisposed) {
      return;
    }
    if (state.state === "Ended") {
      this.setState("ended");
      this.dispose();
    } else if (state.isInLobby) {
      this.setState("lobby");
    } else {
      this.enqueue(this.openCodeAsync);
    }
  };

  private enqueue = (work: () => Promise<void>) => {
    this.queue = this.queue.then(work).catch((error: unknown) => {
      this.output.appendLine(`Rallybeam could not follow the meet's task: ${error instanceof Error ? error.message : String(error)}`);
    });
  };

  // Joins the current task's code once the lobby is over.
  private openCodeAsync = async () => {
    if (this.isDisposed) {
      return;
    }
    if (this.code) {
      if (this.state !== "live") {
        this.setState(this.code.isSynced ? "live" : "syncing");
      }
      return;
    }
    this.setState("syncing");
    if (!this.runs) {
      this.runs = new MeetRuns(this.hub!, this.place, () => this.onState(this.state));
      this.runs.start();
    }
    await this.openTaskAsync(currentTaskOf(this.tasks));
  };

  // The interviewer moved to another task: the old task's code is left, and the new task's comes in front.
  private onTasksAsync = async (tasks: TaskSummary[]) => {
    if (this.isDisposed) {
      return;
    }
    this.tasks = tasks;
    this.onState(this.state);
    const next = currentTaskOf(tasks);
    const old = this.code;
    if (!old || !next || next.id === old.taskId) {
      return;
    }

    old.dispose();
    this.code = undefined;
    await closeEditorsIn(old.folder, this.folder);
    this.setState("syncing");
    await this.openTaskAsync(next);
    void this.runs?.loadAsync();
    // openTaskAsync made the new task's code.
    const code = this.code as TaskCode | undefined;
    await code?.ready;
    const main = code?.mainFileUri();
    if (main && !this.isDisposed) {
      await vscode.window.showTextDocument(main, { preview: false }).then(undefined, () => undefined);
    }
    this.onTaskSwitched(next);
  };

  private openTaskAsync = async (task: TaskSummary | undefined) => {
    const key = task?.id ?? "";
    let entry = this.stored[key];
    if (!entry) {
      // A task's folder is named once, when it first comes in front, so a renamed task keeps it.
      entry = { folder: task ? taskFolderName(taskNumberOf(this.tasks, task.id), task.title) : "", manifest: {} };
      this.stored[key] = entry;
      this.saveStored(this.stored);
    }
    const taskFolder = entry.folder ? vscode.Uri.joinPath(this.folder, ...entry.folder.split("/")) : this.folder;
    await vscode.workspace.fs.createDirectory(taskFolder);
    await this.markEarlierTasksReadOnlyAsync(key);
    if (this.isDisposed) {
      return;
    }

    const current = entry;
    const code = new TaskCode(
      key,
      taskFolder,
      this.folder,
      this.place,
      this.token,
      current.manifest,
      (manifest) => {
        current.manifest = manifest;
        this.saveStored(this.stored);
      },
      this.output,
      () => this.onState(this.state),
      (status) => {
        if (this.code !== code || this.isDisposed) {
          return;
        }
        if (status === "disconnected") {
          if (this.state === "live") {
            this.setState("offline");
          }
          this.enqueue(() => this.reconnectCodeAsync(code));
        } else {
          this.setState("live");
        }
      },
    );
    this.code = code;
    code.start();
  };

  // After the code's socket dropped: joins the same task again while it is still the current one, or moves to the task
  // that became current meanwhile, so a task's code never reaches another task's document. Tries again, more slowly,
  // while the meet cannot be read.
  private reconnectCodeAsync = async (code: TaskCode) => {
    for (let attempt = 0; !this.isDisposed && this.code === code; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(RECONNECT_MAX_MS, 1000 * 2 ** attempt)));
      }
      const summary = await meetSummaryAsync(this.place.server, this.place.code);
      if (!summary || this.isDisposed || this.code !== code) {
        continue;
      }
      this.summary = summary;
      const next = currentTaskOf(summary.tasks);
      if (!next || next.id === code.taskId) {
        this.tasks = summary.tasks;
        code.reconnect();
      } else {
        await this.onTasksAsync(summary.tasks);
      }
      return;
    }
  };

  // The earlier tasks' folders stay as they were left; editing them would reach nobody, so VS Code keeps them
  // read-only (`files.readonlyInclude` in the meet folder's settings), next to whatever the candidate set there.
  private markEarlierTasksReadOnlyAsync = async (currentKey: string) => {
    const files = vscode.workspace.getConfiguration("files", this.folder);
    const folders = Object.fromEntries(Object.entries(this.stored).map(([taskId, p]) => [taskId, p.folder]));
    const ours = new Set(Object.values(folders).map((p) => `${p}/**`));
    const existing = files.inspect<Record<string, boolean>>("readonlyInclude")?.workspaceValue ?? {};
    const value = {
      ...Object.fromEntries(Object.entries(existing).filter(([glob]) => !ours.has(glob))),
      ...readonlyFolders(folders, currentKey),
    };
    if (JSON.stringify(value) !== JSON.stringify(existing)) {
      await files
        .update("readonlyInclude", Object.keys(value).length > 0 ? value : undefined, vscode.ConfigurationTarget.Workspace)
        .then(undefined, () => undefined);
    }
  };

  private setState = (state: SessionState) => {
    this.state = state;
    this.onState(state);
  };
}

// Closes the old task's editors, which would otherwise look live; the meet's own folder is never closed whole.
const closeEditorsIn = async (taskFolder: vscode.Uri, meetFolder: vscode.Uri) => {
  if (taskFolder.fsPath === meetFolder.fsPath) {
    return;
  }
  const prefix = taskFolder.toString() + "/";
  const tabs = vscode.window.tabGroups.all.flatMap((group) =>
    group.tabs.filter((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString().startsWith(prefix)),
  );
  if (tabs.length > 0) {
    await vscode.window.tabGroups.close(tabs).then(undefined, () => undefined);
  }
};
