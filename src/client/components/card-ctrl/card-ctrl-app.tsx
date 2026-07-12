import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addHistoryEntry,
  clearHistory,
  guessType,
  loadHistory,
  removeHistoryEntry,
} from "@/client/lib/history";
import {
  formatNfcError,
  generateShortCode,
  isNfcSupported,
  playTone,
  scanCard,
  vibrate,
  writeCard,
} from "@/client/lib/nfc";
import type {
  HistoryEntry,
  NfcStatus,
  PayloadType,
} from "@/client/lib/nfc-types";
import { HistoryList } from "./history-list";
import { StatusBanner } from "./status-banner";

const CODE_BASE = "https://red.viim.dev/";

export function CardCtrlApp() {
  const supported = useMemo(() => isNfcSupported(), []);
  const [payloadType, setPayloadType] = useState<PayloadType>("url");
  const [data, setData] = useState("");
  const [label, setLabel] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<NfcStatus>(
    supported ? "idle" : "unsupported",
  );
  const [message, setMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const cancelPending = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => () => cancelPending(), [cancelPending]);

  const setFeedback = useCallback(
    (next: NfcStatus, msg: string) => {
      setStatus(next);
      setMessage(msg);
    },
    [],
  );

  const remember = useCallback(
    (
      entry: Omit<HistoryEntry, "id" | "createdAt">,
      options?: { select?: boolean },
    ) => {
      const next = addHistoryEntry(entry);
      setHistory(next);
      if (options?.select !== false && next[0]) {
        setActiveId(next[0].id);
      }
    },
    [],
  );

  const handleGenerate = () => {
    const code = generateShortCode(8);
    const url = `${CODE_BASE}${code}`;
    setPayloadType("url");
    setData(url);
    setLabel(`Code ${code}`);
    setActiveId(null);
    remember(
      {
        type: "url",
        data: url,
        label: `Code ${code}`,
        action: "generate",
      },
      { select: true },
    );
    setFeedback("success", `Generated ${code} — ready to write.`);
    playTone("scan");
    vibrate(20);
  };

  const handleWrite = async () => {
    if (!supported) {
      setFeedback(
        "unsupported",
        "Writing needs Chrome on Android with NFC.",
      );
      return;
    }

    const trimmed = data.trim();
    if (!trimmed) {
      setFeedback("error", "Add a URL or text to write first.");
      playTone("error");
      return;
    }

    cancelPending();
    const controller = new AbortController();
    abortRef.current = controller;

    setFeedback("writing", "Hold a blank or rewritable card to your phone…");
    vibrate(15);

    try {
      await writeCard(
        { type: payloadType, data: trimmed, label: label || undefined },
        { signal: controller.signal },
      );
      remember({
        type: payloadType,
        data: trimmed,
        label: label || undefined,
        action: "write",
      });
      setFeedback("success", "Card written. You’re good to go.");
      playTone("success");
      vibrate([20, 40, 30]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setFeedback("idle", "Write cancelled.");
        return;
      }
      setFeedback("error", formatNfcError(err));
      playTone("error");
      vibrate([40, 40, 40]);
    } finally {
      abortRef.current = null;
    }
  };

  const handleScan = async () => {
    if (!supported) {
      setFeedback(
        "unsupported",
        "Scanning needs Chrome on Android with NFC.",
      );
      return;
    }

    cancelPending();
    const controller = new AbortController();
    abortRef.current = controller;

    setFeedback("scanning", "Hold a card to the back of your phone…");
    vibrate(15);

    try {
      await scanCard(
        (payload) => {
          setPayloadType(payload.type);
          setData(payload.data);
          setLabel("");
          remember({
            type: payload.type,
            data: payload.data,
            action: "scan",
          });
          setFeedback(
            "success",
            payload.type === "url"
              ? `Scanned URL: ${payload.data}`
              : "Card scanned into the editor.",
          );
          playTone("scan");
          vibrate([15, 30, 15]);
        },
        { signal: controller.signal },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setFeedback("idle", "Scan cancelled.");
        return;
      }
      setFeedback("error", formatNfcError(err));
      playTone("error");
      vibrate([40, 40, 40]);
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    cancelPending();
    setFeedback("idle", "Cancelled.");
  };

  const handleSelectHistory = (entry: HistoryEntry) => {
    setPayloadType(entry.type);
    setData(entry.data);
    setLabel(entry.label || "");
    setActiveId(entry.id);
    setFeedback("idle", "Loaded from history — tap Write to go.");
    vibrate(10);
  };

  const busy = status === "scanning" || status === "writing";

  const onDataChange = (value: string) => {
    setData(value);
    setActiveId(null);
    // Auto-switch type when paste looks like a URL
    if (value.trim() && payloadType === "text" && guessType(value) === "url") {
      setPayloadType("url");
    }
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#070b14] text-white">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="absolute -right-16 top-40 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-bold shadow-lg shadow-violet-500/30">
                N
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                CardCtrl
              </p>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Tap. Write. Done.
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Mobile NFC writer with local quick-access history.
            </p>
          </div>
          <SupportBadge supported={supported} />
        </header>

        <div className="mb-4">
          <StatusBanner
            status={status}
            message={message}
            supported={supported}
          />
        </div>

        <section className="mb-5 space-y-3 rounded-3xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur">
          <div className="flex gap-2 rounded-2xl bg-black/30 p-1">
            {(
              [
                { id: "url", label: "URL" },
                { id: "text", label: "Text" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                disabled={busy}
                onClick={() => setPayloadType(tab.id)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
                  payloadType === tab.id
                    ? "bg-white text-slate-900 shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              {payloadType === "url" ? "Link to write" : "Text payload"}
            </span>
            <textarea
              value={data}
              onChange={(e) => onDataChange(e.target.value)}
              disabled={busy}
              rows={3}
              inputMode={payloadType === "url" ? "url" : "text"}
              autoCapitalize={payloadType === "url" ? "none" : "sentences"}
              autoCorrect={payloadType === "url" ? "off" : "on"}
              spellCheck={payloadType !== "url"}
              placeholder={
                payloadType === "url"
                  ? "https://example.com/your-card"
                  : "Plain text for the tag…"
              }
              className="w-full resize-none rounded-2xl border-0 bg-black/40 px-4 py-3.5 text-[16px] leading-relaxed text-white outline-none ring-1 ring-white/10 placeholder:text-slate-600 focus:ring-2 focus:ring-violet-400/50 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Label <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy}
              placeholder="e.g. Front desk badge"
              className="w-full rounded-2xl border-0 bg-black/40 px-4 py-3 text-[16px] text-white outline-none ring-1 ring-white/10 placeholder:text-slate-600 focus:ring-2 focus:ring-violet-400/50 disabled:opacity-60"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy}
              className="flex-1 rounded-2xl bg-white/5 py-3 text-sm font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
            >
              Generate code
            </button>
            <button
              type="button"
              onClick={() => {
                setData("");
                setLabel("");
                setActiveId(null);
                setFeedback("idle", "");
              }}
              disabled={busy || (!data && !label)}
              className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </section>

        <section className="mb-4 flex-1">
          <HistoryList
            entries={history}
            activeId={activeId}
            onSelect={handleSelectHistory}
            onRemove={(id) => {
              setHistory(removeHistoryEntry(id));
              if (activeId === id) setActiveId(null);
            }}
            onClear={() => {
              setHistory(clearHistory());
              setActiveId(null);
              setFeedback("idle", "History cleared.");
            }}
          />
        </section>
      </div>

      {/* Sticky tap-and-go action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#070b14]/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg gap-3">
          {busy ? (
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-2xl bg-white/10 py-4 text-base font-semibold text-white ring-1 ring-white/15 transition active:scale-[0.98]"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleScan}
                className="flex min-w-[6.5rem] flex-col items-center justify-center rounded-2xl bg-white/5 px-3 py-3 text-sm font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98]"
              >
                <ScanIcon />
                <span className="mt-1">Scan</span>
              </button>
              <button
                type="button"
                onClick={handleWrite}
                className="relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 py-4 text-base font-bold text-white shadow-lg shadow-violet-600/30 transition active:scale-[0.98]"
              >
                <span className="absolute inset-0 bg-white/10 opacity-0 transition group-active:opacity-100" />
                <WriteIcon />
                Write to card
              </button>
            </>
          )}
        </div>
        {busy ? (
          <p className="mx-auto mt-2 max-w-lg text-center text-xs text-slate-400">
            Keep the card against the NFC spot until you feel the buzz.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SupportBadge({ supported }: { supported: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        supported
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20"
          : "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20"
      }`}
    >
      {supported ? "NFC ready" : "No NFC"}
    </span>
  );
}

function ScanIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}

function WriteIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
