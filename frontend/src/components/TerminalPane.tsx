import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";

export type TerminalStatus = "connecting" | "connected" | "disconnected";

interface TerminalPaneProps {
  wsTicket: string;
  /** Fired when the socket closes for a reason other than this component unmounting/reconnecting on purpose. */
  onExit?: () => void;
  onStatusChange?: (status: TerminalStatus) => void;
}

export function TerminalPane({ wsTicket, onExit, onStatusChange }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Callbacks are read via refs (kept fresh below) rather than being effect
  // dependencies, so a parent re-render that passes a new function identity
  // doesn't tear down and reconnect an otherwise-healthy socket.
  const onExitRef = useRef(onExit);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onExitRef.current = onExit;
    onStatusChangeRef.current = onStatusChange;
  }, [onExit, onStatusChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    let intentionalClose = false;
    onStatusChangeRef.current?.("connecting");

    const term = new Terminal({ cursorBlink: true, convertEol: true, fontSize: 14 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws/terminal?ticket=${encodeURIComponent(wsTicket)}`);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      onStatusChangeRef.current?.("connected");
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        term.write(event.data);
      } else {
        term.write(new Uint8Array(event.data));
      }
    };
    ws.onclose = () => {
      term.write("\r\n\r\n[connection closed]\r\n");
      onStatusChangeRef.current?.("disconnected");
      if (!intentionalClose) onExitRef.current?.();
    };

    const dataListener = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      // Mark this close as intentional (unmount, or the wsTicket prop changed for a
      // reconnect) so the resulting onclose event doesn't also fire onExit — that's
      // reserved for closes we didn't initiate ourselves.
      intentionalClose = true;
      dataListener.dispose();
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [wsTicket]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
