import { spawn } from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";

import {
  canReplaceManifest,
  EditorPackages,
  editorPackagesFor,
  isMissingPackageError,
  missingPackages,
  SETUP_TSCONFIG_MARK,
  setupManifest,
  setupTsconfig,
} from "./environments";
import { CodeProject } from "./project";

const NODE_DOWNLOAD = "https://nodejs.org/";

/**
 * The packages a JavaScript project type brings in the sandbox, installed for the editor in the folder above the meet's
 * (environments.ts), only when the candidate agrees. A "Not now" is never final: the status bar shows the setup as
 * missing, the offer comes back once when VS Code shows errors those packages would fix, on the next join, and from
 * the command Set up packages for this project.
 */
export class PackageSetup implements vscode.Disposable {
  /** Whether the type in front has packages and they are not installed. */
  public isMissing = false;

  private readonly root: string;

  private readonly disposables: vscode.Disposable[] = [];

  private checkedType: string | undefined;

  private isOffering = false;

  private isInstalling = false;

  // After a "Not now" the offer comes back once, when VS Code shows an error those packages would fix.
  private canOfferOnError = false;

  private isDisposed = false;

  constructor(
    private readonly folder: vscode.Uri,
    private readonly project: CodeProject,
    private readonly output: vscode.OutputChannel,
    private readonly onChanged: () => void,
  ) {
    this.root = path.dirname(folder.fsPath);
  }

  public start = () => {
    this.disposables.push(
      { dispose: this.project.onShapeChanged(() => void this.onTypeChangedAsync()) },
      vscode.languages.onDidChangeDiagnostics(this.onDiagnostics),
    );
    void this.onTypeChangedAsync();
  };

  public dispose = () => {
    this.isDisposed = true;
    this.disposables.forEach((p) => p.dispose());
  };

  /** The command and the status bar's menu: installs the type's packages, or says why it cannot. */
  public setUpAsync = async () => {
    const setup = editorPackagesFor(this.project.language);
    if (!setup) {
      void vscode.window.showInformationMessage(vscode.l10n.t("This meet's project type needs no packages for your editor."));
      return;
    }
    if (!(await this.isMissingAsync(setup))) {
      void vscode.window.showInformationMessage(vscode.l10n.t("{0}'s packages are already installed for your editor.", setup.name));
      return;
    }
    await this.installAsync(setup);
  };

  private onTypeChangedAsync = async () => {
    const type = this.project.language;
    if (type === this.checkedType) {
      return;
    }
    this.checkedType = type;
    const setup = editorPackagesFor(type);
    this.setMissing(setup ? await this.isMissingAsync(setup) : false);
    if (setup && this.isMissing) {
      await this.offerAsync(
        setup,
        vscode.l10n.t(
          "This {0} project needs {0}'s packages so VS Code understands its code. Install them into {1}? It takes a minute and needs Node.js; the meet's files do not change.",
          setup.name,
          this.root,
        ),
      );
    }
  };

  private onDiagnostics = (event: vscode.DiagnosticChangeEvent) => {
    const setup = editorPackagesFor(this.project.language);
    if (!setup || !this.isMissing || !this.canOfferOnError || this.isOffering || this.isInstalling) {
      return;
    }
    const inFolder = event.uris.filter((p) => p.fsPath.startsWith(this.folder.fsPath + path.sep));
    const isCaused = inFolder.some((uri) =>
      vscode.languages.getDiagnostics(uri).some((p) => isMissingPackageError(setup, codeOf(p), p.message)),
    );
    if (isCaused) {
      this.canOfferOnError = false;
      void this.offerAsync(
        setup,
        vscode.l10n.t("VS Code shows these errors because {0}'s packages are not installed for your editor. Install them now?", setup.name),
      );
    }
  };

  private offerAsync = async (setup: EditorPackages, question: string) => {
    if (this.isOffering) {
      return;
    }
    this.isOffering = true;
    const install = vscode.l10n.t("Install");
    const answer = await vscode.window.showInformationMessage(question, install, vscode.l10n.t("Not now"));
    this.isOffering = false;
    if (answer === install) {
      await this.installAsync(setup);
    } else {
      this.canOfferOnError = true;
    }
  };

