import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

import { isPanelCommand, PanelModel, panelHtml } from "./panel";

/** The Rallybeam panel in VS Code's activity bar (V21): the page of panel.ts, drawn again when the meet changes. */
export class MeetPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  private shown: string | undefined;

  constructor(private readonly model: () => PanelModel) {}

  public resolveWebviewView = (view: vscode.WebviewView) => {
    this.view = view;
    this.shown = undefined;
    view.webview.options = { enableScripts: true, enableCommandUris: false, localResourceRoots: [] };
    view.webview.onDidReceiveMessage((message: { command?: unknown } | undefined) => {
      if (isPanelCommand(message?.command)) {
        void vscode.commands.executeCommand(message.command);
      }
    });
    view.onDidDispose(() => {
      this.view = undefined;
    });
    this.refresh();
  };

  /** Draws the page again when what it shows changed; an unchanged page is left alone, so it does not flicker. */
  public refresh = () => {
    if (!this.view) {
      return;
    }
    const model = this.model();
    const key = JSON.stringify(model);
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    this.view.webview.html = panelHtml(model, { cspSource: this.view.webview.cspSource, nonce: randomBytes(16).toString("base64") });
  };
}
