"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { CARD_FIELDS, DESCRIPTION_LIMITS, KEYWORDS_LIMITS, MARKETPLACES, QUICK_COMMENTS } from "@/lib/labels";
import type { CardField, CardResult, CardWarning, Marketplace, Product } from "@/lib/types";
import { Button, CharCounter, StatusBadge } from "./ui";
import { useToast } from "./Toast";

type Draft = Omit<CardResult, "notes">;

function toDraft(r: CardResult | null): Draft | null {
  if (!r) return null;
  return {
    title: r.title,
    description: r.description,
    attributes: r.attributes.map((a) => ({ ...a })),
    keywords: [...r.keywords],
  };
}

const WARNING_STYLE: Record<CardWarning["code"], string> = {
  missing_data: "bg-slate-50 text-slate-600",
  model_note: "bg-slate-50 text-slate-600",
  too_long: "bg-rose-50 text-rose-700",
  too_short: "bg-rose-50 text-rose-700",
  keywords_count: "bg-amber-50 text-amber-800",
  forbidden_word: "bg-rose-50 text-rose-700",
  suspected_fabrication: "bg-amber-50 text-amber-800",
};

function RegeneratePanel({
  field,
  disabled,
  onSubmit,
}: {
  field: CardField;
  disabled: boolean;
  onSubmit: (comment: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(text: string) {
    setBusy(true);
    try {
      await onSubmit(text);
      setOpen(false);
      setComment("");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        title={disabled ? "Сначала сохраните или отмените правки" : undefined}
        onClick={() => setOpen(true)}
        icon={<Sparkles className="size-3.5" />}
      >
        Перегенерировать
      </Button>
    );
  }
  return (
    <div className="mt-2 w-full rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_COMMENTS[field].map((q) => (
          <button
            key={q}
            disabled={busy}
            onClick={() => submit(q)}
            className="rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          autoFocus
          value={comment}
          maxLength={300}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(comment)}
          placeholder="Пожелание, например: «больше про материал»"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <Button variant="primary" size="sm" loading={busy} onClick={() => submit(comment)}>
          Готово
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

function FieldBlock({
  field,
  counter,
  warnings,
  regen,
  children,
}: {
  field: CardField;
  counter?: ReactNode;
  warnings: CardWarning[];
  regen: ReactNode;
  children: ReactNode;
}) {
  const own = warnings.filter((w) => w.field === field && w.code !== "missing_data");
  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{CARD_FIELDS[field]}</h3>
        {counter}
        <div className="ml-auto">{regen}</div>
      </div>
      {children}
      {own.map((w, i) => (
        <p key={i} className={`rounded-lg px-2.5 py-1 text-xs ${WARNING_STYLE[w.code]}`}>
          {w.message}
        </p>
      ))}
    </section>
  );
}

export function ProductDrawer({
  product,
  marketplace,
  onClose,
  onChange,
  onPrev,
  onNext,
}: {
  product: Product;
  marketplace: Marketplace;
  onClose: () => void;
  onChange: (p: Product) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(() => toDraft(product.result));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const titleMax = MARKETPLACES[marketplace].titleMax;

  // Новый результат с сервера (генерация завершилась) — подхватываем, если нет своих правок
  const [seenUpdate, setSeenUpdate] = useState(product.updated_at);
  if (product.updated_at !== seenUpdate) {
    setSeenUpdate(product.updated_at);
    if (!dirty) setDraft(toDraft(product.result));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function update(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await api.editProduct(product.id, {
        ...draft,
        attributes: draft.attributes.filter((a) => a.name.trim() && a.value.trim()),
        keywords: draft.keywords.filter((k) => k.trim()),
      });
      setDirty(false);
      setDraft(toDraft(updated.result));
      onChange(updated);
      toast.ok("Карточка сохранена");
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate(field: CardField, comment: string) {
    try {
      const updated = await api.regenerate(product.id, field, comment);
      setDraft(toDraft(updated.result));
      onChange(updated);
      toast.ok(`${CARD_FIELDS[field]}: новый вариант готов`);
    } catch (e) {
      toast.error(e);
      throw e;
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      onChange(await api.retryProduct(product.id));
      setDirty(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setRetrying(false);
    }
  }

  const src = product.source;
  const generalWarnings = product.warnings.filter((w) => !w.field || w.code === "missing_data");
  const regen = (field: CardField) => (
    <RegeneratePanel field={field} disabled={dirty} onSubmit={(c) => regenerate(field, c)} />
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{src.sku || `строка ${product.row_index + 1}`}</span>
              <StatusBadge status={product.status} />
              {product.edited && <span className="text-xs text-slate-400">изменено вручную</span>}
            </div>
            <h2 className="truncate font-semibold">{src.name}</h2>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={!onPrev} onClick={onPrev} icon={<ChevronLeft className="size-4" />} />
            <Button variant="ghost" size="sm" disabled={!onNext} onClick={onNext} icon={<ChevronRight className="size-4" />} />
            <Button variant="ghost" size="sm" onClick={onClose} icon={<X className="size-4" />} />
          </div>
        </header>

        <div className="grid flex-1 overflow-y-auto scrollbar-thin lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="space-y-4 border-b border-slate-100 bg-slate-50/70 p-5 lg:border-r lg:border-b-0">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Было: данные из таблицы</h3>
            <dl className="space-y-2 text-sm">
              {(
                [
                  ["Название", src.name],
                  ["Категория", src.category],
                  ["Бренд", src.brand],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
                  <dd className={v ? "" : "text-slate-400 italic"}>{v || "не указано"}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h4 className="mb-1.5 text-sm text-slate-500">Характеристики</h4>
              {src.attributes.length ? (
                <ul className="space-y-1 text-sm">
                  {src.attributes.map((a, i) => (
                    <li key={i} className="rounded-lg bg-white px-2.5 py-1.5 shadow-sm">
                      <span className="text-slate-500">{a.name}:</span> {a.value}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 italic">нет</p>
              )}
            </div>
            {generalWarnings.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="flex items-center gap-1 text-sm text-slate-500">
                  <Info className="size-4" /> Заметки
                </h4>
                {generalWarnings.map((w, i) => (
                  <p key={i} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    {w.message}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-6 p-5">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Стало: карточка для {MARKETPLACES[marketplace].label}
            </h3>

            {product.status === "error" && (
              <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4" /> Не удалось сгенерировать
                </p>
                <p className="mt-1">{product.error}</p>
              </div>
            )}

            {(product.status === "queued" || product.status === "running") && !draft && (
              <div className="space-y-3">
                <div className="skeleton h-6 rounded" />
                <div className="skeleton h-40 rounded" />
                <div className="skeleton h-20 rounded" />
              </div>
            )}

            {draft && (
              <>
                <FieldBlock
                  field="title"
                  warnings={product.warnings}
                  counter={<CharCounter value={draft.title.length} max={titleMax} />}
                  regen={regen("title")}
                >
                  <textarea
                    rows={2}
                    value={draft.title}
                    onChange={(e) => update({ title: e.target.value })}
                    className={`w-full resize-none rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none ${
                      draft.title.length > titleMax ? "border-rose-300 bg-rose-50/40" : "border-slate-200 focus:border-indigo-500"
                    }`}
                  />
                </FieldBlock>

                <FieldBlock
                  field="description"
                  warnings={product.warnings}
                  counter={
                    <CharCounter
                      value={draft.description.length}
                      min={DESCRIPTION_LIMITS.min}
                      max={DESCRIPTION_LIMITS.max}
                    />
                  }
                  regen={regen("description")}
                >
                  <textarea
                    rows={11}
                    value={draft.description}
                    onChange={(e) => update({ description: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:outline-none"
                  />
                </FieldBlock>

                <FieldBlock field="attributes" warnings={product.warnings} regen={regen("attributes")}>
                  <div className="space-y-1.5">
                    {draft.attributes.map((a, i) => (
                      <div key={i} className="flex gap-1.5">
                        <input
                          value={a.name}
                          onChange={(e) =>
                            update({
                              attributes: draft.attributes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            })
                          }
                          className="w-2/5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 focus:border-indigo-500 focus:outline-none"
                        />
                        <input
                          value={a.value}
                          onChange={(e) =>
                            update({
                              attributes: draft.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                            })
                          }
                          className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                          onClick={() => update({ attributes: draft.attributes.filter((_, j) => j !== i) })}
                          className="rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                          title="Удалить"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ attributes: [...draft.attributes, { name: "", value: "" }] })}
                      icon={<Plus className="size-3.5" />}
                    >
                      Добавить
                    </Button>
                  </div>
                </FieldBlock>

                <FieldBlock
                  field="keywords"
                  warnings={product.warnings}
                  counter={
                    <CharCounter value={draft.keywords.length} min={KEYWORDS_LIMITS.min} max={KEYWORDS_LIMITS.max} />
                  }
                  regen={regen("keywords")}
                >
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-2">
                    {draft.keywords.map((k, i) => (
                      <span
                        key={`${k}-${i}`}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-2.5 text-xs"
                      >
                        {k}
                        <button
                          onClick={() => update({ keywords: draft.keywords.filter((_, j) => j !== i) })}
                          className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-rose-600"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newKeyword.trim()) {
                          update({ keywords: [...draft.keywords, newKeyword.trim().toLowerCase()] });
                          setNewKeyword("");
                        }
                      }}
                      placeholder="+ запрос, Enter"
                      className="min-w-32 flex-1 px-1 text-xs focus:outline-none"
                    />
                  </div>
                </FieldBlock>
              </>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3">
          <Button
            variant="secondary"
            loading={retrying}
            disabled={product.status === "queued" || product.status === "running"}
            onClick={retry}
            icon={<RefreshCw className="size-4" />}
          >
            {product.status === "error" ? "Повторить генерацию" : "Сгенерировать заново"}
          </Button>
          {dirty && (
            <>
              <span className="ml-auto text-xs text-slate-500">Есть несохранённые правки</span>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(toDraft(product.result));
                  setDirty(false);
                }}
                icon={<Undo2 className="size-4" />}
              >
                Отменить
              </Button>
              <Button variant="primary" loading={saving} onClick={save} icon={<Save className="size-4" />}>
                Сохранить
              </Button>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
