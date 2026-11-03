import { describe, expect, it } from "vitest";

import { accentText, isPanelCommand, PanelModel, panelHtml } from "../src/panel";

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

  it("draws a paying company's look: the header image, logo, welcome message, button colour and footer", () => {
    const html = panelHtml(
      {
        ...model,
        brand: {
          logoUrl: "https://int.rallybeam.com/v1/tenants/t/logo?v=1",
          headerUrl: "https://int.rallybeam.com/v1/tenants/t/editor-header?v=3",
          accentColor: "#ea580c",
          welcomeMessage: "Welcome <to> your interview.",
          poweredBy: "Powered by Rallybeam",
        },
      },
      page,
    );

    expect(html).toContain("img-src vscode-webview://abc https://int.rallybeam.com;");
    expect(html).toContain(`<img class="cover" src="https://int.rallybeam.com/v1/tenants/t/editor-header?v=3" alt="">`);
    expect(html).toContain(`<img class="logo" src="https://int.rallybeam.com/v1/tenants/t/logo?v=1" alt="">`);
    expect(html).toContain(`<p class="welcome">Welcome &lt;to&gt; your interview.</p>`);
    // Ink reads better than white on this orange, as on the web.
    expect(html).toContain("button.primary { background: #ea580c; color: #17252b;");
    expect(html).toContain("<footer>Powered by Rallybeam</footer>");
  });

  it("keeps a branded panel without an image or colour in the editor's own colours", () => {
    const html = panelHtml({ ...model, brand: { poweredBy: "Powered by Rallybeam" } }, page);

    expect(html).not.toContain(`class="cover"`);
    expect(html).not.toContain("button.primary { background: #");
    expect(html).toContain("img-src vscode-webview://abc;");
    expect(html).toContain("<footer>Powered by Rallybeam</footer>");
  });

  it("puts ink on a light button colour and drops a colour that is not #rrggbb", () => {
    expect(accentText("#fde047")).toBe("#17252b");
    expect(accentText("#1f2937")).toBe("#ffffff");
    const html = panelHtml({ ...model, brand: { accentColor: "red;}body{display:none", poweredBy: "Powered by Rallybeam" } }, page);
    expect(html).not.toContain("display:none");
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
