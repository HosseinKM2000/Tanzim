import { appLogger } from "@/lib/logger-sdk";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

type RemoteLogItem = {
  level: "info" | "warn" | "error" | "critical";
  source: string;
  event: string;
  message: string;
  request_id?: string;
  path?: string;
  status_code?: number;
  details?: Record<string, unknown>;
};

const queue: RemoteLogItem[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let handlersInstalled = false;

function scheduleFlush() {
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushRemoteLogs();
  }, 1_500);
}

export async function flushRemoteLogs() {
  if (flushing || queue.length === 0 || typeof fetch === "undefined") return;
  flushing = true;
  const batch = queue.splice(0, 20);
  try {
    await fetch(`${API_BASE_URL}/logs/client`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch }),
      keepalive: true,
    });
  } catch {
    // Re-queue up to 20 items silently if offline; never throw from logger.
    queue.unshift(...batch.slice(0, Math.max(0, 20 - queue.length)));
  } finally {
    flushing = false;
    if (queue.length > 0) scheduleFlush();
  }
}

export function enqueueRemoteLog(item: RemoteLogItem) {
  if (item.path === "/logs/client" || item.path?.includes("/logs/ingest")) return;
  if (queue.length >= 50) queue.shift();
  queue.push(item);
  scheduleFlush();

  // Also bridge to Central Multi-Tenant AppLogger
  appLogger.log({
    level: item.level,
    category: item.source || "frontend",
    action: item.event,
    title: item.event,
    message: item.message,
    metadata: {
      ...item.details,
      status_code: item.status_code,
      request_id: item.request_id,
    },
    context: {
      path: item.path || (typeof window !== "undefined" ? window.location.pathname : undefined),
    },
  });
}

export function logAppOperation(
  action: string,
  title: string,
  details?: Record<string, unknown>,
  category = "operation",
  storeId?: number | null,
  phone?: string | null
) {
  appLogger.log({
    level: "info",
    category,
    action,
    title,
    message: typeof details?.message === "string" ? details.message : undefined,
    storeId,
    phone,
    metadata: details,
  });
}

export function installRemoteErrorHandlers() {
  if (handlersInstalled || typeof window === "undefined") return;
  handlersInstalled = true;

  window.addEventListener("error", (event) => {
    enqueueRemoteLog({
      level: "error",
      source: "frontend",
      event: "window.error",
      message: event.message || "Unhandled window error",
      path: window.location.pathname,
      details: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason ?? "Unhandled promise rejection");
    enqueueRemoteLog({
      level: "error",
      source: "frontend",
      event: "window.unhandledrejection",
      message: reason.slice(0, 500),
      path: window.location.pathname,
    });
  });
}
