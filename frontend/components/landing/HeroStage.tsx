"use client";

import { Check, CheckCircle2, FileSpreadsheet, Loader2, MousePointerClick, ScanSearch } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HERO_PRODUCTS } from "@/lib/hero";
import { FLOATING, SHEET_ROWS } from "@/lib/landing";

// Тайминги одного цикла «генерации» карточки, мс
const SKELETON = 900;
const PER_CHAR = 22;
const PER_ATTR = 140;
const PER_CHIP = 90;
const PER_CHECK = 260;
const HOLD = 3800;
const TICK = 50;

type Stage = ReturnType<typeof stageAt>;

function stageAt(product: (typeof HERO_PRODUCTS)[number], t: number) {
  const titleDone = SKELETON + product.title.length * PER_CHAR;
  const ready = titleDone + 1400;
  return {
    photo: t > 250,
    typed: Math.max(0, Math.min(product.title.length, Math.floor((t - SKELETON) / PER_CHAR))),
    attrs: Math.max(0, Math.floor((t - titleDone) / PER_ATTR)),
    description: t > titleDone + 600,
    chips: Math.max(0, Math.floor((t - titleDone - 800) / PER_CHIP)),
    ready: t > ready,
    checks: t > ready ? Math.floor((t - ready) / PER_CHECK) : 0,
    end: ready + PER_CHECK * product.checks.length + HOLD,
  };
}


/** Сдвиг слоя за курсором: чем больше depth, тем «ближе» слой. */
function parallax(depth: number): CSSProperties {
  return {
    translate: `calc(var(--mx, 0) * ${depth}px) calc(var(--my, 0) * ${depth}px)`,
    transition: "translate .5s cubic-bezier(.2,.7,.2,1)",
  };
}

