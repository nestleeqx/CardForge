import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import batches, misc, products
from app.config import get_settings
from app.db import SessionLocal, init_db
from app.llm import create_provider
from app.services.processing import ArqQueue, InlineQueue, PollQueue
from app.services.redis_store import RateLimitExceeded, get_redis

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

LIMIT_MESSAGES = {
    "batch": "Лимит демо: {limit} партии в час",
    "gen": "Лимит демо: {limit} генераций в час",
    "reset": "Слишком частый сброс демо",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await init_db()
    app.state.provider = create_provider(settings)
    pool = None
    if settings.queue_mode == "arq":
        from arq import create_pool
        from arq.connections import RedisSettings

        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        app.state.queue = ArqQueue(pool)
    else:
        queue_cls = PollQueue if settings.queue_mode == "poll" else InlineQueue
        app.state.queue = queue_cls(
            SessionLocal, app.state.provider, get_redis(), settings.worker_concurrency
        )
    yield
    if pool is not None:
        await pool.aclose()
    await app.state.provider.aclose()


app = FastAPI(title="CardForge API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_origin_regex=get_settings().cors_origin_regex or None,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Retry-After"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limited(_: Request, exc: RateLimitExceeded):
    minutes = max(1, exc.retry_after // 60)
    message = LIMIT_MESSAGES.get(exc.scope, "Лимит запросов").format(limit=exc.limit)
    return JSONResponse(
        status_code=429,
        content={"detail": f"{message}. Попробуйте через {minutes} мин."},
        headers={"Retry-After": str(exc.retry_after)},
    )


app.include_router(misc.router)
app.include_router(batches.router)
app.include_router(products.router)
