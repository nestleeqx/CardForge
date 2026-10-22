"""Требования маркетплейсов и настройки генерации."""

from dataclasses import dataclass

from app.schemas import Length, Marketplace, Tone


@dataclass(frozen=True)
class MarketplaceRules:
    label: str
    title_max: int
    description_min: int = 500
    description_max: int = 2000
    keywords_min: int = 10
    keywords_max: int = 15


RULES: dict[Marketplace, MarketplaceRules] = {
    "wb": MarketplaceRules(label="Wildberries", title_max=60),
    "ozon": MarketplaceRules(label="Ozon", title_max=200),
}

# Целевой диапазон описания внутри общего лимита 500–2000
LENGTH_RANGES: dict[Length, tuple[int, int]] = {
    "short": (500, 900),
    "medium": (900, 1400),
    "long": (1400, 2000),
}

LENGTH_LABELS: dict[Length, str] = {
    "short": "короткое",
    "medium": "среднее",
    "long": "развёрнутое",
}

TONE_GUIDES: dict[Tone, str] = {
    "neutral": (
        "Нейтральный информационный тон: факты, назначение, уход. Без восклицаний и эмоций."
    ),
    "selling": (
        "Продающий тон: выгоды для покупателя, сценарии использования, живой язык. "
        "Без давления и кричащих оценок."
    ),
    "premium": (
        "Премиальный тон: сдержанно, с акцентом на материалы, детали и эстетику. "
        "Короткие ёмкие фразы, без канцелярита."
    ),
}

TONE_LABELS: dict[Tone, str] = {
    "neutral": "нейтральный",
    "selling": "продающий",
    "premium": "премиум",
}
