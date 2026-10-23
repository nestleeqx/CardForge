import { Search } from "lucide-react";
import { MARKETPLACES } from "@/lib/labels";
import type { CardResult, CardWarning, Marketplace, SourceProduct } from "@/lib/types";
import { Highlight, marksFor } from "./Highlight";
import { ProductThumb } from "./ProductThumb";

/** Упрощённый макет витрины: как карточка выглядит для покупателя. Без логотипов маркетплейсов. */
export function MarketplacePreview({
  source,
  card,
  marketplace,
  warnings,
}: {
  source: SourceProduct;
  card: CardResult;
  marketplace: Marketplace;
  warnings: CardWarning[];
}) {
  const title = marketplace === "wb" && source.brand ? `${source.brand} / ${card.title}` : card.title;
  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-4 text-xs text-ink-3">
        Упрощённый макет витрины {MARKETPLACES[marketplace].label}. Подсвечено то, что проверки предлагают поправить.
      </p>
      <div className="grid gap-8 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* Рамка 3:4, как у карточек Ozon и WB; фото вписано целиком, без обрезки.
            Обводка — ring, а не border: border съел бы место, и фото 3:4 не заняло бы рамку целиком */}
        <div className="mx-auto w-full max-w-[260px] md:max-w-none">
          <ProductThumb
            src={source.photo}
            alt={card.title}
            fit="contain"
            className="aspect-[3/4] w-full ring-1 ring-line"
          />
        </div>
        <div className="min-w-0">
          {source.brand && <p className="text-sm font-medium text-accent">{source.brand}</p>}
          <h2 className="mt-1 text-xl leading-snug font-semibold text-balance">
            <Highlight text={title} marks={marksFor(warnings, "title")} />
          </h2>
          <p className="mt-1 text-[11px] text-ink-3">Артикул {source.sku}</p>

          <h3 className="mt-6 text-sm font-semibold">О товаре</h3>
          <dl className="mt-2 space-y-1.5 text-sm">
            {card.attributes.slice(0, 8).map((a) => (
              <div key={a.name} className="flex items-baseline gap-2">
                <dt className="shrink-0 text-ink-3">{a.name}</dt>
                <span className="min-w-4 flex-1 border-b border-dotted border-line-strong" />
                <dd className="max-w-[60%] text-right">{a.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <section className="mt-8 border-t border-line pt-6">
        <h3 className="text-sm font-semibold">Описание</h3>
        <div className="mt-2 max-w-3xl text-sm leading-relaxed whitespace-pre-line text-ink-2">
          <Highlight text={card.description} marks={marksFor(warnings, "description")} />
        </div>
      </section>

      <section className="mt-6 rounded-xl bg-canvas p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <Search className="size-3.5" /> Поисковые запросы — покупатель их не видит, по ним маркетплейс находит товар
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.keywords.map((k) => (
            <span key={k} className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink-2">
              {k}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
