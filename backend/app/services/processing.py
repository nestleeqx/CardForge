"""Обработка строк партии: воркером arq, inline-задачами или по опросу клиента (serverless)."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.llm import LLMError, LLMInvalidResponse, LLMProvider
from app.models import Product
from app.schemas import GenerationSettings, SourceProduct
from app.services.generator import generate_card
from app.services.photo_probe import PhotoProbeError, probe_photo

log = logging.getLogger(__name__)

# Строка «в работе» дольше этого срока считается брошенной (упал воркер или функция)
STALE_AFTER = timedelta(minutes=2)


async def _measure_photo(source: SourceProduct) -> SourceProduct:
    """Узнаёт размер фото, чтобы проверки могли сверить его с форматом 3:4."""
    try:
        info = await probe_photo(source.photo)
    except PhotoProbeError as e:
        return source.model_copy(update={"photo_error": str(e)})
    except Exception:
        log.exception("Не удалось проверить фото %s", source.photo)
        return source
    return source.model_copy(
        update={"photo_width": info.width, "photo_height": info.height, "photo_size": info.size}
    )


async def _generate(
    sessions: async_sessionmaker, provider: LLMProvider, redis: Redis, product_id: str
) -> None:
    """Генерирует карточку для строки, которая уже переведена в статус running."""
    async with sessions() as session:
        product = await session.scalar(
            select(Product).where(Product.id == product_id).options(selectinload(Product.batch))
        )
        if product is None or product.status != "running":
            return
        batch = product.batch
        settings = GenerationSettings(
            marketplace=batch.marketplace, tone=batch.tone, length=batch.length
        )
        source = SourceProduct.model_validate(product.source)
        if source.photo and source.photo_width is None and get_settings().photo_check:
            source = await _measure_photo(source)
            product.source = source.model_dump()
        try:
            card, warnings = await generate_card(provider, redis, source, settings)
        except LLMError as e:
            # Текст ошибки видит пользователь в таблице — без кодов и ответов API, они в логе
            log.warning("Строка %s: %s", product_id, e)
            product.status = "error"
            product.error = (
                "Нейросеть ответила не по формату. Нажмите «Повторить генерацию»."
                if isinstance(e, LLMInvalidResponse)
                else "Нейросеть не ответила. Нажмите «Повторить генерацию»."
            )
        except Exception:
            log.exception("Строка %s упала", product_id)
            product.status = "error"
            product.error = "Не удалось сгенерировать карточку. Нажмите «Повторить генерацию»."
        else:
            product.status = "done"
            product.result = card.model_dump()
            product.warnings = [w.model_dump() for w in warnings]
            product.edited = False
        await session.commit()


async def process_product(
    sessions: async_sessionmaker, provider: LLMProvider, redis: Redis, product_id: str
) -> None:
    async with sessions() as session:
        claimed = await session.execute(
            update(Product)
            .where(Product.id == product_id, Product.status == "queued")
            .values(status="running", attempts=Product.attempts + 1, error=None)
        )
        await session.commit()
        if claimed.rowcount == 0:
            return
    await _generate(sessions, provider, redis, product_id)


async def advance_batch(
    sessions: async_sessionmaker,
    provider: LLMProvider,
    redis: Redis,
    batch_id: str,
    limit: int,
) -> int:
    """Обрабатывает следующие строки партии прямо в запросе. Для serverless без воркеров."""
    async with sessions() as session:
        # Строки, брошенные оборвавшимся вызовом функции, возвращаем в очередь
        await session.execute(
            update(Product)
            .where(
                Product.batch_id == batch_id,
                Product.status == "running",
                Product.updated_at < datetime.now(UTC) - STALE_AFTER,
            )
            .values(status="queued")
        )
        ids = list(
            await session.scalars(
                select(Product.id)
                .where(Product.batch_id == batch_id, Product.status == "queued")
                .order_by(Product.row_index)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        )
        if ids:
            await session.execute(
                update(Product)
                .where(Product.id.in_(ids))
                .values(status="running", attempts=Product.attempts + 1, error=None)
            )
        await session.commit()
    await asyncio.gather(*(_generate(sessions, provider, redis, pid) for pid in ids))
    return len(ids)


class InlineQueue:
    """Запускает обработку в текущем процессе — для тестов и запуска без Redis-воркера."""

    def __init__(self, sessions, provider, redis, concurrency: int = 5):
        self._args = (sessions, provider, redis)
        self._sem = asyncio.Semaphore(concurrency)
        self.tasks: set[asyncio.Task] = set()

    async def enqueue(self, product_ids: list[str]) -> None:
        for pid in product_ids:
            task = asyncio.create_task(self._run(pid))
            self.tasks.add(task)
            task.add_done_callback(self.tasks.discard)

    async def _run(self, pid: str) -> None:
        async with self._sem:
            await process_product(*self._args, pid)

    async def drain(self) -> None:
        while self.tasks:
            await asyncio.gather(*list(self.tasks))


class ArqQueue:
    def __init__(self, pool):
        self._pool = pool

    async def enqueue(self, product_ids: list[str]) -> None:
        # Повторная постановка безопасна: воркер берёт только строки в статусе queued
        for pid in product_ids:
            await self._pool.enqueue_job("process_product_job", pid)


class PollQueue:
    """Очередь без фоновых процессов: строки ждут в статусе queued, пока клиент
    опрашивает партию, и каждый опрос обрабатывает следующую порцию (advance_batch)."""

    polling = True

    def __init__(self, sessions, provider, redis, concurrency: int = 5):
        self._args = (sessions, provider, redis)
        self.concurrency = concurrency

    async def enqueue(self, product_ids: list[str]) -> None:
        return None

    async def advance(self, batch_id: str) -> int:
        return await advance_batch(*self._args, batch_id, self.concurrency)
