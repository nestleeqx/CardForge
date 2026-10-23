import type { CardField, Length, Marketplace, ProductStatus, SourceField, Tone } from "./types";

export const MARKETPLACES: Record<Marketplace, { label: string; titleMax: number }> = {
  ozon: { label: "Ozon", titleMax: 200 },
  wb: { label: "Wildberries", titleMax: 60 },
};

export const DESCRIPTION_LIMITS = { min: 500, max: 2000 };
export const KEYWORDS_LIMITS = { min: 10, max: 15 };

export const TONES: Record<Tone, { label: string; hint: string }> = {
  neutral: { label: "Нейтральный", hint: "Факты и назначение, без эмоций" },
  selling: { label: "Продающий", hint: "Выгоды и сценарии использования" },
  premium: { label: "Премиум", hint: "Материалы, детали, сдержанный стиль" },
};

export const LENGTHS: Record<Length, { label: string; hint: string }> = {
  short: { label: "Короткое", hint: "500–900 символов" },
  medium: { label: "Среднее", hint: "900–1400 символов" },
  long: { label: "Развёрнутое", hint: "1400–2000 символов" },
};

export const STATUSES: Record<ProductStatus, { label: string; text: string; dot: string }> = {
  queued: { label: "В очереди", text: "text-ink-3", dot: "bg-ink-3" },
  running: { label: "В работе", text: "text-info", dot: "bg-info" },
  done: { label: "Готово", text: "text-accent", dot: "bg-accent" },
  error: { label: "Ошибка", text: "text-danger", dot: "bg-danger" },
};

export const SOURCE_FIELDS: Record<SourceField, { label: string; required?: boolean; hint: string }> = {
  sku: { label: "Артикул", hint: "Уникальный код товара" },
  name: { label: "Название", required: true, hint: "Исходное название, как в учёте" },
  category: { label: "Категория", hint: "Тип товара или предмет" },
  brand: { label: "Бренд", hint: "Торговая марка" },
  attributes: { label: "Характеристики", hint: "«Ключ: значение» через ;" },
  photo: { label: "Фото", hint: "Ссылка на изображение, необязательно" },
};

export const CARD_FIELDS: Record<CardField, string> = {
  title: "Название",
  description: "Описание",
  attributes: "Характеристики",
  keywords: "Ключевые слова",
};

export const QUICK_COMMENTS: Record<CardField, string[]> = {
  title: ["короче", "добавь размер", "без бренда"],
  description: ["короче", "больше про материал", "больше про уход", "без воды"],
  attributes: ["убери дубли", "единицы измерения в одном формате"],
  keywords: ["больше длинных запросов", "без бренда", "больше подарочных запросов"],
};

export function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Вес файла: 103 КБ, 2,4 МБ. */
export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}
