import * as esbuild from "esbuild";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { bundleOptions } from "./bundleOptions.mjs";

// Writes THIRD_PARTY_NOTICES.md: the licence of every package inside the bundle, found from esbuild's own list of
// the files it bundles, so the notices follow the dependencies.
const result = await esbuild.build({ ...bundleOptions, write: false, metafile: true });

const packageRootOf = (file) => {
  const parts = file.split("/");
  const at = parts.lastIndexOf("node_modules");
  if (at < 0) {
    return undefined;
  }
  const length = parts[at + 1].startsWith("@") ? 2 : 1;
  return parts.slice(0, at + 1 + length).join("/");
};

const mit = (copyright) => `The MIT License (MIT)

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const UNLICENSE = `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>`;

// Packages published without their licence file: the licence of the repository they come from.
const KNOWN_LICENCES = {
  "@microsoft/signalr": mit("Copyright (c) .NET Foundation and Contributors\n\nAll rights reserved."),
  "fetch-cookie": UNLICENSE,
  punycode: mit("Copyright Mathias Bynens <https://mathiasbynens.be/>"),
};

const roots = new Set(Object.keys(result.metafile.inputs).map(packageRootOf).filter(Boolean));
const notices = [...roots]
  .map((root) => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const licenceFile = readdirSync(root).find((p) => /^(licen[cs]e|copying)(\.|$)/i.test(p));
    const text = licenceFile ? readFileSync(join(root, licenceFile), "utf8").trim() : KNOWN_LICENCES[manifest.name];
    return { name: manifest.name, version: manifest.version, licence: manifest.license, text };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const missing = notices.filter((p) => !p.text);
if (missing.length > 0) {
  console.warn(`No licence file in: ${missing.map((p) => p.name).join(", ")}`);
}

const body = notices
  .map((p) => `## ${p.name} ${p.version} (${p.licence})\n\n${p.text ? "```text\n" + p.text + "\n```" : "_No licence file in the package._"}`)
  .join("\n\n");
const out = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "THIRD_PARTY_NOTICES.md");
writeFileSync(
  out,
  `# Third-party notices\n\nThe Rallybeam extension bundles these packages. Their licences follow.\n\n${body}\n`,
  "utf8",
);
console.log(`Wrote the notices of ${notices.length} packages.`);
if (!existsSync(out)) {
  process.exit(1);
}
