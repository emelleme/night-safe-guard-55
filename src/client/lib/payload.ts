import type {
  CardPayload,
  HistoryEntry,
  PayloadAction,
  PayloadField,
  PayloadKind,
  PayloadPreviewModel,
  PayloadSource,
  PayloadType,
} from "./nfc-types";

const IMAGE_EXTENSIONS =
  /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)(?:$|\?)/i;

export function guessType(value: string): PayloadType {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return "url";
  return "text";
}

export function resolvePayloadPreview(
  payload: Pick<
    CardPayload,
    "data" | "label" | "kind" | "source" | "format" | "mimeType" | "recordType"
  >,
): PayloadPreviewModel | null {
  const raw = payload.data.trim();
  if (!raw) return null;

  const label = payload.label?.trim();
  const sourceLabel = formatPayloadSource(payload.source);
  const formatLabel = payload.format?.trim() || undefined;
  const forcedKind = payload.kind;

  if (forcedKind === "image" || isImagePayload(raw, payload.mimeType)) {
    return {
      kind: "image",
      title: label || "Image payload",
      subtitle: isHttpUrl(raw) ? raw : payload.mimeType || "Embedded image",
      imageSrc: raw,
      imageAlt: label || "Scanned image payload",
      actions: buildUrlAction(raw, "Open image"),
      sourceLabel,
      formatLabel,
      hint: payload.recordType === "mime" ? "NFC MIME image record" : undefined,
    };
  }

  const mail = parseMailto(raw);
  if (mail) {
    return {
      kind: "email",
      title: label || mail.address || "Email payload",
      subtitle: mail.subject || "Ready to compose",
      body: mail.body,
      fields: compactFields([
        mail.address ? { label: "To", value: mail.address } : null,
        mail.subject ? { label: "Subject", value: mail.subject } : null,
      ]),
      actions: [{ href: raw, label: "Compose email" }],
      sourceLabel,
      formatLabel,
    };
  }

  const phone = parsePhoneLink(raw);
  if (phone) {
    return {
      kind: phone.kind,
      title: label || phone.value,
      subtitle: phone.kind === "sms" ? "Text message" : "Phone number",
      body: phone.body,
      fields: compactFields([
        { label: phone.kind === "sms" ? "Recipient" : "Number", value: phone.value },
      ]),
      actions: [
        {
          href: raw,
          label: phone.kind === "sms" ? "Open messages" : "Call number",
        },
      ],
      sourceLabel,
      formatLabel,
    };
  }

  const location = parseGeoLink(raw);
  if (location) {
    return {
      kind: "location",
      title: label || location.coordinates,
      subtitle: "Location payload",
      fields: compactFields([
        { label: "Coordinates", value: location.coordinates },
        location.query ? { label: "Label", value: location.query } : null,
      ]),
      actions: [
        {
          href: `https://maps.google.com/?q=${encodeURIComponent(location.query || location.coordinates)}`,
          label: "Open map",
        },
      ],
      sourceLabel,
      formatLabel,
    };
  }

  const wifi = parseWifi(raw);
  if (wifi) {
    return {
      kind: "wifi",
      title: label || wifi.ssid || "Wi-Fi network",
      subtitle: "Wireless network credentials",
      fields: compactFields([
        wifi.ssid ? { label: "SSID", value: wifi.ssid } : null,
        wifi.security ? { label: "Security", value: wifi.security } : null,
        wifi.password ? { label: "Password", value: wifi.password } : null,
        wifi.hidden ? { label: "Hidden", value: "Yes" } : null,
      ]),
      sourceLabel,
      formatLabel,
    };
  }

  const contact = parseVCard(raw);
  if (contact) {
    return {
      kind: "contact",
      title: label || contact.title,
      subtitle: contact.organization,
      body: contact.note,
      fields: compactFields(contact.fields),
      actions: contact.actions,
      sourceLabel,
      formatLabel,
    };
  }

  const url = parseUrl(raw);
  if (url) {
    const imageUrl = isImageUrl(url);
    return {
      kind: imageUrl ? "image" : "url",
      title: label || friendlyUrlTitle(url),
      subtitle: raw,
      imageSrc: imageUrl ? raw : undefined,
      imageAlt: imageUrl ? label || "Linked image" : undefined,
      actions: [{ href: raw, label: imageUrl ? "Open image" : "Open link" }],
      sourceLabel,
      formatLabel,
    };
  }

  const json = parseJson(raw);
  if (json) {
    return {
      kind: "json",
      title: label || "JSON payload",
      body: json,
      sourceLabel,
      formatLabel,
    };
  }

  return {
    kind: forcedKind || "text",
    title: label || firstMeaningfulLine(raw),
    subtitle: payload.mimeType || undefined,
    body: raw,
    sourceLabel,
    formatLabel,
    hint: payload.recordType === "mime" ? "NFC MIME record" : undefined,
  };
}

export function displayTitle(
  payload: Pick<HistoryEntry, "data" | "label" | "kind" | "source" | "format">,
): string {
  const preview = resolvePayloadPreview(payload);
  if (!preview) return "";
  return preview.title;
}

export function formatPayloadKind(kind: PayloadKind | PayloadType): string {
  switch (kind) {
    case "url":
      return "URL";
    case "image":
      return "Image";
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "sms":
      return "SMS";
    case "location":
      return "Map";
    case "wifi":
      return "Wi-Fi";
    case "contact":
      return "Contact";
    case "json":
      return "JSON";
    default:
      return "Text";
  }
}

