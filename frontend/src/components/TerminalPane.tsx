import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

export type TerminalStatus = "connecting" | "connected" | "disconnected";

interface TerminalPaneProps {
  wsTicket: string;
  /** Fired when the socket closes for a reason other than this component unmounting/reconnecting on purpose. */
  onExit?: () => void;
  onStatusChange?: (status: TerminalStatus) => void;
}

// Builds an xterm theme from this app's own --term-mock-* tokens (styles.css) rather than
// its light-theme --color-* tokens — the terminal is deliberately always-dark (see the CSS
// comment above .terminal-wrap), independent of the app's light/dark mode. Magenta/cyan/white
// and their bright variants are left unset on purpose: this token set doesn't define opinions
// for those, so xterm's own defaults carry them.
function readTerminalTheme(): ITheme {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  return {
    background: token("--term-mock-bg"),
    foreground: token("--term-mock-text"),
    cursor: token("--term-mock-text-bright"),
    cursorAccent: token("--term-mock-bg"),
    black: token("--term-mock-bg"),
    brightBlack: token("--term-mock-text-faint"),
    brightWhite: token("--term-mock-text-bright"),
    red: token("--term-mock-danger"),
    green: token("--term-mock-success"),
    yellow: token("--term-mock-warning"),
    blue: token("--term-mock-prompt"),
  };
}

// ---------------------------------------------------------------------------
// Mobile/touch key row — real troubleshooting needs Esc/Tab/arrows/Ctrl combos
// that a phone's on-screen keyboard can't send. Every button feeds bytes
// through `term.input(bytes, false)`, the same public pipeline real keystrokes
// already use (term.onData -> ws.send in the socket effect below), so this row
// can never drift from how input is actually transmitted. The "Ctrl" button
// arms a one-shot modifier: whatever the *next* keystroke is (typed on the
// device's own keyboard, or another row button) gets converted to its real
// Ctrl-byte if it's a single letter, letting the user reach arbitrary Ctrl
// combos (Ctrl+R, Ctrl+U, Ctrl+A/E) that a fixed preset of buttons can't
// anticipate.
// ---------------------------------------------------------------------------

const NAMED_KEYS: { label: string; bytes: string }[] = [
  { label: "Esc", bytes: "\x1b" },
  { label: "Tab", bytes: "\t" },
  { label: "^C", bytes: "\x03" },
  { label: "^D", bytes: "\x04" },
  { label: "^Z", bytes: "\x1a" },
  { label: "^L", bytes: "\x0c" },
];

const ARROW_KEYS: { label: string; bytes: string }[] = [
  { label: "↑", bytes: "\x1b[A" },
  { label: "↓", bytes: "\x1b[B" },
  { label: "←", bytes: "\x1b[D" },
  { label: "→", bytes: "\x1b[C" },
];

interface TouchKeyRowProps {
  term: Terminal;
  ctrlArmed: boolean;
  onToggleCtrl: () => void;
}

