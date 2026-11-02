import { describe, expect, it } from "vitest";

import {
  canReplaceManifest,
  EDITOR_PACKAGES,
  editorPackagesFor,
  isMissingPackageError,
  missingPackages,
  SETUP_PACKAGE_NAME,
  SETUP_TSCONFIG_MARK,
  setupManifest,
  setupTsconfig,
} from "../src/environments";

const react = EDITOR_PACKAGES["react-vite"];

const parseTsconfig = (text: string) => JSON.parse(text.slice(text.indexOf("\n") + 1));

describe("editor packages", () => {
  it("gives the JavaScript types their packages and the others none", () => {
    expect(editorPackagesFor("react-vite")?.packages).toMatchObject({ react: "19.3.0", "@types/react": "19.3.0" });
    expect(editorPackagesFor("python")).toBeUndefined();
  });

  it("writes a package.json of the type in front only, under the extension's own name", () => {
    const manifest = JSON.parse(setupManifest(react));
    expect(manifest.name).toBe(SETUP_PACKAGE_NAME);
    expect(manifest.devDependencies).toEqual(react.packages);
  });

  it("writes a tsconfig with Vitest's globals, Node's types and the framework's JSX", () => {
    const tsconfig = setupTsconfig(EDITOR_PACKAGES.node);
    expect(tsconfig.startsWith(SETUP_TSCONFIG_MARK)).toBe(true);
    expect(parseTsconfig(tsconfig).compilerOptions).toMatchObject({ types: ["vitest/globals", "node"], jsx: "react-jsx" });
    expect(parseTsconfig(setupTsconfig(EDITOR_PACKAGES["solid-vite"])).compilerOptions).toMatchObject({
      jsx: "preserve",
      jsxImportSource: "solid-js",
    });
    expect(parseTsconfig(setupTsconfig(EDITOR_PACKAGES.expo)).compilerOptions.types).toEqual([]);
  });

  it("replaces only its own package.json", () => {
    expect(canReplaceManifest(undefined)).toBe(true);
    expect(canReplaceManifest(setupManifest(react))).toBe(true);
    expect(canReplaceManifest(JSON.stringify({ name: "my-app" }))).toBe(false);
    expect(canReplaceManifest("not json")).toBe(false);
  });

  it("lists the packages that are absent or of another version", () => {
    const installed: Record<string, string> = { ...react.packages, react: "18.3.1" };
    delete installed.vitest;
    expect(missingPackages(react, (name) => installed[name])).toEqual(["react", "vitest"]);
    expect(missingPackages(react, (name) => react.packages[name])).toEqual([]);
  });

  it("knows VS Code's errors that the packages would fix", () => {
    const missing = (code: number, message: string) => isMissingPackageError(react, code, message);
    expect(missing(2307, "Cannot find module '@testing-library/react' or its corresponding type declarations.")).toBe(true);
    expect(missing(2875, "This JSX tag requires the module path 'react/jsx-runtime' to exist, but none could be found.")).toBe(true);
    expect(missing(2582, "Cannot find name 'test'. Do you need to install type definitions for a test runner?")).toBe(true);
    expect(missing(2307, "Cannot find module 'lodash' or its corresponding type declarations.")).toBe(false);
    expect(missing(2307, "Cannot find module './App' or its corresponding type declarations.")).toBe(false);
    expect(missing(2304, "Cannot find name 'count'.")).toBe(false);
    expect(missing(2322, "Type 'string' is not assignable to type 'number'.")).toBe(false);
  });
});