export function formatPayloadSource(source?: PayloadSource): string | undefined {
  switch (source) {
    case "barcode":
      return "Barcode";
    case "generate":
      return "Generated";
    case "history":
      return "History";
    case "manual":
      return "Draft";
    case "nfc":
      return "NFC";
    default:
      return undefined;
  }
}

function buildUrlAction(raw: string, label: string): PayloadAction[] | undefined {
  return isHttpUrl(raw) ? [{ href: raw, label }] : undefined;
}

function compactFields(
  fields: Array<PayloadField | null | undefined>,
): PayloadField[] | undefined {
  const compact = fields.filter(Boolean) as PayloadField[];
  return compact.length > 0 ? compact : undefined;
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isHttpUrl(raw: string): boolean {
  const url = parseUrl(raw);
  return !!url && (url.protocol === "http:" || url.protocol === "https:");
}

function isImagePayload(raw: string, mimeType?: string): boolean {
  return /^data:image\//i.test(raw) || !!mimeType?.startsWith("image/");
}

function isImageUrl(url: URL): boolean {
  return IMAGE_EXTENSIONS.test(url.pathname) || /^data:image\//i.test(url.href);
}

function friendlyUrlTitle(url: URL): string {
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.host}${path}${url.search}`;
}

function firstMeaningfulLine(raw: string): string {
  const line = raw.split(/\r?\n/, 1)[0]?.trim() || raw.trim();
  if (line.length <= 64) return line;
  return `${line.slice(0, 64)}…`;
}

function parseJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^[[{]/.test(trimmed)) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function parseMailto(raw: string) {
  if (!/^mailto:/i.test(raw)) return null;

  const withoutScheme = raw.slice(7);
  const [addressPart, queryPart = ""] = withoutScheme.split("?");
  const params = new URLSearchParams(queryPart);

  return {
    address: decodeURIComponent(addressPart),
    subject: params.get("subject") || undefined,
    body: params.get("body") || undefined,
  };
}

function parsePhoneLink(raw: string) {
  if (/^tel:/i.test(raw)) {
    return { kind: "phone" as const, value: raw.slice(4), body: undefined };
  }

  if (/^(sms|smsto):/i.test(raw)) {
    const withoutScheme = raw.replace(/^(sms|smsto):/i, "");
    const [value, queryPart = ""] = withoutScheme.split("?");
    const params = new URLSearchParams(queryPart);
    return {
      kind: "sms" as const,
      value,
      body: params.get("body") || undefined,
    };
  }

  return null;
}

function parseGeoLink(raw: string) {
  if (!/^geo:/i.test(raw)) return null;
  const withoutScheme = raw.slice(4);
  const [coordinates, queryPart = ""] = withoutScheme.split("?");
  const params = new URLSearchParams(queryPart);
  return {
    coordinates,
    query: params.get("q") || undefined,
  };
}

function parseWifi(raw: string) {
  if (!/^WIFI:/i.test(raw)) return null;
  const body = raw.slice(5);
  const segments = splitEscaped(body, ";");
  const values = new Map<string, string>();

  for (const segment of segments) {
    const colonIndex = findUnescapedChar(segment, ":");
    if (colonIndex <= 0) continue;
    const key = segment.slice(0, colonIndex).trim().toUpperCase();
    const value = unescapePayloadToken(segment.slice(colonIndex + 1));
    values.set(key, value);
  }

  return {
    ssid: values.get("S"),
    security: values.get("T"),
    password: values.get("P"),
    hidden: values.get("H") === "true",
  };
}

function parseVCard(raw: string) {
  if (!/^BEGIN:VCARD/i.test(raw)) return null;

  const lines = unfoldVCard(raw);
  const fields: PayloadField[] = [];
  const actions: PayloadAction[] = [];
  let fullName = "";
  let organization = "";
  let note = "";

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) continue;

    const keyPart = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1).trim();
    if (!value) continue;

    const [key] = keyPart.split(";");
    const upperKey = key.toUpperCase();

    if (upperKey === "FN") {
      fullName = value;
      continue;
    }

    if (upperKey === "ORG") {
      organization = value;
      continue;
    }

    if (upperKey === "TEL") {
      fields.push({ label: "Phone", value });
      actions.push({ href: `tel:${value}`, label: "Call contact" });
      continue;
    }

    if (upperKey === "EMAIL") {
      fields.push({ label: "Email", value });
      actions.push({ href: `mailto:${value}`, label: "Email contact" });
      continue;
    }

    if (upperKey === "URL") {
      fields.push({ label: "URL", value });
      continue;
    }

    if (upperKey === "ADR") {
      fields.push({ label: "Address", value: value.replace(/;/g, ", ") });
      continue;
    }

    if (upperKey === "NOTE") {
      note = value;
      continue;
    }
  }

  return {
    title: fullName || "Contact payload",
    organization: organization || undefined,
    note: note || undefined,
    fields,
    actions: actions.length > 0 ? dedupeActions(actions) : undefined,
  };
}

function unfoldVCard(raw: string): string[] {
  return raw
    .replace(/\r\n[ \t]/g, "")
    .split(/\r?\n/)
    .filter(Boolean);
}

function dedupeActions(actions: PayloadAction[]): PayloadAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.label}:${action.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitEscaped(raw: string, separator: string): string[] {
  const segments: string[] = [];
  let current = "";

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === "\\") {
      current += char;
      if (i + 1 < raw.length) {
        current += raw[i + 1];
        i += 1;
      }
      continue;
    }
    if (char === separator) {
      segments.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

function findUnescapedChar(raw: string, char: string): number {
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === char && raw[i - 1] !== "\\") {
      return i;
    }
  }
  return -1;
}

function unescapePayloadToken(raw: string): string {
  return raw.replace(/\\([;,:\\])/g, "$1");
}
