import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import {
  enterAsync,
  EntryError,
  isTrustedServer,
  MeetingEntry,
  MeetSummary,
  meetSummaryAsync,
  parseJoinLink,
  parseMeet,
  serverOrigin,
} from "./api";
import { meetPageUrl } from "./execution";
import { Manifest } from "./mirror";
import { RemotePerson } from "./presence";
import { LocalRunner } from "./localRunner";
import { MeetPanel } from "./meetPanel";
import { PanelButton, PanelModel } from "./panel";
import { MeetRuns } from "./runs";
import { MeetPlace, MeetSession, SessionState } from "./session";

/** What the extension remembers of a meet folder, so the window that opens it joins again. */
interface StoredMeet {
  place: MeetPlace;
  manifest: Manifest;
}

const MEETS_KEY = "rallybeam.meets";

let session: MeetSession | undefined;
let statusBar: vscode.StatusBarItem;
let output: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext;
let panel: MeetPanel;
let sessionState: SessionState = "connecting";
let summary: MeetSummary | undefined;

const WELCOMED_KEY = "rallybeam.welcomed";

export const activate = (context: vscode.ExtensionContext) => {
  extensionContext = context;
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "rallybeam.menu";
  output = vscode.window.createOutputChannel("Rallybeam");
  panel = new MeetPanel(panelModel);
  context.subscriptions.push(
    statusBar,
    output,
    { dispose: () => session?.dispose() },
    vscode.commands.registerCommand("rallybeam.join", () => joinByCodeAsync(context)),
    vscode.commands.registerCommand("rallybeam.leave", () => leaveAsync(context)),
    vscode.commands.registerCommand("rallybeam.goToCursor", goToCursorAsync),
    vscode.commands.registerCommand("rallybeam.setUpPackages", setUpPackagesAsync),
    vscode.commands.registerCommand("rallybeam.runLocal", () => withLocalAsync((local) => local.runAsync())),
    vscode.commands.registerCommand("rallybeam.testLocal", () => withLocalAsync((local) => local.testAsync())),
    vscode.commands.registerCommand("rallybeam.run", () => withRunsAsync((runs) => runs.runAsync())),
    vscode.commands.registerCommand("rallybeam.runTests", () => withRunsAsync((runs) => runs.runTestsAsync())),
    vscode.commands.registerCommand("rallybeam.stopRun", () => withRunsAsync((runs) => runs.stopRunAsync())),
    vscode.commands.registerCommand("rallybeam.restartApp", () => withRunsAsync((runs) => runs.restartAppAsync())),
    vscode.commands.registerCommand("rallybeam.openMeet", openMeetAsync),
    vscode.commands.registerCommand("rallybeam.useHere", () => resumeAsync(context)),
    vscode.commands.registerCommand("rallybeam.menu", () => showMenuAsync(context)),
    vscode.window.registerUriHandler({ handleUri: (uri) => joinByLinkAsync(context, uri) }),
    vscode.window.registerWebviewViewProvider("rallybeam.meet", panel),
  );
  setContext("rallybeam.inMeet", false);
  void resumeAsync(context);
};

export const deactivate = () => {
  session?.dispose();
};

// Open in VS Code, from the meet's code canvas.
const joinByLinkAsync = async (context: vscode.ExtensionContext, uri: vscode.Uri) => {
  const link = parseJoinLink(uri.path, uri.query);
  if (!link) {
    return;
  }
  const server = link.server ?? configuredServer();
  if (!isTrustedServer(server, configuredServer())) {
    void vscode.window.showErrorMessage(vscode.l10n.t("This link is not from a Rallybeam server: {0}", server));
    return;
  }
  await enterAndOpenAsync(context, serverOrigin(server), link.code, { ticket: link.ticket });
};

// The meet's code (or its link) and the code from the invitation, typed here.
const joinByCodeAsync = async (context: vscode.ExtensionContext) => {
  const typed = await vscode.window.showInputBox({
    title: vscode.l10n.t("Join a Rallybeam meet"),
    prompt: vscode.l10n.t("The meet's link or code"),
    placeHolder: "https://app.rallybeam.com/abcd1234",
    ignoreFocusOut: true,
  });
  if (!typed?.trim()) {
    return;
  }
  const meet = parseMeet(typed.trim(), configuredServer());
  if (!meet) {
    void vscode.window.showErrorMessage(vscode.l10n.t("That is not a Rallybeam meet's link or code."));
    return;
  }
  const passcode = await vscode.window.showInputBox({
    title: vscode.l10n.t("Join a Rallybeam meet"),
    prompt: vscode.l10n.t("The code from your invitation"),
    password: true,
    ignoreFocusOut: true,
  });
  if (!passcode?.trim()) {
    return;
  }
  await enterAndOpenAsync(context, meet.server, meet.code, { passcode: passcode.trim() });
};

