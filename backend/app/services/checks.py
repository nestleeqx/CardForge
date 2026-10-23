"""Проверки карточки после генерации и после ручной правки.

Модели просят не выдумывать характеристики, но доверять этому нельзя: проверки
независимо сверяют числа и материалы в тексте с исходными данными.
"""

import re

from app.schemas import CardResult, Marketplace, SourceProduct, Warning_
from app.services.photo_probe import photo_problems
from app.services.rules import RULES

FORBIDDEN_PATTERNS: list[tuple[str, str]] = [
    (r"\bлучш\w*", "«лучший»"),
    (r"№\s*1(?!\d)", "«№1»"),
    (r"\bномер\s+(?:1|один)\b", "«номер один»"),
    (r"\bтоп[- ]?1\b", "«топ-1»"),
    (r"\bсамы[йяеох]\s+(?:лучш|дешёв|дешев|качествен)\w*", "«самый …»"),
    (r"\b100\s*%\s*гаранти\w*", "«100% гарантия»"),
    (r"\bабсолютн\w+\s+лидер\w*", "«абсолютный лидер»"),
    (r"\bхит\s+продаж\b", "«хит продаж»"),
]

# Материалы, которые модель любит «додумывать». Ключ — человекочитаемое имя,
# значение — регулярка по основе слова.
MATERIALS: dict[str, str] = {
    "хлопок": r"хлоп(?:ок|ка|ку|ком|ковый|ковая|ковое|ковые|ковых|ковой)",
    "лён": r"\bл[её]н(?:а|ом|у|е)?\b|\bльн(?:ян\w*|а|ом|у|е)\b",
    "бамбук": r"бамбук\w*",
    "шерсть": r"шерст\w*",
    "шёлк": r"\bш[её]лк\w*",
    "полиэстер": r"полиэстер\w*",
    "микрофибра": r"микрофибр\w*",
    "сатин": r"\bсатин\w*",
    "перкаль": r"перкал\w*",
    "керамика": r"керамик\w*|керамическ\w*",
    "фарфор": r"фарфор\w*",
    "стекло": r"\bстекл\w*|\bстеклян\w*",
    "нержавеющая сталь": r"нержаве\w*",
    "сталь": r"\bстал(?:ь|и|ью)\b|\bстальн\w*",
    "алюминий": r"алюмини\w*",
    "чугун": r"чугун\w*",
    "дерево": r"\bдерев(?:о|а|ом|е|янн\w*)\b",
    "дуб": r"\bдуб(?:а|ом|ов\w*)?\b",
    "бук": r"\bбук(?:а|ом|ов(?:ый|ая|ое|ые))?\b",
    "сосна": r"\bсосн\w*",
    "вискоза": r"вискоз\w*",
    "силикон": r"силикон\w*",
    "пластик": r"пластик\w*|пластмасс\w*",
    "акрил": r"\bакрил\w*",
    "кожа": r"\bкож(?:а|и|у|ей|ан\w*)\b",
    "мрамор": r"мрамор\w*",
    "ротанг": r"ротанг\w*",
    "джут": r"\bджут\w*",
}

_NUMBER_RE = re.compile(r"(?<![\d.,])(\d+(?:[.,]\d+)?)(?!\d)")


def _source_text(source: SourceProduct) -> str:
    parts = [source.name, source.category, source.brand, source.sku]
    parts += [f"{a.name} {a.value}" for a in source.attributes]
    return " ".join(parts).lower()


def _numbers(text: str) -> set[str]:
    # 200x220 и 200х220 — оба числа; 1,5 и 1.5 — одно и то же
    text = re.sub(r"(\d)\s*[xх×*]\s*(\d)", r"\1 \2", text.lower())
    found = set()
    for m in _NUMBER_RE.finditer(text):
        value = m.group(1).replace(",", ".")
        if "." in value:
            value = value.rstrip("0").rstrip(".")
        found.add(value)
    return found


def _materials(text: str) -> set[str]:
    text = text.lower()
    return {name for name, pattern in MATERIALS.items() if re.search(pattern, text)}


def _normalize_number(raw: str) -> str:
    value = raw.replace(",", ".")
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    return value


