/** Minimal Web NFC types (Chrome Android). */

export interface NDEFRecordInit {
  recordType: string;
  mediaType?: string;
  id?: string;
  data?: string | BufferSource | null;
  encoding?: string;
  lang?: string;
}

export interface NDEFMessageInit {
  records: NDEFRecordInit[];
}

export interface NDEFRecord {
  readonly recordType: string;
  readonly mediaType?: string;
  readonly id?: string;
  readonly data?: DataView;
  readonly encoding?: string;
  readonly lang?: string;
}

export interface NDEFMessage {
  readonly records: readonly NDEFRecord[];
}

export interface NDEFReadingEvent extends Event {
  readonly serialNumber: string;
  readonly message: NDEFMessage;
}

export interface NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(
    message: NDEFMessageInit | string,
    options?: { signal?: AbortSignal; overwrite?: boolean },
  ): Promise<void>;
  onreading: ((this: NDEFReader, ev: NDEFReadingEvent) => void) | null;
  onreadingerror: ((this: NDEFReader, ev: Event) => void) | null;
}

export interface NDEFReaderConstructor {
  new (): NDEFReader;
}

declare global {
  interface Window {
    NDEFReader?: NDEFReaderConstructor;
  }
}

export type PayloadType = "url" | "text";

export interface CardPayload {
  type: PayloadType;
  data: string;
  label?: string;
}

export interface HistoryEntry {
  id: string;
  type: PayloadType;
  data: string;
  label?: string;
  action: "write" | "scan" | "generate";
  createdAt: number;
}

export type NfcStatus =
  | "idle"
  | "scanning"
  | "writing"
  | "success"
  | "error"
  | "unsupported";
