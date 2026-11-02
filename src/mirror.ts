import * as path from "node:path";
import * as vscode from "vscode";
import * as Y from "yjs";

import { CodeProject, isInFolder, PathProblem, ProjectFile } from "./project";
import { applyChanges, diffTexts, replaceText, toLf } from "./textDiff";

/** The origin of every change this editor makes to the shared document, so its own changes are not mirrored back. */
export const LOCAL = Symbol("rallybeam-vscode");

/** Files larger than this, or with a NUL character, are not added to the meet. */
const MAX_FILE_BYTES = 1024 * 1024;

/** Folders whose files never reach the meet, whatever made them. */
const NEVER_SHARED = [".vscode", ".git", "node_modules"];

/** What a folder holds of the meet's files, by id, so a reopened folder knows them again. */
export type Manifest = Record<string, string>;

/**
 * Keeps a folder on disk equal to the meet's code project:
 *
 * - The files of the type in front are written to the folder; files that leave the project leave the folder.
 * - Typing in an open file reaches the shared text at once; a remote change reaches the open file's buffer, or the
 *   file on disk when it is not open. The shared text is the truth: when both change at once, the buffer is brought
 *   back to it.
 * - A known file changed on disk (a formatter, `git checkout`) sends the difference.
 * - Files created, renamed or deleted in VS Code change the project; files tools make on disk do not.
 */
export class FolderMirror implements vscode.Disposable {
  /** The meet's files this folder holds, by id, at their paths. */
  private readonly known = new Map<string, string>();

  private readonly bound = new Map<string, () => void>();

  /** Files whose buffer is being brought to the shared text; their change events are that edit coming back. */
  private readonly inFlight = new Set<string>();

  private readonly diskTimers = new Map<string, NodeJS.Timeout>();

  private readonly disposables: vscode.Disposable[] = [];

  private queue: Promise<void> = Promise.resolve();

  private isDisposed = false;

  constructor(
    private readonly folder: vscode.Uri,
    private readonly project: CodeProject,
    manifest: Manifest,
    private readonly saveManifest: (manifest: Manifest) => void,
  ) {
    for (const [id, filePath] of Object.entries(manifest)) {
      this.known.set(id, filePath);
    }
  }

