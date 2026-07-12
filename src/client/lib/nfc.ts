import type {
  CardPayload,
  NDEFReader,
  NDEFReadingEvent,
  NDEFRecord,
} from "./nfc-types";

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
  if (record.recordType === "url") {
    const data = decodeText(record);
    return { type: "url", data };
  }

  if (record.recordType === "text" || record.recordType === "mime") {
    const data = decodeText(record);
    return { type: "text", data };
  }

  // Absolute URL records sometimes appear as empty recordType with media
  if (record.mediaType?.startsWith("text/")) {
    return { type: "text", data: decodeText(record) };
  }

  const data = decodeText(record);
  const looksLikeUrl = /^https?:\/\//i.test(data);
  return { type: looksLikeUrl ? "url" : "text", data };
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
        const record = event.message.records[0];
        if (!record) {
          reject(new Error("Empty NFC tag — no NDEF records found."));
          cleanup();
          return;
        }
        const payload = decodeRecord(record);
        onRead(payload, event.serialNumber);
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
