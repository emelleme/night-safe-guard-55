import type {
  CardPayload,
  NDEFMessageInit,
  NDEFReader,
  NDEFReadingEvent,
  NDEFRecord,
  NDEFRecordInit,
} from "./nfc-types";
import { guessType } from "./payload";

/** Only one NFC op at a time — Chrome Android gets flaky if scan/write overlap. */
let activeController: AbortController | null = null;

export type NfcEnvironment = {
  supported: boolean;
  secureContext: boolean;
  topLevel: boolean;
  visible: boolean;
  reason?: string;
};

export function getNfcEnvironment(): NfcEnvironment {
  if (typeof window === "undefined") {
    return {
      supported: false,
      secureContext: false,
      topLevel: false,
      visible: false,
      reason: "Not running in a browser.",
    };
  }

  const secureContext = window.isSecureContext === true;
  const topLevel = window.top === window.self;
  const visible =
    typeof document === "undefined" ? true : document.visibilityState === "visible";
  const hasApi = "NDEFReader" in window;

  if (!hasApi) {
    return {
      supported: false,
      secureContext,
      topLevel,
      visible,
      reason:
        "Web NFC needs Chrome on Android (or Edge Android) with NFC hardware.",
    };
  }
  if (!secureContext) {
    return {
      supported: false,
      secureContext,
      topLevel,
      visible,
      reason: "Web NFC requires HTTPS (or localhost).",
    };
  }
  if (!topLevel) {
    return {
      supported: false,
      secureContext,
      topLevel,
      visible,
      reason:
        "Web NFC only works in the top-level page — open this site outside an iframe.",
    };
  }

  return { supported: true, secureContext, topLevel, visible };
}

export function isNfcSupported(): boolean {
  return getNfcEnvironment().supported;
}

export function createNdefReader(): NDEFReader {
  const env = getNfcEnvironment();
  if (!env.supported) {
    throw new Error(env.reason || "Web NFC is not available.");
  }
  if (!window.NDEFReader) {
    throw new Error("Web NFC is not supported on this device or browser.");
  }
  return new window.NDEFReader();
}

/** Cancel any in-flight scan/write so the adapter is free. */
export function abortNfcOperations(): void {
  try {
    activeController?.abort();
  } catch {
    // ignore
  }
  activeController = null;
}

function beginOperation(external?: AbortSignal): AbortController {
  // Abort previous op synchronously so the radio is free before write/scan
  abortNfcOperations();

  const controller = new AbortController();
  activeController = controller;

  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      const onExternalAbort = () => controller.abort();
      external.addEventListener("abort", onExternalAbort, { once: true });
      controller.signal.addEventListener(
        "abort",
        () => external.removeEventListener("abort", onExternalAbort),
        { once: true },
      );
    }
  }

  return controller;
}

function endOperation(controller: AbortController): void {
  if (activeController === controller) {
    activeController = null;
  }
}

export function buildNdefMessage(payload: CardPayload): NDEFMessageInit {
  const data = payload.data.trim();
  if (!data) {
    throw new Error("Nothing to write — add a URL or text first.");
  }

  if (payload.type === "url") {
    const url = normalizeUrl(data);
    if (!url) {
      throw new Error("Enter a valid URL (include https://).");
    }
    return {
      records: [{ recordType: "url", data: url }],
    };
  }

  // Plain text NDEF — encoding + lang required by the Web NFC text record format
  const record: NDEFRecordInit = {
    recordType: "text",
    data,
    encoding: "utf-8",
    lang: "en",
  };
  return { records: [record] };
}

/** Accept bare domains users often type on mobile. */
function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    candidates.push(`https://${trimmed}`);
  }

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
      // tel:, mailto:, sms: etc. — write as text, not url record
      return null;
    } catch {
      // try next
    }
  }
  return null;
}

export function decodeRecord(record: NDEFRecord): CardPayload {
  if (
    record.recordType === "smart-poster" &&
    typeof record.toRecords === "function"
  ) {
    const nested = decodeRecords(record.toRecords());
    if (nested) {
      return {
        ...nested,
        recordType: record.recordType,
      };
    }
  }

  if (record.recordType === "url" || record.recordType === "absolute-url") {
    const data = decodeText(record);
    return {
      type: guessType(data),
      data,
      kind: /^data:image\//i.test(data) ? "image" : undefined,
      recordType: record.recordType,
    };
  }

  if (record.recordType === "text") {
    const data = decodeText(record);
    return {
      type: guessType(data),
      data,
      recordType: record.recordType,
    };
  }

  if (record.recordType === "mime") {
    return decodeMimeRecord(record);
  }

  if (record.mediaType?.startsWith("text/")) {
    const data = decodeText(record);
    return {
      type: guessType(data),
      data,
      recordType: record.recordType,
      mimeType: record.mediaType,
    };
  }

  const data = decodeText(record);
  const looksLikeUrl = /^https?:\/\//i.test(data);
  return {
    type: looksLikeUrl ? "url" : "text",
    data,
    recordType: record.recordType,
  };
}

