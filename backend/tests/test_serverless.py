from app.config import Settings, get_settings, normalize_database_url
from app.db import SessionLocal
from app.main import app
from app.services.demo import DEMO_CSV
from app.services.processing import PollQueue
from app.services.redis_store import get_redis


def test_neon_url_is_converted_for_asyncpg():
    url = (
        "postgres://u:p@ep-x.eu-central-1.aws.neon.tech/db?sslmode=require&channel_binding=require"
    )
    assert normalize_database_url(url) == (
        "postgresql+asyncpg://u:p@ep-x.eu-central-1.aws.neon.tech/db?ssl=require"
    )
    assert normalize_database_url("sqlite+aiosqlite:///x.db") == "sqlite+aiosqlite:///x.db"


def test_vercel_defaults_to_poll_queue(monkeypatch):
    monkeypatch.delenv("QUEUE_MODE", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("KV_URL", "rediss://default:token@x.upstash.io:6379")
    s = Settings(_env_file=None)
    assert s.queue_mode == "poll"
    assert s.redis_url.startswith("rediss://")


async def test_poll_queue_advances_while_client_polls(client):
    app.state.queue = PollQueue(SessionLocal, app.state.provider, get_redis(), concurrency=5)
    preview = (
        await client.post(
            "/api/uploads/preview", files={"file": ("x.csv", DEMO_CSV.read_bytes(), "text/csv")}
        )
    ).json()
    body = {
        "filename": "x.csv",
        "mapping": preview["suggested_mapping"],
        "rows": preview["rows"][:12],
        "marketplace": "ozon",
        "tone": "neutral",
        "length": "short",
    }
    batch = (await client.post("/api/batches", json=body)).json()
    assert batch["counts"]["queued"] == 12

    done = []
    for _ in range(5):
        batch = (await client.get(f"/api/batches/{batch['id']}")).json()
        done.append(batch["counts"]["done"])
    # Каждый опрос обрабатывает следующую порцию по 5 строк
    assert done[:3] == [5, 10, 12]


async def test_cron_requires_secret(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "cron_secret", "s3cret")
    assert (await client.get("/api/cron/cleanup")).status_code == 401
    resp = await client.get("/api/cron/cleanup", headers={"Authorization": "Bearer s3cret"})
    assert resp.status_code == 200 and resp.json() == {"removed": 0}
