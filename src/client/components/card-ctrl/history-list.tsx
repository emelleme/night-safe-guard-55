import {
  displayTitle,
  relativeTime,
} from "@/client/lib/history";
import type { HistoryEntry } from "@/client/lib/nfc-types";

interface HistoryListProps {
  entries: HistoryEntry[];
  activeId?: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function HistoryList({
  entries,
  activeId,
  onSelect,
  onRemove,
  onClear,
}: HistoryListProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
        <p className="text-sm text-slate-400">
          No history yet. Write or scan a card and it shows up here for
          one-tap reuse.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Quick access
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-slate-500 transition hover:text-rose-300 active:scale-95"
        >
          Clear all
        </button>
      </div>

      <ul className="space-y-2">
        {entries.map((entry) => {
          const active = entry.id === activeId;
          return (
            <li key={entry.id}>
              <div
                className={`group flex items-stretch overflow-hidden rounded-2xl ring-1 transition ${
                  active
                    ? "bg-violet-500/15 ring-violet-400/40"
                    : "bg-white/[0.04] ring-white/10 hover:bg-white/[0.07]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  className="min-w-0 flex-1 px-4 py-3.5 text-left active:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <TypePill type={entry.type} />
                    <ActionPill action={entry.action} />
                    <span className="ml-auto shrink-0 text-[11px] text-slate-500">
                      {relativeTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-[15px] font-medium text-white">
                    {displayTitle(entry)}
                  </p>
                  {entry.label ? (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {entry.data}
                    </p>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label="Remove from history"
                  onClick={() => onRemove(entry.id)}
                  className="flex w-12 shrink-0 items-center justify-center border-l border-white/5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300 active:scale-95"
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TypePill({ type }: { type: HistoryEntry["type"] }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        type === "url"
          ? "bg-cyan-500/15 text-cyan-300"
          : "bg-amber-500/15 text-amber-300"
      }`}
    >
      {type}
    </span>
  );
}

function ActionPill({ action }: { action: HistoryEntry["action"] }) {
  const label =
    action === "write" ? "wrote" : action === "scan" ? "scanned" : "generated";
  return (
    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {label}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
