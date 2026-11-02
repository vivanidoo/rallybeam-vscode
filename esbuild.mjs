import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// One CommonJS file for VS Code's extension host, with every dependency inside, so the .vsix needs no node_modules.
const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  outfile: "dist/extension.js",
  external: ["vscode", "bufferutil", "utf-8-validate"],
  sourcemap: !production,
  minify: production,
  logLevel: "warning",
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
