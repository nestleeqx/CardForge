"use client";

import {
  AlertTriangle,
  ArrowRight,
  Download,
  FileSpreadsheet,
  ListChecks,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Button, buttonClasses, Card, ProgressBar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { formatDate, LENGTHS, MARKETPLACES, TONES } from "@/lib/labels";
import type { BatchSummary } from "@/lib/types";

const STEPS = [
  { icon: Upload, title: "Загрузите CSV или XLSX", text: "Артикул, название, бренд, характеристики через «;»" },
  { icon: Sparkles, title: "ИИ пишет карточки", text: "Название, описание, характеристики и 10–15 ключевых слов" },
  { icon: ListChecks, title: "Проверьте и скачайте", text: "Подсветка лимитов и выдумок, экспорт под шаблон маркетплейса" },
];

function isActive(b: BatchSummary) {
  return b.counts.queued + b.counts.running > 0;
}

function BatchRow({ batch, onDelete }: { batch: BatchSummary; onDelete: () => void }) {
  const toast = useToast();
  const active = isActive(batch);
  const done = batch.counts.done;
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 last:border-0 md:flex-row md:items-center">
      <Link href={`/batches/${batch.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <FileSpreadsheet className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{batch.filename}</span>
            {batch.is_demo && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                демо
              </span>
            )}
          </span>
          <span className="text-xs text-slate-500">
            {MARKETPLACES[batch.marketplace].label} · {TONES[batch.tone].label.toLowerCase()} тон ·{" "}
            {LENGTHS[batch.length].label.toLowerCase()} описание · {formatDate(batch.created_at)}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-4 md:w-80">
        <div className="flex-1">
          <ProgressBar counts={batch.counts} total={batch.total} />
          <div className="mt-1.5 flex justify-between text-xs text-slate-500">
            <span>
              {done} из {batch.total} готово
              {batch.counts.error > 0 && <span className="text-rose-600"> · {batch.counts.error} ошибок</span>}
            </span>
            {batch.warnings > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <AlertTriangle className="size-3" />
                {batch.warnings}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            title="Скачать XLSX"
            disabled={done === 0}
            onClick={() => api.exportBatch(batch.id).catch(toast.error)}
            icon={<Download className="size-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            title="Удалить"
            disabled={active}
            onClick={onDelete}
            icon={<Trash2 className="size-4" />}
          />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR("batches", api.batches, {
    refreshInterval: (latest) => (latest?.some(isActive) ? 2000 : 0),
  });
  const demo = data?.find((b) => b.is_demo);

  async function remove(b: BatchSummary) {
    if (!confirm(`Удалить партию «${b.filename}»?`)) return;
    try {
      await api.deleteBatch(b.id);
      await mutate();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-sm font-medium text-indigo-600">Для селлеров Ozon и Wildberries</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Таблица с товарами → готовые карточки за пару минут
            </h1>
            <p className="mt-3 max-w-xl text-slate-600">
              Сервис пишет названия, описания, характеристики и ключевые слова по вашим данным, сам
              проверяет лимиты маркетплейса и подсвечивает, если нейросеть добавила то, чего нет в
              исходнике.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {demo && (
                <Link href={`/batches/${demo.id}`} className={buttonClasses("primary")}>
                  Открыть демо-партию «Уютный угол»
                  <ArrowRight className="size-4" />
                </Link>
              )}
              <Link href="/new" className={buttonClasses()}>
                <Upload className="size-4" />
                Загрузить свою таблицу
              </Link>
            </div>
          </div>
          <ol className="grid gap-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-xl bg-slate-50 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm">
                  <s.icon className="size-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-medium">
                    {i + 1}. {s.title}
                  </span>
                  <span className="text-sm text-slate-500">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">История загрузок</h2>
          <span className="text-xs text-slate-500">Партии хранятся 24 часа</span>
        </div>
        {isLoading && (
          <div className="space-y-3 p-5">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        )}
        {error && <p className="p-5 text-sm text-rose-600">{error.message}</p>}
        {data?.map((b) => <BatchRow key={b.id} batch={b} onDelete={() => remove(b)} />)}
        {data?.length === 0 && (
          <p className="p-5 text-sm text-slate-500">Партий пока нет — загрузите первую таблицу.</p>
        )}
      </Card>
    </div>
  );
}