function decodeText(record: NDEFRecord): string {
  if (!record.data) return "";
  const encoding = record.encoding || "utf-8";
  try {
    return new TextDecoder(encoding).decode(record.data);
  } catch {
    return new TextDecoder().decode(record.data);
  }
}

function decodeRecords(records: readonly NDEFRecord[]): CardPayload | null {
  if (!records.length) return null;
  const ranked = [...records].sort(compareRecordPriority);
  for (const record of ranked) {
    const payload = decodeRecord(record);
    if (payload.data) return payload;
  }
  return null;
}

function compareRecordPriority(a: NDEFRecord, b: NDEFRecord): number {
  return getRecordPriority(a) - getRecordPriority(b);
}

function getRecordPriority(record: NDEFRecord): number {
  if (record.recordType === "smart-poster") return 0;
  if (record.recordType === "url" || record.recordType === "absolute-url") {
    return 1;
  }
  if (record.recordType === "text") return 2;
  if (record.recordType === "mime" && record.mediaType?.startsWith("image/")) {
    return 3;
  }
  if (record.recordType === "mime") return 4;
  return 5;
}

function decodeMimeRecord(record: NDEFRecord): CardPayload {
  const mediaType = record.mediaType || "application/octet-stream";
  const data = decodeText(record);

  if (mediaType.startsWith("image/")) {
    return {
      type: "text",
      data: bytesToDataUrl(record.data, mediaType),
      kind: "image",
      mimeType: mediaType,
      recordType: record.recordType,
    };
  }

  if (isTextMediaType(mediaType)) {
    return {
      type: guessType(data),
      data,
      mimeType: mediaType,
      recordType: record.recordType,
    };
  }

  return {
    type: "text",
    data: bytesToDataUrl(record.data, mediaType),
    mimeType: mediaType,
    recordType: record.recordType,
  };
}

function isTextMediaType(mediaType: string): boolean {
  return (
    mediaType.startsWith("text/") ||
    /json$/i.test(mediaType) ||
    /xml$/i.test(mediaType) ||
    /vcard/i.test(mediaType)
  );
}

