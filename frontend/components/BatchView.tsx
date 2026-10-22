"use client";

import { AlertTriangle, ChevronRight, Download, Loader2, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { LENGTHS, MARKETPLACES, TONES } from "@/lib/labels";
import type { Batch, Product } from "@/lib/types";
import { ProductDrawer } from "./ProductDrawer";
import { ProductThumb } from "./ProductThumb";
import { useToast } from "./Toast";
import { Button, Chip, Panel, ProgressBar, StatusBadge } from "./ui";

type Filter = "all" | "warnings" | "error";

function isActive(b?: Batch) {
  return !!b && b.counts.queued + b.counts.running > 0;
}

/** Предупреждения, которые требуют внимания (без заметок о нехватке исходных данных). */
function issues(p: Product) {
  return p.warnings.filter((w) => w.code !== "missing_data" && w.code !== "model_note");
}

function Checks({ product }: { product: Product }) {
  const problems = issues(product);
  const notes = product.warnings.length - problems.length;
  return (
    <div className="flex flex-wrap gap-1" title={product.warnings.map((w) => w.message).join("\n")}>
      {problems.length > 0 && (
        <Chip tone="warn">
          <AlertTriangle className="size-3" />
          {problems.length}
        </Chip>
      )}
      {notes > 0 && <Chip>заметок: {notes}</Chip>}
      {product.result && product.warnings.length === 0 && (
        <span className="text-xs whitespace-nowrap text-ink-3">без замечаний</span>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">
        {value}
        {hint && <span className="ml-1 text-xs font-normal text-ink-3">{hint}</span>}
      </p>
    </div>
  );
}

export function BatchView() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: batch, error, mutate } = useSWR(["batch", id], () => api.batch(id), {
    refreshInterval: (latest) => (isActive(latest) ? 2000 : 0),
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [exporting, setExporting] = useState(false);

  const products = useMemo(() => {
    if (!batch) return [];
    const q = query.trim().toLowerCase();
    return batch.products.filter((p) => {
      if (filter === "warnings" && p.warnings.length === 0) return false;
      if (filter === "error" && p.status !== "error") return false;
      if (!q) return true;
      return [p.source.sku, p.source.name, p.result?.title ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [batch, filter, query]);

  if (error) {
    return (
      <Panel className="p-10 text-center">
        <p className="text-danger">{error.message}</p>
        <Link href="/app" className="mt-3 inline-block text-sm text-accent">
          К списку партий
        </Link>
      </Panel>
    );
  }
  if (!batch) return <div className="skeleton h-80 rounded-xl" />;

  const active = isActive(batch);
  const titleMax = MARKETPLACES[batch.marketplace].titleMax;
  const processed = batch.counts.done + batch.counts.error;
  const done = batch.products.filter((p) => p.result);
  const avg = (f: (p: Product) => number) =>
    done.length ? Math.round(done.reduce((n, p) => n + f(p), 0) / done.length) : 0;
  const withWarnings = batch.products.filter((p) => p.warnings.length > 0).length;
  const openIndex = products.findIndex((p) => p.id === openId);
  const openProduct = batch.products.find((p) => p.id === openId) ?? null;

  function updateProduct(updated: Product) {
    mutate(
      (b) => b && { ...b, products: b.products.map((p) => (p.id === updated.id ? updated : p)) },
      { revalidate: updated.status === "queued" },
    );
  }

  async function retryFailed() {
    setRetrying(true);
    try {
      await mutate(await api.retryFailed(batch!.id), { revalidate: false });
    } catch (e) {
      toast.error(e);
    } finally {
      setRetrying(false);
    }
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      await api.exportBatch(batch!.id);
    } catch (e) {
      toast.error(e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <nav className="flex items-center gap-1 text-xs text-ink-3">
            <Link href="/app" className="hover:text-ink">
              Партии
            </Link>
            <ChevronRight className="size-3" />
            <span className="truncate">{batch.filename}</span>
          </nav>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight">
            {batch.is_demo ? "Уютный угол — товары для дома" : batch.filename}
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip tone="accent">{MARKETPLACES[batch.marketplace].label}</Chip>
            <Chip>тон: {TONES[batch.tone].label.toLowerCase()}</Chip>
            <Chip>описание: {LENGTHS[batch.length].hint}</Chip>
            {batch.is_demo && <Chip>демо-партия</Chip>}
          </div>
        </div>
        <div className="flex gap-2">
          {batch.counts.error > 0 && !active && (
            <Button loading={retrying} onClick={retryFailed} icon={<RefreshCw className="size-4" />}>
              Перезапустить упавшие · {batch.counts.error}
            </Button>
          )}
          <Button
            variant="primary"
            loading={exporting}
            disabled={batch.counts.done === 0}
            onClick={exportXlsx}
            icon={<Download className="size-4" />}
          >
            Скачать XLSX
          </Button>
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
          <Stat label="Готово карточек" value={`${batch.counts.done} из ${batch.total}`} />
          <Stat label="С замечаниями" value={withWarnings} hint={withWarnings ? "проверьте вручную" : undefined} />
          <Stat label="Средняя длина названия" value={avg((p) => p.result!.title.length)} hint={`из ${titleMax}`} />
          <Stat label="Средняя длина описания" value={avg((p) => p.result!.description.length)} hint="символов" />
        </div>
        <div className="border-t border-line px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-2">
            <span className="flex items-center gap-1.5">
              {active && <Loader2 className="size-3.5 animate-spin text-info" />}
              {active ? `Генерация идёт: ${processed} из ${batch.total}` : "Генерация завершена"}
            </span>
            <span className="text-ink-3 tabular-nums">
              в очереди {batch.counts.queued} · в работе {batch.counts.running} · ошибок {batch.counts.error}
            </span>
          </div>
          <ProgressBar counts={batch.counts} total={batch.total} />
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2.5">
          <div className="flex rounded-lg bg-sunken p-0.5 text-[13px]">
            {(
              [
                ["all", "Все", batch.total],
                ["warnings", "С замечаниями", withWarnings],
                ["error", "Ошибки", batch.counts.error],
              ] as [Filter, string, number][]
            ).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-2.5 py-1 transition ${
                  filter === key ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"
                }`}
              >
                {label} <span className="text-[11px] text-ink-3">{count}</span>
              </button>
            ))}
          </div>
          <label className="relative w-full sm:ml-auto sm:w-auto">
            <Search className="absolute top-2 left-2.5 size-4 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Артикул или название"
              className="h-8 w-full rounded-lg border sm:w-60 border-line bg-surface pr-3 pl-8 text-sm placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        {/* На телефоне — список карточек вместо широкой таблицы */}
        <ul className="divide-y divide-line md:hidden">
          {products.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setOpenId(p.id)}
                className="flex w-full gap-3 px-4 py-3 text-left transition-colors active:bg-canvas"
              >
                <ProductThumb src={p.source.photo} alt={p.source.name} className="size-14" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-medium">{p.source.name}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="truncate text-[11px] text-ink-3">
                    {p.source.sku || `#${p.row_index + 1}`} · {p.source.brand || "без бренда"}
                  </div>
                  {p.result ? (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-2">{p.result.title}</p>
                  ) : p.status === "error" ? (
                    <p className="mt-1 text-xs text-danger">{p.error}</p>
                  ) : (
                    <div className="skeleton mt-2 h-3.5 w-4/5 rounded" />
                  )}
                  <div className="mt-1.5">
                    <Checks product={p} />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto scrollbar-thin md:block">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="text-xs text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-4 font-medium">Товар из таблицы</th>
                <th className="px-3 py-2 font-medium">Название для {MARKETPLACES[batch.marketplace].label}</th>
                <th className="px-3 py-2 font-medium">Описание</th>
                <th className="px-3 py-2 text-right font-medium">Ключи</th>
                <th className="px-3 py-2 font-medium">Проверки</th>
                <th className="py-2 pr-4 pl-3 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => {
                const r = p.result;
                const titleOver = r && r.title.length > titleMax;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                    className={`cursor-pointer align-top transition-colors hover:bg-canvas ${openId === p.id ? "bg-accent-soft/40" : ""}`}
                  >
                    <td className="py-3 pr-3 pl-4">
                      <div className="flex w-56 items-center gap-3">
                        <ProductThumb src={p.source.photo} alt={p.source.name} className="size-11" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.source.name}</div>
                          <div className="truncate text-[11px] text-ink-3">
                            {p.source.sku || `#${p.row_index + 1}`} · {p.source.brand || "без бренда"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-80 px-3 py-3">
                      {r ? (
                        <>
                          <div className="line-clamp-2 leading-snug">{r.title}</div>
                          <div
                            className={`mt-0.5 text-[11px] tabular-nums ${titleOver ? "font-semibold text-danger" : "text-ink-3"}`}
                          >
                            {r.title.length}/{titleMax}
                          </div>
                        </>
                      ) : p.status === "error" ? (
                        <span className="text-xs text-danger">{p.error}</span>
                      ) : (
                        <div className="skeleton mt-1 h-4 w-52 rounded" />
                      )}
                    </td>
                    <td className="max-w-md px-3 py-3 text-ink-2">
                      {r ? (
                        <div className="line-clamp-2 leading-snug">{r.description}</div>
                      ) : (
                        p.status !== "error" && <div className="skeleton mt-1 h-4 w-72 rounded" />
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-ink-2 tabular-nums">
                      {r?.keywords.length ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Checks product={p} />
                    </td>
                    <td className="py-3 pr-4 pl-3">
                      <StatusBadge status={p.status} />
                      {p.edited && <div className="mt-0.5 text-[11px] text-ink-3">правка</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {products.length === 0 && <p className="p-8 text-center text-sm text-ink-3">Ничего не найдено</p>}
      </Panel>

      {openProduct && (
        <ProductDrawer
          key={openProduct.id}
          product={openProduct}
          marketplace={batch.marketplace}
          onClose={() => setOpenId(null)}
          onChange={updateProduct}
          onPrev={openIndex > 0 ? () => setOpenId(products[openIndex - 1].id) : undefined}
          onNext={
            openIndex >= 0 && openIndex < products.length - 1 ? () => setOpenId(products[openIndex + 1].id) : undefined
          }
        />
      )}
    </div>
  );
}