  private installAsync = async (setup: EditorPackages) => {
    if (this.isInstalling || this.isDisposed) {
      return;
    }
    const manifest = vscode.Uri.file(path.join(this.root, "package.json"));
    if (!canReplaceManifest(await readText(manifest))) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t(
          "{0} already has a package.json of its own, so Rallybeam does not install packages there. Set rallybeam.folder to a folder of its own to get them.",
          this.root,
        ),
      );
      return;
    }
    if (!(await runsAsync("npm", ["--version"], this.root))) {
      const download = vscode.l10n.t("Get Node.js");
      const answer = await vscode.window.showWarningMessage(
        vscode.l10n.t("Installing {0}'s packages needs Node.js, which this computer does not have. Run and Run tests on Rallybeam work without it.", setup.name),
        download,
      );
      if (answer === download) {
        void vscode.env.openExternal(vscode.Uri.parse(NODE_DOWNLOAD));
      }
      return;
    }

    this.isInstalling = true;
    try {
      await vscode.workspace.fs.writeFile(manifest, new TextEncoder().encode(setupManifest(setup)));
      const tsconfig = vscode.Uri.file(path.join(this.root, "tsconfig.json"));
      const existing = await readText(tsconfig);
      if (existing === undefined || existing.startsWith(SETUP_TSCONFIG_MARK)) {
        await vscode.workspace.fs.writeFile(tsconfig, new TextEncoder().encode(setupTsconfig(setup)));
      }

      const isDone = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: vscode.l10n.t("Installing {0}'s packages for your editor…", setup.name),
          cancellable: true,
        },
        (_progress, cancellation) =>
          // No package's install scripts run: the editor needs the packages' files, not what they would build.
          runsAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], this.root, this.output, cancellation),
      );
      this.setMissing(await this.isMissingAsync(setup));
      if (isDone && !this.isMissing) {
        void vscode.commands.executeCommand("typescript.restartTsServer").then(undefined, () => undefined);
        void vscode.window.showInformationMessage(vscode.l10n.t("{0}'s packages are installed for your editor.", setup.name));
      } else {
        this.canOfferOnError = true;
        const show = vscode.l10n.t("Show output");
        const answer = await vscode.window.showWarningMessage(
          vscode.l10n.t("{0}'s packages were not installed. Run and Run tests on Rallybeam still work.", setup.name),
          show,
        );
        if (answer === show) {
          this.output.show();
        }
      }
    } finally {
      this.isInstalling = false;
    }
  };

  private isMissingAsync = async (setup: EditorPackages): Promise<boolean> => {
    const installed: Record<string, string | undefined> = {};
    await Promise.all(
      Object.keys(setup.packages).map(async (name) => {
        const text = await readText(vscode.Uri.file(path.join(this.root, "node_modules", ...name.split("/"), "package.json")));
        try {
          installed[name] = text === undefined ? undefined : (JSON.parse(text) as { version?: string }).version;
        } catch {
          installed[name] = undefined;
        }
      }),
    );
    return missingPackages(setup, (name) => installed[name]).length > 0;
  };

  private setMissing = (isMissing: boolean) => {
    if (this.isMissing !== isMissing && !this.isDisposed) {
      this.isMissing = isMissing;
      this.onChanged();
    }
  };
}

const codeOf = (diagnostic: vscode.Diagnostic): number | undefined => {
  const code = typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code;
  return typeof code === "number" ? code : Number(code) || undefined;
};

const readText = async (uri: vscode.Uri): Promise<string | undefined> => {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
};

// Runs a command to its end; true when it exits with 0. On Windows npm is a .cmd script, which needs the shell; the
// arguments are this file's own, never typed or received.
const runsAsync = (
  command: string,
  args: string[],
  cwd: string,
  output?: vscode.OutputChannel,
  cancellation?: vscode.CancellationToken,
): Promise<boolean> =>
  new Promise((resolve) => {
    output?.appendLine(`$ ${command} ${args.join(" ")}   (in ${cwd})`);
    const child = spawn(command, args, { cwd, shell: process.platform === "win32", windowsHide: true });
    child.stdout.on("data", (data: Buffer) => output?.append(data.toString()));
    child.stderr.on("data", (data: Buffer) => output?.append(data.toString()));
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    cancellation?.onCancellationRequested(() => {
      if (process.platform === "win32" && child.pid !== undefined) {
        // The shell's child, npm, goes with it only when the whole tree is ended.
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      } else {
        child.kill();
      }
    });
  });
