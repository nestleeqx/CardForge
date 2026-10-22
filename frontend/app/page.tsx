import { ArrowRight, CheckCircle2, ChevronDown, FileSpreadsheet, FileUp, PencilLine, Sparkles } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Highlight } from "@/components/Highlight";
import { Logo } from "@/components/Logo";
import { HeroStage } from "@/components/landing/HeroStage";
import { Reveal } from "@/components/landing/Reveal";
import { CHECK_EXAMPLE, SHOWCASE } from "@/lib/landing";
import { SITE, SITE_URL } from "@/lib/site";

const STEPS = [
  { icon: FileUp, title: "Загрузите таблицу", text: "CSV или XLSX из учётной системы. Колонки сервис сопоставит сам, при необходимости поправите." },
  { icon: Sparkles, title: "Выберите площадку и тон", text: "Ozon или Wildberries, нейтральный, продающий или премиальный тон, длина описания." },
  { icon: PencilLine, title: "Проверьте и поправьте", text: "Карточки появляются по мере готовности. Любое поле можно поправить или попросить переписать." },
  { icon: FileSpreadsheet, title: "Скачайте XLSX", text: "Колонки под шаблон выбранной площадки и отдельный лист со всеми замечаниями." },
];

const CHECKS = [
  { title: "Лимиты площадки", text: "Название до 60 символов для WB и до 200 для Ozon, описание 500–2000, 10–15 поисковых запросов." },
  { title: "Запрещённые формулировки", text: "«Лучший», «№1», «хит продаж» и другие оценки, за которые площадки снижают карточку." },
  { title: "Выдуманные характеристики", text: "Числа и материалы в тексте сверяются с исходной строкой. Всё, чего там не было, подсвечивается." },
  { title: "Нехватка данных", text: "Нет бренда, мало характеристик — сервис подскажет, что добавить в таблицу, чтобы описание стало точнее." },
];