function FloatingProducts() {
  const places = [
    { cls: "left-[4%] top-[130px]", r: "-9deg", depth: -22 },
    { cls: "left-[8%] top-[400px]", r: "7deg", depth: -14 },
    { cls: "right-[5%] top-[110px]", r: "8deg", depth: -20 },
    { cls: "right-[8%] top-[380px]", r: "-6deg", depth: -12 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      {FLOATING.map((p, i) => (
        <div key={p.sku} className={`absolute ${places[i].cls}`} style={parallax(places[i].depth)}>
          <figure
            className="float-card polaroid pointer-events-auto w-40"
            style={{ "--r": places[i].r, animationDelay: `${i * -1700}ms` } as CSSProperties}
          >
            <div className="polaroid-inner rounded-2xl bg-surface p-2 shadow-[0_18px_40px_-18px_rgba(23,25,28,.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- декоративное фото с CDN */}
              <img src={p.photo} alt="" draggable={false} className="aspect-square w-full rounded-xl object-cover" />
              <figcaption className="mt-2 flex items-center justify-between px-1 pb-0.5 text-[10px]">
                <span className="text-ink-3">{p.sku}</span>
                <span className="inline-flex items-center gap-1 font-medium text-accent">
                  <span className="size-1.5 rounded-full bg-lime-strong" />
                  готово
                </span>
              </figcaption>
            </div>
          </figure>
        </div>
      ))}
    </div>
  );
}

function GeneratingCard({ index, stage }: { index: number; stage: Stage }) {
  const p = HERO_PRODUCTS[index];
  const typing = stage.typed < p.title.length;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_40px_80px_-40px_rgba(23,25,28,.45)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <p className="text-[10px] font-medium tracking-wider text-ink-3 uppercase">Карточка для Ozon</p>
          <p className="text-xs">{p.sku}</p>
        </div>
        {stage.ready ? (
          <span key="ready" className="pop inline-flex items-center gap-1.5 rounded-full bg-lime px-2.5 py-1 text-xs font-medium text-accent-ink">
            <Check className="size-3.5" /> Готово к выгрузке
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft px-2.5 py-1 text-xs font-medium text-info">
            <Loader2 className="size-3.5 animate-spin" /> ИИ пишет карточку
          </span>
        )}
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element -- фото товара с CDN */}
          <img
            key={p.sku}
            src={p.photo}
            alt={p.title}
            className={`size-full object-cover transition duration-700 ${stage.photo ? "scale-100 opacity-100" : "scale-105 opacity-0"}`}
          />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent">{p.brand}</p>
          <p className="mt-1 min-h-[3.4em] text-lg leading-snug font-semibold">
            {stage.typed === 0 ? (
              <span className="block space-y-2 pt-1">
                <span className="skeleton block h-4 w-full rounded" />
                <span className="skeleton block h-4 w-2/3 rounded" />
              </span>
            ) : (
              <>
                {p.title.slice(0, stage.typed)}
                {typing && <span className="caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-ink" />}
              </>
            )}
          </p>
          <dl className="mt-4 space-y-1.5 text-xs">
            {p.attributes.map(([k, v], i) =>
              i < stage.attrs ? (
                <div key={`${p.sku}-${k}`} className="slide-in flex items-baseline gap-2">
                  <dt className="shrink-0 text-ink-3">{k}</dt>
                  <span className="min-w-3 flex-1 border-b border-dotted border-line-strong" />
                  <dd className="text-right text-ink-2">{v}</dd>
                </div>
              ) : (
                <div key={`${p.sku}-${k}`} className="skeleton h-3.5 rounded" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
              ),
            )}
          </dl>
        </div>
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="min-h-[4.5em]">
          {stage.description ? (
            <p key={p.sku} className="fade-in text-sm leading-relaxed text-ink-2">
              {p.description}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="skeleton h-3.5 rounded" />
              <div className="skeleton h-3.5 rounded" />
              <div className="skeleton h-3.5 w-3/4 rounded" />
            </div>
          )}
        </div>
        <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
          {p.keywords.slice(0, stage.chips).map((k) => (
            <span key={`${p.sku}-${k}`} className="pop rounded-full bg-sunken px-2.5 py-0.5 text-[11px] text-ink-2">
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Первый экран: карточка «генерируется» по очереди для нескольких товаров, слои слегка следуют за курсором. */
export function HeroStage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [t, setT] = useState(0);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    if (stageRef.current) io.observe(stageRef.current);
    return () => {
      media.removeEventListener("change", update);
      io.disconnect();
    };
  }, []);

  const product = HERO_PRODUCTS[index];
  // Генерация карточки — смена содержимого, а не движение, поэтому идёт и при «уменьшить движение»
  const stage = stageAt(product, t);

  // Таймер цикла: стоит, пока первый экран не виден или вкладка в фоне
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      setT((v) => v + TICK);
    }, TICK);
    return () => clearInterval(id);
  }, [visible]);

  if (t > stage.end) {
    setIndex((index + 1) % HERO_PRODUCTS.length);
    setT(0);
  }

  function select(i: number) {
    setIndex(i);
    setT(0);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (reduced || e.pointerType !== "mouse") return;
    const el = stageRef.current!;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", (((e.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--my", (((e.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
  }

  function onPointerLeave() {
    stageRef.current?.style.setProperty("--mx", "0");
    stageRef.current?.style.setProperty("--my", "0");
  }

  const heroRows = new Map(HERO_PRODUCTS.map((p, i) => [p.sku, i]));

  return (
    <section ref={stageRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className="relative -mt-[72px] pt-[72px]">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" style={parallax(-6)} />
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(200,242,107,.38),transparent)]"
      />
      <FloatingProducts />

      {children}

      <div className="relative px-4">
        <div className="relative mx-auto mt-16 h-[480px] max-w-5xl sm:h-[540px]">
          <div className="absolute top-14 left-0 hidden w-[430px] md:block" style={parallax(14)}>
            <div className="-rotate-6 rounded-xl border border-line bg-surface shadow-[0_20px_40px_-24px_rgba(23,25,28,.3)]">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-2">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="size-3.5 text-accent" /> uyutny-ugol.xlsx
                </span>
                <span className="flex items-center gap-1 text-[10px] text-ink-3">
                  <MousePointerClick className="size-3" /> выберите строку
                </span>
              </div>
              <table className="w-full text-[11px]">
                <thead className="text-ink-3">
                  <tr className="border-b border-line bg-canvas">
                    {["Артикул", "Название", "Бренд", "Характеристики"].map((h) => (
                      <th key={h} className="px-2.5 py-1.5 text-left font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SHEET_ROWS.map((row) => {
                    const i = heroRows.get(row[0]);
                    const current = i === index;
                    return (
                      <tr
                        key={row[0]}
                        onClick={i !== undefined ? () => select(i) : undefined}
                        className={`border-b border-line/70 transition-colors duration-300 last:border-0 ${
                          current ? "bg-accent-soft" : i !== undefined ? "cursor-pointer hover:bg-canvas" : ""
                        }`}
                      >
                        {row.map((c, j) => (
                          <td key={j} className={`max-w-28 truncate px-2.5 py-1.5 ${current ? "text-accent-ink" : "text-ink-2"}`}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="absolute top-6 right-0 hidden w-64 md:block" style={parallax(18)}>
            <div className="rotate-[5deg] rounded-xl border border-line bg-surface p-4 shadow-[0_20px_40px_-24px_rgba(23,25,28,.3)]">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <ScanSearch className="size-3.5 text-accent" /> Проверки · {product.sku}
              </p>
              <ul className="mt-3 space-y-2 text-xs">
                {product.checks.map((c, i) => {
                  const done = i < stage.checks;
                  return (
                    <li key={`${product.sku}-${c}`} className="flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 className="pop size-3.5 shrink-0 text-accent" />
                      ) : (
                        <span className="size-3.5 shrink-0 rounded-full border border-dashed border-line-strong" />
                      )}
                      <span className={`transition-colors duration-300 ${done ? "text-ink-2" : "text-ink-3"}`}>{c}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[600px]" style={parallax(6)}>
            <div className="mb-3 flex justify-center gap-1.5">
              {HERO_PRODUCTS.map((p, i) => {
                const active = i === index;
                const progress = Math.min(1, t / stage.end);
                return (
                  <button
                    key={p.sku}
                    onClick={() => select(i)}
                    className={`relative overflow-hidden rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active ? "border-ink/10 bg-surface text-ink shadow-sm" : "border-transparent text-ink-3 hover:text-ink"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 bg-lime/70"
                        style={{ width: `${progress * 100}%`, transition: `width ${TICK}ms linear` }}
                      />
                    )}
                    <span className="relative">{p.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="rise" style={{ animationDelay: "300ms" }}>
              <GeneratingCard index={index} stage={stage} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-canvas via-canvas/80 to-transparent" />
        </div>
      </div>
    </section>
  );
}
