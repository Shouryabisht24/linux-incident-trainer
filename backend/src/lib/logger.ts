// Minimal leveled logger. This is a personal, single-node tool, so we keep it
// dependency-free and simple: timestamped, leveled lines with an optional
// structured context object. Set LOG_LEVEL=debug|info|warn|error (default info).
type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[(process.env.LOG_LEVEL as Level) in LEVELS ? (process.env.LOG_LEVEL as Level) : "info"];

function emit(level: Level, msg: string, ctx?: Record<string, unknown>): void {
  if (LEVELS[level] < MIN) return;
  const ts = new Date().toISOString();
  const suffix = ctx && Object.keys(ctx).length ? " " + safeJson(ctx) : "";
  const line = `${ts} ${level.toUpperCase().padEnd(5)} ${msg}${suffix}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function safeJson(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message } : v));
  } catch {
    return "[unserializable context]";
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
