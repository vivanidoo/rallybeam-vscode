import * as path from "node:path";
import * as vscode from "vscode";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { Cursors } from "./cursors";
import { LocalRunner } from "./localRunner";
import { FolderMirror, Manifest } from "./mirror";
import { PackageSetup } from "./packageSetup";
import { People } from "./people";
import { participantColor, VSCODE_CLIENT } from "./presence";
import { CodeProject } from "./project";
import type { MeetPlace } from "./session";

/** The subprotocol the API's Yjs relay expects next to the participant token. */
export const RELAY_SUBPROTOCOL = "rallybeam";

/** The relay's close code for a socket whose task is no longer the current one. */
const TASK_CHANGED = 4409;

/**
 * One task's code (V23): its document on the relay, which serves the task current when the socket opens, mirrored to
 * the task's own folder, with everyone's cursors, the packages for the editor and the runs on this computer. A task
 * switch disposes it and makes the next task's.
 */
export class TaskCode implements vscode.Disposable {
  /** Who has which file in front, once the code is here. */
  public people: People | undefined;

  /** The packages of the type in front, for the editor, once the code is here. */
  public packages: PackageSetup | undefined;

  /** Run and Run tests on this computer, once the code is here. */
  public local: LocalRunner | undefined;

  public project: CodeProject | undefined;

  public isSynced = false;

  /** Done once the folder holds the task's files. */
  public readonly ready: Promise<void>;

  private markReady: () => void = () => undefined;

  private ydoc: Y.Doc | undefined;

  private provider: WebsocketProvider | undefined;

  private mirror: FolderMirror | undefined;

  private cursors: Cursors | undefined;

  private stopShape: (() => void) | undefined;

  private isDisposed = false;

  constructor(
    /** The task's id, or "" while the meet's tasks are not known. */
    public readonly taskId: string,
    /** The task's folder, inside the meet's. */
    public readonly folder: vscode.Uri,
    private readonly meetFolder: vscode.Uri,
    private readonly place: MeetPlace,
    private readonly token: string,
    private readonly manifest: Manifest,
    private readonly saveManifest: (manifest: Manifest) => void,
    private readonly output: vscode.OutputChannel,
    private readonly onChanged: () => void,
    private readonly onStatus: (status: "synced" | "connected" | "disconnected") => void,
  ) {
    this.ready = new Promise((resolve) => {
      this.markReady = resolve;
    });
  }

  public start = () => {
    const ydoc = new Y.Doc();
    const relay = `${this.place.server.replace(/^http/, "ws")}/yjs`;
    const provider = new WebsocketProvider(relay, `${this.place.code}/code`, ydoc, {
      protocols: [RELAY_SUBPROTOCOL, this.token],
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
      disableBc: true,
      // The relay refuses a socket that names a task no longer current (everest-api CanvasRelay.TASK_CHANGED).
      ...(this.taskId ? { params: { task: this.taskId } } : {}),
    });
    provider.awareness.setLocalStateField("user", {
      name: this.place.participant.displayName,
      color: participantColor(this.place.participant.colorIndex),
      client: VSCODE_CLIENT,
    });
    this.ydoc = ydoc;
    this.provider = provider;

    const project = new CodeProject(ydoc);
    this.project = project;
    provider.on("sync", (isSynced: boolean) => {
      if (!isSynced || this.isDisposed) {
        return;
      }
      if (!this.mirror) {
        this.mirror = new FolderMirror(this.folder, this.meetFolder, project, this.manifest, this.saveManifest);
        this.cursors = new Cursors(provider.awareness, project, this.mirror.idOf);
        this.people = new People(provider.awareness, project, this.mirror.idOf, this.mirror.uriOf, this.onChanged);
        // The packages and their settings are in the folder above the meet's, shared by its tasks.
        this.packages = new PackageSetup(this.meetFolder, project, this.output, this.onChanged);
        this.local = new LocalRunner(this.folder, path.dirname(this.meetFolder.fsPath), project, this.packages);
        // Another project type changes what runs here and the panel's buttons, as when the interviewer switches it.
        this.stopShape = project.onShapeChanged(this.onChanged);
        void this.mirror.start().then(() => {
          this.cursors?.start();
          this.people?.start();
          this.packages?.start();
          this.markReady();
        });
      }
      this.isSynced = true;
      // Synced once what the panel and the menus show is there: the local runs and who is where.
      this.onStatus("synced");
    });
    provider.on("status", ({ status }: { status: string }) => {
      if (this.isDisposed) {
        return;
      }
      if (status === "disconnected") {
        // The relay gives a socket the task current when it opens, so a reconnect after the interviewer moved on
        // would merge this task's code into the next task's. The session reconnects once it knows the task is still
        // current (reconnect), or moves to the next one.
        if (provider.shouldConnect) {
          provider.disconnect();
          this.onStatus("disconnected");
        }
      } else if (status === "connected" && provider.synced) {
        this.onStatus("connected");
      }
    });
    // The relay refused the task as no longer current: the session reads the meet and moves to the current task.
    provider.on("closed", ({ code }: { code: number }) => {
      if (!this.isDisposed && code === TASK_CHANGED) {
        this.onStatus("disconnected");
      }
    });
  };

  /** Joins the task's document again after a drop, once the session knows the task is still the current one. */
  public reconnect = () => {
    if (!this.isDisposed) {
      this.provider?.connect();
    }
  };

  /** The file to open when the task comes in front: the project's main file, else its first. */
  public mainFileUri = (): vscode.Uri | undefined => {
    const project = this.project;
    if (!project || !this.mirror) {
      return undefined;
    }
    const mainId = project.meta.get(`mainFile:${project.language}`);
    const file = (mainId ? project.fileOf(mainId) : undefined) ?? project.mirroredFiles()[0];
    return file ? this.mirror.uriOf(file.path) : undefined;
  };

  public dispose = () => {
    this.isDisposed = true;
    this.stopShape?.();
    this.cursors?.dispose();
    this.people?.dispose();
    this.packages?.dispose();
    this.local?.dispose();
    this.mirror?.dispose();
    this.provider?.destroy();
    this.ydoc?.destroy();
  };
}
