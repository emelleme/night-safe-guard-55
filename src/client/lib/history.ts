import type { HistoryEntry, PayloadType } from "./nfc-types";

const STORAGE_KEY = "cardctrl.history.v1";
const MAX_ENTRIES = 40;

function safeParse(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.data === "string" &&
        typeof e.createdAt === "number",
    );
  } catch {
    return [];
  }
}

export function loadHistory(): HistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

export function saveHistory(entries: HistoryEntry[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function addHistoryEntry(
  partial: Omit<HistoryEntry, "id" | "createdAt">,
): HistoryEntry[] {
  const current = loadHistory();
  const normalized = partial.data.trim();
  if (!normalized) return current;

  // Dedupe: move matching recent entry to top instead of stacking clones
  const withoutDupes = current.filter(
    (e) => !(e.data === normalized && e.type === partial.type),
  );

  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    type: partial.type,
    data: normalized,
    label: partial.label?.trim() || undefined,
    action: partial.action,
    createdAt: Date.now(),
  };

  const next = [entry, ...withoutDupes].slice(0, MAX_ENTRIES);
  saveHistory(next);
  return next;
}

export function removeHistoryEntry(id: string): HistoryEntry[] {
  const next = loadHistory().filter((e) => e.id !== id);
  saveHistory(next);
  return next;
}

export function clearHistory(): HistoryEntry[] {
  saveHistory([]);
  return [];
}

export function pinLabel(id: string, label: string): HistoryEntry[] {
  const next = loadHistory().map((e) =>
    e.id === id ? { ...e, label: label.trim() || undefined } : e,
  );
  saveHistory(next);
  return next;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function displayTitle(entry: HistoryEntry): string {
  if (entry.label) return entry.label;
  if (entry.type === "url") {
    try {
      const u = new URL(entry.data);
      const path = u.pathname === "/" ? "" : u.pathname;
      return `${u.host}${path}${u.search}`;
    } catch {
      return entry.data;
    }
  }
  return entry.data.length > 48 ? `${entry.data.slice(0, 48)}…` : entry.data;
}

export function guessType(value: string): PayloadType {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return "url";
  return "text";
}
