import { DESCRIPTION_LIMITS } from "./labels";
import type { CardField, CardResult, SourceProduct } from "./types";

/** Подсказка показывается, только если её можно выполнить: просить «добавь размер»,
 *  когда размер уже в названии или его нет в таблице, бессмысленно — модель ничего не изменит. */
type Rule = { text: string; when?: (card: CardResult, source: SourceProduct) => boolean };

const SIZE_IN_TEXT = /\d+(?:[.,]\d+)?\s*[×xх*]\s*\d+|\d+(?:[.,]\d+)?\s*(?:см|мм|м|л|мл)(?![а-яё])/i;
const SIZE_ATTR = /размер|длина|ширина|высота|диаметр|объ[её]м|габарит/i;

const has = (text: string, part: string) => !!part && text.toLowerCase().includes(part.toLowerCase());
const brand = (source: SourceProduct) => source.brand.trim();
const sourceAttr = (source: SourceProduct, pattern: RegExp) =>
  source.attributes.some((a) => pattern.test(a.name) || pattern.test(a.value));

const RULES: Record<CardField, Rule[]> = {
  title: [
    { text: "короче" },
    {
      text: "добавь размер",
      when: (card, source) =>
        !SIZE_IN_TEXT.test(card.title) && source.attributes.some((a) => SIZE_ATTR.test(a.name) && /\d/.test(a.value)),
    },
    { text: "без бренда", when: (card, source) => has(card.title, brand(source)) },
    // Бренд убрали раньше — без явной просьбы сервер его модели не показывает
    { text: "верни бренд", when: (card, source) => !!brand(source) && !has(card.title, brand(source)) },
  ],
  description: [
    // У минимума площадки (500 символов) сокращать уже некуда
    { text: "короче", when: (card) => card.description.length > DESCRIPTION_LIMITS.min * 1.2 },
    { text: "подробнее", when: (card) => card.description.length <= DESCRIPTION_LIMITS.min * 1.2 },
    { text: "больше про материал", when: (_, source) => sourceAttr(source, /материал|состав|ткань/i) },
    { text: "больше про уход", when: (_, source) => sourceAttr(source, /уход|стирк|чистк/i) },
    { text: "без воды" },
  ],
  attributes: [
    {
      text: "убери дубли",
      when: (card) => new Set(card.attributes.map((a) => a.name.trim().toLowerCase())).size < card.attributes.length,
    },
    { text: "единицы измерения в одном формате" },
  ],
  keywords: [
    { text: "больше длинных запросов" },
    { text: "без бренда", when: (card, source) => card.keywords.some((k) => has(k, brand(source))) },
    { text: "больше подарочных запросов" },
  ],
};

export function quickComments(field: CardField, card: CardResult, source: SourceProduct): string[] {
  return RULES[field].filter((r) => !r.when || r.when(card, source)).map((r) => r.text);
}