const enterAndOpenAsync = async (
  context: vscode.ExtensionContext,
  server: string,
  code: string,
  credential: { ticket: string } | { passcode: string },
) => {
  let entry: MeetingEntry;
  try {
    entry = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Joining the meet…") },
      () => enterAsync(server, code, credential),
    );
  } catch (error) {
    void vscode.window.showErrorMessage(entryErrorText(error));
    return;
  }

  // The meet's own folder, opened as this window's workspace or in a new window.
  const folder = vscode.Uri.file(path.join(baseFolder(), entry.code));
  await vscode.workspace.fs.createDirectory(folder);
  const meets = storedMeets(context);
  const previous = meets[folder.fsPath];
  meets[folder.fsPath] = {
    place: { server, code: entry.code, participant: entry.participant },
    manifest: previous?.place.code === entry.code ? previous.manifest : {},
  };
  await context.globalState.update(MEETS_KEY, meets);
  await context.secrets.store(tokenKey(folder), entry.token);

  if (isOpenHere(folder)) {
    await resumeAsync(context);
  } else {
    const hasFolder = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    await vscode.commands.executeCommand("vscode.openFolder", folder, { forceNewWindow: hasFolder });
  }
};

// The window that has a meet's folder open joins it again, as after Open in VS Code reloads the window.
const resumeAsync = async (context: vscode.ExtensionContext) => {
  const folder = vscode.workspace.workspaceFolders?.map((p) => p.uri).find((p) => storedMeets(context)[p.fsPath]);
  const stored = folder ? storedMeets(context)[folder.fsPath] : undefined;
  const token = folder ? await context.secrets.get(tokenKey(folder)) : undefined;
  if (!folder || !stored || !token) {
    return;
  }

  session?.dispose();
  summary = undefined;
  const saveManifest = (manifest: Manifest) => {
    const meets = storedMeets(context);
    if (meets[folder.fsPath]) {
      meets[folder.fsPath] = { ...meets[folder.fsPath], manifest };
      void context.globalState.update(MEETS_KEY, meets);
    }
  };
  session = new MeetSession(
    stored.place,
    token,
    folder,
    stored.manifest,
    saveManifest,
    (state) => showState(stored.place, state),
    output,
  );
  showState(stored.place, "connecting");
  const current = session;
  void meetSummaryAsync(stored.place.server, stored.place.code).then((found) => {
    if (session === current) {
      summary = found;
      panel.refresh();
    }
  });
  try {
    await session.startAsync();
  } catch (error) {
    showState(stored.place, "offline");
    void vscode.window.showErrorMessage(
      vscode.l10n.t("Rallybeam could not reach the meet: {0}", error instanceof Error ? error.message : String(error)),
    );
  }
};

// Like clicking someone's dot beside the files on the web.
const goToCursorAsync = async () => {
  if (!session?.people) {
    void vscode.window.showInformationMessage(vscode.l10n.t("You are not in a Rallybeam meet in this window."));
    return;
  }
  await session.people.goToAsync();
};

// The meet's page, where the call, the task and the phone are.
const openMeetAsync = async () => {
  if (!session) {
    void vscode.window.showInformationMessage(vscode.l10n.t("You are not in a Rallybeam meet in this window."));
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(meetPageUrl(session.place.server, session.place.code)));
};

// Run and Run tests on this computer, once the code is here.
const withLocalAsync = async (act: (local: LocalRunner) => Promise<void>) => {
  if (!session) {
    void vscode.window.showInformationMessage(vscode.l10n.t("You are not in a Rallybeam meet in this window."));
  } else if (!session.local) {
    void vscode.window.showInformationMessage(vscode.l10n.t("The code runs once the interviewer opens the workspace."));
  } else {
    await act(session.local);
  }
};

