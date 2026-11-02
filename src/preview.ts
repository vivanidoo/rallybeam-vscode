import * as vscode from "vscode";

// VS Code's integrated browser (1.11x on); Simple Browser hands its own commands to it, without their column, so a
// preview opened through Simple Browser lands in the editor's group and opens a new tab every time.
const INTEGRATED_BROWSER = "workbench.action.browser.open";

/**
 * A preview in the editor's own browser, beside the code, in the tab that already shows that address when there is
 * one: VS Code's integrated browser where the editor has it, else Simple Browser (older VS Code, Cursor and the
 * others), else the system browser. Opened by itself (`isQuiet`), it gives the focus back to the editor and never
 * opens the system browser.
 */
export const showPreviewAsync = async (url: string, isQuiet = false) => {
  const editor = isQuiet ? vscode.window.activeTextEditor : undefined;
  try {
    if ((await vscode.commands.getCommands(true)).includes(INTEGRATED_BROWSER)) {
      await vscode.commands.executeCommand(INTEGRATED_BROWSER, { url, openToSide: true, reuseUrlFilter: new URL(url).origin });
      if (editor) {
        await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
      }
      return;
    }
    await vscode.commands.executeCommand("simpleBrowser.api.open", vscode.Uri.parse(url), {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: isQuiet,
    });
  } catch {
    if (!isQuiet) {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }
};
