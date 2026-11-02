import { describe, expect, it, vi } from "vitest";

import { enterAsync, EntryError, Fetch, isTrustedServer, parseJoinLink, parseMeet } from "../src/api";

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
