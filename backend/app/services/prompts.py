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
    return f"""Правила. Жёсткие — 1, 2 и все ограничения длины и количества; \
остальное — рекомендации по стилю.
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


# Заготовки пожеланий из интерфейса трактуем буквально, а не «по возможности»
FIELD_TASK = (
    "Пожелание менеджера обязательно к выполнению: оно отменяет рекомендации по стилю, тону, "
    "структуре и формуле названия (например, «без бренда» — бренда в поле быть не должно, "
    "«короче» — заметно короче текущего, но не короче минимальной длины поля). "
    "Жёсткие правила пожелание не отменяет: если они мешают, выполни его настолько, "
    "насколько они позволяют. "
    "Новый вариант должен отличаться от текущего. Текущий вариант мог править менеджер: "
    "бери его за основу и не возвращай то, чего в нём нет (бренд, характеристику, фразу), "
    "если пожелание прямо об этом не просит."
)


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
        f"Перепиши только поле «{FIELD_LABELS[field]}». {FIELD_TASK} "
        "Ответ — только JSON по схеме, без пояснений."
    )
    user = f"Перепиши поле «{FIELD_LABELS[field]}».\n" + _data(
        {
            "task": "field",
            "field": field,
            "comment": comment or "сделай вариант лучше текущего",
            **settings.model_dump(),
            "product": source.model_dump(),
            # Только переписываемое поле: в остальных может оставаться то, что менеджер
            # убрал из этого (например, бренд в описании, когда его убрали из названия)
            "current": current.model_dump(include={field}),
            **_length_hint(getattr(current, field), field, comment, settings),
        }
    )
    return system, user


def length_floor(field: CardField, settings: GenerationSettings) -> int:
    """Минимальная длина поля по правилам площадки."""
    return RULES[settings.marketplace].description_min if field == "description" else 1


def words(text: str) -> int:
    return len(text.split())


def shorten_target(before: str, floor: int) -> tuple[int, int]:
    """Цель для «короче»: примерно на пятую часть короче, но не ниже минимума.

    Возвращает (символы, слова): символы модели считают плохо, слова — заметно лучше.
    """
    chars = min(len(before) - 1, max(floor + 40, round(len(before) * 0.8)))
    return chars, max(1, round(words(before) * chars / len(before)))


def _length_hint(
    value: object, field: CardField, comment: str, settings: GenerationSettings
) -> dict[str, Any]:
    if not isinstance(value, str) or not value:
        return {}
    hint: dict[str, Any] = {"current_length": f"{len(value)} символов, {words(value)} слов"}
    if "короч" in comment.lower():
        chars, count = shorten_target(value, length_floor(field, settings))
        hint["target_length"] = f"примерно {chars} символов — около {count} слов"
    return hint


def repair_prompt(user: str, violations: list[str]) -> str:
    issues = "\n".join(f"- {v}" for v in violations)
    return (
        f"{user}\n\nПредыдущий вариант нарушил правила:\n{issues}\n"
        "Исправь эти пункты и верни JSON заново."
    )
