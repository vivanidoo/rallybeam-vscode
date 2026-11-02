/**
 * The packages each JavaScript project type brings in Rallybeam's sandbox. The sandbox installs them in its image,
 * above the project, so a meet's package.json names only what the candidate adds. On the candidate's computer the
 * extension installs the same packages in the folder above the meet's (packageSetup.ts), where Node and TypeScript find
 * them the same way.
 *
 * The versions are everest-sandbox's `environments/<type>/deps/package.json`, plus the type definitions an editor needs
 * and the sandbox does not (it runs the code without type-checking it).
 */
export interface EditorPackages {
  /** The type's name, as the web's project picker shows it. */
  name: string;
  packages: Record<string, string>;
  /** How TypeScript reads JSX: React's automatic runtime unless the framework has its own. */
  jsxImportSource?: string;
}

const REACT_TYPES = { "@types/react": "19.3.0", "@types/react-dom": "19.3.0" };
const NODE_TYPES = { "@types/node": "22.20.5" };

export const EDITOR_PACKAGES: Record<string, EditorPackages> = {
  angular: {
    name: "Angular",
    packages: {
      "@angular/build": "22.2.5",
      "@angular/cli": "22.2.5",
      "@angular/common": "22.2.4",
      "@angular/compiler": "22.2.4",
      "@angular/compiler-cli": "22.2.4",
      "@angular/core": "22.2.4",
      "@angular/forms": "22.2.4",
      "@angular/platform-browser": "22.2.4",
      "@angular/router": "22.2.4",
      jsdom: "30.1.3",
      rxjs: "7.8.2",
      tslib: "2.9.1",
      typescript: "6.0.3",
      vitest: "5.0.5",
    },
  },
  expo: {
    name: "Expo",
    packages: {
      "@types/react": "19.3.0",
      expo: "58.0.22",
      "expo-status-bar": "58.0.4",
      react: "19.3.0",
      "react-native": "0.88.1",
      typescript: "6.0.3",
    },
  },
  "html-project": {
    name: "HTML",
    packages: { "@testing-library/dom": "10.4.2", jsdom: "30.1.3", vite: "8.3.4", vitest: "5.0.5" },
  },
  javascript: { name: "JavaScript", packages: { ...NODE_TYPES, vitest: "5.0.5" } },
  nextjs: {
    name: "Next.js",
    packages: {
      ...NODE_TYPES,
      ...REACT_TYPES,
      "@testing-library/dom": "10.4.2",
      "@testing-library/jest-dom": "7.0.1",
      "@testing-library/react": "16.3.3",
      "@vitejs/plugin-react": "6.1.2",
      jsdom: "30.1.3",
      next: "16.4.3",
      react: "19.3.0",
      "react-dom": "19.3.0",
      typescript: "5.9.3",
      vitest: "5.0.5",
    },
  },
  node: { name: "Node.js", packages: { ...NODE_TYPES, vitest: "5.0.5" } },
  nuxt: {
    name: "Nuxt",
    packages: {
      "@nuxt/test-utils": "4.3.4",
      "@vue/test-utils": "2.5.1",
      "happy-dom": "21.0.4",
      nuxt: "4.6.3",
      typescript: "5.9.3",
      vitest: "5.0.5",
      vue: "3.5.44",
      "vue-router": "5.4.0",
    },
  },
  "react-native": {
    name: "React Native",
    packages: {
      "@babel/core": "7.29.7",
      "@babel/preset-env": "7.29.7",
      "@babel/runtime": "7.29.10",
      "@react-native-community/cli": "20.2.0",
      "@react-native-community/cli-platform-android": "20.2.0",
      "@react-native/babel-preset": "0.88.1",
      "@react-native/metro-config": "0.88.1",
      "@react-native/typescript-config": "0.88.1",
      "@types/react": "19.3.0",
      react: "19.3.0",
      "react-native": "0.88.1",
      typescript: "6.0.3",
    },
  },
  "react-router": {
    name: "React Router",
    packages: {
      ...NODE_TYPES,
      ...REACT_TYPES,
      "@react-router/dev": "8.5.1",
      "@react-router/node": "8.5.1",
      "@testing-library/dom": "10.4.2",
      "@testing-library/jest-dom": "7.0.1",
      "@testing-library/react": "16.3.3",
      "@vitejs/plugin-react": "6.1.2",
      isbot: "5.2.2",
      jsdom: "30.1.3",
      react: "19.3.0",
      "react-dom": "19.3.0",
      "react-router": "8.5.1",
      typescript: "5.9.3",
      vite: "8.3.4",
      vitest: "5.0.5",
    },
  },
  "react-vite": {
    name: "React",
    packages: {
      ...REACT_TYPES,
      "@testing-library/dom": "10.4.2",
      "@testing-library/jest-dom": "7.0.1",
      "@testing-library/react": "16.3.3",
      "@vitejs/plugin-react": "6.1.2",
      jsdom: "30.1.3",
      react: "19.3.0",
      "react-dom": "19.3.0",
      vite: "8.3.4",
      vitest: "5.0.5",
    },
  },
  "solid-vite": {
    name: "Solid",
    packages: {
      "@solidjs/testing-library": "0.8.10",
      "@testing-library/jest-dom": "7.0.1",
      jsdom: "30.1.3",
      "solid-js": "1.9.18",
      vite: "8.3.4",
      "vite-plugin-solid": "2.11.15",
      vitest: "5.0.5",
    },
    jsxImportSource: "solid-js",
  },
  "svelte-vite": {
    name: "Svelte",
    packages: {
      "@sveltejs/vite-plugin-svelte": "7.3.1",
      "@testing-library/svelte": "5.4.2",
      jsdom: "30.1.3",
      svelte: "5.57.3",
      vite: "8.3.4",
      vitest: "5.0.5",
    },
  },
  typescript: { name: "TypeScript", packages: { ...NODE_TYPES, tsx: "4.23.15", vitest: "5.0.5" } },
  "vue-vite": {
    name: "Vue",
    packages: {
      "@vitejs/plugin-vue": "6.0.10",
      "@vue/test-utils": "2.5.1",
      jsdom: "30.1.3",
      vite: "8.3.4",
      vitest: "5.0.5",
      vue: "3.5.44",
    },
  },
};

