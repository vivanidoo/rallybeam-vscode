import { describe, expect, it } from "vitest";

import { isPanelCommand, PanelModel, panelHtml } from "../src/panel";

const page = { cspSource: "vscode-webview://abc", nonce: "n0nce" };

const model: PanelModel = {
  company: "Vujanić <Tehnometal>",
  heading: "Frontend interview",
  detail: "Meet 4CYNhXba",
  sections: [
    { heading: "In Rallybeam", note: "Everyone in the meet sees these runs.", buttons: [{ command: "rallybeam.run", label: "Show the app", icon: "preview", isPrimary: true }] },
    { heading: "On your computer", note: "Only you see these runs.", buttons: [] },
    { buttons: [{ command: "rallybeam.leave", label: "Leave meet", icon: "signOut" }] },
  ],
};

describe("the Rallybeam panel", () => {
  it("shows the company, the meet's title and its code on top, escaped", () => {
    const html = panelHtml(model, page);
    expect(html).toContain(`<p class="company">Vujanić &lt;Tehnometal&gt;</p>`);
    expect(html).toContain("<h1>Frontend interview</h1>");
    expect(html).toContain(`<p class="detail">Meet 4CYNhXba</p>`);
    expect(html).not.toContain("<Tehnometal>");
  });

  it("draws the sections in order with a line between them, leaving out those without buttons", () => {
    const html = panelHtml(model, page);
    expect(html.indexOf("In Rallybeam")).toBeLessThan(html.indexOf("Leave meet"));
    expect(html).not.toContain("On your computer");
    expect(html.match(/<hr>/g)).toHaveLength(1);
    expect(html).toContain(`<button class="primary" data-command="rallybeam.run">`);
    expect(html).toContain(`<button class="secondary" data-command="rallybeam.leave">`);
  });

  it("runs only its own style and script", () => {
    const html = panelHtml({ heading: "Rallybeam", sections: [] }, page);
    expect(html).toContain("default-src 'none'; style-src 'nonce-n0nce'; script-src 'nonce-n0nce'");
    expect(html).toContain(`<script nonce="n0nce">`);
    expect(html).not.toContain(`class="company"`);
  });

  it("takes only its own commands from the page", () => {
    expect(isPanelCommand("rallybeam.runLocal")).toBe(true);
    expect(isPanelCommand("workbench.action.terminal.sendSequence")).toBe(false);
    expect(isPanelCommand(undefined)).toBe(false);
  });

  it("shows a section's message without buttons, such as why Rallybeam cannot run the code now", () => {
    const html = panelHtml(
      { heading: "Meet", sections: [{ heading: "In Rallybeam", message: "Code execution is not reachable right now.", buttons: [] }] },
      page,
    );
    expect(html).toContain("<h2>In Rallybeam</h2>");
    expect(html).toContain(`<p class="message">Code execution is not reachable right now.</p>`);
  });
});
