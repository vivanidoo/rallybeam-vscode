// The bundle's esbuild options, shared by the build and the notices.
export const bundleOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode", "bufferutil", "utf-8-validate"],
  // SignalR picks its hidden require when __webpack_require__ is a function; both names go to src/signalrRequire.ts.
  inject: ["src/signalrRequire.ts"],
  define: { __webpack_require__: "signalrRequire", __non_webpack_require__: "signalrRequire" },
  logLevel: "warning",
};
