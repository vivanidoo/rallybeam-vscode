import { describe, expect, it } from "vitest";

import { formatSeconds, meetPageUrl, refusalOf, toTerminalText } from "../src/execution";

describe("execution", () => {
  it("reads the refusal from the hub's error", () => {
    expect(refusalOf(new Error("An unexpected error occurred invoking 'RunCode' on the server. HubException: no_runner"))).toBe(
      "no_runner",
    );
    expect(refusalOf(new Error("HubException: not_an_app"))).toBe("not_an_app");
    expect(refusalOf(new Error("Connection closed"))).toBe("failed");
  });

  it("starts each line of output at the terminal's left edge", () => {
    expect(toTerminalText("one\ntwo\r\nthree")).toBe("one\r\ntwo\r\nthree");
  });

  it("formats a run's length", () => {
    expect(formatSeconds(1.234)).toBe("1.2 s");
    expect(formatSeconds(42.6)).toBe("43 s");
  });

  it("links the meet's page", () => {
    expect(meetPageUrl("https://app.rallybeam.com/", "ZrUh89uz")).toBe("https://app.rallybeam.com/ZrUh89uz");
  });
});
