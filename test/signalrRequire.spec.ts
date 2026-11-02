import { describe, expect, it } from "vitest";
import WebSocket from "ws";

import { signalrRequire } from "../src/signalrRequire";

describe("signalrRequire", () => {
  it("gives SignalR the bundled WebSocket and cookie modules", () => {
    expect(signalrRequire("ws")).toBe(WebSocket);
    expect(signalrRequire("tough-cookie")).toHaveProperty("CookieJar");
    expect(typeof signalrRequire("fetch-cookie")).toBe("function");
    expect(typeof signalrRequire("eventsource")).toBe("function");
  });

  it("refuses a module that is not bundled", () => {
    expect(() => signalrRequire("node-fetch")).toThrow("Cannot find module 'node-fetch'");
  });
});