// Run in Rallybeam and the other run commands, once the lobby is over.
const withRunsAsync = async (act: (runs: MeetRuns) => Promise<void>) => {
  if (!session) {
    void vscode.window.showInformationMessage(vscode.l10n.t("You are not in a Rallybeam meet in this window."));
  } else if (!session.runs) {
    void vscode.window.showInformationMessage(vscode.l10n.t("The code runs once the interviewer opens the workspace."));
  } else {
    await act(session.runs);
  }
};

// The project type's packages for the editor, for a candidate who said Not now.
const setUpPackagesAsync = async () => {
  if (!session?.packages) {
    void vscode.window.showInformationMessage(vscode.l10n.t("You are not in a Rallybeam meet in this window."));
    return;
  }
  await session.packages.setUpAsync();
};

// The status bar's menu, in the panel's order: the runs in Rallybeam, those on this computer with the packages they
// need, then everyone's cursor and leaving.
const showMenuAsync = async (context: vscode.ExtensionContext) => {
  if (!session) {
    await vscode.commands.executeCommand("rallybeam.join");
    return;
  }
  const people = session.people;
  type MenuItem = vscode.QuickPickItem & { person?: RemotePerson };
  const setUp: MenuItem = { label: vscode.l10n.t("$(package) Set up packages for your editor") };
  const runs = session.runs;
  const local = session.local;
  const runLocal: MenuItem = { label: vscode.l10n.t("$(play) Run"), description: vscode.l10n.t("on your computer") };
  const testLocal: MenuItem = { label: vscode.l10n.t("$(beaker) Run tests"), description: vscode.l10n.t("on your computer") };
  const run: MenuItem = {
    label: runs?.isApp ? vscode.l10n.t("$(open-preview) Show the app in Rallybeam") : vscode.l10n.t("$(play) Run in Rallybeam"),
    description: vscode.l10n.t("everyone in the meet sees it"),
  };
  const runTests: MenuItem = { label: vscode.l10n.t("$(beaker) Run tests in Rallybeam"), description: vscode.l10n.t("everyone in the meet sees it") };
  const leave: MenuItem = { label: vscode.l10n.t("$(sign-out) Leave meet") };
  const separator: MenuItem = { label: "", kind: vscode.QuickPickItemKind.Separator };
  const groups: MenuItem[][] = [
    runs?.canRun ? [run, runTests] : [],
    [...(local?.canRun ? [runLocal, testLocal] : []), ...(session.packages?.isMissing ? [setUp] : [])],
    [...(people ? people.pickItems(people.here()) : []), leave],
  ];
  const items = groups.filter((p) => p.length > 0).flatMap((p, index) => (index === 0 ? p : [separator, ...p]));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: vscode.l10n.t("Meet {0}", session.place.code) });
  if (picked === runLocal) {
    await local?.runAsync();
  } else if (picked === testLocal) {
    await local?.testAsync();
  } else if (picked === run) {
    await runs?.runAsync();
  } else if (picked === runTests) {
    await runs?.runTestsAsync();
  } else if (picked === setUp) {
    await setUpPackagesAsync();
  } else if (picked === leave) {
    await leaveAsync(context);
  } else if (picked?.person) {
    await people?.goToAsync(picked.person);
  }
};

