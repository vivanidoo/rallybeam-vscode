/**
 * How each JavaScript project type runs on the candidate's own computer (V19): the sandbox's own commands
 * (everest-sandbox `environments/<type>/manifest.json`), started from the meet's folder with the packages the editor
 * setup installed in the folder above it (environments.ts). The sandbox keeps its Vite and Vitest settings outside the
 * project; these are the same settings without what only the sandbox needs (its preview bridge and proxy, ports and
 * caches), written beside the packages, so the meet's files do not change.
 */
export interface LocalPaths {
  /** The folder above the meet's, with the packages. */
  root: string;
  /** This type's own folder for its settings, under the root. */
  config: string;
  /** The project's main file, relative to the meet's folder, for a program. */
  main: string;
}

export interface LocalRun {
  /** Run: a program, or an app's dev server. */
  run?: (paths: LocalPaths) => string[];
  /** Where an app's dev server answers, for its preview. */
  port?: number;
  /** Run tests. */
  test?: (paths: LocalPaths) => string[];
  /** The settings files the commands name, by name under `config`. */
  configFiles?: (paths: LocalPaths) => Record<string, string>;
  /** The program's main file when the project names none. */
  defaultMain?: string;
  /** Runs on a phone: the dev server shows a QR code for Expo Go. */
  isPhone?: boolean;
  /** Environment variables the tools need to run unattended. */
  env?: Record<string, string>;
}

const VITE_PORT = 5173;

const js = (value: unknown) => JSON.stringify(value);

const vite = (p: LocalPaths) => [`${p.root}/node_modules/vite/bin/vite.js`, "--config", `${p.config}/vite.config.mjs`, "--configLoader", "native"];

const vitest = (file: string) => (p: LocalPaths) => [
  `${p.root}/node_modules/vitest/vitest.mjs`,
  "run",
  "--config",
  `${p.config}/${file}`,
  "--configLoader",
  "native",
];

// A Vite type's settings: the sandbox's plugins and tests, served on localhost from the meet's folder, with the
// packages folder allowed so Vite serves the packages' files too.
const viteConfig =
  (imports: string, plugins: string, include: string[], testExtra = "") =>
  (p: LocalPaths): Record<string, string> => ({
    "vite.config.mjs": `// Written by the Rallybeam extension: the sandbox's settings for this project type, on this computer.
import { defineConfig } from "vite";
${imports}
export default defineConfig({
  plugins: [${plugins}],
  cacheDir: ${js(`${p.config}/vite-cache`)},
  server: { port: ${VITE_PORT}, strictPort: true, fs: { allow: [process.cwd(), ${js(p.root)}] } },
  test: {
    environment: "jsdom",
    globals: true,
    include: ${js(include)},${testExtra}
  },
});
`,
  });

// Vitest's settings for a type whose app runs with its own CLI, or a program.
const vitestConfig =
  (imports: string, body: string) =>
  (p: LocalPaths): Record<string, string> => ({
    "vitest.config.mjs": `// Written by the Rallybeam extension: the sandbox's test settings for this project type, on this computer.
${imports}
export default defineConfig({
  cacheDir: ${js(`${p.config}/vite-cache`)},
${body}
});
`,
  });

const programTests = vitestConfig(
  `import { defineConfig } from "vitest/config";`,
  `  test: {
    environment: "node",
    globals: true,
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"],
    exclude: ["**/node_modules/**", ".rb/**"],
  },`,
);

const reactTests = (include: string[], alias = "") =>
  vitestConfig(
    `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";`,
    `  plugins: [react()],${alias}
  test: { environment: "jsdom", globals: true, include: ${js(include)}, exclude: ["**/node_modules/**", ".next/**", ".rb/**"] },`,
  );

const VITE_APP = { run: vite, port: VITE_PORT, test: vitest("vite.config.mjs") };

