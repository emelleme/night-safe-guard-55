import { formatPayloadKind } from "@/client/lib/payload";
import type { PayloadPreviewModel } from "@/client/lib/nfc-types";

interface PayloadPreviewProps {
  preview: PayloadPreviewModel;
  raw: string;
}

export function PayloadPreview({ preview, raw }: PayloadPreviewProps) {
  return (
    <section className="mb-5 overflow-hidden rounded-3xl bg-white/[0.04] ring-1 ring-white/10 backdrop-blur">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
            Preview
          </span>
          <KindPill kind={preview.kind} />
          {preview.sourceLabel ? <MetaPill label={preview.sourceLabel} /> : null}
          {preview.formatLabel ? <MetaPill label={preview.formatLabel} /> : null}
        </div>
        <h2 className="mt-3 text-lg font-semibold text-white">{preview.title}</h2>
        {preview.subtitle ? (
          <p className="mt-1 break-all text-sm text-slate-400">
            {preview.subtitle}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 px-4 py-4">
        {preview.imageSrc ? (
          <div className="overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/10">
            <img
              src={preview.imageSrc}
              alt={preview.imageAlt || preview.title}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        ) : null}

        {preview.fields?.length ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {preview.fields.map((field) => (
              <div
                key={`${field.label}:${field.value}`}
                className="rounded-2xl bg-black/25 px-3 py-3 ring-1 ring-white/8"
              >
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {field.label}
                </dt>
                <dd className="mt-1 break-words text-sm text-slate-100">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {preview.body ? (
          <pre className="overflow-x-auto rounded-2xl bg-black/30 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-200 ring-1 ring-white/10">
            {preview.body}
          </pre>
        ) : null}

        {preview.actions?.length ? (
          <div className="flex flex-wrap gap-2">
            {preview.actions.map((action) => (
              <a
                key={`${action.label}:${action.href}`}
                href={action.href}
                target={action.href.startsWith("http") ? "_blank" : undefined}
                rel={action.href.startsWith("http") ? "noreferrer" : undefined}
                className="inline-flex items-center rounded-xl bg-white/7 px-3 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                {action.label}
              </a>
            ))}
          </div>
        ) : null}

        {preview.hint ? (
          <p className="text-xs text-slate-500">{preview.hint}</p>
        ) : null}

        <details className="rounded-2xl bg-black/20 ring-1 ring-white/8">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-300">
            Raw payload
          </summary>
          <pre className="border-t border-white/8 px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-slate-400">
            {raw}
          </pre>
        </details>
      </div>
    </section>
  );
}

function KindPill({ kind }: { kind: PayloadPreviewModel["kind"] }) {
  return (
    <span className="rounded-full bg-cyan-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
      {formatPayloadKind(kind)}
    </span>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400 ring-1 ring-white/8">
      {label}
    </span>
  );
}
