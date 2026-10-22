"""Шаблонный генератор без внешнего API.

Нужен, чтобы проект запускался без ключей: собирает карточку из исходных данных
по правилам маркетплейса. Ничего не выдумывает — только переставляет факты.
"""

import asyncio
import json
import re
from typing import Any

from pydantic import BaseModel

from app.llm.base import LLMProvider
from app.schemas import Attribute, SourceProduct
from app.services.rules import LENGTH_RANGES, RULES

# Тексты нейтральны к категории: шаблон работает и для дома, и для спорта, и для электроники
_TONE_OPENERS = {
    "neutral": "{title}: основные характеристики и особенности модели.",
    "selling": "{title} — практичный выбор для тех, кто ценит удобство в мелочах.",
    "premium": "{title}. Продуманные детали и аккуратное исполнение.",
}

_TONE_CLOSERS = {
    "neutral": "Перед покупкой сверьте размеры и характеристики с вашими задачами.",
    "selling": "Добавьте товар в корзину — он пригодится каждый день и станет хорошим подарком.",
    "premium": "Сдержанный дизайн и внимание к деталям — для тех, кто выбирает осознанно.",
}

_FILLERS = [
    "Модель удобна в использовании и не требует сложного ухода.",
    "Все параметры указаны в характеристиках карточки — так проще подобрать подходящий вариант.",
    "Товар подойдёт для ежедневного использования и в качестве подарка.",
    "Аккуратный внешний вид сохраняется надолго, если соблюдать рекомендации производителя.",
    "Описание составлено по данным производителя, без лишних обещаний.",
]


def _lower_first(value: str) -> str:
    """«Материал TPE» → «материал TPE», но аббревиатуры вроде «TPE» и «USB» не трогаем."""
    value = value.strip()
    if len(value) > 1 and value[:2].isupper():
        return value
    return value[:1].lower() + value[1:]


def _parse_data(user: str) -> dict[str, Any]:
    m = re.search(r"<data>(.*?)</data>", user, re.S)
    return json.loads(m.group(1)) if m else {}


def _normalize(attrs: list[Attribute]) -> list[Attribute]:
    seen, out = set(), []
    for a in attrs:
        name = a.name.strip().capitalize()
        value = re.sub(r"(\d)(?![xх×]\d)([а-яёa-z])", r"\1 \2", a.value.strip(), flags=re.I)
        if name.lower() in seen or not value:
            continue
        seen.add(name.lower())
        out.append(Attribute(name=name, value=value))
    return out


def _title(p: SourceProduct, max_len: int) -> str:
    base = p.name.strip()
    if p.brand and p.brand.lower() not in base.lower():
        base = f"{base} {p.brand}"
    for a in p.attributes[:2]:
        # Голое число без единиц («700» из колонки «Вес, г») в названии ничего не говорит
        if re.fullmatch(r"[\d\s.,]+", a.value):
            continue
        candidate = f"{base}, {_lower_first(a.value)}"
        if len(candidate) <= max_len:
            base = candidate
    return base[:max_len].rstrip(" ,")


def _description(p: SourceProduct, tone: str, length: str, comment: str) -> str:
    lo, hi = LENGTH_RANGES[length]  # type: ignore[index]
    if "короч" in comment.lower():
        lo, hi = max(500, lo - 300), max(800, hi - 400)
    title = f"{p.name} {p.brand}" if p.brand else p.name
    opener = _TONE_OPENERS.get(tone, _TONE_OPENERS["neutral"]).format(title=title)
    facts = [f"{a.name.capitalize()}: {a.value.strip()}." for a in p.attributes]
    paragraphs = [opener, " ".join(facts)] if facts else [opener]
    text = "\n\n".join(paragraphs)
    for filler in _FILLERS:
        if len(text) >= lo:
            break
        text += " " + filler
    closer = _TONE_CLOSERS.get(tone, _TONE_CLOSERS["neutral"])
    if len(text) + len(closer) + 2 <= hi:
        text += "\n\n" + closer
    return text[:hi]


def _keywords(p: SourceProduct) -> list[str]:
    name = p.name.lower().strip()
    category = p.category.lower().strip()
    words = name.split()
    head = words[0] if words else name
    candidates = [name, category, f"{name} купить", f"{name} недорого", f"{category} купить"]
    candidates += [
        f"{head} {_lower_first(a.value)}"
        for a in p.attributes[:6]
        if not re.search(r"\d", a.value) and len(a.value.split()) <= 2
    ]
    candidates += [f"{name} в подарок", f"{head} с доставкой", f"{category} недорого"]
    if p.brand:
        candidates.append(f"{p.brand.lower()} {head}")
    out: list[str] = []
    for c in candidates:
        c = re.sub(r"\s+", " ", c).strip()
        if c and c not in out and len(c.split()) <= 5:
            out.append(c)
    fallback = [f"{head} в наличии", f"{name} отзывы", f"{head} оригинал", f"{category} новинки"]
    for c in fallback:
        if len(out) >= 12:
            break
        if c not in out:
            out.append(c)
    return out[:15]


class MockProvider(LLMProvider):
    name = "mock"
    model = "template-v1"

    def __init__(self, delay: float = 0.6):
        self.delay = delay

    async def _complete(self, system: str, user: str, schema: type[BaseModel]) -> str:
        await asyncio.sleep(self.delay)
        data = _parse_data(user)
        product = SourceProduct.model_validate(data.get("product", {}))
        rules = RULES[data.get("marketplace", "ozon")]
        tone, length = data.get("tone", "neutral"), data.get("length", "medium")
        comment = data.get("comment", "")
        card = {
            "title": _title(product, rules.title_max),
            "description": _description(product, tone, length, comment),
            "attributes": [a.model_dump() for a in _normalize(product.attributes)],
            "keywords": _keywords(product),
            "notes": [],
        }
        if len(product.attributes) < 3:
            card["notes"].append("Мало характеристик: добавьте материал, размеры и цвет")
        fields = set(schema.model_fields)
        return json.dumps({k: v for k, v in card.items() if k in fields}, ensure_ascii=False)
