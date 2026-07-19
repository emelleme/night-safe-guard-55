import type { NfcStatus } from "@/client/lib/nfc-types";

interface StatusBannerProps {
  status: NfcStatus;
  message: string;
  supported: boolean;
}

const styles: Record<
  NfcStatus,
  { ring: string; bg: string; text: string; dot: string }
> = {
  idle: {
    ring: "ring-white/10",
    bg: "bg-white/5",
    text: "text-slate-300",
    dot: "bg-slate-400",
  },
  scanning: {
    ring: "ring-cyan-400/30",
    bg: "bg-cyan-500/10",
    text: "text-cyan-100",
    dot: "bg-cyan-400 animate-pulse",
  },
  "barcode-scanning": {
    ring: "ring-fuchsia-400/30",
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-100",
    dot: "bg-fuchsia-300 animate-pulse",
  },
  writing: {
    ring: "ring-violet-400/30",
    bg: "bg-violet-500/10",
    text: "text-violet-100",
    dot: "bg-violet-400 animate-pulse",
  },
  success: {
    ring: "ring-emerald-400/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-100",
    dot: "bg-emerald-400",
  },
  error: {
    ring: "ring-rose-400/30",
    bg: "bg-rose-500/10",
    text: "text-rose-100",
    dot: "bg-rose-400",
  },
  unsupported: {
    ring: "ring-amber-400/30",
    bg: "bg-amber-500/10",
    text: "text-amber-100",
    dot: "bg-amber-400",
  },
};

export function StatusBanner({ status, message, supported }: StatusBannerProps) {
  const s = styles[status];
  const show =
    message ||
    status === "scanning" ||
    status === "barcode-scanning" ||
    status === "writing" ||
    status === "unsupported" ||
    !supported;

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-2xl px-4 py-3 ring-1 ${s.ring} ${s.bg}`}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <p className={`text-sm leading-relaxed ${s.text}`}>
        {!supported
          ? message ||
            "Web NFC needs Chrome on Android with NFC on, over HTTPS, outside in-app browsers. Barcode scan and drafting still work here."
          : message ||
            (status === "scanning"
              ? "Hold a card flat against the NFC spot (often near the camera)…"
              : status === "barcode-scanning"
                ? "Point the camera at a barcode or QR code…"
                : status === "writing"
                  ? "Ready — hold the card still until the phone buzzes…"
                  : "")}
      </p>
    </div>
  );
}
