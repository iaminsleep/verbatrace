import Dexie, { type Table } from "dexie";

type Details = Record<string, number | boolean | string | null>;

interface DiagnosticError {
  name: string;
  stack: string | null;
  cause?: DiagnosticError;
}

interface DiagnosticEvent {
  sessionId: string;
  sequence: number;
  time: string;
  event: string;
  details?: Details;
  error?: DiagnosticError;
}

export interface DiagnosticSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  environment: { appVersion: string; locale: string; theme: string | null; isolated: boolean; browser: string };
}

class DiagnosticStore extends Dexie {
  sessions!: Table<DiagnosticSession, string>;
  events!: Table<DiagnosticEvent, [string, number]>;

  constructor() {
    super("verbatrace-diagnostics");
    this.version(1).stores({
      sessions: "id, startedAt",
      events: "[sessionId+sequence], sessionId",
    });
  }
}

const store = new DiagnosticStore();
const preference = "verbatrace-enable-logs";
const retentionMs = 14 * 24 * 60 * 60 * 1000;
const eventLimit = 5000;
const listeners = new Set<() => void>();
let enabled = true;
let available = true;
let initialized = false;
let active: DiagnosticSession | null = null;
let sequence = 0;
let pending: Promise<void> = Promise.resolve();
let appVersion = "";

export const subscribeDiagnostics = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const diagnosticsEnabled = () => enabled;
export const diagnosticsAvailable = () => available;

function notify() {
  for (const listener of listeners) listener();
}

function persist(operation: () => Promise<unknown>) {
  pending = pending.then(async () => {
    if (!available) return;
    try {
      await operation();
    } catch {
      available = false;
      notify();
    }
  });
}

export function logEvent(event: string, details?: Details) {
  append(event, details);
}

function append(event: string, details?: Details, error?: DiagnosticError) {
  if (!active || !available || sequence > eventLimit) return;
  const atLimit = sequence === eventLimit;
  const row: DiagnosticEvent = {
    sessionId: active.id,
    sequence: sequence++,
    time: new Date().toISOString(),
    event: atLimit ? "session.event_limit" : event,
    ...(atLimit ? {} : { details, error }),
  };
  persist(() => store.events.add(row));
}

function cleanFrames(stack: string): string | null {
  const frames = stack.split("\n").filter((line) => /^\s+at\s|^[^@\s]*@\S/.test(line));
  return frames.map((line) => line.replace(/(?:blob:|file:|https?:)[^\s)]+/g, (location) => {
    const parts = /^(.*?)(:\d+:\d+)?$/.exec(location);
    const address = parts?.[1] ?? location;
    const position = parts?.[2] ?? "";
    try {
      const url = new URL(address);
      if (url.protocol === "blob:") return `<blob>${position}`;
      if (url.origin === window.location.origin) return url.pathname + position;
    } catch {}
    return `<external>${position}`;
  })).join("\n") || null;
}

function describeError(error: unknown, seen = new Set<unknown>()): DiagnosticError {
  if (!(error instanceof Error)) return { name: "NonErrorThrown", stack: null };
  const name = /^[\w.-]{1,64}$/.test(error.name) ? error.name : "Error";
  const result: DiagnosticError = {
    name,
    stack: typeof error.stack === "string" ? cleanFrames(error.stack) : null,
  };
  if (error.cause !== undefined && !seen.has(error.cause) && seen.size < 8) {
    seen.add(error);
    result.cause = describeError(error.cause, seen);
  }
  return result;
}

export function logError(event: string, error: unknown, details?: Details) {
  if (active && available) append(event, details, describeError(error));
}

function start(reason: string) {
  if (!enabled || active) return;
  const startedAt = new Date().toISOString();
  const session = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    startedAt,
    environment: {
      appVersion,
      locale: document.documentElement.lang,
      theme: document.documentElement.dataset.theme ?? null,
      isolated: window.crossOriginIsolated,
      browser: navigator.userAgent,
    },
  };
  active = session;
  sequence = 0;
  persist(() => store.sessions.add(session));
  logEvent("session.start", { reason });
  persist(async () => {
    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    await store.transaction("rw", store.sessions, store.events, async () => {
      const expired = await store.sessions.where("startedAt").below(cutoff).primaryKeys();
      if (expired.length === 0) return;
      await store.events.where("sessionId").anyOf(expired).delete();
      await store.sessions.bulkDelete(expired);
    });
  });
}

function end(reason: string) {
  if (!active) return;
  const { id } = active;
  logEvent("session.end", { reason });
  active = null;
  const endedAt = new Date().toISOString();
  persist(() => store.sessions.update(id, { endedAt }));
}

function applyPreference(value: boolean) {
  if (enabled === value) return;
  if (!value) end("disabled");
  enabled = value;
  if (value) start("enabled");
  notify();
}

export function setDiagnosticsEnabled(value: boolean) {
  try {
    localStorage.setItem(preference, String(value));
  } catch {
    applyPreference(value);
    return false;
  }
  applyPreference(value);
  return true;
}

export function startDiagnostics(version: string) {
  if (initialized) return;
  initialized = true;
  appVersion = version;
  try { enabled = localStorage.getItem(preference) !== "false"; } catch {}
  start("opened");
  window.addEventListener("error", (event) => logError("window.error", event.error, {
    line: event.lineno, column: event.colno,
  }));
  window.addEventListener("unhandledrejection", (event) => logError("window.unhandled_rejection", event.reason));
  document.addEventListener("visibilitychange", () => logEvent("session.visibility", { state: document.visibilityState }));
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) logEvent("session.suspend");
    else end("pagehide");
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) logEvent("session.resume");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === preference || event.key === null) applyPreference(event.newValue !== "false");
  });
}

export async function listDiagnosticSessions() {
  await pending;
  const cutoff = new Date(Date.now() - retentionMs).toISOString();
  return store.sessions.where("startedAt").aboveOrEqual(cutoff).reverse().toArray();
}

export async function exportDiagnosticSession(id: string) {
  await pending;
  return store.transaction("r", store.sessions, store.events, async () => {
    const session = await store.sessions.get(id);
    if (!session) throw new Error("Diagnostic session not found");
    const rows = await store.events.where("sessionId").equals(id).sortBy("sequence");
    const events = rows.map(({ sessionId: _sessionId, ...event }) => event);
    const json = JSON.stringify({ formatVersion: 1, session, events }, null, 2);
    return {
      blob: new Blob([json], { type: "application/json" }),
      filename: `logs_session_${session.startedAt.slice(0, 19).replace("T", "_").replaceAll(":", "-")}_UTC_${id.slice(0, 8)}.json`,
    };
  });
}
