import os
import tempfile
from pathlib import Path

_db = Path(tempfile.mkdtemp()) / "test.db"
os.environ.update(
    DATABASE_URL=f"sqlite+aiosqlite:///{_db.as_posix()}",
    QUEUE_MODE="inline",
    LLM_PROVIDER="mock",
    MOCK_DELAY="0",
    BATCHES_PER_HOUR="3",
    GENERATIONS_PER_HOUR="20",
)

import fakeredis  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.redis_store import set_redis  # noqa: E402


@pytest.fixture
async def client():
    set_redis(fakeredis.FakeAsyncRedis(decode_responses=True))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    async with app.router.lifespan_context(app):
        # Тестовый клиент шлёт свой IP, чтобы лимиты не пересекались между тестами
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Visitor-Id": "test-visitor-0001"},
        ) as c:
            yield c
        if hasattr(app.state.queue, "drain"):
            await app.state.queue.drain()
    await engine.dispose()


async def drain():
    await app.state.queue.drain()
