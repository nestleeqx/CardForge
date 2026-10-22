"""Обработка одной строки партии: вызывается воркером arq или inline в тестах."""

import asyncio
import logging

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload

from app.llm import LLMError, LLMProvider
from app.models import Product
from app.schemas import GenerationSettings, SourceProduct
from app.services.generator import generate_card

log = logging.getLogger(__name__)


async def process_product(
    sessions: async_sessionmaker, provider: LLMProvider, redis: Redis, product_id: str
) -> None:
    async with sessions() as session:
        product = await session.scalar(
            select(Product).where(Product.id == product_id).options(selectinload(Product.batch))
        )
        if product is None or product.status != "queued":
            return
        product.status = "running"
        product.attempts += 1
        product.error = None
        await session.commit()

        batch = product.batch
        settings = GenerationSettings(
            marketplace=batch.marketplace, tone=batch.tone, length=batch.length
        )
        try:
            card, warnings = await generate_card(
                provider, redis, SourceProduct.model_validate(product.source), settings
            )
        except LLMError as e:
            log.warning("Строка %s: %s", product_id, e)
            product.status, product.error = "error", str(e)[:500]
        except Exception:
            log.exception("Строка %s упала", product_id)
            product.status, product.error = "error", "Внутренняя ошибка при генерации"
        else:
            product.status = "done"
            product.result = card.model_dump()
            product.warnings = [w.model_dump() for w in warnings]
            product.edited = False
        await session.commit()


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
        # Повторная постановка безопасна: воркер берёт только строки в статусе queued/error
        for pid in product_ids:
            await self._pool.enqueue_job("process_product_job", pid)
