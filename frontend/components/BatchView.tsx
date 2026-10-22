"use client";

import { AlertTriangle, ArrowLeft, Download, Loader2, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { LENGTHS, MARKETPLACES, plural, STATUSES, TONES } from "@/lib/labels";
import type { Batch, Product } from "@/lib/types";
import { ProductDrawer } from "./ProductDrawer";
import { Button, Card, ProgressBar, StatusBadge } from "./ui";
import { useToast } from "./Toast";

type Filter = "all" | "warnings" | "error";

function isActive(b?: Batch) {
  return !!b && b.counts.queued + b.counts.running > 0;
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
      <Card className="p-8 text-center">
        <p className="text-rose-600">{error.message}</p>
        <Link href="/" className="mt-3 inline-block text-sm text-indigo-600">
          К списку партий
        </Link>
      </Card>
    );
  }
  if (!batch) return <div className="skeleton h-64 rounded-2xl" />;

  const active = isActive(batch);
  const titleMax = MARKETPLACES[batch.marketplace].titleMax;
  const processed = batch.counts.done + batch.counts.error;
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
        <div>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" /> Все партии
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {batch.filename}
            {batch.is_demo && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                демо «Уютный угол»
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {MARKETPLACES[batch.marketplace].label} · тон {TONES[batch.tone].label.toLowerCase()} · описание{" "}
            {LENGTHS[batch.length].label.toLowerCase()} ({LENGTHS[batch.length].hint})
          </p>
        </div>
        <div className="flex gap-2">
          {batch.counts.error > 0 && !active && (
            <Button loading={retrying} onClick={retryFailed} icon={<RefreshCw className="size-4" />}>
              Перезапустить упавшие ({batch.counts.error})
            </Button>
          )}
          <Button
            variant="primary"
            loading={exporting}
            disabled={batch.counts.done === 0}
            onClick={exportXlsx}
            icon={<Download className="size-4" />}
          >
            Скачать XLSX для {MARKETPLACES[batch.marketplace].label}
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium">
            {active && <Loader2 className="size-4 animate-spin text-blue-600" />}
            {active ? "Идёт генерация" : "Генерация завершена"}: {processed} из {batch.total}
          </span>
          <span className="flex flex-wrap gap-3 text-xs text-slate-500">
            {(Object.keys(STATUSES) as (keyof typeof STATUSES)[]).map((s) => (
              <span key={s}>
                {STATUSES[s].label}: <b className="text-slate-700">{batch.counts[s]}</b>
              </span>
            ))}
          </span>
        </div>
        <ProgressBar counts={batch.counts} total={batch.total} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {(
              [
                ["all", `Все ${batch.total}`],
                ["warnings", `С предупреждениями ${withWarnings}`],
                ["error", `Ошибки ${batch.counts.error}`],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-3 py-1 transition ${filter === key ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative ml-auto">
            <Search className="absolute top-2 left-2.5 size-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Артикул или название"
              className="w-60 rounded-lg border border-slate-200 py-1.5 pr-3 pl-8 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-4 py-2.5 font-medium">Артикул</th>
                <th className="px-4 py-2.5 font-medium">Было</th>
                <th className="px-4 py-2.5 font-medium">Стало: название</th>
                <th className="px-4 py-2.5 font-medium">Описание</th>
                <th className="px-4 py-2.5 text-center font-medium">Ключи</th>
                <th className="px-4 py-2.5 font-medium">Проверки</th>
                <th className="px-4 py-2.5 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const r = p.result;
                const titleOver = r && r.title.length > titleMax;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                    className="cursor-pointer border-b border-slate-50 align-top transition hover:bg-indigo-50/40"
                  >
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-slate-500">
                      {p.source.sku || `#${p.row_index + 1}`}
                    </td>
                    <td className="max-w-44 px-4 py-3">
                      <div className="truncate">{p.source.name}</div>
                      <div className="truncate text-xs text-slate-400">
                        {p.source.attributes.length} {plural(p.source.attributes.length, ["характеристика", "характеристики", "характеристик"])}
                      </div>
                    </td>
                    <td className="max-w-80 px-4 py-3">
                      {r ? (
                        <>
                          <div className="line-clamp-2 font-medium">{r.title}</div>
                          <div className={`text-xs ${titleOver ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                            {r.title.length} / {titleMax}
                          </div>
                        </>
                      ) : p.status === "error" ? (
                        <span className="text-xs text-rose-600">{p.error}</span>
                      ) : (
                        <div className="skeleton h-4 w-48 rounded" />
                      )}
                    </td>
                    <td className="max-w-96 px-4 py-3 text-slate-600">
                      {r ? (
                        <div className="line-clamp-2">{r.description}</div>
                      ) : (
                        p.status !== "error" && <div className="skeleton h-4 w-64 rounded" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{r?.keywords.length ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.warnings.length > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-amber-700"
                          title={p.warnings.map((w) => w.message).join("\n")}
                        >
                          <AlertTriangle className="size-3.5" />
                          {p.warnings.length}
                        </span>
                      ) : (
                        r && <span className="text-xs text-emerald-600">ок</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={p.status} />
                        {p.edited && <span className="text-xs text-slate-400">правка</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {products.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Ничего не найдено</p>}
        </div>
      </Card>

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
