"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Plus, RefreshCw, Save, Sparkles, Undo2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { CARD_FIELDS, DESCRIPTION_LIMITS, KEYWORDS_LIMITS, MARKETPLACES, QUICK_COMMENTS } from "@/lib/labels";
import type { CardField, CardResult, CardWarning, Marketplace, Product } from "@/lib/types";
import { Highlight, marksFor, type Mark } from "./Highlight";
import { MarketplacePreview } from "./MarketplacePreview";
import { ProductThumb } from "./ProductThumb";
import { useToast } from "./Toast";
import { Button, CharCounter, StatusBadge } from "./ui";

type Draft = Omit<CardResult, "notes">;
type Tab = "editor" | "preview";

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
  missing_data: "bg-sunken text-ink-2",
  model_note: "bg-sunken text-ink-2",
  too_long: "bg-danger-soft text-danger",
  too_short: "bg-danger-soft text-danger",
  forbidden_word: "bg-danger-soft text-danger",
  keywords_count: "bg-warn-soft text-warn",
  suspected_fabrication: "bg-warn-soft text-warn",
};

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none";

/** Текстовое поле, которое показывает подсветку проблемных фрагментов, пока его не начали править. */
function EditableText({
  value,
  onChange,
  marks,
  rows,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  marks: Mark[];
  rows: number;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (marks.length && !editing) {
    return (
      <div
        role="textbox"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onFocus={() => setEditing(true)}
        className={`${inputClass} cursor-text leading-relaxed whitespace-pre-wrap ${className}`}
        style={{ minHeight: `${rows * 1.6}rem` }}
      >
        <Highlight text={value} marks={marks} />
      </div>
    );
  }
  return (
    <textarea
      autoFocus={editing}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      className={`${inputClass} leading-relaxed ${className}`}
    />
  );
}

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
    } catch {
      // ошибка уже показана тостом
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
        title={disabled ? "Сначала сохраните или отмените правки" : "Попросить ИИ переписать поле"}
        onClick={() => setOpen(true)}
        icon={<Sparkles className="size-3.5" />}
      >
        Переписать
      </Button>
    );
  }
  return (
    <div className="mt-2 w-full rounded-xl border border-accent/30 bg-accent-soft/50 p-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_COMMENTS[field].map((q) => (
          <button
            key={q}
            disabled={busy}
            onClick={() => submit(q)}
            className="rounded-md border border-accent/25 bg-surface px-2 py-0.5 text-xs text-accent-ink hover:bg-accent-soft disabled:opacity-50"
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
          placeholder="Своё пожелание, например «больше про материал»"
          className={`${inputClass} h-8 py-1`}
        />
        <Button variant="primary" size="sm" className="h-8" loading={busy} onClick={() => submit(comment)}>
          Переписать
        </Button>
        <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={() => setOpen(false)}>
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
    <section>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold">{CARD_FIELDS[field]}</h3>
        {counter}
        <div className="ml-auto">{regen}</div>
      </div>
      {children}
      {own.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {own.map((w, i) => (
            <p key={i} className={`flex items-start gap-1.5 rounded-md px-2 py-1 text-xs ${WARNING_STYLE[w.code]}`}>
              <AlertTriangle className="mt-px size-3 shrink-0" />
              {w.message}
            </p>
          ))}
        </div>
      )}
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
  const [tab, setTab] = useState<Tab>("editor");
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
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea");
      if (e.key === "Escape") onClose();
      if (!typing && e.key === "ArrowLeft") onPrev?.();
      if (!typing && e.key === "ArrowRight") onNext?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  // Страница под открытой панелью не прокручивается
  useEffect(() => {
    // Блокируем на <html>: там же зарезервировано место под полосу прокрутки, и разметка не прыгает
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, []);

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
  // Для подсветки берём сохранённые предупреждения, пока текст не изменён вручную
  const warnings = dirty ? product.warnings.filter((w) => !w.terms?.length) : product.warnings;
  const sourceNotes = product.warnings.filter((w) => w.code === "missing_data" || w.code === "model_note");
  const attrTerms = marksFor(warnings, "attributes").map((m) => m.term.toLowerCase());
  const regen = (field: CardField) => (
    <RegeneratePanel field={field} disabled={dirty} onSubmit={(c) => regenerate(field, c)} />
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[1100px] flex-col bg-surface shadow-2xl">
        <header className="flex items-center gap-2.5 border-b border-line px-4 py-3 sm:gap-3 sm:px-5">
          {/* На самых узких экранах миниатюра уступает место артикулу и названию */}
          <ProductThumb src={src.photo} alt={src.name} className="size-10 max-[359px]:hidden" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap">
              <span className="text-[11px] text-ink-3">{src.sku || `строка ${product.row_index + 1}`}</span>
              <StatusBadge status={product.status} />
              {product.edited && (
                <span className="text-[11px] text-ink-3">
                  <span className="sm:hidden">правка</span>
                  <span className="hidden sm:inline">изменено вручную</span>
                </span>
              )}
            </div>
            <h2 className="truncate font-semibold">{src.name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="sm" title="Предыдущий (←)" disabled={!onPrev} onClick={onPrev} icon={<ChevronLeft className="size-4" />} />
            <Button variant="ghost" size="sm" title="Следующий (→)" disabled={!onNext} onClick={onNext} icon={<ChevronRight className="size-4" />} />
            <Button variant="ghost" size="sm" title="Закрыть (Esc)" onClick={onClose} icon={<X className="size-4" />} />
          </div>
        </header>

        {draft && (
          <div className="flex gap-5 border-b border-line px-5 text-sm">
            {(
              [
                ["editor", "Редактор"],
                ["preview", "Как увидит покупатель"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 py-2.5 transition-colors ${
                  tab === key ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {tab === "preview" && draft ? (
            <div className="p-6">
              <MarketplacePreview source={src} card={{ ...draft, notes: [] }} marketplace={marketplace} warnings={warnings} />
            </div>
          ) : (
            <div className="grid lg:min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
              <section className="space-y-5 border-b border-line bg-canvas/70 p-5 lg:border-r lg:border-b-0">
                <h3 className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">Было · строка таблицы</h3>
                <dl className="space-y-1.5 text-sm">
                  {(
                    [
                      ["Название", src.name],
                      ["Категория", src.category],
                      ["Бренд", src.brand],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-20 shrink-0 text-ink-3">{k}</dt>
                      <dd className={v ? "" : "text-ink-3 italic"}>{v || "не указано"}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <h4 className="mb-2 text-xs text-ink-3">Характеристики · {src.attributes.length}</h4>
                  {src.attributes.length ? (
                    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
                      {src.attributes.map((a, i) => (
                        <li key={i} className="flex gap-3 px-3 py-1.5">
                          <span className="w-28 shrink-0 text-ink-3">{a.name}</span>
                          <span>{a.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-3 italic">нет</p>
                  )}
                </div>
                {sourceNotes.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs text-ink-3">Чего не хватило в исходных данных</h4>
                    <ul className="space-y-1">
                      {sourceNotes.map((w, i) => (
                        <li key={i} className="rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
                          {w.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="space-y-6 p-5">
                <h3 className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">
                  Стало · карточка для {MARKETPLACES[marketplace].label}
                </h3>

                {product.status === "error" && (
                  <div className="rounded-xl bg-danger-soft p-4 text-sm text-danger">
                    <p className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="size-4" /> Не удалось сгенерировать
                    </p>
                    <p className="mt-1">{product.error}</p>
                  </div>
                )}

                {(product.status === "queued" || product.status === "running") && !draft && (
                  <div className="space-y-3">
                    <div className="skeleton h-12 rounded-lg" />
                    <div className="skeleton h-48 rounded-lg" />
                    <div className="skeleton h-24 rounded-lg" />
                  </div>
                )}

                {draft && (
                  <>
                    <FieldBlock
                      field="title"
                      warnings={warnings}
                      counter={<CharCounter value={draft.title.length} max={titleMax} />}
                      regen={regen("title")}
                    >
                      <EditableText
                        rows={2}
                        value={draft.title}
                        onChange={(title) => update({ title })}
                        marks={marksFor(warnings, "title")}
                        className={`resize-none font-medium ${draft.title.length > titleMax ? "border-danger/40 bg-danger-soft/40" : ""}`}
                      />
                    </FieldBlock>

                    <FieldBlock
                      field="description"
                      warnings={warnings}
                      counter={<CharCounter value={draft.description.length} min={DESCRIPTION_LIMITS.min} max={DESCRIPTION_LIMITS.max} />}
                      regen={regen("description")}
                    >
                      <EditableText
                        rows={12}
                        value={draft.description}
                        onChange={(description) => update({ description })}
                        marks={marksFor(warnings, "description")}
                        className="resize-none"
                      />
                    </FieldBlock>

                    <FieldBlock field="attributes" warnings={warnings} regen={regen("attributes")}>
                      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                        {draft.attributes.map((a, i) => {
                          const flagged = attrTerms.some((t) => `${a.name} ${a.value}`.toLowerCase().includes(t));
                          return (
                            <div key={i} className={`group flex ${flagged ? "bg-warn-soft/60" : ""}`}>
                              {/* На телефоне название поля — подпись над значением, на десктопе — колонка слева */}
                              <div className="flex min-w-0 flex-1 flex-col sm:flex-row">
                                <input
                                  value={a.name}
                                  aria-label="Название характеристики"
                                  onChange={(e) =>
                                    update({ attributes: draft.attributes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                                  }
                                  className="w-full min-w-0 bg-transparent px-3 pt-2 pb-0 text-xs text-ink-3 focus:bg-surface focus:outline-none sm:w-2/5 sm:border-r sm:border-line sm:py-1.5 sm:text-sm sm:text-ink-2"
                                />
                                <input
                                  value={a.value}
                                  aria-label="Значение характеристики"
                                  onChange={(e) =>
                                    update({ attributes: draft.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
                                  }
                                  className="w-full min-w-0 flex-1 bg-transparent px-3 pt-0.5 pb-2 text-sm focus:bg-surface focus:outline-none sm:py-1.5"
                                />
                              </div>
                              <button
                                onClick={() => update({ attributes: draft.attributes.filter((_, j) => j !== i) })}
                                className="px-2.5 text-ink-3 transition hover:text-danger focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                aria-label="Удалить характеристику"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() => update({ attributes: [...draft.attributes, { name: "", value: "" }] })}
                        icon={<Plus className="size-3.5" />}
                      >
                        Добавить характеристику
                      </Button>
                    </FieldBlock>

                    <FieldBlock
                      field="keywords"
                      warnings={warnings}
                      counter={<CharCounter value={draft.keywords.length} min={KEYWORDS_LIMITS.min} max={KEYWORDS_LIMITS.max} />}
                      regen={regen("keywords")}
                    >
                      <div className="flex flex-wrap gap-1.5 rounded-lg border border-line p-2 focus-within:border-accent">
                        {draft.keywords.map((k, i) => (
                          <span
                            key={`${k}-${i}`}
                            className="inline-flex items-center gap-1 rounded-md bg-sunken py-0.5 pr-0.5 pl-2 text-xs text-ink-2"
                          >
                            {k}
                            <button
                              onClick={() => update({ keywords: draft.keywords.filter((_, j) => j !== i) })}
                              className="rounded p-0.5 text-ink-3 hover:bg-line hover:text-danger"
                              aria-label={`Удалить «${k}»`}
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
                          placeholder="+ добавить запрос"
                          className="min-w-32 flex-1 px-1 text-xs placeholder:text-ink-3 focus:outline-none"
                        />
                      </div>
                    </FieldBlock>
                  </>
                )}
              </section>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3">
          <Button
            variant="secondary"
            loading={retrying}
            disabled={product.status === "queued" || product.status === "running"}
            onClick={retry}
            icon={<RefreshCw className="size-4" />}
          >
            {product.status === "error" ? "Повторить генерацию" : "Сгенерировать заново"}
          </Button>
          {dirty ? (
            <>
              <span className="ml-auto text-xs text-ink-3">Есть несохранённые правки</span>
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
          ) : (
            <span className="ml-auto hidden text-xs text-ink-3 sm:block">← → — соседние товары, Esc — закрыть</span>
          )}
        </footer>
      </aside>
    </div>
  );
}
