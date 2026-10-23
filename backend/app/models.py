import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return uuid.uuid4().hex


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    marketplace: Mapped[str] = mapped_column(String(8))
    tone: Mapped[str] = mapped_column(String(16))
    length: Mapped[str] = mapped_column(String(16))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    products: Mapped[list["Product"]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="Product.row_index",
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    batch_id: Mapped[str] = mapped_column(ForeignKey("batches.id", ondelete="CASCADE"), index=True)
    row_index: Mapped[int] = mapped_column(Integer)
    # queued | running | done | error
    status: Mapped[str] = mapped_column(String(16), default="queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    # {sku, name, category, brand, attributes: [{name, value}], photo}
    source: Mapped[dict[str, Any]] = mapped_column(JSONType)
    # {title, description, attributes, keywords, notes}
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    edited: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    batch: Mapped[Batch] = relationship(back_populates="products")


class Visitor(Base):
    """Анонимный посетитель: запись появляется при первом визите, вместе с демо-партией.

    Нужна, чтобы отличать первый визит от «удалил все партии» — во втором случае
    демо само не возвращается.
    """

    __tablename__ = "visitors"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
