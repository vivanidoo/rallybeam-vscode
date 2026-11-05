/**
 * How the meet's folder looks when it opens: the task in front, not Rallybeam's own settings. The `.vscode` folder holds
 * only the settings Rallybeam writes, and is never shared with the meet, so the Explorer hides it.
 */
const SETTINGS_FOLDER = ".vscode";

/**
 * The meet folder's `files.exclude` with `.vscode` hidden, next to the rules the candidate set there; undefined when
 * nothing changes. A rule the candidate set for `.vscode` themselves, even `false`, is kept.
 */
export const withSettingsHidden = (
  existing: Readonly<Record<string, boolean>> | undefined,
): Record<string, boolean> | undefined =>
  existing && SETTINGS_FOLDER in existing ? undefined : { ...existing, [SETTINGS_FOLDER]: true };

/**
 * Whether one of the open tabs shows a file in the folder, as when VS Code brings back the editors of a folder it
 * reopens; then joining leaves them as they are.
 */
export const hasOpenFileIn = (tabUris: readonly string[], folderUri: string): boolean => {
  const prefix = folderUri.endsWith("/") ? folderUri : `${folderUri}/`;
  return tabUris.some((p) => p.startsWith(prefix));
};