function bytesToDataUrl(data: DataView | undefined, mediaType: string): string {
  if (!data) return "";

  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${mediaType};base64,${btoa(binary)}`;
}

export async function scanCard(
  onRead: (payload: CardPayload, serialNumber: string) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const controller = beginOperation(options?.signal);
  const { signal } = controller;

  try {
    assertDocumentReadyForNfc();
    const ndef = createNdefReader();

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        ndef.onreading = null;
        ndef.onreadingerror = null;
        signal.removeEventListener("abort", onAbort);
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const onAbort = () => {
        settle(() =>
          reject(new DOMException("Scan cancelled", "AbortError")),
        );
      };

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);

      ndef.onreading = (event: NDEFReadingEvent) => {
        try {
          const payload = decodeRecords(event.message.records);
          if (!payload) {
            settle(() =>
              reject(new Error("Empty NFC tag — no NDEF records found.")),
            );
            return;
          }
          onRead(
            {
              ...payload,
              source: "nfc",
              serialNumber: event.serialNumber || undefined,
            },
            event.serialNumber,
          );
          settle(() => resolve());
        } catch (err) {
          settle(() => reject(err));
        }
      };

      ndef.onreadingerror = () => {
        settle(() =>
          reject(
            new Error("Could not read this tag. Hold steady and try again."),
          ),
        );
      };

      // Must stay in the user-gesture call stack → call scan immediately
      ndef.scan({ signal }).catch((err) => {
        settle(() => reject(err));
      });
    });
  } finally {
    endOperation(controller);
  }
}

/**
 * Write NDEF to the next tag the user taps.
 *
 * Chrome Android: bare `write()` often throws NetworkError ("Tag lost") when the
 * RF field drops mid-transfer. The stable path is:
 *   1) scan() under the user gesture
 *   2) on first solid `reading`, call write() while the tag is still present
 *   3) if NetworkError, keep listening and retry on the next reading (up to N times)
 *
 * Call this synchronously from a click handler so scan() keeps user activation.
 */
export async function writeCard(
  payload: CardPayload,
  options?: { signal?: AbortSignal; onProgress?: (msg: string) => void },
): Promise<void> {
  // Build message first (sync) so scan() still runs under the gesture
  const message = buildNdefMessage(payload);

  const controller = beginOperation(options?.signal);
  const { signal } = controller;

  try {
    assertDocumentReadyForNfc();
    const ndef = createNdefReader();
    await writeViaScan(ndef, message, signal, options?.onProgress);
  } finally {
    endOperation(controller);
  }
}

const MAX_WRITE_ATTEMPTS = 6;

/**
 * Scan until a tag is in the field, then write. Retries "Tag lost" while the
 * card stays against the phone instead of failing on the first RF blip.
 */
function writeViaScan(
  ndef: NDEFReader,
  message: NDEFMessageInit,
  signal: AbortSignal,
  onProgress?: (msg: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let writing = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetry = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const cleanup = () => {
      clearRetry();
      ndef.onreading = null;
      ndef.onreadingerror = null;
      signal.removeEventListener("abort", onAbort);
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () => {
      settle(() => reject(new DOMException("Write cancelled", "AbortError")));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort);

    const scheduleRetry = (delayMs: number) => {
      clearRetry();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!settled && !writing) {
          tryWrite();
        }
      }, delayMs);
    };

    const tryWrite = () => {
      if (settled || writing) return;
      writing = true;
      clearRetry();
      attempts += 1;

      onProgress?.(
        attempts === 1
          ? "Tag detected — writing… hold still."
          : `Retrying write (${attempts}/${MAX_WRITE_ATTEMPTS})… keep holding.`,
      );

      // write() while the tag is still in the field (Chrome-recommended pattern)
      ndef
        .write(message, { overwrite: true, signal })
        .then(() => {
          settle(() => resolve());
        })
        .catch((err: unknown) => {
          writing = false;

          if (isAbortError(err)) {
            settle(() => reject(err));
            return;
          }

          // RF dropped mid-write — retry shortly; tag often still under the phone
          if (isTransientFieldError(err) && attempts < MAX_WRITE_ATTEMPTS) {
            onProgress?.(
              "Connection blipped. Keep the card flat — retrying automatically…",
            );
            // Stagger retries: quick first, then slightly longer
            scheduleRetry(attempts === 1 ? 180 : 320 + attempts * 80);
            return;
          }

          settle(() => reject(err));
        });
    };

    ndef.onreading = () => {
      // Tag just entered / re-entered the field — best moment to write
      clearRetry();
      tryWrite();
    };

    // Do NOT fail the whole op on a single readingerror — common while aligning
    ndef.onreadingerror = () => {
      if (settled || writing) return;
      onProgress?.(
        "Almost… slide the card slowly over the NFC area (often near the camera).",
      );
    };

    onProgress?.("Waiting for a tag — hold the card flat against the phone…");

    // Must stay in the user-gesture call stack
    ndef.scan({ signal }).catch((err) => {
      if (writing || settled) return;
      settle(() => reject(err));
    });
  });
}

function assertDocumentReadyForNfc(): void {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    throw new Error(
      "Screen is locked or the tab is in the background. Keep Chrome open and unlocked.",
    );
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** RF blips / tag alignment issues — safe to retry while the user still holds the card. */
function isTransientFieldError(error: unknown): boolean {
  if (error instanceof DOMException) {
    if (
      error.name === "NetworkError" ||
      error.name === "NotReadableError" ||
      error.name === "InvalidStateError"
    ) {
      return true;
    }
    if (/tag lost|networkerror|not readable|invalid state/i.test(error.message)) {
      return true;
    }
  }
  if (error instanceof Error) {
    return /tag lost|moved too soon|hold/i.test(error.message);
  }
  return false;
}

export function generateShortCode(length = 8): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function playTone(
  kind: "success" | "error" | "scan" = "success",
): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (kind === "error") {
      osc.type = "square";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (kind === "scan") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(990, now + 0.08);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    }

    setTimeout(() => void ctx.close(), 500);
  } catch {
    // Audio optional
  }
}

export function vibrate(pattern: number | number[] = 40): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

export function formatNfcError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "AbortError":
        return "Cancelled.";
      case "NotAllowedError":
        return "NFC blocked. Tap Allow on the permission prompt, use Chrome (not an in-app browser), keep the screen on, and try again.";
      case "NotSupportedError":
        return "This tag or device doesn’t support NDEF write. Try a different NTAG/MIFARE Ultralight card.";
      case "NotReadableError":
        return "Couldn’t read/write the tag. Hold it still on the NFC spot (usually near the camera) for 2 seconds.";
      case "NetworkError":
        return "Tag lost mid-write. Hold the card flat and still on the NFC spot (often near the camera) for a full 2–3 seconds, then try again. Avoid metal cases.";
      case "InvalidStateError":
        return "NFC is busy. Tap Cancel, wait a second, then try Write again.";
      case "SecurityError":
        return "NFC blocked by the browser (needs HTTPS and a top-level Chrome tab).";
      default:
        return error.message
          ? `${error.name}: ${error.message}`
          : `NFC error (${error.name}).`;
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong with NFC.";
}
