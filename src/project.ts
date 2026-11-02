import * as Y from "yjs";

/**
 * The meet's shared code project, read and changed the way the web editor does: every file is a `Y.Map { path, text, language, seed, hidden }` under its id in
 * `Y.Map('files')`, and `Y.Map('meta')` holds the project type in front as `language`. Each type keeps its own files;
 * a file without a language belongs to the type in front.
 */

/** The type a project without one shows, as on the web. */
export const DEFAULT_LANGUAGE = "typescript";

/** The most files a type's project holds. */
export const MAX_FILES = 100;

/** The most parts a path has, its folders and its file name. */
export const MAX_PARTS = 8;

const PART = /^[A-Za-z0-9_.-]{1,100}$/;

/** Why a path cannot be used: it breaks the rules, another file has it, it is also a folder, or the project is full. */
export type PathProblem = "invalid" | "taken" | "folder" | "full";

/** One file of the type in front. */
export interface ProjectFile {
  id: string;
  path: string;
  text: Y.Text;
  isHidden: boolean;
}

type FileMap = Y.Map<string | boolean | Y.Text>;

/** Whether a path follows the web editor's rules: parts of letters, digits, `_`, `.` and `-`, never `.` or `..`. */
export const isValidPath = (path: string): boolean => {
  const parts = path.split("/");
  return parts.length <= MAX_PARTS && parts.every((part) => part !== "." && part !== ".." && PART.test(part));
};

/** Whether a path lies inside the folder, at any depth, ignoring case. */
export const isInFolder = (path: string, folder: string): boolean =>
  path.toLowerCase().startsWith(`${folder.toLowerCase()}/`);

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export class CodeProject {
  public readonly files: Y.Map<FileMap>;

  public readonly meta: Y.Map<string>;

  constructor(
    public readonly ydoc: Y.Doc,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {
    this.files = ydoc.getMap<FileMap>("files");
    this.meta = ydoc.getMap<string>("meta");
  }

  /** The project type in front. */
  public get language(): string {
    return this.meta.get("language") ?? DEFAULT_LANGUAGE;
  }

  /** Every file of the type in front, hidden ones too, by path ignoring case. */
  public filesInFront = (): ProjectFile[] => {
    const language = this.language;
    const files: ProjectFile[] = [];
    this.files.forEach((file, id) => {
      const path = file.get("path");
      const text = file.get("text");
      const own = file.get("language");
      if (typeof path === "string" && text instanceof Y.Text && (typeof own === "string" ? own : language) === language) {
        files.push({ id, path, text, isHidden: file.get("hidden") === true });
      }
    });
    return files.sort((a, b) => compare(a.path.toLowerCase(), b.path.toLowerCase()) || compare(a.id, b.id));
  };

  /**
   * The files the editor's folder holds: those of the type in front, never a hidden one, and of
   * two files with one path only the first.
   */
  public mirroredFiles = (): ProjectFile[] => {
    const files: ProjectFile[] = [];
    for (const file of this.filesInFront()) {
      const previous = files[files.length - 1];
      if (!file.isHidden && previous?.path.toLowerCase() !== file.path.toLowerCase()) {
        files.push(file);
      }
    }
    return files;
  };

  /** A file of the type in front by its id. */
  public fileOf = (id: string): ProjectFile | undefined => this.filesInFront().find((p) => p.id === id);

  /** Why a path cannot be used for a new file or a rename, or undefined when it can; the type's own rules. */
  public checkPath = (path: string, exceptId?: string): PathProblem | undefined => {
    if (!isValidPath(path)) {
      return "invalid";
    }

    const others = this.filesInFront().filter((p) => p.id !== exceptId);
    const lower = path.toLowerCase();
    if (others.some((p) => p.path.toLowerCase() === lower)) {
      return "taken";
    }
    if (others.some((p) => isInFolder(p.path, path) || isInFolder(path, p.path))) {
      return "folder";
    }
    if (exceptId === undefined && others.length >= MAX_FILES) {
      return "full";
    }
    return undefined;
  };

  /** Adds a file of the type in front; returns its id, or why it could not. */
  public createFile = (path: string, text: string, origin?: unknown): { id?: string; problem?: PathProblem } => {
    const problem = this.checkPath(path);
    if (problem) {
      return { problem };
    }

    const id = this.createId();
    const file = new Y.Map<string | boolean | Y.Text>([
      ["path", path],
      ["text", new Y.Text(text)],
      ["language", this.language],
    ]);
    this.ydoc.transact(() => this.files.set(id, file), origin);
    return { id };
  };

  /** Moves a file to a new path; returns why it could not, if so. */
  public renameFile = (id: string, path: string, origin?: unknown): PathProblem | undefined => {
    const problem = this.checkPath(path, id);
    if (problem) {
      return problem;
    }

    this.ydoc.transact(() => this.files.get(id)?.set("path", path), origin);
    return undefined;
  };

  public deleteFile = (id: string, origin?: unknown) => {
    this.ydoc.transact(() => this.files.delete(id), origin);
  };

  /**
   * Calls back when files come, go or move, or the type in front changes; not on typing, which each file's text tells.
   *
   * @returns Stops listening.
   */
  public onShapeChanged = (listener: () => void): (() => void) => {
    const onFiles = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>) => {
      if (events.some((p) => !(p.target instanceof Y.Text))) {
        listener();
      }
    };
    this.files.observeDeep(onFiles);
    this.meta.observe(listener);
    return () => {
      this.files.unobserveDeep(onFiles);
      this.meta.unobserve(listener);
    };
  };
}
