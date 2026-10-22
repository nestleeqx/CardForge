"use client";

import { ArrowLeft, ArrowRight, Download, FileUp, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import { Button, Panel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { LENGTHS, MARKETPLACES, SOURCE_FIELDS, TONES } from "@/lib/labels";
import type { Length, Marketplace, Preview, SourceField, Tone } from "@/lib/types";

const STEPS = ["Файл", "Колонки", "Настройки"];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
              i <= step ? "bg-ink text-white" : "bg-sunken text-ink-3"
            }`}
          >
            {i + 1}
          </span>
          <span className={i === step ? "font-medium" : "text-ink-3"}>{label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-line-strong" />}
        </li>
      ))}
    </ol>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Record<T, { label: string; hint: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {(Object.keys(options) as T[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-xl border p-3 text-left transition ${
            value === key
              ? "border-accent bg-accent-soft/60 ring-1 ring-accent"
              : "border-line hover:border-line-strong"
          }`}
        >
          <span className="block text-sm font-medium">{options[key].label}</span>
          <span className="text-xs text-ink-3">{options[key].hint}</span>
        </button>
      ))}
    </div>
  );
}

export default function NewBatchPage() {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const { data: limits } = useSWR("limits", api.limits);

  const [step, setStep] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<SourceField, string | null>>({
    sku: null,
    name: null,
    category: null,
    brand: null,
    attributes: null,
    photo: null,
  });
  const [extra, setExtra] = useState(true);
  const [marketplace, setMarketplace] = useState<Marketplace>("ozon");
  const [tone, setTone] = useState<Tone>("selling");
  const [length, setLength] = useState<Length>("medium");
  const [creating, setCreating] = useState(false);

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const p = await api.preview(file);
      setPreview(p);
      setMapping(p.suggested_mapping);
      setStep(1);
    } catch (e) {
      toast.error(e);
    } finally {
      setParsing(false);
    }
  }

  async function start() {
    if (!preview) return;
    setCreating(true);
    try {
      const batch = await api.createBatch({
        filename: preview.filename,
        mapping,
        rows: preview.rows,
        marketplace,
        tone,
        length,
        extra_as_attributes: extra,
      });
      router.push(`/app/batches/${batch.id}`);
    } catch (e) {
      toast.error(e);
      setCreating(false);
    }
  }

  const mappedCols = new Set(Object.values(mapping).filter(Boolean));
  const extraCols = preview?.columns.filter((c) => !mappedCols.has(c)) ?? [];
  const rowsWithName = preview?.rows.filter((r) => mapping.name && r[mapping.name]?.trim()).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Новая партия</h1>
          <p className="mt-1 text-sm text-ink-2">Таблица → сопоставление колонок → настройки генерации</p>
        </div>
        <Stepper step={step} />
      </div>

      {step === 0 && (
        <Panel className="p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            onClick={() => input.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition ${
              dragging ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent hover:bg-canvas"
            }`}
          >
            {parsing ? (
              <Loader2 className="size-10 animate-spin text-accent" />
            ) : (
              <FileUp className="size-10 text-accent" />
            )}
            <p className="mt-4 font-medium">Перетащите CSV или XLSX сюда или нажмите, чтобы выбрать</p>
            <p className="mt-1 text-sm text-ink-3">
              Колонки: артикул, название, категория, бренд, характеристики через «;», ссылка на фото
            </p>
            {limits && (
              <p className="mt-3 text-xs text-ink-3">
                Демо-лимиты: до {limits.max_rows_per_file} строк, до {Math.round(limits.max_file_bytes / 1024)} КБ,{" "}
                {limits.batches_per_hour} партии в час
              </p>
            )}
            <input
              ref={input}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              onClick={() => api.downloadSample().catch(toast.error)}
              icon={<Download className="size-4" />}
            >
              Скачать пример — 30 товаров «Уютного угла»
            </Button>
          </div>
        </Panel>
      )}

      {step === 1 && preview && (
        <Panel className="space-y-6 p-6">
          <div>
            <h2 className="font-semibold">Сопоставьте колонки</h2>
            <p className="text-sm text-ink-3">
              {preview.filename}: {preview.rows.length} строк, {preview.columns.length} колонок. Мы угадали, что смогли
              — поправьте, если нужно.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(SOURCE_FIELDS) as SourceField[]).map((field) => (
              <label key={field} className="block">
                <span className="text-sm font-medium">
                  {SOURCE_FIELDS[field].label}
                  {SOURCE_FIELDS[field].required && <span className="text-danger"> *</span>}
                </span>
                <span className="ml-2 text-xs text-ink-3">{SOURCE_FIELDS[field].hint}</span>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [field]: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                >
                  <option value="">— не использовать —</option>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {extraCols.length > 0 && (
            <label className="flex items-start gap-2 rounded-xl bg-canvas p-3 text-sm">
              <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} className="mt-0.5" />
              <span>
                Добавить остальные колонки в характеристики:{" "}
                <span className="text-ink-3">{extraCols.join(", ")}</span>
              </span>
            </label>
          )}

          <div className="overflow-x-auto rounded-xl border border-line scrollbar-thin">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-xs text-ink-3">
                <tr>
                  {(Object.keys(SOURCE_FIELDS) as SourceField[])
                    .filter((f) => mapping[f])
                    .map((f) => (
                      <th key={f} className="px-3 py-2 font-medium whitespace-nowrap">
                        {SOURCE_FIELDS[f].label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-line">
                    {(Object.keys(SOURCE_FIELDS) as SourceField[])
                      .filter((f) => mapping[f])
                      .map((f) => (
                        <td key={f} className="max-w-64 truncate px-3 py-2" title={row[mapping[f]!]}>
                          {row[mapping[f]!]}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)} icon={<ArrowLeft className="size-4" />}>
              Другой файл
            </Button>
            <Button variant="primary" disabled={!mapping.name || rowsWithName === 0} onClick={() => setStep(2)}>
              Дальше <ArrowRight className="size-4" />
            </Button>
          </div>
        </Panel>
      )}

      {step === 2 && preview && (
        <Panel className="space-y-6 p-6">
          <section className="space-y-2">
            <h2 className="font-semibold">Маркетплейс</h2>
            <Segmented
              value={marketplace}
              onChange={setMarketplace}
              options={{
                ozon: { label: MARKETPLACES.ozon.label, hint: `Название до ${MARKETPLACES.ozon.titleMax} символов` },
                wb: { label: MARKETPLACES.wb.label, hint: `Название до ${MARKETPLACES.wb.titleMax} символов` },
              }}
            />
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Тон</h2>
            <Segmented value={tone} onChange={setTone} options={TONES} />
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Длина описания</h2>
            <Segmented value={length} onChange={setLength} options={LENGTHS} />
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft/60 p-4 text-sm">
            <span>
              Будет сгенерировано карточек: <b>{rowsWithName}</b>
              {rowsWithName < preview.rows.length && (
                <span className="text-ink-3"> (строки без названия пропущены)</span>
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(1)} icon={<ArrowLeft className="size-4" />}>
                Назад
              </Button>
              <Button variant="primary" loading={creating} onClick={start} icon={<Sparkles className="size-4" />}>
                Запустить генерацию
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