def _fabrication_hits(text: str, source: SourceProduct) -> list[tuple[str, str]]:
    """Пары (что выдумано, точный фрагмент текста) — фрагменты нужны для подсветки."""
    src = _source_text(source)
    src_numbers = _numbers(src)
    src_materials = _materials(src)
    hits = [
        (_normalize_number(m.group(1)), m.group(1))
        for m in _NUMBER_RE.finditer(text)
        if _normalize_number(m.group(1)) not in src_numbers
    ]
    for name, pattern in MATERIALS.items():
        if name in src_materials:
            continue
        hits += [(name, m.group(0)) for m in re.finditer(pattern, text, re.I)]
    return hits


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def find_fabrications(text: str, source: SourceProduct) -> list[str]:
    """Числа и материалы из текста, которых нет в исходных данных."""
    hits = _fabrication_hits(text, source)
    numbers = sorted({label for label, raw in hits if raw[0].isdigit()})
    materials = sorted({label for label, raw in hits if not raw[0].isdigit()})
    return numbers + materials


def _forbidden_hits(text: str) -> list[tuple[str, str]]:
    hits = []
    for pattern, label in FORBIDDEN_PATTERNS:
        m = re.search(pattern, text, re.I)
        if m:
            hits.append((label, m.group(0)))
    return hits


def find_forbidden(text: str) -> list[str]:
    return [label for label, _ in _forbidden_hits(text)]


def check_source(source: SourceProduct) -> list[Warning_]:
    warnings = []
    if not source.name:
        warnings.append(Warning_(code="missing_data", message="Нет исходного названия товара"))
    if not source.brand:
        warnings.append(Warning_(code="missing_data", field="title", message="Не указан бренд"))
    if not source.category:
        warnings.append(Warning_(code="missing_data", message="Не указана категория"))
    if not source.photo:
        warnings.append(
            Warning_(
                code="photo",
                message="Нет ссылки на фото — без фото Ozon и Wildberries не примут карточку",
            )
        )
    elif source.photo_error:
        warnings.append(
            Warning_(code="photo", message=f"Фото не открылось по ссылке: {source.photo_error}")
        )
    elif source.photo_width and source.photo_height:
        problems = photo_problems(source.photo_width, source.photo_height, source.photo_size)
        warnings += [Warning_(code="photo", message=p) for p in problems]
    if len(source.attributes) < 3:
        warnings.append(
            Warning_(
                code="missing_data",
                field="description",
                message=f"Мало характеристик ({len(source.attributes)}) — описание выйдет общим",
            )
        )
    return warnings


def check_card(card: CardResult, source: SourceProduct, marketplace: Marketplace) -> list[Warning_]:
    rules = RULES[marketplace]
    warnings = check_source(source)

    if len(card.title) > rules.title_max:
        warnings.append(
            Warning_(
                code="too_long",
                field="title",
                message=f"Название {len(card.title)} символов, лимит {rules.label} — "
                f"{rules.title_max}",
            )
        )
    desc_len = len(card.description)
    if desc_len < rules.description_min:
        warnings.append(
            Warning_(
                code="too_short",
                field="description",
                message=f"Описание {desc_len} символов, минимум {rules.description_min}",
            )
        )
    elif desc_len > rules.description_max:
        warnings.append(
            Warning_(
                code="too_long",
                field="description",
                message=f"Описание {desc_len} символов, максимум {rules.description_max}",
            )
        )

    kw = len(card.keywords)
    if not rules.keywords_min <= kw <= rules.keywords_max:
        warnings.append(
            Warning_(
                code="keywords_count",
                field="keywords",
                message=f"Ключевых слов {kw}, нужно {rules.keywords_min}–{rules.keywords_max}",
            )
        )

    for field, text in (("title", card.title), ("description", card.description)):
        for label, raw in _forbidden_hits(text):
            warnings.append(
                Warning_(
                    code="forbidden_word",
                    field=field,
                    message=f"Запрещённая формулировка {label}",
                    terms=[raw],
                )
            )
        hits = _fabrication_hits(text, source)
        if hits:
            warnings.append(
                Warning_(
                    code="suspected_fabrication",
                    field=field,
                    message="Нет в исходных данных: " + ", ".join(find_fabrications(text, source)),
                    terms=_unique([raw for _, raw in hits]),
                )
            )

    for attr in card.attributes:
        hits = _fabrication_hits(f"{attr.name} {attr.value}", source)
        if hits:
            warnings.append(
                Warning_(
                    code="suspected_fabrication",
                    field="attributes",
                    message=f"{attr.name}: нет в исходнике — "
                    + ", ".join(_unique([label for label, _ in hits])),
                    terms=_unique([raw for _, raw in hits]),
                )
            )

    for note in card.notes:
        warnings.append(Warning_(code="model_note", message=note))
    return warnings


def hard_violations(card: CardResult, source: SourceProduct, marketplace: Marketplace) -> list[str]:
    """Нарушения, ради которых стоит один раз переспросить модель."""
    return [
        w.message
        for w in check_card(card, source, marketplace)
        if w.code
        in {"too_long", "too_short", "forbidden_word", "suspected_fabrication", "keywords_count"}
    ]
