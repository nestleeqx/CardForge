from fastapi import APIRouter, Header, HTTPException

from app.api.batches import batch_out, load_batch
from app.config import get_settings
from app.deps import IpDep, ProviderDep, QueueDep, RedisDep, SessionDep, VisitorDep
from app.schemas import BatchOut, LimitsOut
from app.services.demo import cleanup_old, reset_demo, restore_demo
from app.services.redis_store import hit_limit, remaining

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/health")
async def health():
    return {"ok": True}


@router.get("/cron/cleanup")
async def cron_cleanup(session: SessionDep, authorization: str | None = Header(default=None)):
    """Ночная очистка для Vercel Cron — там нет воркера arq с его расписанием."""
    secret = get_settings().cron_secret
    if not secret or authorization != f"Bearer {secret}":
        raise HTTPException(401, "Нужен CRON_SECRET")
    removed = await cleanup_old(session, get_settings().batch_ttl_hours)
    return {"removed": removed}


@router.get("/limits", response_model=LimitsOut)
async def limits(redis: RedisDep, provider: ProviderDep, ip: IpDep):
    s = get_settings()
    return LimitsOut(
        max_rows_per_file=s.max_rows_per_file,
        max_file_bytes=s.max_file_bytes,
        batches_per_hour=s.batches_per_hour,
        generations_per_hour=s.generations_per_hour,
        batches_left=await remaining(redis, "batch", ip, s.batches_per_hour),
        generations_left=await remaining(redis, "gen", ip, s.generations_per_hour),
        provider=f"{provider.name}:{provider.model}",
    )


@router.post("/demo/reset", response_model=BatchOut)
async def demo_reset(
    session: SessionDep, redis: RedisDep, queue: QueueDep, ip: IpDep, owner: VisitorDep
):
    """Удаляет партии посетителя и заново создаёт демо-партию «Уютного угла»."""
    await hit_limit(redis, "reset", ip, get_settings().demo_resets_per_hour)
    batch, pending = await reset_demo(session, owner)
    if pending:
        await queue.enqueue(pending)
    return batch_out(await load_batch(session, batch.id, owner))


@router.post("/demo/restore", response_model=BatchOut)
async def demo_restore(
    session: SessionDep, redis: RedisDep, queue: QueueDep, ip: IpDep, owner: VisitorDep
):
    """Возвращает демо-партию, если посетитель её удалил. Другие партии не трогает."""
    await hit_limit(redis, "reset", ip, get_settings().demo_resets_per_hour)
    batch, pending = await restore_demo(session, owner)
    if pending:
        await queue.enqueue(pending)
    return batch_out(await load_batch(session, batch.id, owner))
