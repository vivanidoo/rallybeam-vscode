import { describe, expect, it } from "vitest";

import { EDITOR_PACKAGES } from "../src/environments";
import { expoMetroConfig, LOCAL_RUNS, localPaths, localRunFor } from "../src/localRuns";

const paths = localPaths("C:\\Users\\cand\\Rallybeam", "react-vite", "src/main.tsx");

describe("local runs", () => {
  it("uses forward slashes and the type's own settings folder", () => {
    expect(paths).toEqual({
      root: "C:/Users/cand/Rallybeam",
      config: "C:/Users/cand/Rallybeam/.rallybeam/react-vite",
      main: "src/main.tsx",
    });
  });

  it("runs a Vite app with its settings from the packages folder", () => {
    const react = localRunFor("react-vite")!;
    expect(react.run!(paths)).toEqual([
      "C:/Users/cand/Rallybeam/node_modules/vite/bin/vite.js",
      "--config",
      "C:/Users/cand/Rallybeam/.rallybeam/react-vite/vite.config.mjs",
      "--configLoader",
      "native",
    ]);
    expect(react.port).toBe(5173);
    const config = react.configFiles!(paths)["vite.config.mjs"];
    expect(config).toContain(`import react from "@vitejs/plugin-react";`);
    expect(config).toContain(`allow: [process.cwd(), "C:/Users/cand/Rallybeam"]`);
    expect(config).toContain("globals: true");
    expect(config).not.toContain("/opt/rb");
  });

  it("runs a program's main file", () => {
    expect(localRunFor("typescript")!.run!({ ...paths, main: "src/index.ts" })).toEqual(["--import", "tsx", "src/index.ts"]);
    expect(localRunFor("node")!.defaultMain).toBe("index.js");
  });

  it("runs only types whose packages the editor setup installs", () => {
    for (const type of Object.keys(LOCAL_RUNS)) {
      expect(EDITOR_PACKAGES[type], type).toBeDefined();
    }
    expect(localRunFor("python")).toBeUndefined();
    expect(localRunFor("react-native")).toBeUndefined();
  });

  it("points Expo's Metro at the packages folder", () => {
    expect(expoMetroConfig("C:\\Users\\cand\\Rallybeam")).toContain(`"C:/Users/cand/Rallybeam/node_modules"`);
  });
});