export const LOCAL_RUNS: Record<string, LocalRun> = {
  "react-vite": {
    ...VITE_APP,
    configFiles: viteConfig(`import react from "@vitejs/plugin-react";`, "react()", ["src/**/*.test.{ts,tsx,js,jsx}"]),
  },
  "vue-vite": {
    ...VITE_APP,
    configFiles: viteConfig(`import vue from "@vitejs/plugin-vue";`, "vue()", ["src/**/*.test.{ts,js}"]),
  },
  "svelte-vite": {
    ...VITE_APP,
    configFiles: viteConfig(
      `import { svelte } from "@sveltejs/vite-plugin-svelte";\nimport { svelteTesting } from "@testing-library/svelte/vite";`,
      "svelte({ configFile: false }), svelteTesting()",
      ["src/**/*.test.{ts,js}"],
    ),
  },
  "solid-vite": {
    ...VITE_APP,
    configFiles: viteConfig(
      `import solid from "vite-plugin-solid";`,
      "solid()",
      ["src/**/*.test.{ts,tsx,js,jsx}"],
      `\n    server: { deps: { inline: ["@solidjs/testing-library"] } },`,
    ),
  },
  "html-project": {
    ...VITE_APP,
    configFiles: viteConfig("", "", ["**/*.test.js"], `\n    exclude: ["**/node_modules/**", ".rb/**"],`),
  },
  javascript: { run: (p) => [p.main], defaultMain: "index.js", test: vitest("vitest.config.mjs"), configFiles: programTests },
  node: { run: (p) => [p.main], defaultMain: "index.js", test: vitest("vitest.config.mjs"), configFiles: programTests },
  typescript: {
    run: (p) => ["--import", "tsx", p.main],
    defaultMain: "index.ts",
    test: vitest("vitest.config.mjs"),
    configFiles: programTests,
  },
  nextjs: {
    run: (p) => [`${p.root}/node_modules/next/dist/bin/next`, "dev", "--port", "3000"],
    port: 3000,
    test: vitest("vitest.config.mjs"),
    configFiles: reactTests(["**/*.test.{ts,tsx,js,jsx}"], `\n  resolve: { alias: { "@/": \`\${process.cwd()}/\` } },`),
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
  "react-router": {
    run: (p) => [`${p.root}/node_modules/@react-router/dev/bin.cjs`, "dev", "--port", String(VITE_PORT), "--strictPort"],
    port: VITE_PORT,
    test: vitest("vitest.config.mjs"),
    configFiles: reactTests(["app/**/*.test.{ts,tsx,js,jsx}"]),
  },
  nuxt: {
    run: (p) => [`${p.root}/node_modules/nuxt/bin/nuxt.mjs`, "dev", "--port", "3000"],
    port: 3000,
    test: vitest("vitest.config.mjs"),
    configFiles: vitestConfig(
      `import { defineVitestConfig as defineConfig } from "@nuxt/test-utils/config";`,
      `  test: { environment: "nuxt", globals: true, include: ["{app,test,tests}/**/*.{test,spec}.{ts,js}"] },`,
    ),
    env: { NUXT_TELEMETRY_DISABLED: "1" },
  },
  angular: {
    run: (p) => [`${p.root}/node_modules/@angular/cli/bin/ng.js`, "serve", "--port", "4200"],
    port: 4200,
    test: (p) => [`${p.root}/node_modules/@angular/cli/bin/ng.js`, "test", "--watch=false"],
    env: { NG_CLI_ANALYTICS: "false" },
  },
  expo: {
    run: (p) => [`${p.root}/node_modules/expo/bin/cli`, "start"],
    isPhone: true,
    env: { EXPO_NO_TELEMETRY: "1" },
  },
};

export const localRunFor = (type: string): LocalRun | undefined => LOCAL_RUNS[type];

/** Paths for the commands, with forward slashes, which Node and the tools take on every platform. */
export const localPaths = (root: string, type: string, main: string): LocalPaths => {
  const slashed = root.replace(/\\/g, "/");
  return { root: slashed, config: `${slashed}/.rallybeam/${type}`, main };
};

/**
 * Expo's Metro must watch the packages folder to serve its files, as the sandbox's own settings do; Metro reads its
 * settings only from the project, so this file goes in the meet's folder, only when the project has none, and never
 * reaches the meet. Its require uses single quotes: the bundle check reads `require("…")` as the extension's own.
 */
export const expoMetroConfig = (root: string): string => `// Written by the Rallybeam extension so Metro serves the packages in ${root.replace(/\\/g, "/")}. It stays on this computer.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), ${js(`${root.replace(/\\/g, "/")}/node_modules`)}];

module.exports = config;
`;
