import type {
  CardPayload,
  NDEFReader,
  NDEFReadingEvent,
  NDEFRecord,
} from "./nfc-types";
import { guessType } from "./payload";

export function isNfcSupported(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

export function createNdefReader(): NDEFReader {
  if (!window.NDEFReader) {
    throw new Error("Web NFC is not supported on this device or browser.");
  }
  return new window.NDEFReader();
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
  const ndef = createNdefReader();

  await new Promise<void>((resolve, reject) => {
    const signal = options?.signal;

    const cleanup = () => {
      ndef.onreading = null;
      ndef.onreadingerror = null;
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Scan cancelled", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    ndef.onreading = (event: NDEFReadingEvent) => {
      try {
        const payload = decodeRecords(event.message.records);
        if (!payload) {
          reject(new Error("Empty NFC tag — no NDEF records found."));
          cleanup();
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
        cleanup();
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    ndef.onreadingerror = () => {
      cleanup();
      reject(new Error("Could not read this tag. Try again."));
    };

    ndef.scan({ signal }).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

export async function writeCard(
  payload: CardPayload,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const ndef = createNdefReader();
  const data = payload.data.trim();

  if (!data) {
    throw new Error("Nothing to write — add a URL or text first.");
  }

  if (payload.type === "url" && !isValidUrl(data)) {
    throw new Error("Enter a valid URL (include https://).");
  }

  const recordType = payload.type === "url" ? "url" : "text";

  await ndef.write(
    {
      records: [{ recordType, data }],
    },
    { signal: options?.signal, overwrite: true },
  );
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

    // Close context after tone finishes to free resources
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
    if (error.name === "AbortError") return "Cancelled.";
    if (error.name === "NotAllowedError") {
      return "NFC permission denied. Allow NFC access and try again.";
    }
    if (error.name === "NotSupportedError") {
      return "NFC not supported on this device or browser.";
    }
    if (error.name === "NotReadableError") {
      return "Could not read the tag. Hold steady and try again.";
    }
    if (error.name === "NetworkError") {
      return "Tag lost. Keep the card against the phone.";
    }
    return error.message || error.name;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
