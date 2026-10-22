// Адрес сайта для canonical, sitemap и Open Graph. Если NEXT_PUBLIC_SITE_URL не задан,
// на Vercel берём адрес продакшена, который платформа сама передаёт в сборку Next.js.
const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000")
).replace(/\/$/, "");

export const SITE = {
  name: "CardForge",
  title: "CardForge — ИИ-генератор карточек товаров для Ozon и Wildberries",
  description:
    "Загрузите таблицу с товарами и получите готовые названия, описания, характеристики и ключевые слова для Ozon и Wildberries. Сервис сам проверяет лимиты маркетплейса и находит выдуманные нейросетью характеристики.",
  keywords: [
    "генератор карточек товаров",
    "карточки для Ozon",
    "карточки для Wildberries",
    "описание товара нейросеть",
    "SEO описание для маркетплейса",
    "ключевые слова для WB",
    "ИИ для селлеров",
  ],
};
