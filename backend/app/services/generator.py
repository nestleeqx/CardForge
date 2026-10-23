"""Генерация карточки и перегенерация одного поля."""

import logging
import re

from redis.asyncio import Redis

from app.llm import LLMInvalidResponse, LLMProvider
from app.schemas import (
    Attribute,
    AttributesDraft,
    CardDraft,
    CardField,
    CardResult,
    DescriptionDraft,
    GenerationSettings,
    KeywordsDraft,
    SourceProduct,
    TitleDraft,
    Warning_,
)
from app.services.checks import check_card, hard_violations
from app.services.prompts import card_prompt, field_prompt, repair_prompt
from app.services.redis_store import cached_complete

log = logging.getLogger(__name__)

FIELD_SCHEMAS = {
    "title": TitleDraft,
    "description": DescriptionDraft,
    "keywords": KeywordsDraft,
    "attributes": AttributesDraft,
}

# Первый ответ + одна попытка исправить нарушения правил
MAX_ATTEMPTS = 2


def _clean(card: CardResult, source: SourceProduct) -> CardResult:
    keywords: list[str] = []
    for kw in card.keywords:
        kw = " ".join(kw.lower().split())
        if kw and kw not in keywords:
            keywords.append(kw)
    return card.model_copy(
        update={
            "title": " ".join(card.title.split()),
            "description": card.description.strip(),
            "keywords": keywords,
            "attributes": _tidy_attributes(card, source),
        }
    )


_UNIT_IN_NAME = re.compile(r"^(.+?),\s*([^\d,]{1,8})$")
_NUMBER = re.compile(r"^\d+(?:[.,]\d+)?$")


def _tidy_attributes(card: CardResult, source: SourceProduct) -> list[Attribute]:
    """Значения характеристик пишем как в таблице, единицы переносим из названия в значение.

    Модель любит делать «Лавандовый» из «лавандовый» и терять единицу: из «Вес, г: 900»
    получается «Вес: 900». Возвращаем «лавандовый» и «Вес: 900 г».
    """
    spelling = {a.value.lower(): a.value for a in source.attributes}
    # Единица для числа из таблицы: «900» из колонки «Вес, г» → «г»
    units = {}
    for a in source.attributes:
        m = _UNIT_IN_NAME.match(a.name)
        if m and _NUMBER.match(a.value.strip()):
            units[a.value.strip()] = (m.group(1).strip(), m.group(2).strip())
    tidy = []
    for a in card.attributes:
        name, value = a.name, spelling.get(a.value.lower(), a.value)
        m = _UNIT_IN_NAME.match(name)
        if m and _NUMBER.match(value.strip()):
            name, value = m.group(1).strip(), f"{value.strip()} {m.group(2).strip()}"
        elif value.strip() in units and units[value.strip()][0].lower() == name.lower():
            value = f"{value.strip()} {units[value.strip()][1]}"
        tidy.append(a.model_copy(update={"name": name, "value": value}))
    return tidy


async def generate_card(
    provider: LLMProvider,
    redis: Redis,
    source: SourceProduct,
    settings: GenerationSettings,
) -> tuple[CardResult, list[Warning_]]:
    system, user = card_prompt(source, settings)
    prompt = user
    best: CardResult | None = None
    best_violations: list[str] = []
    last_error: LLMInvalidResponse | None = None

    for _ in range(MAX_ATTEMPTS):
        try:
            draft = await cached_complete(redis, provider, system, prompt, CardDraft)
        except LLMInvalidResponse as e:
            last_error = e
            prompt = repair_prompt(user, [str(e)[:500]])
            continue
        card = _clean(CardResult.model_validate(draft.model_dump()), source)
        violations = hard_violations(card, source, settings.marketplace)
        if best is None or len(violations) < len(best_violations):
            best, best_violations = card, violations
        if not violations:
            break
        log.info("Карточка %s нарушает правила, переспрашиваем: %s", source.sku, violations)
        prompt = repair_prompt(user, violations)

    if best is None:
        assert last_error is not None
        raise last_error
    return best, check_card(best, source, settings.marketplace)


async def regenerate_field(
    provider: LLMProvider,
    redis: Redis,
    source: SourceProduct,
    settings: GenerationSettings,
    current: CardResult,
    field: CardField,
    comment: str,
) -> tuple[CardResult, list[Warning_]]:
    system, user = field_prompt(source, settings, current, field, comment)
    draft = await cached_complete(redis, provider, system, user, FIELD_SCHEMAS[field])
    card = _clean(current.model_copy(update={field: getattr(draft, field)}), source)
    return card, check_card(card, source, settings.marketplace)
