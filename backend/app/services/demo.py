"""Демо-партия магазина «Уютный угол» и очистка старых данных."""

import json
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Batch, Product
from app.schemas import CardResult
from app.services.checks import check_card
from app.services.parsing import build_source, parse_table, suggest_mapping

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"
DEMO_CSV = SEED_DIR / "uyutny-ugol.csv"
DEMO_RESULTS = SEED_DIR / "uyutny-ugol.results.json"
DEMO_SETTINGS = {"marketplace": "ozon", "tone": "selling", "length": "short"}


@lru_cache
def _demo_rows() -> tuple[list[str], list[dict[str, str]]]:
    return parse_table(DEMO_CSV.name, DEMO_CSV.read_bytes(), max_rows=100, max_cell=5000)


@lru_cache
def _demo_results() -> dict[str, dict]:
    if not DEMO_RESULTS.exists():
        return {}
    return json.loads(DEMO_RESULTS.read_text(encoding="utf-8"))


async def create_demo_batch(session: AsyncSession, owner: str) -> tuple[Batch, list[str]]:
    """Готовая партия с уже сгенерированными карточками — без расхода токенов.

    Возвращает партию и id строк, для которых в сиде нет результата (их надо поставить в очередь).
    """
    columns, rows = _demo_rows()
    mapping = suggest_mapping(columns)
    results = _demo_results()
    batch = Batch(owner=owner, filename=DEMO_CSV.name, is_demo=True, **DEMO_SETTINGS)
    session.add(batch)
    for i, row in enumerate(rows):
        source = build_source(row, mapping, extra_as_attributes=True)
        product = Product(row_index=i, source=source.model_dump(), status="queued", warnings=[])
        seeded = results.get(source.sku)
        if seeded:
            card = CardResult.model_validate(seeded)
            product.status = "done"
            product.attempts = 1
            product.result = card.model_dump()
            product.warnings = [
                w.model_dump() for w in check_card(card, source, DEMO_SETTINGS["marketplace"])
            ]
        batch.products.append(product)
    await session.flush()
    pending = [p.id for p in batch.products if p.status == "queued"]
    await session.commit()
    return batch, pending


async def ensure_demo(session: AsyncSession, owner: str) -> list[str]:
    exists = await session.scalar(select(Batch.id).where(Batch.owner == owner).limit(1))
    if exists:
        return []
    _, pending = await create_demo_batch(session, owner)
    return pending


async def delete_batches(session: AsyncSession, ids: list[str]) -> None:
    if ids:
        await session.execute(delete(Product).where(Product.batch_id.in_(ids)))
        await session.execute(delete(Batch).where(Batch.id.in_(ids)))
    await session.commit()


async def reset_demo(session: AsyncSession, owner: str) -> tuple[Batch, list[str]]:
    ids = list(await session.scalars(select(Batch.id).where(Batch.owner == owner)))
    await delete_batches(session, ids)
    return await create_demo_batch(session, owner)


async def cleanup_old(session: AsyncSession, ttl_hours: int) -> int:
    """Удаляет партии старше суток. Демо пересоздаётся при следующем визите."""
    border = datetime.now(UTC) - timedelta(hours=ttl_hours)
    ids = list(await session.scalars(select(Batch.id).where(Batch.created_at < border)))
    await delete_batches(session, ids)
    return len(ids)
