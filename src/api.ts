/**
 * The Rallybeam API's way in from an editor: a handoff ticket from
 * the code canvas, or the code from the invitation, exchanged for the participant's token.
 */

import type { TaskContent, TaskSummary } from "./tasks";

export type ParticipantRole = "Interviewer" | "Candidate" | "Observer" | string;

export interface ParticipantView {
  id: string;
  displayName: string;
  colorIndex: number;
  role: ParticipantRole;
}

export interface MeetingEntry {
  code: string;
  participant: ParticipantView;
  token: string;
}

/** Why the API refused: its problem title, such as `wrong_code`, `ticket_expired`, `code_locked` or `meeting_ended`. */
export class EntryError extends Error {
  constructor(
    public readonly reason: string,
    public readonly status: number,
  ) {
    super(reason);
  }
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Enters a meet with a handoff ticket or the code from the invitation, and returns the participant's token. */
export const enterAsync = async (
  server: string,
  code: string,
  credential: { ticket: string } | { passcode: string },
  fetchImpl: Fetch = fetch,
): Promise<MeetingEntry> => {
  const response = await fetchImpl(`${server}/v1/meetings/${encodeURIComponent(code)}/editor/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(credential),
  });
  if (!response.ok) {
    let reason = `http_${response.status}`;
    try {
      const problem = (await response.json()) as { title?: unknown };
      if (typeof problem.title === "string") {
        reason = problem.title;
      }
    } catch {
      // A body that is not a problem keeps the status.
    }
    throw new EntryError(reason, response.status);
  }
  return (await response.json()) as MeetingEntry;
};

/** What the meet's page shows on top: its title and the inviting company, from what anyone with the link may know. */
export interface MeetSummary {
  title: string | null;
  companyName: string | null;
  /** The meet's tasks, with which one is current; their titles only. */
  tasks: TaskSummary[];
}

/**
 * The meet's title and company (`GET /v1/meetings/{code}`); the company only when the meet carries its brand, as on
 * the web. Undefined when the server cannot tell, which leaves the panel with the code alone.
 */
export const meetSummaryAsync = async (server: string, code: string, fetchImpl: Fetch = fetch): Promise<MeetSummary | undefined> => {
  try {
    const response = await fetchImpl(`${server}/v1/meetings/${encodeURIComponent(code)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return undefined;
    }
    const info = (await response.json()) as { title?: unknown; brand?: { companyName?: unknown } | null; tasks?: unknown };
    return {
      title: typeof info.title === "string" && info.title.trim() ? info.title.trim() : null,
      companyName: typeof info.brand?.companyName === "string" && info.brand.companyName.trim() ? info.brand.companyName.trim() : null,
      tasks: readTasks(info.tasks),
    };
  } catch {
    return undefined;
  }
};

/** The tasks of the meet's view or of the hub's `TasksChanged`, leaving out what is not a task. */
export const readTasks = (value: unknown): TaskSummary[] =>
  (Array.isArray(value) ? value : []).flatMap((p: { id?: unknown; order?: unknown; title?: unknown; state?: unknown }) =>
    typeof p?.id === "string" && typeof p.order === "number" && (p.state === "Pending" || p.state === "Current" || p.state === "Done")
      ? [{ id: p.id, order: p.order, title: typeof p.title === "string" ? p.title : null, state: p.state }]
      : [],
  );

/**
 * The task's brief for this participant (`GET /v1/meetings/{code}/tasks/{taskId}/content`): its description and the
 * goals the interviewer revealed. The server leaves out what only the interviewers see. Undefined when it cannot be
 * read.
 */
export const taskContentAsync = async (
  server: string,
  code: string,
  taskId: string,
  token: string,
  fetchImpl: Fetch = fetch,
): Promise<TaskContent | undefined> => {
  try {
    const url = `${server}/v1/meetings/${encodeURIComponent(code)}/tasks/${encodeURIComponent(taskId)}/content`;
    const response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      return undefined;
    }
    const content = (await response.json()) as { title?: unknown; description?: unknown; items?: unknown };
    const items = (Array.isArray(content.items) ? content.items : []).flatMap(
      (p: { index?: unknown; text?: unknown; isRevealed?: unknown }) =>
        typeof p?.index === "number" && typeof p.text === "string" ? [{ index: p.index, text: p.text, isRevealed: p.isRevealed === true }] : [],
    );
    return {
      taskId,
      title: typeof content.title === "string" ? content.title : null,
      description: typeof content.description === "string" ? content.description : null,
      items,
    };
  } catch {
    return undefined;
  }
};

/**
 * Whether the extension may send a ticket or code to a server: Rallybeam's own over HTTPS, or the one the person set
 * in the settings, such as a local API. A link from elsewhere cannot point the extension at another server.
 */
export const isTrustedServer = (server: string, configured: string): boolean => {
  let url: URL;
  try {
    url = new URL(server);
  } catch {
    return false;
  }
  if (url.origin === trimmedOrigin(configured)) {
    return true;
  }
  return url.protocol === "https:" && (url.hostname === "rallybeam.com" || url.hostname.endsWith(".rallybeam.com"));
};

const trimmedOrigin = (server: string): string | undefined => {
  try {
    return new URL(server).origin;
  } catch {
    return undefined;
  }
};

/** A server's origin, without a trailing slash or path. */
export const serverOrigin = (server: string): string => new URL(server).origin;

/** What a join link (`vscode://vivani.rallybeam/join?…`) carries. */
export interface JoinLink {
  code: string;
  ticket: string;
  server?: string;
}

export const parseJoinLink = (path: string, query: string): JoinLink | undefined => {
  if (path !== "/join") {
    return undefined;
  }
  const params = new URLSearchParams(query);
  const code = params.get("code");
  const ticket = params.get("ticket");
  if (!code || !ticket) {
    return undefined;
  }
  return { code, ticket, server: params.get("server") ?? undefined };
};

/** A meet from a pasted link (its server must be trusted) or a bare code on the configured server. */
export const parseMeet = (typed: string, configured: string): { server: string; code: string } | undefined => {
  if (/^[A-Za-z0-9]{8}$/.test(typed)) {
    return { server: serverOrigin(configured), code: typed };
  }
  try {
    const url = new URL(typed);
    const code = url.pathname.split("/").filter(Boolean)[0];
    if (code && /^[A-Za-z0-9]{8}$/.test(code) && isTrustedServer(url.origin, configured)) {
      return { server: url.origin, code };
    }
  } catch {
    // Not a link.
  }
  return undefined;
};
