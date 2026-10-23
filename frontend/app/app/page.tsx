"use client";

import { AlertTriangle, Download, FileSpreadsheet, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { Button, buttonClasses, Chip, Panel, ProgressBar } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, LENGTHS, MARKETPLACES, TONES } from "@/lib/labels";
import type { BatchSummary } from "@/lib/types";

function isActive(b: BatchSummary) {
  return b.counts.queued + b.counts.running > 0;
}

function BatchRow({ batch, onDelete }: { batch: BatchSummary; onDelete: () => void }) {
  const toast = useToast();
  const active = isActive(batch);
  return (
    // Телефон: название и кнопки в первой строке, прогресс — во второй на всю ширину.
    // Десктоп: всё в одну строку
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 px-4 py-3.5 transition-colors hover:bg-canvas/60 md:grid-cols-[minmax(0,1fr)_260px_auto] md:gap-x-3">
      <Link href={`/app/batches/${batch.id}`} className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-ink-3">
          <FileSpreadsheet className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{batch.filename}</span>
            {batch.is_demo && <Chip tone="accent">демо</Chip>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-3">
            {/* На телефоне — только площадка и дата, тон и длина описания видны внутри партии */}
            <span className="sm:hidden">
              {MARKETPLACES[batch.marketplace].label} · {formatDate(batch.created_at)}
            </span>
            <span className="hidden sm:inline">
              {MARKETPLACES[batch.marketplace].label} · {TONES[batch.tone].label.toLowerCase()} тон ·{" "}
              {LENGTHS[batch.length].label.toLowerCase()} описание · {formatDate(batch.created_at)}
            </span>
          </span>
        </span>
      </Link>
      <div className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-1">
        <ProgressBar counts={batch.counts} total={batch.total} />
        <div className="mt-1.5 flex justify-between text-xs text-ink-3">
          <span className="tabular-nums">
            {batch.counts.done}/{batch.total}
            {batch.counts.error > 0 && <span className="text-danger"> · {batch.counts.error} ош.</span>}
          </span>
          {batch.warnings > 0 && (
            <span className="inline-flex items-center gap-1 text-warn">
              <AlertTriangle className="size-3" />
              {batch.warnings} с замечаниями
            </span>
          )}
        </div>
      </div>
      <div className="col-start-2 row-start-1 flex justify-end gap-0.5 md:col-start-3">
        <Button
          variant="ghost"
          size="sm"
          title="Скачать XLSX"
          aria-label="Скачать XLSX"
          disabled={batch.counts.done === 0}
          onClick={() => api.exportBatch(batch.id).catch(toast.error)}
          icon={<Download className="size-4" />}
        />
        <Button
          variant="ghost"
          size="sm"
          title="Удалить"
          aria-label="Удалить партию"
          disabled={active}
          onClick={onDelete}
          icon={<Trash2 className="size-4" />}
        />
      </div>
    </div>
  );
}

export default function BatchesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, isLoading, mutate } = useSWR("batches", api.batches, {
    refreshInterval: (latest) => (latest?.some(isActive) ? 2000 : 0),
  });

  const router = useRouter();
  const [restoring, setRestoring] = useState(false);

  async function restoreDemo() {
    setRestoring(true);
    try {
      const demo = await api.restoreDemo();
      await mutate();
      router.push(`/app/batches/${demo.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setRestoring(false);
    }
  }

  async function remove(b: BatchSummary) {
    const ok = await confirm({
      title: "Удалить партию?",
      description: (
        <>
          «{b.filename}» и все её карточки удалятся без возможности восстановления.
        </>
      ),
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteBatch(b.id);
      await mutate();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Партии</h1>
          <p className="mt-1 text-sm text-ink-2">Загруженные таблицы и сгенерированные карточки. Партии хранятся 24 часа.</p>
        </div>
        {/* В пустом списке главное действие — в самом пустом блоке, без дубля в шапке */}
        {!!data?.length && (
          <Link href="/app/new" className={buttonClasses("primary")}>
            <Plus className="size-4" /> Новая партия
          </Link>
        )}
      </div>

      <Panel className="divide-y divide-line overflow-hidden">
        {isLoading && [0, 1].map((i) => <div key={i} className="skeleton m-4 h-10 rounded-lg" />)}
        {error && <p className="p-4 text-sm text-danger">{error.message}</p>}
        {data?.map((b) => <BatchRow key={b.id} batch={b} onDelete={() => remove(b)} />)}
        {data?.length === 0 && (
          <div className="p-10 text-center">
            <p className="font-medium">Партий пока нет</p>
            <p className="mt-1 text-sm text-ink-2">Загрузите таблицу с товарами — карточки появятся через пару минут.</p>
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              <Link href="/app/new" className={buttonClasses("primary")}>
                <Plus className="size-4" /> Загрузить таблицу
              </Link>
              <Button loading={restoring} onClick={restoreDemo} icon={<RotateCcw className="size-4" />}>
                Вернуть демо-партию
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
