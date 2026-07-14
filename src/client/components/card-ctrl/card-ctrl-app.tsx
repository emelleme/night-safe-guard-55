import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addHistoryEntry,
  clearHistory,
  loadHistory,
  removeHistoryEntry,
} from "@/client/lib/history";
import {
  formatBarcodeError,
  isBarcodeSupported,
  scanBarcodeFromFile,
  startBarcodeScanner,
  supportedBarcodeLabels,
  type BarcodeScannerSession,
} from "@/client/lib/barcode";
import {
  formatNfcError,
  generateShortCode,
  isNfcSupported,
  playTone,
  scanCard,
  vibrate,
  writeCard,
} from "@/client/lib/nfc";
import { guessType, resolvePayloadPreview } from "@/client/lib/payload";
import type {
  CardPayload,
  HistoryEntry,
  NfcStatus,
  PayloadType,
} from "@/client/lib/nfc-types";
import { HistoryList } from "./history-list";
import { PayloadPreview } from "./payload-preview";
import { StatusBanner } from "./status-banner";

const CODE_BASE = "https://cardctrl.pages.dev/";
const EMPTY_DRAFT: CardPayload = {
  type: "url",
  data: "",
  source: "manual",
};

export function CardCtrlApp() {
  const nfcSupported = useMemo(() => isNfcSupported(), []);
  const cameraSupported = useMemo(() => isBarcodeSupported(), []);
  const barcodeFormats = useMemo(() => supportedBarcodeLabels().join(" • "), []);

  const [draft, setDraft] = useState<CardPayload>(EMPTY_DRAFT);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<NfcStatus>(
    nfcSupported ? "idle" : "unsupported",
  );
  const [message, setMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const barcodeSessionRef = useRef<BarcodeScannerSession | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const stopBarcodeSession = useCallback(() => {
    barcodeSessionRef.current?.stop();
    barcodeSessionRef.current = null;
    setTorchAvailable(false);
    setTorchEnabled(false);
  }, []);

  const cancelPending = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopBarcodeSession();
  }, [stopBarcodeSession]);

  useEffect(() => () => cancelPending(), [cancelPending]);

  const setFeedback = useCallback((next: NfcStatus, nextMessage: string) => {
    setStatus(next);
    setMessage(nextMessage);
  }, []);

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

  const applyPayload = useCallback(
    (
      payload: CardPayload,
      options?: {
        action?: HistoryEntry["action"];
        message?: string;
        selectHistory?: boolean;
      },
    ) => {
      setDraft(payload);
      setActiveId(null);

      if (options?.action) {
        remember(
          {
            type: payload.type,
            data: payload.data,
            label: payload.label,
            kind: payload.kind,
            source: payload.source,
            format: payload.format,
            action: options.action,
          },
          { select: options.selectHistory },
        );
      }

      if (options?.message) {
        setFeedback("success", options.message);
      }
    },
    [remember, setFeedback],
  );

  const preview = useMemo(() => resolvePayloadPreview(draft), [draft]);
  const busy =
    status === "scanning" ||
    status === "writing" ||
    status === "barcode-scanning";

  useEffect(() => {
    if (!scannerOpen || !cameraSupported || !videoRef.current) return undefined;

    let active = true;

    startBarcodeScanner({
      video: videoRef.current,
      onRead: (payload) => {
        if (!active) return;
        stopBarcodeSession();
        setScannerOpen(false);
        applyPayload(payload, {
          action: "scan",
          message: `${payload.format || "Barcode"} scanned into the editor.`,
        });
        playTone("scan");
        vibrate([15, 30, 15]);
      },
    })
      .then((session) => {
        if (!active) {
          session.stop();
          return;
        }
        barcodeSessionRef.current = session;
        setTorchAvailable(Boolean(session.switchTorch));
      })
      .catch((error) => {
        if (!active) return;
        stopBarcodeSession();
        setScannerOpen(false);
        setFeedback("error", formatBarcodeError(error));
        playTone("error");
        vibrate([40, 40, 40]);
      });

    return () => {
      active = false;
      stopBarcodeSession();
    };
  }, [
    applyPayload,
    cameraSupported,
    scannerOpen,
    setFeedback,
    stopBarcodeSession,
  ]);

  const handleGenerate = () => {
    const code = generateShortCode(8);
    const url = `${CODE_BASE}${code}`;

    applyPayload(
      {
        type: "url",
        data: url,
        label: `Code ${code}`,
        source: "generate",
      },
      {
        action: "generate",
        message: `Generated ${code} and loaded it into the writer.`,
        selectHistory: true,
      },
    );

    playTone("scan");
    vibrate(20);
  };

  const handleWrite = async () => {
    if (!nfcSupported) {
      setFeedback(
        "unsupported",
        "Writing needs Chrome on Android with NFC enabled.",
      );
      return;
    }

    const trimmed = draft.data.trim();
    if (!trimmed) {
      setFeedback("error", "Add a URL or text payload before writing.");
      playTone("error");
      return;
    }

    cancelPending();
    setScannerOpen(false);

    const controller = new AbortController();
    abortRef.current = controller;

    setFeedback("writing", "Hold a blank or rewritable card to your phone…");
    vibrate(15);

    try {
      await writeCard(
        {
          type: draft.type,
          data: trimmed,
          label: draft.label,
        },
        { signal: controller.signal },
      );

      applyPayload(
        {
          ...draft,
          data: trimmed,
        },
        {
          action: "write",
          message: "Card written. You’re good to go.",
        },
      );

      playTone("success");
      vibrate([20, 40, 30]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setFeedback("idle", "Write cancelled.");
        return;
      }

      setFeedback("error", formatNfcError(error));
      playTone("error");
      vibrate([40, 40, 40]);
    } finally {
      abortRef.current = null;
    }
  };

  const handleNfcScan = async () => {
    if (!nfcSupported) {
      setFeedback(
        "unsupported",
        "NFC scan needs Chrome on Android with NFC enabled.",
      );
      return;
    }

    cancelPending();
    setScannerOpen(false);

    const controller = new AbortController();
    abortRef.current = controller;

    setFeedback("scanning", "Hold a card to the back of your phone…");
    vibrate(15);

    try {
      await scanCard(
        (payload) => {
          const scanned = {
            ...payload,
            label: payload.label || undefined,
            source: "nfc" as const,
          };

          applyPayload(scanned, {
            action: "scan",
            message:
              scanned.kind === "image"
                ? "NFC image payload loaded for preview."
                : "Card scanned into the editor.",
          });

          playTone("scan");
          vibrate([15, 30, 15]);
        },
        { signal: controller.signal },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setFeedback("idle", "Scan cancelled.");
        return;
      }

      setFeedback("error", formatNfcError(error));
      playTone("error");
      vibrate([40, 40, 40]);
    } finally {
      abortRef.current = null;
    }
  };

  const handleBarcodeScan = () => {
    cancelPending();
    setScannerOpen(true);
    setFeedback(
      "barcode-scanning",
      cameraSupported
        ? "Point the camera at a barcode or QR code…"
        : "Camera unavailable here. Pick a barcode image instead.",
    );
    vibrate(15);
  };

  const handleBarcodeImagePick = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    cancelPending();
    setScannerOpen(false);
    setFeedback("barcode-scanning", "Reading barcode from image…");

    try {
      const payload = await scanBarcodeFromFile(file);
      applyPayload(payload, {
        action: "scan",
        message: `${payload.format || "Barcode"} read from the image.`,
      });
      playTone("scan");
      vibrate([15, 30, 15]);
    } catch (error) {
      setFeedback("error", formatBarcodeError(error));
      playTone("error");
      vibrate([40, 40, 40]);
    }
  };

  const handleCancel = () => {
    cancelPending();
    setScannerOpen(false);
    setFeedback("idle", "Cancelled.");
  };

  const handleSelectHistory = (entry: HistoryEntry) => {
    setDraft({
      type: entry.type,
      data: entry.data,
      label: entry.label,
      kind: entry.kind,
      source: "history",
      format: entry.format,
    });
    setActiveId(entry.id);
    setFeedback("idle", "Loaded from history — tap Write to go.");
    vibrate(10);
  };

  const handleTypeChange = (type: PayloadType) => {
    setDraft((current) => ({
      ...current,
      type,
      source: "manual",
      format: undefined,
      kind: undefined,
      mimeType: undefined,
      recordType: undefined,
      serialNumber: undefined,
    }));
    setActiveId(null);
  };

  const handleDataChange = (value: string) => {
    setDraft((current) => ({
      ...current,
      data: value,
      type:
        value.trim() && current.type === "text" && guessType(value) === "url"
          ? "url"
          : current.type,
      source: "manual",
      format: undefined,
      kind: undefined,
      mimeType: undefined,
      recordType: undefined,
      serialNumber: undefined,
    }));
    setActiveId(null);
  };

  const handleTorchToggle = async () => {
    const switchTorch = barcodeSessionRef.current?.switchTorch;
    if (!switchTorch) return;

    try {
      await switchTorch(!torchEnabled);
      setTorchEnabled((current) => !current);
    } catch {
      setFeedback("error", "Torch control is not available on this camera.");
    }
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#070b14] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="absolute -right-16 top-40 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleBarcodeImagePick}
      />

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
              Tap. Scan. Write.
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              NFC writer with barcode intake, smart payload previews, and local
              quick-access history.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <SupportBadge
              label={nfcSupported ? "NFC ready" : "No NFC"}
              tone={nfcSupported ? "ready" : "warn"}
            />
            <SupportBadge
              label={cameraSupported ? "Camera ready" : "Image scan only"}
              tone={cameraSupported ? "ready" : "neutral"}
            />
          </div>
        </header>

        <div className="mb-4">
          <StatusBanner
            status={status}
            message={message}
            supported={nfcSupported}
          />
        </div>

        {scannerOpen ? (
          <section className="mb-5 overflow-hidden rounded-3xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Barcode scanner
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Scan QR, Aztec, Data Matrix, PDF417, Code 128, EAN, UPC, and
                  other common formats.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 rounded-xl bg-white/7 px-3 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                Use image
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10">
              {cameraSupported ? (
                <div className="relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-[58%] w-[72%] rounded-[2rem] border border-white/45 shadow-[0_0_0_200vmax_rgba(7,11,20,0.25)]" />
                  </div>
                </div>
              ) : (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 px-6 text-center">
                  <BarcodeIcon />
                  <p className="max-w-xs text-sm leading-relaxed text-slate-300">
                    Live camera scan is unavailable here, but you can still
                    choose a screenshot or photo of a barcode.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-white/7 px-3 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <ImageIcon />
                Scan from image
              </button>
              {torchAvailable ? (
                <button
                  type="button"
                  onClick={handleTorchToggle}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/7 px-3 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10"
                >
                  <FlashIcon active={torchEnabled} />
                  {torchEnabled ? "Torch on" : "Torch off"}
                </button>
              ) : null}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Supported formats: {barcodeFormats}
            </p>
          </section>
        ) : null}

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
                onClick={() => handleTypeChange(tab.id)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
                  draft.type === tab.id
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
              {draft.type === "url" ? "Link to write" : "Text payload"}
            </span>
            <textarea
              value={draft.data}
              onChange={(event) => handleDataChange(event.target.value)}
              disabled={busy}
              rows={preview?.kind === "image" ? 2 : 4}
              inputMode={draft.type === "url" ? "url" : "text"}
              autoCapitalize={draft.type === "url" ? "none" : "sentences"}
              autoCorrect={draft.type === "url" ? "off" : "on"}
              spellCheck={draft.type !== "url"}
              placeholder={
                draft.type === "url"
                  ? "https://example.com/your-card"
                  : "Plain text, contact card, Wi-Fi string, or other payload…"
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
              value={draft.label || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  label: event.target.value || undefined,
                }))
              }
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
                setDraft(EMPTY_DRAFT);
                setActiveId(null);
                setFeedback("idle", "");
              }}
              disabled={busy || (!draft.data && !draft.label)}
              className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </section>

        {preview ? <PayloadPreview preview={preview} raw={draft.data} /> : null}

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
                onClick={handleNfcScan}
                className="flex min-w-[5.4rem] flex-col items-center justify-center rounded-2xl bg-white/5 px-3 py-3 text-sm font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98]"
              >
                <ScanIcon />
                <span className="mt-1">NFC</span>
              </button>
              <button
                type="button"
                onClick={handleBarcodeScan}
                className="flex min-w-[5.4rem] flex-col items-center justify-center rounded-2xl bg-white/5 px-3 py-3 text-sm font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98]"
              >
                <BarcodeIcon />
                <span className="mt-1">Barcode</span>
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
            {status === "barcode-scanning"
              ? "Keep the code inside the frame or choose an image to decode."
              : "Keep the card against the NFC spot until you feel the buzz."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SupportBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "ready" | "warn";
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        tone === "ready"
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20"
          : tone === "warn"
            ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20"
            : "bg-white/8 text-slate-300 ring-1 ring-white/10"
      }`}
    >
      {label}
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

function BarcodeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 5v14" />
      <path d="M7 5v14" />
      <path d="M10 5v14" />
      <path d="M14 5v14" />
      <path d="M17 5v14" />
      <path d="M20 5v14" />
      <path d="M3 5h18" />
      <path d="M3 19h18" />
    </svg>
  );
}

function ImageIcon() {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  );
}

function FlashIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
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
