import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

/**
 * Presence in the code document, in the awareness fields the web editor uses: `user`
 * `{ name, color, client }`, `fileId` for the file in front, and `selection` `{ anchor, head }` as Yjs relative
 * positions, as y-monaco writes them.
 */

/** The participant colours, in the web editor's order. */
export const PARTICIPANT_COLORS = ["#2563EB", "#DB2777", "#16A34A", "#EA580C", "#7C3AED", "#0891B2", "#CA8A04", "#DC2626"];

export const participantColor = (index: number): string =>
  PARTICIPANT_COLORS[((index % PARTICIPANT_COLORS.length) + PARTICIPANT_COLORS.length) % PARTICIPANT_COLORS.length];

/** The value of `user.client` that marks someone coding in VS Code or an editor built on it. */
export const VSCODE_CLIENT = "vscode";

export interface PresenceUser {
  name: string;
  color: string;
  client?: string;
}

/** Someone else's cursor in one file, as offsets in its text. */
export interface RemoteCursor {
  clientId: number;
  user: PresenceUser;
  anchor: number;
  head: number;
}

/** Tells the others this person's file in front and selection in it, by offsets in the file's text. */
export const setLocalSelection = (awareness: Awareness, fileId: string, text: Y.Text, anchor: number, head: number) => {
  awareness.setLocalStateField("fileId", fileId);
  awareness.setLocalStateField("selection", {
    anchor: Y.createRelativePositionFromTypeIndex(text, anchor),
    head: Y.createRelativePositionFromTypeIndex(text, head),
  });
};

interface RemoteState {
  user?: PresenceUser;
  fileId?: string | null;
  selection?: { anchor?: Y.RelativePosition; head?: Y.RelativePosition } | null;
}

/** Everyone else's cursor in one file: those who have it in front and whose selection is in its text. */
export const remoteCursorsIn = (awareness: Awareness, fileId: string, text: Y.Text): RemoteCursor[] => {
  const doc = text.doc!;
  const cursors: RemoteCursor[] = [];
  awareness.getStates().forEach((value, clientId) => {
    const state = value as RemoteState;
    if (clientId === doc.clientID || state.fileId !== fileId || !state.user || !state.selection?.anchor || !state.selection.head) {
      return;
    }

    const anchor = Y.createAbsolutePositionFromRelativePosition(state.selection.anchor, doc);
    const head = Y.createAbsolutePositionFromRelativePosition(state.selection.head, doc);
    if (anchor?.type === text && head?.type === text) {
      cursors.push({ clientId, user: state.user, anchor: anchor.index, head: head.index });
    }
  });
  return cursors;
};

/** Someone else in the code document, and the file they have in front. */
export interface RemotePerson {
  clientId: number;
  user: PresenceUser;
  fileId: string;
}

/** Everyone else who has a file in front, by name, as the web's dots show them. */
export const remotePeople = (awareness: Awareness): RemotePerson[] => {
  const people: RemotePerson[] = [];
  awareness.getStates().forEach((value, clientId) => {
    const state = value as RemoteState;
    if (clientId !== awareness.clientID && state.user && typeof state.fileId === "string") {
      people.push({ clientId, user: state.user, fileId: state.fileId });
    }
  });
  return people.sort((a, b) => a.user.name.localeCompare(b.user.name) || a.clientId - b.clientId);
};

/**
 * The badge on a file in the explorer: the initial of the one person who has it in front, or how many have it. VS Code
 * shows at most two characters.
 */
export const fileBadge = (people: readonly PresenceUser[]): string => {
  if (people.length === 1) {
    return (people[0].name.trim()[0] ?? "?").toUpperCase();
  }
  return people.length > 9 ? "9+" : String(people.length);
};

/** The position of a web colour among the participant colours, or -1 for another colour. */
export const colorIndexOf = (color: string): number =>
  PARTICIPANT_COLORS.findIndex((p) => p.toLowerCase() === color.toLowerCase());
