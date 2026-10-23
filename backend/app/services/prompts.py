import json
from typing import Any

from app.schemas import CardField, CardResult, GenerationSettings, SourceProduct
from app.services.rules import LENGTH_RANGES, RULES, TONE_GUIDES

FIELD_LABELS: dict[CardField, str] = {
    "title": "название",
    "description": "описание",
    "attributes": "характеристики",
    "keywords": "ключевые слова",
}


def _rules_block(settings: GenerationSettings) -> str:
    r = RULES[settings.marketplace]
    lo, hi = LENGTH_RANGES[settings.length]
    return f"""Жёсткие правила:
1. Используй только факты из данных товара. Не добавляй материалы, размеры, числа, страну \
производства, гарантию, комплектацию, которых нет в данных. Внешний вид — тоже факт: \
не придумывай цвет, прозрачность, форму и фактуру деталей. Если данных не хватает — \
не придумывай, а коротко опиши, чего не хватило, в notes.
2. Запрещены превосходные и рекламные оценки: «лучший», «№1», «самый …», «хит продаж», \
«100% гарантия», «абсолютный лидер».
3. Название: не длиннее {r.title_max} символов, формула «тип товара + бренд + \
{r.title_hint}» через запятые. Бери характеристики, по которым покупатель ищет и сравнивает: \
размер, объём, вес, материал, количество в наборе, цвет. Например: «Коврик для йоги \
Asana Pro, 183×61 см, 6 мм, TPE, лавандовый». Без кавычек, капслока, восклицательных знаков.
4. Описание: {lo}–{hi} символов (жёсткие границы {r.description_min}–{r.description_max}). \
2–4 абзаца через пустую строку, без маркдауна, списков и эмодзи. {TONE_GUIDES[settings.tone]} \
Не пересказывай характеристики подряд — их покупатель увидит в таблице. Избегай канцелярита \
и пустых фраз: «данная модель», «является», «обеспечивает», «позволяет», «предназначен для», \
тавтологий вроде «размер M подойдёт тем, кому подходит размер M». Не начинай абзацы одинаково.
5. Характеристики: нормализуй исходные пары «ключ — значение»: ключ с заглавной буквы, \
единицы через пробел (40 см, 1,5 л), без дублей. Значения пиши как в данных, не меняя \
регистр. Новых характеристик не добавляй.
6. Ключевые слова: {r.keywords_min}–{r.keywords_max} поисковых запросов, как их вводит \
покупатель: строчными буквами, 1–4 слова, без повторов, бренд — не больше чем в двух."""


def _data(payload: dict[str, Any]) -> str:
    return "<data>\n" + json.dumps(payload, ensure_ascii=False, indent=1) + "\n</data>"


def card_prompt(source: SourceProduct, settings: GenerationSettings) -> tuple[str, str]:
    label = RULES[settings.marketplace].label
    system = (
        f"Ты — копирайтер маркетплейса {label}. Пишешь карточки товаров на русском языке.\n\n"
        f"{_rules_block(settings)}\n\nОтвет — только JSON по схеме, без пояснений."
    )
    user = "Составь карточку товара по данным:\n" + _data(
        {"task": "card", **settings.model_dump(), "product": source.model_dump()}
    )
    return system, user


def field_prompt(
    source: SourceProduct,
    settings: GenerationSettings,
    current: CardResult,
    field: CardField,
    comment: str,
) -> tuple[str, str]:
    label = RULES[settings.marketplace].label
    system = (
        f"Ты — копирайтер маркетплейса {label}. Редактируешь одно поле готовой карточки товара.\n\n"
        f"{_rules_block(settings)}\n\n"
        f"Перепиши только поле «{FIELD_LABELS[field]}». Пожелание менеджера важнее стиля, "
        "но не важнее правил. Ответ — только JSON по схеме, без пояснений."
    )
    user = f"Перепиши поле «{FIELD_LABELS[field]}».\n" + _data(
        {
            "task": "field",
            "field": field,
            "comment": comment or "сделай вариант лучше текущего",
            **settings.model_dump(),
            "product": source.model_dump(),
            "current": current.model_dump(exclude={"notes"}),
        }
    )
    return system, user


def repair_prompt(user: str, violations: list[str]) -> str:
    issues = "\n".join(f"- {v}" for v in violations)
    return (
        f"{user}\n\nПредыдущий вариант нарушил правила:\n{issues}\n"
        "Исправь эти пункты и верни JSON заново."
    )
