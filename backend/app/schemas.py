from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Marketplace = Literal["ozon", "wb"]
Tone = Literal["neutral", "selling", "premium"]
Length = Literal["short", "medium", "long"]
ProductStatus = Literal["queued", "running", "done", "error"]
CardField = Literal["title", "description", "attributes", "keywords"]
SourceField = Literal["sku", "name", "category", "brand", "attributes", "photo"]


class Attribute(BaseModel):
    name: str
    value: str


class SourceProduct(BaseModel):
    sku: str = ""
    name: str = ""
    category: str = ""
    brand: str = ""
    attributes: list[Attribute] = []
    photo: str = ""


# --- Ответы нейросети: строгие схемы, по ним валидируется JSON модели ---


class CardDraft(BaseModel):
    """Полная карточка, которую возвращает модель."""

    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=3)
    description: str = Field(min_length=50)
    attributes: list[Attribute]
    keywords: list[str] = Field(min_length=3)
    notes: list[str] = Field(
        default=[],
        description="Чего не хватило в исходных данных, одной фразой на пункт",
    )


class TitleDraft(BaseModel):
    title: str = Field(min_length=3)


class DescriptionDraft(BaseModel):
    description: str = Field(min_length=50)


class KeywordsDraft(BaseModel):
    keywords: list[str] = Field(min_length=3)


class AttributesDraft(BaseModel):
    attributes: list[Attribute]


# --- API ---


class Warning_(BaseModel):
    code: Literal[
        "missing_data",
        "too_long",
        "too_short",
        "forbidden_word",
        "suspected_fabrication",
        "keywords_count",
        "model_note",
    ]
    field: CardField | None = None
    message: str
    # Точные фрагменты текста поля, которые надо подсветить
    terms: list[str] = []


class CardResult(BaseModel):
    title: str
    description: str
    attributes: list[Attribute]
    keywords: list[str]
    notes: list[str] = []


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    row_index: int
    status: ProductStatus
    error: str | None
    attempts: int
    source: SourceProduct
    result: CardResult | None
    warnings: list[Warning_]
    edited: bool
    updated_at: datetime


class BatchSummary(BaseModel):
    id: str
    filename: str
    marketplace: Marketplace
    tone: Tone
    length: Length
    is_demo: bool
    created_at: datetime
    total: int
    counts: dict[ProductStatus, int]
    warnings: int


class BatchOut(BatchSummary):
    products: list[ProductOut]


class PreviewOut(BaseModel):
    filename: str
    columns: list[str]
    rows: list[dict[str, str]]
    suggested_mapping: dict[SourceField, str | None]


class GenerationSettings(BaseModel):
    marketplace: Marketplace = "ozon"
    tone: Tone = "selling"
    length: Length = "medium"


class BatchCreate(GenerationSettings):
    filename: str = Field(max_length=255)
    mapping: dict[SourceField, str | None]
    rows: list[dict[str, str]] = Field(min_length=1)
    # Незамапленные колонки добавляются в характеристики под своим заголовком
    extra_as_attributes: bool = True


class ProductPatch(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    attributes: list[Attribute] | None = Field(default=None, max_length=60)
    keywords: list[str] | None = Field(default=None, max_length=40)


class RegenerateIn(BaseModel):
    field: CardField
    comment: str = Field(default="", max_length=300)


class LimitsOut(BaseModel):
    max_rows_per_file: int
    max_file_bytes: int
    batches_per_hour: int
    generations_per_hour: int
    batches_left: int
    generations_left: int
    provider: str
