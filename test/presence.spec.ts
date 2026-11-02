import { describe, expect, it } from "vitest";
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

import { colorIndexOf, fileBadge, participantColor, remoteCursorsIn, remotePeople, setLocalSelection } from "../src/presence";

// Two people on one document, as the relay connects them.
const pair = () => {
  const here = new Y.Doc();
  const there = new Y.Doc();
  there.getText("a").insert(0, "hello world");
  Y.applyUpdate(here, Y.encodeStateAsUpdate(there));
  return { here, there, hereAwareness: new Awareness(here), thereAwareness: new Awareness(there) };
};

const send = (from: Awareness, to: Awareness) =>
  applyAwarenessUpdate(to, encodeAwarenessUpdate(from, [from.clientID]), "relay");

describe("presence", () => {
  it("sends this person's selection in the fields the web reads, and reads the others' back", () => {
    const { here, there, hereAwareness, thereAwareness } = pair();
    thereAwareness.setLocalStateField("user", { name: "Ana", color: "#2563EB" });
    setLocalSelection(thereAwareness, "file-a", there.getText("a"), 0, 5);
    send(thereAwareness, hereAwareness);

    const cursors = remoteCursorsIn(hereAwareness, "file-a", here.getText("a"));

    expect(cursors).toEqual([{ clientId: there.clientID, user: { name: "Ana", color: "#2563EB" }, anchor: 0, head: 5 }]);
    const state = hereAwareness.getStates().get(there.clientID) as { fileId: string; selection: object };
    expect(state.fileId).toBe("file-a");
    expect(Object.keys(state.selection)).toEqual(["anchor", "head"]);
  });

  it("leaves out this person, other files, and those without a selection", () => {
    const { here, hereAwareness, thereAwareness } = pair();
    hereAwareness.setLocalStateField("user", { name: "Me", color: "#000000" });
    setLocalSelection(hereAwareness, "file-a", here.getText("a"), 1, 1);
    thereAwareness.setLocalState({ user: { name: "Ana", color: "#2563EB" }, fileId: "file-b" });
    send(thereAwareness, hereAwareness);

    expect(remoteCursorsIn(hereAwareness, "file-a", here.getText("a"))).toEqual([]);
    expect(remoteCursorsIn(hereAwareness, "file-b", here.getText("a"))).toEqual([]);
  });

  it("follows the text as others type before the cursor", () => {
    const { here, there, hereAwareness, thereAwareness } = pair();
    thereAwareness.setLocalStateField("user", { name: "Ana", color: "#2563EB" });
    setLocalSelection(thereAwareness, "file-a", there.getText("a"), 6, 6);
    send(thereAwareness, hereAwareness);

    here.getText("a").insert(0, ">> ");

    expect(remoteCursorsIn(hereAwareness, "file-a", here.getText("a"))[0].head).toBe(9);
  });

  it("uses the web's colours", () => {
    expect(participantColor(0)).toBe("#2563EB");
    expect(participantColor(9)).toBe("#DB2777");
    expect(participantColor(-1)).toBe("#DC2626");
  });

  it("lists everyone else who has a file in front, by name", () => {
    const { there, hereAwareness, thereAwareness } = pair();
    hereAwareness.setLocalState({ user: { name: "Me", color: "#000000" }, fileId: "file-a" });
    thereAwareness.setLocalState({ user: { name: "James", color: "#DB2777", client: "vscode" }, fileId: "file-b" });
    send(thereAwareness, hereAwareness);
    const third = new Awareness(new Y.Doc());
    third.setLocalState({ user: { name: "Ana", color: "#2563EB" }, fileId: null });
    send(third, hereAwareness);

    expect(remotePeople(hereAwareness)).toEqual([
      { clientId: there.clientID, user: { name: "James", color: "#DB2777", client: "vscode" }, fileId: "file-b" },
    ]);
  });

  it("badges a file with one person's initial, or how many have it", () => {
    expect(fileBadge([{ name: "james", color: "#DB2777" }])).toBe("J");
    expect(fileBadge([{ name: " ", color: "#DB2777" }])).toBe("?");
    expect(fileBadge([{ name: "A", color: "#000" }, { name: "B", color: "#000" }])).toBe("2");
    expect(fileBadge(Array.from({ length: 12 }, () => ({ name: "X", color: "#000" })))).toBe("9+");
  });

  it("finds a web colour among the participant colours", () => {
    expect(colorIndexOf("#db2777")).toBe(1);
    expect(colorIndexOf("#123456")).toBe(-1);
  });
});
