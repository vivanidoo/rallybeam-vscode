/**
 * The Rallybeam panel's page (V21): the meet on top (the inviting company, the meet's title and code), then its
 * actions in sections with a line between them: the task and its brief (V23), Rallybeam's runs, then this computer's. A webview, as VS Code's welcome content shows no
 * text that changes and no lines. The page only posts which button was clicked; the extension runs the command, and
 * only one of PANEL_COMMANDS.
 */
export const PANEL_COMMANDS = [
  "rallybeam.join",
  "rallybeam.run",
  "rallybeam.runTests",
  "rallybeam.restartApp",
  "rallybeam.runLocal",
  "rallybeam.testLocal",
  "rallybeam.setUpPackages",
  "rallybeam.goToCursor",
  "rallybeam.follow",
  "rallybeam.showBrief",
  "rallybeam.openMeet",
  "rallybeam.useHere",
  "rallybeam.leave",
] as const;

export type PanelCommand = (typeof PANEL_COMMANDS)[number];

export const isPanelCommand = (value: unknown): value is PanelCommand =>
  typeof value === "string" && (PANEL_COMMANDS as readonly string[]).includes(value);

export type PanelIcon =
  | "play"
  | "beaker"
  | "preview"
  | "restart"
  | "package"
  | "person"
  | "follow"
  | "brief"
  | "browser"
  | "signIn"
  | "signOut";

export interface PanelButton {
  command: PanelCommand;
  label: string;
  icon: PanelIcon;
  /** The section's main actions are drawn as VS Code's primary buttons, the others as its secondary ones. */
  isPrimary?: boolean;
}

export interface PanelSection {
  heading?: string;
  note?: string;
  /** Why the section has no buttons now, such as Rallybeam's runs not being reachable; shown without buttons too. */
  message?: string;
  buttons: PanelButton[];
}

export interface PanelModel {
  /** The inviting company, when the meet carries its brand. */
  company?: string;
  heading: string;
  /** Under the heading, such as the meet's code. */
  detail?: string;
  /** Where the meet stands, while it is not live. */
  status?: string;
  /** Drawn in order, with a line between two of them; a section without buttons or a message is left out. */
  sections: PanelSection[];
}

export interface PanelPage {
  /** The webview's own source for its CSP (`webview.cspSource`). */
  cspSource: string;
  /** A new one for every page, for its style and script. */
  nonce: string;
}

// 16-pixel line icons in the text's colour, drawn for the panel (no icon font is shipped).
const ICONS: Record<PanelIcon, string> = {
  play: '<path d="M5 3.2v9.6L12.5 8z"/>',
  beaker: '<path d="M5.5 2h5M6.5 2v4.3L2.9 12.6A1 1 0 0 0 3.8 14h8.4a1 1 0 0 0 .9-1.4L9.5 6.3V2M4.6 10h6.8"/>',
  preview: '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1"/><path d="M1.8 5.8h12.4"/>',
  restart: '<path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3"/>',
  package: '<path d="M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8zM2.5 4.8 8 7.8l5.5-3M8 7.8v6.4"/>',
  person: '<circle cx="8" cy="5" r="2.6"/><path d="M2.8 14c0-2.9 2.3-4.6 5.2-4.6s5.2 1.7 5.2 4.6"/>',
  follow: '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  brief: '<path d="M4 1.8h5.5L12.5 5v9.2H4zM9.5 1.8V5h3M6 8h4.5M6 10.5h4.5"/>',
  browser: '<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/>',
  signIn: '<path d="M10 2.5h2.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10M6 5l3 3-3 3M9 8H2"/>',
  signOut: '<path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10 5l3 3-3 3M13 8H6"/>',
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const icon = (name: PanelIcon) =>
  `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const button = (p: PanelButton) =>
  `<button class="${p.isPrimary ? "primary" : "secondary"}" data-command="${p.command}">${icon(p.icon)}<span>${escapeHtml(p.label)}</span></button>`;

const section = (p: PanelSection) =>
  [
    `<section>`,
    p.heading ? `<h2>${escapeHtml(p.heading)}</h2>` : "",
    p.note ? `<p class="note">${escapeHtml(p.note)}</p>` : "",
    p.message ? `<p class="message">${escapeHtml(p.message)}</p>` : "",
    ...p.buttons.map(button),
    `</section>`,
  ].join("");

export const panelHtml = (model: PanelModel, page: PanelPage): string => {
  const sections = model.sections.filter((p) => p.buttons.length > 0 || p.message);
  const nonce = escapeHtml(page.nonce);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${escapeHtml(page.cspSource)};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { padding: 12px 20px 16px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  header { margin-bottom: 14px; }
  .company { margin: 0 0 4px; color: var(--vscode-descriptionForeground); font-size: 0.85em; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 1.25em; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
  .detail { margin: 2px 0 0; color: var(--vscode-descriptionForeground); }
  .status { margin: 8px 0 0; }
  hr { margin: 14px 0; border: 0; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.35))); }
  h2 { margin: 0 0 2px; font-size: 1em; font-weight: 600; }
  .note { margin: 0 0 8px; color: var(--vscode-descriptionForeground); }
  .message { margin: 0 0 8px; padding: 6px 8px; border-left: 2px solid var(--vscode-editorWarning-foreground, #cca700); background: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.1)); }
  button { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; max-width: 300px; margin: 0 0 8px; padding: 4px 8px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; font: inherit; line-height: 18px; cursor: pointer; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .icon { width: 16px; height: 16px; flex: none; }
</style>
</head>
<body>
<header>
${model.company ? `<p class="company">${escapeHtml(model.company)}</p>` : ""}<h1>${escapeHtml(model.heading)}</h1>
${model.detail ? `<p class="detail">${escapeHtml(model.detail)}</p>` : ""}${model.status ? `<p class="status">${escapeHtml(model.status)}</p>` : ""}
</header>
${sections.map(section).join("\n<hr>\n")}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const button of document.querySelectorAll("button[data-command]")) {
    button.addEventListener("click", () => vscode.postMessage({ command: button.dataset.command }));
  }
</script>
</body>
</html>
`;
};
