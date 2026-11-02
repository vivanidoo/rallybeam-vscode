// SignalR's Node build loads these modules at run time through a require it hides from bundlers, so they would be
// missing from the .vsix ("Cannot find module 'ws'"). esbuild points that require here, which bundles them. Node 20
// has fetch and AbortController, so SignalR never asks for node-fetch or abort-controller.
const MODULES: Record<string, () => unknown> = {
  ws: () => require("ws"),
  eventsource: () => require("eventsource"),
  "tough-cookie": () => require("tough-cookie"),
  "fetch-cookie": () => require("fetch-cookie"),
};

/** The require SignalR calls in Node, answering from the bundle. */
export const signalrRequire = (name: string): unknown => {
  const load = MODULES[name];
  if (!load) {
    throw new Error(`Cannot find module '${name}'`);
  }
  return load();
};
