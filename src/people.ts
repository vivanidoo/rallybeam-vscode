import * as vscode from "vscode";
import { Awareness } from "y-protocols/awareness";

import { colorIndexOf, fileBadge, RemotePerson, remoteCursorsIn, remotePeople, VSCODE_CLIENT } from "./presence";
import { CodeProject } from "./project";

/**
 * Who has which file in front, as the web's dots beside the files show it: a badge and the person's colour on the file
 * in VS Code's explorer, and a way to go to someone's cursor, from the status bar or the command palette.
 */
export class People implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<undefined>();

  public readonly onDidChangeFileDecorations = this.changed.event;

  private readonly disposables: vscode.Disposable[] = [this.changed];

  // The files that had a badge, so a change to who is where repaints only when it matters.
  private lastShape = "";

  constructor(
    private readonly awareness: Awareness,
    private readonly project: CodeProject,
    private readonly idOf: (uri: vscode.Uri) => string | undefined,
    private readonly uriOf: (filePath: string) => vscode.Uri,
  ) {}

  public start = () => {
    this.awareness.on("change", this.refresh);
    this.disposables.push(
      vscode.window.registerFileDecorationProvider(this),
      { dispose: () => this.awareness.off("change", this.refresh) },
      { dispose: this.project.onShapeChanged(() => this.changed.fire(undefined)) },
    );
  };

  public dispose = () => {
    this.disposables.forEach((p) => p.dispose());
  };

  /** Everyone else who has one of the folder's files in front. */
  public here = (): RemotePerson[] => {
    const mirrored = new Set(this.project.mirroredFiles().map((p) => p.id));
    return remotePeople(this.awareness).filter((p) => mirrored.has(p.fileId));
  };

  public provideFileDecoration = (uri: vscode.Uri): vscode.FileDecoration | undefined => {
    const id = this.idOf(uri);
    const people = id === undefined ? [] : this.here().filter((p) => p.fileId === id);
    if (people.length === 0) {
      return undefined;
    }

    const names = people.map((p) => p.user.name).join(", ");
    const index = colorIndexOf(people[0].user.color);
    const decoration = new vscode.FileDecoration(
      fileBadge(people.map((p) => p.user)),
      vscode.l10n.t("Here: {0}", names),
      index < 0 ? undefined : new vscode.ThemeColor(`rallybeam.person${index}`),
    );
    decoration.propagate = true;
    return decoration;
  };

  /** Opens someone's file at their cursor: the one person in the meet, or the one picked. */
  public goToAsync = async (person?: RemotePerson) => {
    const people = this.here();
    const chosen = person ?? (people.length === 1 ? people[0] : await this.pickAsync(people));
    if (!chosen) {
      return;
    }
    const file = this.project.mirroredFiles().find((p) => p.id === chosen.fileId);
    if (!file) {
      return;
    }

    const editor = await vscode.window.showTextDocument(this.uriOf(file.path));
    const cursor = remoteCursorsIn(this.awareness, file.id, file.text).find((p) => p.clientId === chosen.clientId);
    if (cursor) {
      const position = editor.document.positionAt(cursor.head);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  };

  /** A picker line for each person, with the file they have in front. */
  public pickItems = (people: readonly RemotePerson[]): (vscode.QuickPickItem & { person: RemotePerson })[] => {
    const paths = new Map(this.project.mirroredFiles().map((p) => [p.id, p.path]));
    return people.map((person) => ({
      label: vscode.l10n.t("$(location) Go to {0}'s cursor", person.user.name),
      description: paths.get(person.fileId),
      detail: person.user.client === VSCODE_CLIENT ? vscode.l10n.t("In VS Code") : undefined,
      person,
    }));
  };

  private pickAsync = async (people: readonly RemotePerson[]): Promise<RemotePerson | undefined> => {
    if (people.length === 0) {
      void vscode.window.showInformationMessage(vscode.l10n.t("Nobody else has a file open in the meet."));
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(this.pickItems(people), {
      placeHolder: vscode.l10n.t("Whose cursor?"),
    });
    return picked?.person;
  };

  private refresh = () => {
    const shape = this.here()
      .map((p) => `${p.fileId}:${p.clientId}:${p.user.name}:${p.user.color}`)
      .join("|");
    if (shape !== this.lastShape) {
      this.lastShape = shape;
      this.changed.fire(undefined);
    }
  };
}
