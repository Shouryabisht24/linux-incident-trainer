import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { logger } from "../lib/logger.js";
import { attachOrCreateShell, endShellSession, isContainerAlive, releaseSocket } from "../services/docker.service.js";
import { getSessionForUser, heartbeat, verifyWsTicket } from "../services/session.service.js";

const wss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 });

// Heartbeat: detects dead peers (e.g. a laptop that went to sleep without a
// clean TCP close) so they don't linger as phantom entries in wss.clients.
// `ws.terminate()` still fires the socket's normal "close" event, so
// `releaseSocket` cleanup below runs unchanged for a terminated client.
const PING_INTERVAL_MS = 30_000;

function heartbeatSweep(): void {
  for (const raw of wss.clients) {
    const client = raw as WebSocket & { isAlive?: boolean };
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}

const pingTimer = setInterval(heartbeatSweep, PING_INTERVAL_MS);
pingTimer.unref();

/** Cleanly close all live terminal sockets (used during graceful shutdown). */
export function closeAllTerminals(): void {
  clearInterval(pingTimer);
  for (const client of wss.clients) {
    try {
      client.close(1001, "server shutting down");
    } catch {
      /* ignore */
    }
  }
}

export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const url = new URL(req.url ?? "", "http://internal");
  if (url.pathname !== "/ws/terminal") {
    socket.destroy();
    return;
  }

  const ticket = url.searchParams.get("ticket");
  if (!ticket) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  let claims: { sessionId: string; userId: string };
  try {
    claims = verifyWsTicket(ticket);
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    bridge(ws, claims.sessionId, claims.userId).catch((err) => {
      logger.error("terminal bridge error", { err });
      ws.close();
    });
  });
}

async function bridge(ws: WebSocket, sessionId: string, userId: string): Promise<void> {
  const session = await getSessionForUser(sessionId, userId);
  if (!session.container_id || !["running", "checking"].includes(session.status)) {
    ws.close(1008, "session not running");
    return;
  }
  if (!(await isContainerAlive(session.container_id))) {
    endShellSession(session.container_id);
    ws.close(1011, "container not running");
    return;
  }

  const client = ws as WebSocket & { isAlive?: boolean };
  client.isAlive = true;
  ws.on("pong", () => {
    client.isAlive = true;
  });

  const { session: term, resumed } = await attachOrCreateShell(session.container_id);
  term.sockets.add(ws);

  if (resumed) {
    ws.send("\r\n\x1b[2m[reconnected — shell session resumed]\x1b[0m\r\n");
  }

  ws.on("error", (err) => {
    logger.warn("terminal ws error", { sessionId, containerId: session.container_id, err });
  });

  ws.on("message", (data, isBinary) => {
    const buf = toBuffer(data);
    if (!isBinary) {
      const text = buf.toString("utf8");
      if (text.startsWith("{")) {
        try {
          const msg = JSON.parse(text);
          if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
            term.resize({ h: msg.rows, w: msg.cols }).catch(() => {});
            return;
          }
        } catch {
          // fall through to writing raw text as terminal input
        }
      }
    }
    heartbeat(sessionId, userId).catch(() => {});
    term.stream.write(buf);
  });

  ws.on("close", () => {
    releaseSocket(session.container_id!, ws);
  });
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
