import * as vscode from "vscode";
import { Awareness } from "y-protocols/awareness";

import { remoteCursorsIn, setLocalSelection } from "./presence";
import { CodeProject } from "./project";

interface Decorations {
  color: string;
  name: string;
  selection: vscode.TextEditorDecorationType;
  caret: vscode.TextEditorDecorationType;
}

/**
 * Everyone's cursors, both ways: this person's file in front and selection go to the others
 * through awareness, as y-monaco sends them; the others' cursors and selections show in the visible editors in their
 * colours, with their names.
 */
export class Cursors implements vscode.Disposable {
  private readonly decorations = new Map<number, Decorations>();

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly awareness: Awareness,
    private readonly project: CodeProject,
    private readonly idOf: (uri: vscode.Uri) => string | undefined,
  ) {}

  public start = () => {
    this.awareness.on("change", this.paint);
    this.disposables.push(
      { dispose: () => this.awareness.off("change", this.paint) },
      vscode.window.onDidChangeTextEditorSelection((event) => this.tell(event.textEditor)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.tell(editor);
        }
      }),
      vscode.window.onDidChangeVisibleTextEditors(this.paint),
      vscode.workspace.onDidChangeTextDocument(this.paint),
    );
    if (vscode.window.activeTextEditor) {
      this.tell(vscode.window.activeTextEditor);
    }
    this.paint();
  };

  public dispose = () => {
    this.disposables.forEach((p) => p.dispose());
    this.decorations.forEach((p) => {
      p.selection.dispose();
      p.caret.dispose();
    });
    this.decorations.clear();
  };

  // Only the editor in front speaks for this person, as the web's one editor does.
  private tell = (editor: vscode.TextEditor) => {
    if (editor !== vscode.window.activeTextEditor) {
      return;
    }
    const id = this.idOf(editor.document.uri);
    const text = id === undefined ? undefined : this.project.fileOf(id)?.text;
    if (id === undefined || !text) {
      return;
    }

    const { anchor, active } = editor.selection;
    const length = text.length;
    const offset = (position: vscode.Position) => Math.min(editor.document.offsetAt(position), length);
    setLocalSelection(this.awareness, id, text, offset(anchor), offset(active));
  };

  private paint = () => {
    const shown = new Map<number, { editor: vscode.TextEditor; selections: vscode.Range[]; carets: vscode.Range[] }[]>();
    for (const editor of vscode.window.visibleTextEditors) {
      const id = this.idOf(editor.document.uri);
      const text = id === undefined ? undefined : this.project.fileOf(id)?.text;
      if (id === undefined || !text) {
        continue;
      }

      for (const cursor of remoteCursorsIn(this.awareness, id, text)) {
        this.decorationsOf(cursor.clientId, cursor.user.color, cursor.user.name);
        const document = editor.document;
        const anchor = document.positionAt(cursor.anchor);
        const head = document.positionAt(cursor.head);
        const entries = shown.get(cursor.clientId) ?? [];
        entries.push({ editor, selections: anchor.isEqual(head) ? [] : [new vscode.Range(anchor, head)], carets: [new vscode.Range(head, head)] });
        shown.set(cursor.clientId, entries);
      }
    }

    // Someone who left takes their colours along.
    const states = this.awareness.getStates();
    for (const [clientId, decorations] of [...this.decorations]) {
      if (!states.has(clientId)) {
        decorations.selection.dispose();
        decorations.caret.dispose();
        this.decorations.delete(clientId);
      }
    }

    for (const editor of vscode.window.visibleTextEditors) {
      for (const [clientId, decorations] of this.decorations) {
        const entry = shown.get(clientId)?.find((p) => p.editor === editor);
        editor.setDecorations(decorations.selection, entry?.selections ?? []);
        editor.setDecorations(decorations.caret, entry?.carets ?? []);
      }
    }
  };

  private decorationsOf = (clientId: number, color: string, name: string): Decorations => {
    const existing = this.decorations.get(clientId);
    if (existing && existing.color === color && existing.name === name) {
      return existing;
    }
    existing?.selection.dispose();
    existing?.caret.dispose();

    const decorations: Decorations = {
      color,
      name,
      selection: vscode.window.createTextEditorDecorationType({
        backgroundColor: `${color}33`,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      }),
      caret: vscode.window.createTextEditorDecorationType({
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        // A thin bar in the person's colour, with their name above it.
        before: {
          contentText: "​",
          border: `solid ${color}`,
          textDecoration: "none; border-width: 0 0 0 2px; margin-left: -1px; position: relative; z-index: 1",
        },
        after: {
          contentText: name,
          color: "#ffffff",
          backgroundColor: color,
          textDecoration:
            "none; position: absolute; transform: translateY(-100%); margin-left: -2px; padding: 0 4px; font-size: 0.75em; border-radius: 2px; z-index: 2; pointer-events: none; white-space: nowrap",
        },
      }),
    };
    this.decorations.set(clientId, decorations);
    return decorations;
  };
}
