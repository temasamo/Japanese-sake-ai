// src/lib/search/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

export function slog(level: LogLevel, msg: string, extra?: unknown) {
  const line = `[${new Date().toISOString()}][${level.toUpperCase()}] ${msg}`;
  if (level === "error") console.error(line, extra ?? "");
  else if (level === "warn") console.warn(line, extra ?? "");
  else if (level === "info") console.info(line, extra ?? "");
  else console.debug(line, extra ?? "");
}
