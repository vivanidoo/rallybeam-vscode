# Rallybeam for VS Code

Code in your own editor during a [Rallybeam](https://app.rallybeam.com) meet. The meet's code opens as a folder on
your disk and stays live with the meet: what you type reaches the others as you type, what they type appears in your
files, and everyone's cursor shows with their name.

Works in VS Code and in the editors built on it that install VS Code extensions, such as Cursor, Windsurf and
VSCodium.

## Joining

- **From the meet:** in the code canvas, click **Open in VS Code** (or pick another editor from its menu). The link
  carries a ticket that lasts two minutes; the extension exchanges it for your place in the meet.
- **From the editor:** run **Rallybeam: Join meet** from the command palette, and give the meet's link or code and
  the code from your invitation.

When the meet starts with a conversation, the status bar says it is waiting for the interviewer to open the
workspace, and the code arrives when they do. Click the status bar to go to someone's cursor or to leave the meet.

## Who is where

- The others' cursors and selections show in your open files in their colours, with their names.
- A file someone has open shows their initial and colour in the explorer; hover it for their names.
- **Rallybeam: Go to someone's cursor** opens their file at their cursor.

## The folder

Each meet gets its own folder, `~/Rallybeam/<meet code>` (setting `rallybeam.folder`). It stays after the meet.

- Creating, renaming or deleting files in VS Code changes the meet's project. Files that tools create, such as
  `bin/`, `obj/`, `node_modules/` or build output, stay on your machine.
- A meet file changed on disk by a tool, such as a formatter or `git checkout`, sends its new text. A meet file
  removed from the terminal comes back.
- The folder's `.vscode/settings.json` turns on auto save and LF line endings, so the disk follows the meet.
- VS Code's undo also takes back changes that arrived from others.
- What you run in your terminal stays on your machine. **Run in Rallybeam** (below) runs the shared code for everyone.

## Running the code

Everything is in the **Rallybeam** panel, the icon in VS Code's left bar, and in the menu of the status bar's
"Rallybeam" item. The editor's title bar has ▶ and the beaker too.

**On your computer:** **Run** and **Run tests** run the code here, in VS Code's terminal, as any project does: a
program prints its output, an app's dev server starts and its page opens in VS Code's browser panel (it reloads as
you type), Expo shows a QR code for the Expo Go app on your phone. They need the project type's packages (below),
and Node.js. Nobody else in the meet sees these runs.

**In Rallybeam:** **Run in Rallybeam** and **Run tests in Rallybeam** run the meet's code in its sandbox, as the web's
**Run** does, so the interviewer sees every run you start and you see theirs:

- A program's output and the tests' results show in the **Rallybeam runs** terminal. **Rallybeam: Stop my run**
  stops yours.
- An app opens the sandbox's preview in VS Code's browser panel. The dev server's log is in the **Rallybeam app**
  terminal; **Rallybeam: Restart the app** restarts it. When you join, an app that already runs in the meet opens
  its preview beside the code by itself, once; joining never starts it.
- A phone app (Expo, React Native, Kotlin Android) runs on the meet's phone, which shows on the meet's page in your
  browser.

JavaScript and TypeScript types run on your computer: React, Vue, Svelte, Solid, HTML, Next.js, Nuxt, React Router,
Angular, Node.js, TypeScript and Expo. The others (Python, Java, C# and the rest, and React Native) run in Rallybeam.

## What it does on your computer

The extension is open source so that you can check this yourself. It:

- **Writes files only in the meet's folder**: the meet's files, and `.vscode/settings.json` there. If you agree to
  set up a JavaScript project's packages, also `package.json`, `tsconfig.json`, `node_modules` and the run settings
  (`.rallybeam`) in the folder above it (below). Running an Expo project adds a `metro.config.js` in the meet's folder
  when it has none; it stays on your computer.
- **Connects only to Rallybeam**: to `app.rallybeam.com` (or another `rallybeam.com` server named in a meet's link),
  or to the server you set in `rallybeam.server`. A link that names any other server is refused.
- **Sends** the meet's files and your changes to them, the file you have open and your cursor in it, and your name
  and colour in the meet. It reads no other files.
- **Keeps** the meet's token in VS Code's secret storage, to join again when the folder reopens.
- **Runs nothing without asking**: it runs the meet's code only when you click **Run** or **Run tests**, and
  installs a project's packages (`npm install --ignore-scripts`) only when you click **Install** (below).
- **Collects no telemetry.**

## Packages for your editor

Rallybeam's sandbox brings each JavaScript project type's packages (React, Vue, Vitest and the others), so a meet's
`package.json` names only what you add yourself, and `npm install` in the meet's folder installs nothing. Without
them VS Code shows errors such as "Cannot find module 'react'", although **Run** and **Run tests** on Rallybeam work.

So when you join such a meet, the extension offers to install them. With **Install** it writes a `package.json` and
a `tsconfig.json` in the folder above the meet's (`~/Rallybeam`) and runs `npm install --ignore-scripts` there; Node
and TypeScript find packages in the folders above a project, as they do in the sandbox. The meet's own files do not
change. It needs Node.js, and holds one type's packages at a time: joining a meet of another type offers that type's.

With **Not now** nothing is installed. The status bar then shows "set up your editor", which opens the offer again,
as do the command **Rallybeam: Set up packages for this project**, the first errors those packages would fix, and
the next join. If `rallybeam.folder` points at a folder with a `package.json` of its own, the extension leaves it
alone.

VS Code asks whether you trust the authors of a new folder. The extension works either way, also in Restricted Mode.

## Development

```bash
npm install
npm run check
```

`check` type-checks, runs the tests (Vitest) and bundles `dist/extension.js` with esbuild. Press F5 to start an
Extension Development Host; set `rallybeam.server` to a local Rallybeam API to try it against your own server.

```bash
npm run package
```

builds `rallybeam-<version>.vsix`, which **Extensions: Install from VSIX…** installs. Releases are built and
published by the **Release** workflow, to the VS Code Marketplace and to Open VSX.

## Licence

[MIT](LICENSE). The bundled packages' licences are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The Rallybeam name and logo belong to Vivani. The licence covers the code, not the name or the logo, so a fork must
not present itself as Rallybeam.
