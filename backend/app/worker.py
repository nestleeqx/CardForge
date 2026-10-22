"""Фоновый воркер arq: генерация карточек и ночная очистка демо.

Запуск: arq app.worker.WorkerSettings
"""

import logging
from datetime import UTC, datetime, timedelta

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import select, update

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.llm import create_provider
from app.models import Product
from app.services.demo import cleanup_old
from app.services.processing import process_product
from app.services.redis_store import get_redis

log = logging.getLogger(__name__)
settings = get_settings()


async def startup(ctx):
    await init_db()
    ctx["provider"] = create_provider(settings)
    ctx["store"] = get_redis()
    # Строки, зависшие в «в работе» после перезапуска воркера, возвращаем в очередь
    border = datetime.now(UTC) - timedelta(minutes=5)
    async with SessionLocal() as session:
        stale = list(
            await session.scalars(
                select(Product.id).where(Product.status == "running", Product.updated_at < border)
            )
        )
        if stale:
            await session.execute(
                update(Product).where(Product.id.in_(stale)).values(status="queued")
            )
            await session.commit()
    for pid in stale:
        await ctx["redis"].enqueue_job("process_product_job", pid)  # ctx["redis"] — пул arq
    if stale:
        log.info("Вернули в очередь %d зависших строк", len(stale))


async def shutdown(ctx):
    await ctx["provider"].aclose()


async def process_product_job(ctx, product_id: str):
    await process_product(SessionLocal, ctx["provider"], ctx["store"], product_id)


async def nightly_cleanup(ctx):
    async with SessionLocal() as session:
        removed = await cleanup_old(session, settings.batch_ttl_hours)
    log.info("Очистка: удалено партий %d", removed)


class WorkerSettings:
    functions = [process_product_job]
    cron_jobs = [cron(nightly_cleanup, hour={3}, minute={0})]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = settings.worker_concurrency
    job_timeout = 180
    keep_result = 60
