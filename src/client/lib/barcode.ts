import type { CardPayload } from "./nfc-types";
import { guessType } from "./payload";

const POSSIBLE_FORMAT_KEYS = [
  "QR_CODE",
  "AZTEC",
  "DATA_MATRIX",
  "PDF_417",
  "CODE_128",
  "CODE_39",
  "CODE_93",
  "CODABAR",
  "EAN_13",
  "EAN_8",
  "ITF",
  "UPC_A",
  "UPC_E",
  "RSS_14",
  "RSS_EXPANDED",
] as const;

const FORMAT_LABELS: Record<(typeof POSSIBLE_FORMAT_KEYS)[number], string> = {
  QR_CODE: "QR code",
  AZTEC: "Aztec",
  DATA_MATRIX: "Data Matrix",
  PDF_417: "PDF417",
  CODE_128: "Code 128",
  CODE_39: "Code 39",
  CODE_93: "Code 93",
  CODABAR: "Codabar",
  EAN_13: "EAN-13",
  EAN_8: "EAN-8",
  ITF: "ITF",
  UPC_A: "UPC-A",
  UPC_E: "UPC-E",
  RSS_14: "RSS-14",
  RSS_EXPANDED: "RSS Expanded",
};

type ZXingModule = typeof import("@zxing/browser");

let zxingPromise: Promise<ZXingModule> | null = null;

function loadZXing(): Promise<ZXingModule> {
  if (!zxingPromise) {
    zxingPromise = import("@zxing/browser");
  }
  return zxingPromise;
}

const POSSIBLE_FORMAT_LABELS = [
  FORMAT_LABELS.QR_CODE,
  FORMAT_LABELS.AZTEC,
  FORMAT_LABELS.DATA_MATRIX,
  FORMAT_LABELS.PDF_417,
  FORMAT_LABELS.CODE_128,
  FORMAT_LABELS.CODE_39,
  FORMAT_LABELS.CODE_93,
  FORMAT_LABELS.CODABAR,
  FORMAT_LABELS.EAN_13,
  FORMAT_LABELS.EAN_8,
  FORMAT_LABELS.ITF,
  FORMAT_LABELS.UPC_A,
  FORMAT_LABELS.UPC_E,
  FORMAT_LABELS.RSS_14,
  FORMAT_LABELS.RSS_EXPANDED,
];

export interface BarcodeScannerSession {
  stop: () => void;
  switchTorch?: (enabled: boolean) => Promise<void>;
}

interface BarcodeLikeResult {
  getBarcodeFormat(): number;
  getText(): string;
}

export function isBarcodeSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function supportedBarcodeLabels(): string[] {
  return [...POSSIBLE_FORMAT_LABELS];
}

export async function startBarcodeScanner(options: {
  onRead: (payload: CardPayload) => void;
  video: HTMLVideoElement;
}): Promise<BarcodeScannerSession> {
  const zxing = await loadZXing();
  const reader = new zxing.BrowserMultiFormatReader();
  reader.possibleFormats = POSSIBLE_FORMAT_KEYS.map(
    (key) => zxing.BarcodeFormat[key],
  );

  let settled = false;
  const controls = await reader.decodeFromConstraints(
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    options.video,
    (result, error, activeControls) => {
      if (result && !settled) {
        settled = true;
        activeControls.stop();
        options.onRead(payloadFromResult(result, zxing));
        return;
      }

      if (error && !isRecoverableScanError(error)) {
        activeControls.stop();
      }
    },
  );

  return {
    stop: () => {
      settled = true;
      controls.stop();
      zxing.BrowserMultiFormatReader.releaseAllStreams();
    },
    switchTorch: controls.switchTorch,
  };
}

export async function scanBarcodeFromFile(file: File): Promise<CardPayload> {
  const zxing = await loadZXing();
  const reader = new zxing.BrowserMultiFormatReader();
  reader.possibleFormats = POSSIBLE_FORMAT_KEYS.map(
    (key) => zxing.BarcodeFormat[key],
  );

  const objectUrl = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(objectUrl);
    return payloadFromResult(result, zxing);
  } catch (error) {
    if (isRecoverableScanError(error)) {
      throw new Error("No barcode found in that image. Try a tighter crop.");
    }
    throw error;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatBarcodeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission denied. Allow camera access and try again.";
    }
    if (error.name === "NotFoundError") {
      return "No camera found on this device.";
    }
    if (error.name === "NotReadableError") {
      return "Camera is busy in another app. Close it there and retry.";
    }
    return error.message || error.name;
  }

  if (error instanceof Error) {
    if (isRecoverableScanError(error)) {
      return "No barcode found yet. Move a little closer and hold steady.";
    }
    return error.message;
  }

  return "Barcode scanning failed.";
}

function payloadFromResult(
  result: BarcodeLikeResult,
  zxing: ZXingModule,
): CardPayload {
  const data = result.getText().trim();
  return {
    type: guessType(data),
    data,
    source: "barcode",
    format: formatBarcodeFormat(result.getBarcodeFormat(), zxing.BarcodeFormat),
  };
}

function formatBarcodeFormat(
  format: number,
  barcodeFormatEnum: ZXingModule["BarcodeFormat"],
): string {
  const enumKey = barcodeFormatEnum[format];
  if (typeof enumKey === "string" && enumKey in FORMAT_LABELS) {
    return FORMAT_LABELS[enumKey as keyof typeof FORMAT_LABELS];
  }
  return "Barcode";
}

function isRecoverableScanError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { name?: string; message?: string };
  return (
    maybeError.name === "NotFoundException" ||
    maybeError.name === "ChecksumException" ||
    maybeError.name === "FormatException" ||
    maybeError.message?.includes("No MultiFormat Readers were able to detect the code") ||
    false
  );
}
