/**
 * The Rallybeam panel's page (V21): the meet on top (the inviting company, the meet's title and code), then its
 * actions in sections with a line between them: the task and its brief (V23), Rallybeam's runs, then this computer's. A webview, as VS Code's welcome content shows no
 * text that changes and no lines. A paying company's meet carries its look (V24): the header image behind the top,
 * darkened so the text stays readable, the logo, the welcome message, the primary buttons in its colour and "Powered
 * by Rallybeam" at the end. The page only posts which button was clicked; the extension runs the command, and only
 * one of PANEL_COMMANDS.
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

/** The inviting company's look (V24); images are addresses on the meet's server. */
export interface PanelBrand {
  logoUrl?: string;
  headerUrl?: string;
  /** `#rrggbb`; anything else is left out. */
  accentColor?: string;
  welcomeMessage?: string;
  /** The footer, "Powered by Rallybeam". */
  poweredBy: string;
}

export interface PanelModel {
  /** The inviting company, when the meet carries its brand. */
  company?: string;
  /** The company's look, when the meet carries its brand. */
  brand?: PanelBrand;
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

const ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** The brand ink, as the web's brand palette puts it on light button colours. */
const INK = "#17252b";

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** White or ink on the button colour, whichever reads better, as on the web. */
export const accentText = (accent: string): string => (contrast("#ffffff", accent) >= contrast(INK, accent) ? "#ffffff" : INK);

/** The origins the brand's images come from, for the page's CSP; anything but http(s) is left out. */
const imageOrigins = (brand: PanelBrand | undefined): string[] =>
  [...new Set([brand?.logoUrl, brand?.headerUrl].flatMap((url) => {
    try {
      const parsed = url ? new URL(url) : undefined;
      return parsed && (parsed.protocol === "https:" || parsed.protocol === "http:") ? [parsed.origin] : [];
    } catch {
      return [];
    }
  }))];

const header = (model: PanelModel): string => {
  const brand = model.brand;
  const company = model.company
    ? brand?.logoUrl
      ? `<p class="company branded"><img class="logo" src="${escapeHtml(brand.logoUrl)}" alt=""><span>${escapeHtml(model.company)}</span></p>`
      : `<p class="company">${escapeHtml(model.company)}</p>`
    : "";
  const meet = [
    company,
    `<h1>${escapeHtml(model.heading)}</h1>`,
    model.detail ? `<p class="detail">${escapeHtml(model.detail)}</p>` : "",
    brand ? `<div class="accent-bar"></div>` : "",
    brand?.welcomeMessage ? `<p class="welcome">${escapeHtml(brand.welcomeMessage)}</p>` : "",
  ].join("");
  const status = model.status ? `<p class="status">${escapeHtml(model.status)}</p>` : "";
  if (!brand?.headerUrl) {
    return `<header>\n${meet}${status}\n</header>`;
  }
  return `<header class="has-image"><div class="hero"><img class="cover" src="${escapeHtml(brand.headerUrl)}" alt=""><div class="scrim"></div><div class="hero-text">${meet}</div></div>${status}</header>`;
};

const brandStyle = (brand: PanelBrand | undefined): string => {
  if (!brand) {
    return "";
  }
  const accent = brand.accentColor && ACCENT_PATTERN.test(brand.accentColor) ? brand.accentColor.toLowerCase() : undefined;
  return [
    `  .company.branded { display: flex; align-items: center; gap: 8px; text-transform: none; letter-spacing: 0; font-size: 1em; color: inherit; }`,
    `  .logo { height: 20px; max-width: 96px; object-fit: contain; flex: none; }`,
    `  .accent-bar { width: 48px; height: 3px; margin: 10px 0 8px; border-radius: 2px; background: ${accent ?? "var(--vscode-button-background)"}; }`,
    `  .welcome { margin: 0; white-space: pre-line; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }`,
    `  header.has-image { margin: -12px -20px 14px; }`,
    `  .hero { position: relative; padding: 16px 20px 14px; color: #ffffff; overflow: hidden; }`,
    `  .hero .cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }`,
    `  .hero .scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.45) 65%, rgba(0, 0, 0, 0.2) 100%); }`,
    `  .hero-text { position: relative; }`,
    `  .hero .company, .hero .detail { color: rgba(255, 255, 255, 0.85); }`,
    `  header.has-image .status { margin: 8px 20px 0; }`,
    `  footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.35))); color: var(--vscode-descriptionForeground); font-size: 0.9em; }`,
    accent
      ? `  button.primary { background: ${accent}; color: ${accentText(accent)}; border-color: ${accent}; }\n  button.primary:hover { background: ${accent}; filter: brightness(1.1); }`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export const panelHtml = (model: PanelModel, page: PanelPage): string => {
  const sections = model.sections.filter((p) => p.buttons.length > 0 || p.message);
  const nonce = escapeHtml(page.nonce);
  const imageSources = [page.cspSource, ...imageOrigins(model.brand)].map(escapeHtml).join(" ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${imageSources};">
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
${brandStyle(model.brand)}
</style>
</head>
<body>
${header(model)}
${sections.map(section).join("\n<hr>\n")}
${model.brand ? `<footer>${escapeHtml(model.brand.poweredBy)}</footer>` : ""}
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