const leaveAsync = async (context: vscode.ExtensionContext) => {
  if (!session) {
    void vscode.commands.executeCommand("rallybeam.join");
    return;
  }
  const leave = vscode.l10n.t("Leave meet");
  const answer = await vscode.window.showInformationMessage(
    vscode.l10n.t("Leave meet {0}? The folder and its files stay.", session.place.code),
    { modal: true },
    leave,
  );
  if (answer !== leave) {
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.map((p) => p.uri).find((p) => storedMeets(context)[p.fsPath]);
  session.dispose();
  session = undefined;
  statusBar.hide();
  setContext("rallybeam.inMeet", false);
  setContext("rallybeam.canRun", false);
  setContext("rallybeam.canRunLocally", false);
  summary = undefined;
  panel.refresh();
  if (folder) {
    const meets = storedMeets(context);
    delete meets[folder.fsPath];
    await context.globalState.update(MEETS_KEY, meets);
    await context.secrets.delete(tokenKey(folder));
  }
};

const showState = (place: MeetPlace, state: SessionState) => {
  const texts: Record<SessionState, string> = {
    connecting: vscode.l10n.t("$(sync~spin) Rallybeam {0}: connecting", place.code),
    lobby: vscode.l10n.t("$(clock) Rallybeam {0}: waiting for the interviewer to open the workspace", place.code),
    syncing: vscode.l10n.t("$(sync~spin) Rallybeam {0}: getting the code", place.code),
    live: vscode.l10n.t("$(broadcast) Rallybeam {0}", place.code),
    offline: vscode.l10n.t("$(debug-disconnect) Rallybeam {0}: reconnecting", place.code),
    moved: vscode.l10n.t("$(debug-disconnect) Rallybeam {0}: open in another VS Code window", place.code),
    ended: vscode.l10n.t("$(circle-slash) Rallybeam {0}: the meet has ended", place.code),
  };
  statusBar.text =
    state === "live" && session?.packages?.isMissing
      ? vscode.l10n.t("$(warning) Rallybeam {0}: set up your editor", place.code)
      : texts[state];
  // A meet that moved to another window or ended runs nothing here.
  const isOpen = state !== "moved" && state !== "ended";
  setContext("rallybeam.inMeet", true);
  setContext("rallybeam.canRun", isOpen && Boolean(session?.runs?.canRun));
  setContext("rallybeam.canRunLocally", isOpen && Boolean(session?.local?.canRun));
  setContext("rallybeam.isApp", isOpen && Boolean(session?.runs?.isApp));
  setContext("rallybeam.packagesMissing", isOpen && Boolean(session?.packages?.isMissing));
  if (state === "live") {
    void welcomeAsync(place);
  }
  statusBar.tooltip = vscode.l10n.t("In meet {0} as {1}. Click to run the code, go to someone's cursor, or leave.", place.code, place.participant.displayName);
  statusBar.show();
  sessionState = state;
  panel.refresh();
  if (state === "ended") {
    void vscode.window.showInformationMessage(vscode.l10n.t("The meet has ended. Your files stay in this folder."));
  } else if (state === "moved") {
    void offerUseHereAsync();
  }
};

// The Rallybeam panel: the meet on top, then the runs everyone sees, the runs on this computer, and the rest.
const panelModel = (): PanelModel => {
  if (!session) {
    return {
      heading: vscode.l10n.t("Rallybeam"),
      detail: vscode.l10n.t(
        "You are not in a meet. Click Open in VS Code in a meet's code canvas, or join with the meet's code and the code from your invitation.",
      ),
      sections: [{ buttons: [{ command: "rallybeam.join", label: vscode.l10n.t("Join meet"), icon: "signIn", isPrimary: true }] }],
    };
  }
  const { runs, local, packages, people } = session;
  const code = session.place.code;
  const statuses: Record<SessionState, string | undefined> = {
    connecting: vscode.l10n.t("Connecting to the meet…"),
    lobby: vscode.l10n.t("Waiting for the interviewer to open the workspace."),
    syncing: vscode.l10n.t("Getting the code…"),
    live: undefined,
    offline: vscode.l10n.t("Reconnecting…"),
    moved: vscode.l10n.t("This meet is open in another VS Code window now."),
    ended: vscode.l10n.t("The meet has ended. Your files stay in this folder."),
  };
  const isOpen = sessionState !== "moved" && sessionState !== "ended";
  const inRallybeam: PanelButton[] = [];
  if (isOpen && runs?.canRun) {
    inRallybeam.push(
      runs.isApp
        ? { command: "rallybeam.run", label: vscode.l10n.t("Show the app"), icon: "preview", isPrimary: true }
        : { command: "rallybeam.run", label: vscode.l10n.t("Run"), icon: "play", isPrimary: true },
      { command: "rallybeam.runTests", label: vscode.l10n.t("Run tests"), icon: "beaker", isPrimary: true },
    );
    if (runs.isApp) {
      inRallybeam.push({ command: "rallybeam.restartApp", label: vscode.l10n.t("Restart the app"), icon: "restart" });
    }
  }
  const onComputer: PanelButton[] = [];
  if (isOpen && local?.canRun) {
    onComputer.push(
      { command: "rallybeam.runLocal", label: vscode.l10n.t("Run"), icon: "play" },
      { command: "rallybeam.testLocal", label: vscode.l10n.t("Run tests"), icon: "beaker" },
    );
  }
  if (isOpen && packages?.isMissing) {
    onComputer.push({ command: "rallybeam.setUpPackages", label: vscode.l10n.t("Set up packages"), icon: "package" });
  }
  const others: PanelButton[] = [{ command: "rallybeam.openMeet", label: vscode.l10n.t("Open the meet in your browser"), icon: "browser" }];
  if (isOpen && people) {
    others.push({ command: "rallybeam.goToCursor", label: vscode.l10n.t("Go to someone's cursor"), icon: "person" });
  }
  others.push({ command: "rallybeam.leave", label: vscode.l10n.t("Leave meet"), icon: "signOut" });
  return {
    company: summary?.companyName ?? undefined,
    heading: summary?.title ?? vscode.l10n.t("Meet {0}", code),
    detail: summary?.title ? vscode.l10n.t("Meet {0}", code) : undefined,
    status: statuses[sessionState],
    sections: [
      {
        buttons:
          sessionState === "moved"
            ? [{ command: "rallybeam.useHere", label: vscode.l10n.t("Use here"), icon: "signIn", isPrimary: true }]
            : [],
      },
      { heading: vscode.l10n.t("In Rallybeam"), note: vscode.l10n.t("Everyone in the meet sees these runs."), buttons: inRallybeam },
      {
        heading: vscode.l10n.t("On your computer"),
        note: packages?.isMissing
          ? vscode.l10n.t("Only you see these runs. They need the project type's packages.")
          : vscode.l10n.t("Only you see these runs."),
        buttons: onComputer,
      },
      { note: vscode.l10n.t("The call and the task stay on the meet's page in your browser."), buttons: others },
    ],
  };
};

// Like the web's Use here: this window takes the meet back from the other VS Code window, with its stored token.
const offerUseHereAsync = async () => {
  const useHere = vscode.l10n.t("Use here");
  const answer = await vscode.window.showInformationMessage(
    vscode.l10n.t("This meet is open in another VS Code window now. Use it here to continue in this one."),
    useHere,
  );
  if (answer === useHere) {
    await resumeAsync(extensionContext);
  }
};

const setContext = (key: string, value: boolean) => void vscode.commands.executeCommand("setContext", key, value);

// Once per meet: where its buttons are, and what stays in the browser.
const welcomeAsync = async (place: MeetPlace) => {
  const welcomed = extensionContext.globalState.get<string[]>(WELCOMED_KEY, []);
  if (welcomed.includes(place.code)) {
    return;
  }
  await extensionContext.globalState.update(WELCOMED_KEY, [...welcomed, place.code].slice(-50));
  const show = vscode.l10n.t("Show the Rallybeam panel");
  const answer = await vscode.window.showInformationMessage(
    vscode.l10n.t(
      "You are in meet {0}. Your edits reach the meet as you type. Run and test from the Rallybeam panel on the left, or with ▶ above the editor. The call and the task stay in your browser.",
      place.code,
    ),
    show,
  );
  if (answer === show) {
    void vscode.commands.executeCommand("workbench.view.extension.rallybeam");
  }
};

const entryErrorText = (error: unknown): string => {
  const reason = error instanceof EntryError ? error.reason : "network";
  switch (reason) {
    case "wrong_code":
      return vscode.l10n.t("That code does not open this meet. Check the code from your invitation.");
    case "ticket_expired":
      return vscode.l10n.t("The link has expired. Click Open in VS Code in the meet again.");
    case "code_locked":
      return vscode.l10n.t("Too many wrong codes. Wait a few minutes and try again.");
    case "meeting_ended":
      return vscode.l10n.t("The meet has ended.");
    case "not_found":
    case "http_404":
      return vscode.l10n.t("There is no meet with that code.");
    default:
      return vscode.l10n.t("Rallybeam could not be reached. Check your connection and try again.");
  }
};

const configuredServer = (): string =>
  vscode.workspace.getConfiguration("rallybeam").get<string>("server") || "https://app.rallybeam.com";

const baseFolder = (): string =>
  vscode.workspace.getConfiguration("rallybeam").get<string>("folder") || path.join(os.homedir(), "Rallybeam");

const storedMeets = (context: vscode.ExtensionContext): Record<string, StoredMeet> => ({
  ...context.globalState.get<Record<string, StoredMeet>>(MEETS_KEY, {}),
});

const tokenKey = (folder: vscode.Uri) => `rallybeam.token:${folder.fsPath}`;

const isOpenHere = (folder: vscode.Uri): boolean =>
  vscode.workspace.workspaceFolders?.some((p) => p.uri.fsPath === folder.fsPath) ?? false;
