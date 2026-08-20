// SessionDO — per-session WebSocket relay.
//
// One Durable Object instance per session-id (getByName(sessionId)), so a
// session's sockets always land on the same instance. The DO uses the
// Hibernation WebSocket API: sockets are accepted via ctx.acceptWebSocket
// and the DO can go to sleep between events; webSocketMessage /
// webSocketClose / webSocketError wake it only when there is work.
//
// This is ticket #1 of a 3-ticket chain (tracer bullet: plaintext, no
// crypto, no 1:1 enforcement). The relay is deliberately dumb — it echoes
// every message to every other attached socket. Tickets #2 (QR pairing,
// 1:1 enforcement) and #3 (end-to-end encryption) extend this class and
// the message envelope in apps/sweep/src/lib/sync.ts rather than rewriting
// the pipe.

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

export class SessionDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Auto-reply to client pings without waking the DO. A later ticket will
    // add a keepalive that sends "ping"; without this auto-response every
    // keepalive would spin the instance up. Today nothing sends "ping", so
    // this is a forward-looking seam — but configuring it now means the relay
    // is ready and the keepalive can land in the client without touching the
    // DO.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Echo relay: forward every message to all other attached sockets.
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const others = this.ctx.getWebSockets().filter((s) => s !== ws);
    for (const socket of others) {
      socket.send(message);
    }
  }

  webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): void {
    // The socket is already detached and closed when this fires; the
    // hibernation API handles cleanup. Nothing to do.
  }

  webSocketError(_ws: WebSocket, _error: unknown): void {
    // The socket is already closed when this fires; the hibernation API
    // handles cleanup. Nothing to do.
  }
}