const FAQ = [
  {
    q: "Нейросеть не напишет того, чего нет у товара?",
    a: "Может попытаться — поэтому каждую карточку проверяет сервис. Числа и материалы в тексте сверяются с вашей таблицей, всё лишнее подсвечивается, а модель получает одну попытку переписать текст.",
  },
  {
    q: "Можно ли поправить текст вручную?",
    a: "Да. Любое поле редактируется прямо в карточке. Можно и попросить переписать отдельное поле с пожеланием: «короче», «больше про материал», «без бренда в начале».",
  },
  {
    q: "Какая таблица нужна?",
    a: "Обычная выгрузка из учёта в CSV или XLSX: артикул, название, категория, бренд и характеристики. Названия колонок могут быть любыми — сервис сопоставит их сам, а вы поправите, если он ошибся.",
  },
  {
    q: "Что я получу на выходе?",
    a: "Файл XLSX с колонками под шаблон Ozon или Wildberries: название, описание, характеристики, поисковые запросы и ссылки на фото. На отдельном листе — все замечания, чтобы ничего не потерялось.",
  },
  {
    q: "Можно ли не передавать данные за рубеж?",
    a: "Да. Сервис работает и с российской нейросетью YandexGPT — тогда данные о товарах остаются в России.",
  },
  {
    q: "Сколько товаров можно обработать?",
    a: "В демо — до 50 товаров за одну загрузку, чтобы его хватило всем посетителям. В рабочей версии ограничение задаётся под ваш ассортимент: карточки генерируются параллельно, сотни товаров обрабатываются за минуты.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE.name,
  url: SITE_URL,
  description: SITE.description,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "ru",
  offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

const darkButton =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-ink font-medium text-white transition-colors hover:bg-ink/85";

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function Showcase() {
  const items = [...SHOWCASE, ...SHOWCASE];
  return (
    <section aria-label="Товары демо-магазина" className="overflow-hidden py-6">
      <p className="mb-6 text-center text-sm text-ink-3">30 карточек магазина «Уютный угол» уже готовы в демо</p>
      <div className="relative [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
        <div className="marquee flex w-max gap-4">
          {items.map((p, i) => (
            <div key={`${p.sku}-${i}`} className="flex w-60 shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 pr-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- декоративное фото с CDN Unsplash */}
              <img src={p.photo} alt="" loading="lazy" className="size-14 rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-accent">
                  <CheckCircle2 className="size-3" /> карточка готова
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="overflow-x-hidden bg-canvas">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <header className="sticky top-0 z-40 px-3 pt-3 sm:pt-4">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 rounded-2xl border border-line/80 bg-surface/85 pr-2 pl-4 shadow-[0_10px_30px_-16px_rgba(23,25,28,.25)] backdrop-blur-md">
          <Link href="/" aria-label="CardForge — на главную">
            <Logo />
          </Link>
          <nav className="hidden gap-6 text-sm text-ink-2 md:flex">
            <a href="#how" className="transition-colors hover:text-ink">
              Как работает
            </a>
            <a href="#checks" className="transition-colors hover:text-ink">
              Проверки
            </a>
            <a href="#faq" className="transition-colors hover:text-ink">
              Вопросы
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/app/new" className="hidden px-3 text-sm text-ink-2 transition-colors hover:text-ink sm:block">
              Загрузить таблицу
            </Link>
            <Link href="/app/demo" className={`${darkButton} h-10 px-4 text-sm`}>
              Открыть демо
            </Link>
          </div>
        </div>
      </header>

      <main>
        <HeroStage>
          <div className="relative mx-auto max-w-3xl px-4 pt-16 text-center sm:pt-24">
            <span
              className="rise inline-flex items-center gap-1.5 rounded-full border border-lime-strong/60 bg-lime/60 px-3 py-1 text-xs font-medium text-accent-ink"
              style={delay(0)}
            >
              <Sparkles className="size-3.5" /> Для селлеров Ozon и Wildberries
            </span>
            <h1
              className="rise mt-6 text-[40px] leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-6xl"
              style={delay(80)}
            >
              Готовые карточки товаров прямо из вашей таблицы
            </h1>
            <p className="rise mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2" style={delay(160)}>
              Загрузите выгрузку из учёта — получите названия, описания и поисковые запросы. Сервис сам проверит лимиты
              площадки и подсветит то, что нейросеть могла додумать.
            </p>
            <div className="rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row" style={delay(240)}>
              <Link href="/app/demo" className={`${darkButton} group h-12 px-6 text-[15px]`}>
                Открыть демо — без регистрации <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/app/new" className="inline-flex h-12 items-center px-4 text-[15px] text-ink-2 hover:text-ink">
                или загрузите свою таблицу
              </Link>
            </div>
            <ul className="rise mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-2" style={delay(320)}>
              {["Ozon и Wildberries", "Проверка выдуманных фактов", "Выгрузка в XLSX"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-accent" /> {t}
                </li>
              ))}
            </ul>
          </div>

        </HeroStage>

        <Showcase />

        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Четыре шага до готового файла</h2>
            <p className="mt-3 text-ink-2">От выгрузки из учёта до таблицы, которую можно сразу загружать на площадку.</p>
          </Reveal>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal
                as="li"
                key={s.title}
                delay={i * 90}
                className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(23,25,28,.3)]"
              >
                <span className="absolute top-4 right-5 text-5xl leading-none font-semibold text-sunken transition-colors group-hover:text-lime/70">
                  {i + 1}
                </span>
                <span className="relative grid size-10 place-items-center rounded-xl bg-lime/70 text-accent-ink transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <s.icon className="size-5" />
                </span>
                <h3 className="relative mt-5 font-semibold">{s.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-ink-2">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="checks" className="scroll-mt-24 px-4">
          <Reveal className="mx-auto max-w-6xl rounded-[28px] border border-line bg-surface px-6 py-14 sm:px-12">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Нейросети нельзя верить на слово</h2>
                <p className="mt-4 text-ink-2">
                  Модели любят приукрасить: добавить вес, которого нет в таблице, или «натуральный хлопок» в акриловый
                  плед. Поэтому сервис перепроверяет каждую карточку по вашей таблице, прежде чем вы её увидите.
                </p>
                <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                  {CHECKS.map((c) => (
                    <li key={c.title}>
                      <h3 className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="size-4 text-accent" /> {c.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">{c.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <Reveal delay={150} className="draw-marks group/note relative">
                <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-2 rounded-2xl bg-warn-soft transition-transform duration-500 group-hover/note:rotate-3" />
                <div className="relative -rotate-1 rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_48px_-28px_rgba(23,25,28,.35)] transition-transform duration-500 group-hover/note:rotate-0">
                  <p className="text-[11px] font-medium tracking-wider text-ink-3 uppercase">Черновик описания</p>
                  <p className="mt-3 text-lg leading-relaxed">
                    <Highlight text={CHECK_EXAMPLE.text} marks={CHECK_EXAMPLE.marks} />
                  </p>
                  <div className="mt-5 space-y-1.5">
                    {CHECK_EXAMPLE.notes.map((n) => (
                      <p
                        key={n.text}
                        className={`rounded-lg px-3 py-2 text-xs ${n.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}
                      >
                        {n.text}
                      </p>
                    ))}
                  </div>
                  <p className="mt-5 text-xs leading-relaxed text-ink-3">
                    В таблице: «Материал: акрил 70%, шерсть 30%». Ни веса, ни хлопка там нет — сервис это подсветит,
                    а нейросеть перепишет текст.
                  </p>
                </div>
              </Reveal>
            </div>
          </Reveal>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Частые вопросы</h2>
          <div className="mt-10 space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details
                  className="group rounded-2xl border border-line bg-surface px-5 transition-shadow open:shadow-[0_16px_32px_-24px_rgba(23,25,28,.3)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-transform group-open:rotate-180">
                      <ChevronDown className="size-4" />
                    </span>
                  </summary>
                  <p className="-mt-1 pb-5 text-sm leading-relaxed text-ink-2">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="px-4 pb-20">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-ink px-8 py-14 text-center text-white sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(200,242,107,.30),transparent)]"
            />
            <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Посмотрите на 30 готовых карточек</h2>
            <p className="relative mx-auto mt-3 max-w-md text-white/70">
              Без регистрации. Можно править, просить переписать поля и скачать XLSX.
            </p>
            <Link
              href="/app/demo"
              className="group relative mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-[15px] font-medium text-ink transition-colors hover:bg-lime-strong"
            >
              Открыть демо <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-3 sm:px-6">
          <Logo />
          <p>Демо-проект. Магазин «Уютный угол» и бренды вымышлены, фото — Unsplash.</p>
        </div>
      </footer>
    </div>
  );
}
