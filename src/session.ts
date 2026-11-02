import { HubConnection, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import * as vscode from "vscode";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { ParticipantView } from "./api";
import { Cursors } from "./cursors";
import { FolderMirror, Manifest } from "./mirror";
import { People } from "./people";
import { participantColor, VSCODE_CLIENT } from "./presence";
import { CodeProject } from "./project";

/** The subprotocol the API's Yjs relay expects next to the participant token. */
export const RELAY_SUBPROTOCOL = "rallybeam";

/** One meet this window is in. */
export interface MeetPlace {
  server: string;
  code: string;
  participant: ParticipantView;
}

/** What the session shows in the status bar. */
export type SessionState = "connecting" | "lobby" | "syncing" | "live" | "offline" | "ended";

interface MeetingStateView {
  state: string;
  isInLobby: boolean;
}

interface MeetingSnapshot extends MeetingStateView {
  participantId: string;
}

/**
 * This window in a meet: the meeting hub tells when the lobby is over and when the meet ends, and from then on the
 * code document is joined on the relay, mirrored to the folder, with everyone's cursors.
 */
export class MeetSession implements vscode.Disposable {
  public state: SessionState = "connecting";

  private hub: HubConnection | undefined;

  private ydoc: Y.Doc | undefined;

  private provider: WebsocketProvider | undefined;

  private mirror: FolderMirror | undefined;

  private cursors: Cursors | undefined;

  /** Who has which file in front, once the code is here. */
  public people: People | undefined;

  private isDisposed = false;

  constructor(
    public readonly place: MeetPlace,
    private readonly token: string,
    private readonly folder: vscode.Uri,
    private readonly manifest: Manifest,
    private readonly saveManifest: (manifest: Manifest) => void,
    private readonly onState: (state: SessionState) => void,
  ) {}

  public startAsync = async () => {
    const hub = new HubConnectionBuilder()
      .withUrl(`${this.place.server}/hubs/meeting`, { accessTokenFactory: () => this.token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    this.hub = hub;
    hub.on("MeetingStateChanged", (state: MeetingStateView) => this.follow(state));
    hub.onreconnecting(() => this.setState("offline"));
    hub.onreconnected(() => void this.joinHubAsync());
    await hub.start();
    await this.joinHubAsync();
  };

  public dispose = () => {
    this.isDisposed = true;
    this.cursors?.dispose();
    this.people?.dispose();
    this.mirror?.dispose();
    this.provider?.destroy();
    this.ydoc?.destroy();
    void this.hub?.stop();
  };

  private joinHubAsync = async () => {
    const snapshot = await this.hub!.invoke<MeetingSnapshot>("Join");
    this.follow(snapshot);
  };

  private follow = (state: MeetingStateView) => {
    if (this.isDisposed) {
      return;
    }
    if (state.state === "Ended") {
      this.setState("ended");
      this.dispose();
    } else if (state.isInLobby) {
      this.setState("lobby");
    } else {
      this.openCode();
    }
  };

  // Joins the meet's code document once, after the lobby.
  private openCode = () => {
    if (this.provider) {
      if (this.state !== "live") {
        this.setState(this.provider.synced ? "live" : "syncing");
      }
      return;
    }

    this.setState("syncing");
    const ydoc = new Y.Doc();
    const relay = `${this.place.server.replace(/^http/, "ws")}/yjs`;
    const provider = new WebsocketProvider(relay, `${this.place.code}/code`, ydoc, {
      protocols: [RELAY_SUBPROTOCOL, this.token],
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
      disableBc: true,
    });
    provider.awareness.setLocalStateField("user", {
      name: this.place.participant.displayName,
      color: participantColor(this.place.participant.colorIndex),
      client: VSCODE_CLIENT,
    });
    this.ydoc = ydoc;
    this.provider = provider;

    const project = new CodeProject(ydoc);
    const onSync = (isSynced: boolean) => {
      if (!isSynced || this.isDisposed) {
        return;
      }
      this.setState("live");
      if (!this.mirror) {
        this.mirror = new FolderMirror(this.folder, project, this.manifest, this.saveManifest);
        this.cursors = new Cursors(provider.awareness, project, this.mirror.idOf);
        this.people = new People(provider.awareness, project, this.mirror.idOf, this.mirror.uriOf);
        void this.mirror.start().then(() => {
          this.cursors?.start();
          this.people?.start();
        });
      }
    };
    provider.on("sync", onSync);
    provider.on("status", ({ status }: { status: string }) => {
      if (status === "disconnected" && !this.isDisposed && this.state === "live") {
        this.setState("offline");
      } else if (status === "connected" && provider.synced) {
        this.setState("live");
      }
    });
  };

  private setState = (state: SessionState) => {
    this.state = state;
    this.onState(state);
  };
}
