import { describe, expect, it, vi } from "vitest";

import { enterAsync, EntryError, Fetch, isTrustedServer, meetSummaryAsync, parseJoinLink, parseMeet, taskContentAsync } from "../src/api";

const respond = (status: number, body: unknown): Fetch =>
  vi.fn(() => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }));

describe("enterAsync", () => {
  it("posts the ticket or the code to the editor's entry and returns the participant's token", async () => {
    const entry = { code: "abcd1234", participant: { id: "p", displayName: "Ana", colorIndex: 1, role: "Candidate" }, token: "jwt" };
    const fetchImpl = respond(200, entry);

    expect(await enterAsync("https://int.rallybeam.com", "abcd1234", { passcode: "ABC-123" }, fetchImpl)).toEqual(entry);
    expect(fetchImpl).toHaveBeenCalledWith("https://int.rallybeam.com/v1/meetings/abcd1234/editor/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ passcode: "ABC-123" }),
    });
  });

  it("names the API's reason when it refuses", async () => {
    const refused = enterAsync("https://app.rallybeam.com", "abcd1234", { ticket: "t" }, respond(401, { title: "ticket_expired" }));

    await expect(refused).rejects.toEqual(new EntryError("ticket_expired", 401));
  });

  it("falls back to the status without a problem", async () => {
    const fetchImpl: Fetch = () => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error("html")) });

    await expect(enterAsync("https://app.rallybeam.com", "abcd1234", { ticket: "t" }, fetchImpl)).rejects.toMatchObject({
      reason: "http_502",
    });
  });
});

describe("meetSummaryAsync", () => {
  it("reads the meet's title and the company of its brand", async () => {
    const fetchImpl = respond(200, {
      code: "abcd1234",
      title: " Frontend interview ",
      brand: { companyName: "VUJANIĆ TEHNOMETAL" },
      tasks: [
        { id: "t2", order: 1, title: "React counter", state: "Pending", parts: [] },
        { id: "t1", order: 0, title: "Two sum", state: "Current", parts: [] },
        { id: 7, order: 2, state: "Pending" },
      ],
    });

    expect(await meetSummaryAsync("https://int.rallybeam.com", "abcd1234", fetchImpl)).toEqual({
      title: "Frontend interview",
      companyName: "VUJANIĆ TEHNOMETAL",
      tasks: [
        { id: "t2", order: 1, title: "React counter", state: "Pending" },
        { id: "t1", order: 0, title: "Two sum", state: "Current" },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://int.rallybeam.com/v1/meetings/abcd1234", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("leaves out what the meet does not have, and gives nothing when the server cannot tell", async () => {
    expect(await meetSummaryAsync("https://app.rallybeam.com", "abcd1234", respond(200, { title: null, brand: null }))).toEqual({
      title: null,
      companyName: null,
      tasks: [],
    });
    expect(await meetSummaryAsync("https://app.rallybeam.com", "abcd1234", respond(404, {}))).toBeUndefined();
    expect(await meetSummaryAsync("https://app.rallybeam.com", "abcd1234", () => Promise.reject(new Error("offline")))).toBeUndefined();
  });
});

describe("taskContentAsync", () => {
  it("reads the task's brief with the participant's token", async () => {
    const fetchImpl = respond(200, {
      taskId: "t1",
      title: "Two sum",
      description: "Find **two** numbers.",
      items: [
        { index: 0, text: "Handle duplicates", isRevealed: true },
        { index: 1, text: "", isRevealed: false },
      ],
      interviewerNotes: null,
      isStaff: false,
    });

    expect(await taskContentAsync("https://int.rallybeam.com", "abcd1234", "t1", "jwt", fetchImpl)).toEqual({
      taskId: "t1",
      title: "Two sum",
      description: "Find **two** numbers.",
      items: [
        { index: 0, text: "Handle duplicates", isRevealed: true },
        { index: 1, text: "", isRevealed: false },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://int.rallybeam.com/v1/meetings/abcd1234/tasks/t1/content", {
      method: "GET",
      headers: { Accept: "application/json", Authorization: "Bearer jwt" },
    });
  });

  it("gives nothing when the brief cannot be read", async () => {
    expect(await taskContentAsync("https://app.rallybeam.com", "abcd1234", "t1", "jwt", respond(404, {}))).toBeUndefined();
  });
});

describe("isTrustedServer", () => {
  it("trusts Rallybeam's servers over HTTPS and the configured one", () => {
    expect(isTrustedServer("https://app.rallybeam.com", "https://app.rallybeam.com")).toBe(true);
    expect(isTrustedServer("https://int.rallybeam.com", "https://app.rallybeam.com")).toBe(true);
    expect(isTrustedServer("https://localhost:44380", "https://localhost:44380/")).toBe(true);
  });

  it("trusts nothing else", () => {
    expect(isTrustedServer("http://app.rallybeam.com", "https://app.rallybeam.com")).toBe(false);
    expect(isTrustedServer("https://rallybeam.com.evil.example", "https://app.rallybeam.com")).toBe(false);
    expect(isTrustedServer("https://evilrallybeam.com", "https://app.rallybeam.com")).toBe(false);
    expect(isTrustedServer("not a url", "https://app.rallybeam.com")).toBe(false);
  });
});

describe("parseJoinLink", () => {
  it("reads the code, ticket and server of a join link", () => {
    expect(parseJoinLink("/join", "code=abcd1234&ticket=t%2F1&server=https%3A%2F%2Fint.rallybeam.com")).toEqual({
      code: "abcd1234",
      ticket: "t/1",
      server: "https://int.rallybeam.com",
    });
  });

  it("ignores other paths and links without a ticket", () => {
    expect(parseJoinLink("/other", "code=abcd1234&ticket=t")).toBeUndefined();
    expect(parseJoinLink("/join", "code=abcd1234")).toBeUndefined();
  });
});

describe("parseMeet", () => {
  it("takes a bare code on the configured server, or a trusted meet link", () => {
    expect(parseMeet("abcd1234", "https://app.rallybeam.com/")).toEqual({ server: "https://app.rallybeam.com", code: "abcd1234" });
    expect(parseMeet("https://int.rallybeam.com/abcd1234/code", "https://app.rallybeam.com")).toEqual({
      server: "https://int.rallybeam.com",
      code: "abcd1234",
    });
  });

  it("refuses other servers and other text", () => {
    expect(parseMeet("https://example.com/abcd1234", "https://app.rallybeam.com")).toBeUndefined();
    expect(parseMeet("hello", "https://app.rallybeam.com")).toBeUndefined();
  });
});
