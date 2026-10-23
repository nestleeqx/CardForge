"""Демо-партия магазина «Уютный угол» и очистка старых данных."""

import json
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Batch, Product, Visitor
from app.schemas import CardResult, SourceProduct
from app.services.checks import check_card
from app.services.parsing import build_source, parse_table, suggest_mapping

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"
DEMO_CSV = SEED_DIR / "uyutny-ugol.csv"
DEMO_RESULTS = SEED_DIR / "uyutny-ugol.results.json"
# Размеры фото измерены заранее (scripts/measure_demo_photos.py): демо не проходит генерацию
DEMO_PHOTOS = SEED_DIR / "uyutny-ugol.photos.json"
DEMO_SETTINGS = {"marketplace": "ozon", "tone": "selling", "length": "short"}


@lru_cache
def _demo_rows() -> tuple[list[str], list[dict[str, str]]]:
    return parse_table(DEMO_CSV.name, DEMO_CSV.read_bytes(), max_rows=100, max_cell=5000)


@lru_cache
def _demo_photos() -> dict[str, list[int | None]]:
    if not DEMO_PHOTOS.exists():
        return {}
    return json.loads(DEMO_PHOTOS.read_text(encoding="utf-8"))


@lru_cache
def _demo_results() -> dict[str, dict]:
    if not DEMO_RESULTS.exists():
        return {}
    return json.loads(DEMO_RESULTS.read_text(encoding="utf-8"))


def _with_photo_size(source: SourceProduct, photos: dict[str, list[int | None]]) -> SourceProduct:
    if source.sku not in photos:
        return source
    width, height, size = photos[source.sku]
    return source.model_copy(
        update={"photo_width": width, "photo_height": height, "photo_size": size}
    )


def fill_demo_photo_sizes(batch: Batch) -> bool:
    """Дописывает размеры фото в демо-партию, созданную до того, как их стали хранить.

    Демо живёт сутки, так что после обновления фото у части посетителей ещё открыта старая копия.
    Возвращает True, если что-то изменилось и нужно сохранить.
    """
    if not batch.is_demo:
        return False
    photos = _demo_photos()
    changed = False
    for product in batch.products:
        source = SourceProduct.model_validate(product.source)
        if source.photo_width is not None or source.sku not in photos:
            continue
        source = _with_photo_size(source, photos)
        product.source = source.model_dump()
        if product.result is not None:
            card = CardResult.model_validate(product.result)
            product.warnings = [w.model_dump() for w in check_card(card, source, batch.marketplace)]
        changed = True
    return changed


async def create_demo_batch(
    session: AsyncSession, owner: str, commit: bool = True
) -> tuple[Batch, list[str]]:
    """Готовая партия с уже сгенерированными карточками — без расхода токенов.

    Возвращает партию и id строк, для которых в сиде нет результата (их надо поставить в очередь).
    """
    columns, rows = _demo_rows()
    mapping = suggest_mapping(columns)
    results = _demo_results()
    photos = _demo_photos()
    batch = Batch(owner=owner, filename=DEMO_CSV.name, is_demo=True, **DEMO_SETTINGS)
    session.add(batch)
    for i, row in enumerate(rows):
        source = _with_photo_size(build_source(row, mapping, extra_as_attributes=True), photos)
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
    if commit:
        await session.commit()
    return batch, pending


async def _register_visitor(session: AsyncSession, owner: str) -> bool:
    """Записывает посетителя. True — если это его первый визит.

    ON CONFLICT DO NOTHING: если боковая панель и страница одновременно спросили список,
    второй запрос в Postgres дождётся коммита первого и не создаст вторую демо-партию.
    """
    insert = pg_insert if session.bind.dialect.name == "postgresql" else sqlite_insert
    result = await session.execute(
        insert(Visitor).values(id=owner).on_conflict_do_nothing(index_elements=["id"])
    )
    return result.rowcount == 1


async def ensure_demo(session: AsyncSession, owner: str) -> list[str]:
    """Демо-партия появляется только при первом визите. Если посетитель потом удалил
    все партии, список остаётся пустым — вернуть демо можно кнопкой «Сбросить демо»."""
    if not await _register_visitor(session, owner):
        await session.commit()
        return []
    # Посетители, пришедшие до появления таблицы visitors, уже могут иметь партии
    has_batches = await session.scalar(select(Batch.id).where(Batch.owner == owner).limit(1))
    pending: list[str] = []
    if not has_batches:
        _, pending = await create_demo_batch(session, owner, commit=False)
    await session.commit()
    return pending


async def delete_batches(session: AsyncSession, ids: list[str]) -> None:
    if ids:
        await session.execute(delete(Product).where(Product.batch_id.in_(ids)))
        await session.execute(delete(Batch).where(Batch.id.in_(ids)))
    await session.commit()


async def reset_demo(session: AsyncSession, owner: str) -> tuple[Batch, list[str]]:
    ids = list(await session.scalars(select(Batch.id).where(Batch.owner == owner)))
    await delete_batches(session, ids)
    await _register_visitor(session, owner)
    return await create_demo_batch(session, owner)


async def restore_demo(session: AsyncSession, owner: str) -> tuple[Batch, list[str]]:
    """Возвращает демо-партию, ничего не удаляя: для «Открыть демо», когда посетитель её удалил."""
    existing = await session.scalar(
        select(Batch).where(Batch.owner == owner, Batch.is_demo.is_(True)).limit(1)
    )
    if existing:
        return existing, []
    await _register_visitor(session, owner)
    return await create_demo_batch(session, owner)


async def cleanup_old(session: AsyncSession, ttl_hours: int) -> int:
    """Удаляет партии старше суток и забывает старых посетителей —
    при следующем визите они снова получат свежую демо-партию."""
    border = datetime.now(UTC) - timedelta(hours=ttl_hours)
    ids = list(await session.scalars(select(Batch.id).where(Batch.created_at < border)))
    await session.execute(delete(Visitor).where(Visitor.created_at < border))
    await delete_batches(session, ids)
    return len(ids)
