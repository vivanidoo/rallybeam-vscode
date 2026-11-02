import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

// The .vsix has no node_modules, so the bundle may load only VS Code, Node's own modules and ws's optional add-ons.
// Fails when a dependency loads a module at run time that the bundle does not contain.
const ALLOWED = new Set(["vscode", "bufferutil", "utf-8-validate", ...builtinModules]);

const bundle = readFileSync("dist/extension.js", "utf8");
const missing = [...bundle.matchAll(/\brequire\("([^"]+)"\)/g)]
  .map((p) => p[1].replace(/^node:/, ""))
  .filter((p) => !ALLOWED.has(p));
const hidden = /__(non_)?webpack_require__/.test(bundle);

if (missing.length > 0 || hidden) {
  console.error(`dist/extension.js loads modules it does not contain: ${[...new Set(missing)].join(", ") || "a hidden require"}`);
  process.exit(1);
}
console.log("dist/extension.js loads only VS Code and Node's own modules.");
