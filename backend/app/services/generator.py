"""Генерация карточки и перегенерация одного поля."""

import logging

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
            "attributes": _source_spelling(card, source),
        }
    )


def _source_spelling(card: CardResult, source: SourceProduct) -> list[Attribute]:
    """Значения характеристик, совпадающие с таблицей без учёта регистра, пишем как в таблице:
    модель любит делать «Лавандовый» из «лавандовый»."""
    known = {a.value.lower(): a.value for a in source.attributes}
    return [
        a.model_copy(update={"value": known.get(a.value.lower(), a.value)}) for a in card.attributes
    ]


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
