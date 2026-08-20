// Session sync — WebSocket relay client for sweep pairing.
//
// Ticket #1 (tracer bullet): plaintext "hello" messages through the
// SessionDO relay (worker/src/session.ts). The relay is a dumb echo pipe;
// all protocol lives here on the client.
//
// Extension seams for the chain:
//   - #2 (QR pairing, 1:1 enforcement): the message envelope already
//     carries a `type` and `peerId`; join/leave and peer-count messages
//     slot in without touching the pipe.
//   - #3 (end-to-end encryption): the envelope gains an encrypted payload
//     variant; the relay keeps relaying opaque messages.
//
// This module is DOM-free — the UI wiring lives in app.ts.

export type SyncStatus = "idle" | "connecting" | "connected" | "closed";

export interface SyncMessage {
  type: string;
  peerId: string;
  [key: string]: unknown;
}

export interface SyncHandle {
  readonly sessionId: string;
  readonly peerId: string;
  send(message: SyncMessage): void;
  close(): void;
}

export interface SyncOptions {
  onMessage(message: SyncMessage): void;
  onStatus(status: SyncStatus): void;
}

// Open a WebSocket to the session relay for `sessionId` and send a hello
// on connect. The relay echoes messages to other sockets in the session;
// this tab never receives its own messages back.
export function connectSession(
  sessionId: string,
  options: SyncOptions,
): SyncHandle {
  const peerId = crypto.randomUUID();
  const ws = new WebSocket(`/ws?s=${encodeURIComponent(sessionId)}`);

  ws.addEventListener("open", () => {
    options.onStatus("connected");
    ws.send(JSON.stringify({ type: "hello", peerId }));
  });

  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as SyncMessage;
      if (message && typeof message.type === "string") {
        options.onMessage(message);
      }
    } catch {
      // Non-JSON payloads are ignored; the envelope is the contract.
    }
  });

  ws.addEventListener("close", () => options.onStatus("closed"));
  ws.addEventListener("error", () => options.onStatus("closed"));

  return {
    sessionId,
    peerId,
    send(message: SyncMessage): void {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
    close(): void {
      ws.close();
    },
  };
}

// The URL a second tab should open to join the same session.
export function joinUrl(sessionId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("s", sessionId);
  return url.toString();
}

// Session id from the URL (?s=<session-id>), if present.
export function sessionIdFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("s");
}