/** The name of the package.json the extension writes, which tells it apart from anyone else's. */
export const SETUP_PACKAGE_NAME = "rallybeam-editor-packages";

/** The first line of the tsconfig.json the extension writes. */
export const SETUP_TSCONFIG_MARK = "// Written by the Rallybeam extension";

/** Vitest's globals, which every type with Vitest turns on, as its tests use them without importing them. */
const TEST_GLOBALS = new Set(["afterAll", "afterEach", "beforeAll", "beforeEach", "describe", "expect", "it", "test", "vi"]);

export const editorPackagesFor = (type: string): EditorPackages | undefined => EDITOR_PACKAGES[type];

/** The package.json of the folder above the meets: only the type in front, so npm removes another type's packages. */
export const setupManifest = (setup: EditorPackages): string =>
  JSON.stringify(
    {
      name: SETUP_PACKAGE_NAME,
      private: true,
      description: `The ${setup.name} packages Rallybeam installed so your editor understands the meets' code. The meets are in the folders beside this file.`,
      devDependencies: setup.packages,
    },
    null,
    2,
  ) + "\n";

/** The tsconfig.json beside it, used by every meet project that has none of its own. */
export const setupTsconfig = (setup: EditorPackages): string => {
  const types = [
    ...("vitest" in setup.packages ? ["vitest/globals"] : []),
    ...("@types/node" in setup.packages ? ["node"] : []),
  ];
  const compilerOptions = {
    target: "ES2022",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    module: "ESNext",
    moduleResolution: "Bundler",
    jsx: setup.jsxImportSource ? "preserve" : "react-jsx",
    ...(setup.jsxImportSource ? { jsxImportSource: setup.jsxImportSource } : {}),
    strict: true,
    allowJs: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    isolatedModules: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    types,
  };
  return `${SETUP_TSCONFIG_MARK}, for the meet projects in the folders beside it that have none of their own.\n${JSON.stringify({ compilerOptions }, null, 2)}\n`;
};

/** Whether a package.json is the one the extension writes (or none is there yet), so it may be replaced. */
export const canReplaceManifest = (text: string | undefined): boolean => {
  if (text === undefined) {
    return true;
  }
  try {
    return (JSON.parse(text) as { name?: unknown }).name === SETUP_PACKAGE_NAME;
  } catch {
    return false;
  }
};

/** The packages whose installed version is not the one the type needs. */
export const missingPackages = (setup: EditorPackages, installedVersion: (name: string) => string | undefined): string[] =>
  Object.entries(setup.packages)
    .filter(([name, version]) => installedVersion(name) !== version)
    .map(([name]) => name);

// TypeScript's errors for a module, type library or name it cannot find (ts 2307, 2875, 7016, 2688; 2304, 2582, 2593).
const MISSING_MODULE_CODES = new Set([2307, 2875, 7016, 2688]);
const MISSING_NAME_CODES = new Set([2304, 2582, 2593]);

const packageOf = (specifier: string): string => {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

/** Whether an editor error comes from one of the type's packages not being installed. */
export const isMissingPackageError = (setup: EditorPackages, code: number | undefined, message: string): boolean => {
  const quoted = /'([^']+)'/.exec(message)?.[1];
  if (code === undefined || quoted === undefined) {
    return false;
  }
  if (MISSING_MODULE_CODES.has(code)) {
    const name = packageOf(quoted);
    return name in setup.packages || `@types/${name}` in setup.packages;
  }
  return MISSING_NAME_CODES.has(code) && TEST_GLOBALS.has(quoted) && "vitest" in setup.packages;
};
