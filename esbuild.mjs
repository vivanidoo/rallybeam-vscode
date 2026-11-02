import * as esbuild from "esbuild";

import { bundleOptions } from "./scripts/bundleOptions.mjs";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// One CommonJS file for VS Code's extension host, with every dependency inside, so the .vsix needs no node_modules.
const context = await esbuild.context({
  ...bundleOptions,
  outfile: "dist/extension.js",
  sourcemap: !production,
  minify: production,
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