function TouchKeyRow({ term, ctrlArmed, onToggleCtrl }: TouchKeyRowProps) {
  function press(bytes: string) {
    term.input(bytes, false);
  }

  return (
    <div className="terminal-touch-row" role="toolbar" aria-label="Terminal key shortcuts">
      {NAMED_KEYS.map((key) => (
        <button key={key.label} type="button" className="terminal-touch-key" onClick={() => press(key.bytes)}>
          {key.label}
        </button>
      ))}
      {ARROW_KEYS.map((key) => (
        <button key={key.label} type="button" className="terminal-touch-key" onClick={() => press(key.bytes)}>
          {key.label}
        </button>
      ))}
      <button
        type="button"
        className={`terminal-touch-key${ctrlArmed ? " terminal-touch-key-armed" : ""}`}
        aria-pressed={ctrlArmed}
        onClick={onToggleCtrl}
      >
        Ctrl
      </button>
    </div>
  );
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

  // term/fit live for the whole component lifetime (mount-once effect below);
  // the socket effect reads them via these refs so a reconnect never recreates
  // the terminal itself, preserving scrollback across a dropped connection.
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [touchUiEnabled, setTouchUiEnabled] = useState(false);
  const [ctrlArmed, setCtrlArmed] = useState(false);
  const ctrlArmedRef = useRef(false);

  function toggleCtrl() {
    const next = !ctrlArmedRef.current;
    ctrlArmedRef.current = next;
    setCtrlArmed(next);
  }

  function sendResizeIfOpen() {
    const term = termRef.current;
    const ws = wsRef.current;
    if (term && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    }
  }

  // Mount-once effect: creates the Terminal/FitAddon, opens it, wires the
  // ResizeObserver and the font-ready re-fit — everything the old single
  // effect did except creating the WebSocket. Runs exactly once for the life
  // of this component instance.
  useEffect(() => {
    if (!containerRef.current) return;

    setTouchUiEnabled(window.matchMedia("(pointer: coarse)").matches);

    // fontFamily is additive only — xterm falls back through the rest of the stack (its own
    // built-in monospace default lives after these) if the self-hosted Plex Mono woff2 hasn't
    // finished loading yet, so a slow font fetch never blocks the terminal from opening.
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 14,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace',
      theme: readTerminalTheme(),
      scrollback: 10000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      sendResizeIfOpen();
    });
    resizeObserver.observe(containerRef.current);

    // The very first fit() above can run before the self-hosted Plex Mono woff2 finishes loading,
    // in which case xterm measures its cell size off a fallback font — usually near-identical, but
    // re-fitting once the real font is ready guards against a subtly-off cols/rows on that first
    // render. document.fonts is universally supported in the browsers this app already requires
    // for WebSocket/xterm, so no feature-detect fallback is needed.
    document.fonts.ready.then(() => {
      if (disposed) return;
      fit.fit();
      sendResizeIfOpen();
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket-only effect: creates the WebSocket for the current ticket and wires
  // it to the already-existing terminal (read via refs). Re-runs whenever
  // wsTicket changes (manual/auto reconnect) WITHOUT disposing the terminal or
  // its ResizeObserver, so scrollback and the on-screen buffer survive a
  // reconnect — the backend (docker.service.ts's exec registry) now offers
  // real shell continuity to resume into, so recreating the terminal on every
  // reconnect would just be throwing away UI state for no reason.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    let intentionalClose = false;
    onStatusChangeRef.current?.("connecting");

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws/terminal?ticket=${encodeURIComponent(wsTicket)}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

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
    // Local flag only — onclose remains the single source of truth for status/exit callbacks.
    let hadError = false;
    ws.onerror = () => {
      hadError = true;
    };
    ws.onclose = () => {
      if (intentionalClose) {
        term.write("\r\n\r\n[connection closed]\r\n");
      } else {
        term.write("\r\n\x1b[2m[connection lost — reconnecting…]\x1b[0m\r\n");
      }
      onStatusChangeRef.current?.("disconnected");
      if (!intentionalClose) onExitRef.current?.();
      void hadError;
    };

    const dataListener = term.onData((data) => {
      let payload = data;
      if (ctrlArmedRef.current) {
        ctrlArmedRef.current = false;
        setCtrlArmed(false);
        if (data.length === 1 && /[a-zA-Z]/.test(data)) {
          payload = String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64);
        }
      }
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });

    return () => {
      // Mark this close as intentional (unmount, or the wsTicket prop changed for a
      // reconnect) so the resulting onclose event doesn't also fire onExit — that's
      // reserved for closes we didn't initiate ourselves.
      intentionalClose = true;
      dataListener.dispose();
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [wsTicket]);

  return (
    <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      {touchUiEnabled && termRef.current && (
        <TouchKeyRow term={termRef.current} ctrlArmed={ctrlArmed} onToggleCtrl={toggleCtrl} />
      )}
    </div>
  );
}
