import { describe, expect, it } from "vitest";

import { ExecutionView, formatSeconds, isPassingView, joinPreviewOf, meetPageUrl, refusalOf, toTerminalText } from "../src/execution";

const app: ExecutionView = {
  isAvailable: true,
  reason: null,
  environmentId: "react-vite",
  taskPartId: "part-1",
  canRun: true,
  mode: "App",
  previewUrl: "https://32cb04a7d0f43994.meet.rs/",
  appState: "Running",
};

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

  it("opens an app's preview on joining only when it already runs", () => {
    expect(joinPreviewOf(app)).toBe("https://32cb04a7d0f43994.meet.rs/");
    expect(joinPreviewOf({ ...app, canRun: false })).toBe("https://32cb04a7d0f43994.meet.rs/");
    expect(joinPreviewOf({ ...app, appState: "Starting" })).toBeUndefined();
    expect(joinPreviewOf({ ...app, mode: "Program" })).toBeUndefined();
    expect(joinPreviewOf({ ...app, isAvailable: false })).toBeUndefined();
    expect(joinPreviewOf({ ...app, environmentId: "expo" })).toBeUndefined();
    expect(joinPreviewOf(undefined)).toBeUndefined();
  });

  it("reads the view again only while it may change by itself", () => {
    expect(isPassingView(undefined)).toBe(true);
    expect(isPassingView({ ...app, isAvailable: false, reason: "no_runner" })).toBe(true);
    expect(isPassingView({ ...app, isAvailable: false, reason: "no_code_task" })).toBe(false);
    expect(isPassingView(app)).toBe(false);
  });
});