  /** Writes the project into the folder and starts following both sides. */
  public start = async () => {
    await this.writeFolderSettings();
    const stopShape = this.project.onShapeChanged(() => this.enqueue(this.reconcile));
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.folder, "**/*"));
    this.disposables.push(
      { dispose: stopShape },
      watcher,
      watcher.onDidChange((uri) => void this.onDiskChanged(uri)),
      watcher.onDidDelete((uri) => this.onDiskDeleted(uri)),
      vscode.workspace.onDidChangeTextDocument(this.onDocumentChanged),
      vscode.workspace.onDidCreateFiles((event) => void this.onCreated(event.files)),
      vscode.workspace.onDidDeleteFiles((event) => this.onDeleted(event.files)),
      vscode.workspace.onDidRenameFiles((event) => this.onRenamed(event.files)),
    );
    await this.enqueue(this.reconcile);
  };

  /** The id of the meet's file at a URI, if the folder holds one there. */
  public idOf = (uri: vscode.Uri): string | undefined => {
    const relative = this.relativePath(uri);
    if (relative === undefined) {
      return undefined;
    }
    for (const [id, filePath] of this.known) {
      if (filePath === relative) {
        return id;
      }
    }
    return undefined;
  };

  /** The URI of one of the meet's files in the folder. */
  public uriOf = (filePath: string): vscode.Uri => vscode.Uri.joinPath(this.folder, ...filePath.split("/"));

  public dispose = () => {
    this.isDisposed = true;
    this.disposables.forEach((p) => p.dispose());
    this.bound.forEach((stop) => stop());
    this.bound.clear();
    this.diskTimers.forEach((timer) => clearTimeout(timer));
  };

  private enqueue = (work: () => Promise<void>): Promise<void> => {
    this.queue = this.queue.then(work).catch((error: unknown) => {
      console.error("Rallybeam: the folder could not follow the meet", error);
    });
    return this.queue;
  };

  // Makes the folder hold exactly the project's files: removes those that left, moves those that moved, writes new ones.
  private reconcile = async () => {
    if (this.isDisposed) {
      return;
    }

    const files = new Map(this.project.mirroredFiles().map((p) => [p.id, p]));
    for (const [id, filePath] of [...this.known]) {
      const file = files.get(id);
      if (!file) {
        this.unbind(id);
        this.known.delete(id);
        await this.applyEdit((edit) => edit.deleteFile(this.uriOf(filePath), { ignoreIfNotExists: true }));
      } else if (file.path !== filePath) {
        this.known.set(id, file.path);
        await this.applyEdit((edit) =>
          edit.renameFile(this.uriOf(filePath), this.uriOf(file.path), { overwrite: true, ignoreIfExists: false }),
        );
      }
    }

    for (const file of files.values()) {
      if (!this.known.has(file.id)) {
        this.known.set(file.id, file.path);
      }
      if (!this.bound.has(file.id)) {
        this.bind(file);
        await this.bringToShared(file.id);
      }
    }
    this.saveManifest(Object.fromEntries(this.known));
  };

  private bind = (file: ProjectFile) => {
    const observer = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin !== LOCAL) {
        void this.bringToShared(file.id);
      }
    };
    file.text.observe(observer);
    this.bound.set(file.id, () => file.text.unobserve(observer));
  };

  private unbind = (id: string) => {
    this.bound.get(id)?.();
    this.bound.delete(id);
  };

  // Makes the file's open buffer, or the file on disk when it is not open, equal to the shared text.
  private bringToShared = async (id: string) => {
    const filePath = this.known.get(id);
    const text = this.project.fileOf(id)?.text;
    if (filePath === undefined || !text || this.isDisposed) {
      return;
    }

    const uri = this.uriOf(filePath);
    const document = this.openDocumentOf(uri);
    if (!document) {
      this.writeSoon(id);
      return;
    }
    if (this.inFlight.has(id)) {
      // The edit in flight checks again when it lands.
      return;
    }

    const shared = text.toString();
    const change = diffTexts(document.getText(), shared);
    if (!change && document.eol === vscode.EndOfLine.LF) {
      return;
    }

    this.inFlight.add(id);
    try {
      await this.applyEdit((edit) => {
        if (document.eol !== vscode.EndOfLine.LF) {
          edit.set(uri, [vscode.TextEdit.setEndOfLine(vscode.EndOfLine.LF)]);
        }
        if (change) {
          const range = new vscode.Range(document.positionAt(change.offset), document.positionAt(change.offset + change.length));
          edit.replace(uri, range, change.text);
        }
      });
    } finally {
      this.inFlight.delete(id);
    }
    // Someone typed while the edit was on its way: the shared text wins.
    if (document.getText() !== text.toString()) {
      await this.bringToShared(id);
    }
  };

  private writeSoon = (id: string) => {
    clearTimeout(this.diskTimers.get(id));
    this.diskTimers.set(
      id,
      setTimeout(() => {
        this.diskTimers.delete(id);
        void this.enqueue(() => this.writeToDisk(id));
      }, 150),
    );
  };

  private writeToDisk = async (id: string) => {
    const filePath = this.known.get(id);
    const text = this.project.fileOf(id)?.text;
    if (filePath === undefined || !text || this.isDisposed) {
      return;
    }

    const uri = this.uriOf(filePath);
    if (this.openDocumentOf(uri)) {
      await this.bringToShared(id);
      return;
    }
    const shared = text.toString();
    if ((await this.readText(uri)) !== shared) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(shared, "utf8"));
    }
  };

  private onDocumentChanged = (event: vscode.TextDocumentChangeEvent) => {
    const id = this.idOf(event.document.uri);
    const text = id === undefined ? undefined : this.project.fileOf(id)?.text;
    if (id === undefined || !text || event.contentChanges.length === 0 || this.inFlight.has(id)) {
      return;
    }

    const local = event.document.getText();
    if (local === text.toString()) {
      return;
    }
    if (event.document.eol !== vscode.EndOfLine.LF) {
      replaceText(text, toLf(local), LOCAL);
      void this.bringToShared(id);
      return;
    }

    applyChanges(
      text,
      event.contentChanges.map((p) => ({ offset: p.rangeOffset, length: p.rangeLength, text: p.text })),
      LOCAL,
    );
    // A remote change on its way to the buffer: bring the buffer to the shared text.
    if (text.toString() !== local) {
      void this.bringToShared(id);
    }
  };

  // A known file changed on disk, outside the editor: its new text reaches the project. An open file with unsaved
  // changes keeps its buffer, which is already in the project.
  private onDiskChanged = async (uri: vscode.Uri) => {
    const id = this.idOf(uri);
    const text = id === undefined ? undefined : this.project.fileOf(id)?.text;
    if (!text || this.openDocumentOf(uri)?.isDirty) {
      return;
    }

    const disk = await this.readText(uri);
    if (disk !== undefined && !isBinary(disk) && toLf(disk) !== text.toString()) {
      replaceText(text, toLf(disk), LOCAL);
    }
  };

  // A known file removed outside VS Code, such as from the terminal, comes back: a tool never removes a meet's file.
  private onDiskDeleted = (uri: vscode.Uri) => {
    const id = this.idOf(uri);
    if (id !== undefined) {
      setTimeout(() => {
        if (this.known.has(id) && this.idOf(uri) === id) {
          void this.enqueue(() => this.writeToDisk(id));
        }
      }, 1000);
    }
  };

  private onCreated = async (uris: readonly vscode.Uri[]) => {
    for (const uri of uris) {
      const relative = this.relativePath(uri);
      if (relative === undefined || isNeverShared(relative) || this.idOf(uri) !== undefined) {
        continue;
      }
      const stat = await vscode.workspace.fs.stat(uri).then(
        (p) => p,
        () => undefined,
      );
      if (!stat || stat.type & vscode.FileType.Directory) {
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        this.warn(relative, "large");
        continue;
      }
      const content = (await this.readText(uri)) ?? "";
      if (isBinary(content)) {
        this.warn(relative, "binary");
        continue;
      }
      const { id, problem } = this.project.createFile(relative, toLf(content), LOCAL);
      if (id === undefined) {
        this.warn(relative, problem ?? "invalid");
        continue;
      }
      this.known.set(id, relative);
      const file = this.project.fileOf(id);
      if (file) {
        this.bind(file);
      }
      this.saveManifest(Object.fromEntries(this.known));
    }
  };

  private onDeleted = (uris: readonly vscode.Uri[]) => {
    for (const uri of uris) {
      const relative = this.relativePath(uri);
      if (relative === undefined) {
        continue;
      }
      for (const [id, filePath] of [...this.known]) {
        if (filePath === relative || isInFolder(filePath, relative)) {
          this.unbind(id);
          this.known.delete(id);
          this.project.deleteFile(id, LOCAL);
        }
      }
    }
    this.saveManifest(Object.fromEntries(this.known));
  };

  private onRenamed = (renames: readonly { oldUri: vscode.Uri; newUri: vscode.Uri }[]) => {
    let refused = false;
    for (const { oldUri, newUri } of renames) {
      const from = this.relativePath(oldUri);
      const to = this.relativePath(newUri);
      if (from === undefined) {
        continue;
      }
      for (const [id, filePath] of [...this.known]) {
        if (filePath !== from && !isInFolder(filePath, from)) {
          continue;
        }
        const moved = to === undefined ? undefined : to + filePath.slice(from.length);
        const problem = moved === undefined ? "invalid" : this.project.renameFile(id, moved, LOCAL);
        // Where it went is known, so a refused move is put back by the next reconcile.
        this.known.set(id, moved ?? filePath);
        if (problem) {
          this.warn(moved ?? filePath, problem);
          refused = true;
        }
      }
    }
    this.saveManifest(Object.fromEntries(this.known));
    if (refused) {
      void this.enqueue(this.reconcile);
    }
  };

  // The meet folder saves on its own, so remote changes reach the disk, and uses LF, as the shared offsets need.
  private writeFolderSettings = async () => {
    const uri = vscode.Uri.joinPath(this.folder, ".vscode", "settings.json");
    if ((await this.readText(uri)) === undefined) {
      const settings = { "files.autoSave": "afterDelay", "files.eol": "\n" };
      await vscode.workspace.fs.writeFile(uri, Buffer.from(`${JSON.stringify(settings, null, 2)}\n`, "utf8"));
    }
  };

  private applyEdit = async (build: (edit: vscode.WorkspaceEdit) => void) => {
    const edit = new vscode.WorkspaceEdit();
    build(edit);
    await vscode.workspace.applyEdit(edit);
  };

  private openDocumentOf = (uri: vscode.Uri): vscode.TextDocument | undefined => {
    const key = uri.toString();
    const isInTab = vscode.window.tabGroups.all.some((group) =>
      group.tabs.some((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === key),
    );
    return isInTab ? vscode.workspace.textDocuments.find((p) => p.uri.toString() === key) : undefined;
  };

  private readText = async (uri: vscode.Uri): Promise<string | undefined> => {
    try {
      return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    } catch {
      return undefined;
    }
  };

  private relativePath = (uri: vscode.Uri): string | undefined => {
    if (uri.scheme !== this.folder.scheme) {
      return undefined;
    }
    const relative = path.relative(this.folder.fsPath, uri.fsPath);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      return undefined;
    }
    return relative.split(path.sep).join("/");
  };

  private warn = (filePath: string, problem: PathProblem | "large" | "binary") => {
    const reasons: Record<typeof problem, string> = {
      invalid: vscode.l10n.t("its name may hold only letters, digits, _, . and -, in at most 8 parts"),
      taken: vscode.l10n.t("another file has that name"),
      folder: vscode.l10n.t("a folder has that name"),
      full: vscode.l10n.t("the project already has 100 files"),
      large: vscode.l10n.t("it is larger than 1 MB"),
      binary: vscode.l10n.t("it is not a text file"),
    };
    void vscode.window.showWarningMessage(
      vscode.l10n.t("{0} is not in the meet: {1}.", filePath, reasons[problem]),
    );
  };
}

const isNeverShared = (relative: string): boolean => NEVER_SHARED.some((p) => relative === p || isInFolder(relative, p));

const isBinary = (text: string): boolean => text.includes("\0");
