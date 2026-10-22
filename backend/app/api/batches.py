from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.deps import IpDep, QueueDep, RedisDep, SessionDep, VisitorDep
from app.models import Batch, Product
from app.schemas import BatchCreate, BatchOut, BatchSummary, PreviewOut, ProductOut
from app.services.demo import DEMO_CSV, delete_batches, ensure_demo
from app.services.export import build_xlsx
from app.services.parsing import ParseError, build_source, parse_table, suggest_mapping
from app.services.redis_store import hit_limit

router = APIRouter(prefix="/api", tags=["batches"])

STATUSES = ("queued", "running", "done", "error")


def summarize(batch: Batch, products: list[Product]) -> BatchSummary:
    counts = {s: 0 for s in STATUSES}
    for p in products:
        counts[p.status] += 1
    return BatchSummary(
        id=batch.id,
        filename=batch.filename,
        marketplace=batch.marketplace,
        tone=batch.tone,
        length=batch.length,
        is_demo=batch.is_demo,
        created_at=batch.created_at,
        total=len(products),
        counts=counts,
        warnings=sum(1 for p in products if p.warnings),
    )


async def load_batch(session, batch_id: str, owner: str) -> Batch:
    batch = await session.scalar(
        select(Batch)
        .where(Batch.id == batch_id, Batch.owner == owner)
        .options(selectinload(Batch.products))
        .execution_options(populate_existing=True)
    )
    if batch is None:
        raise HTTPException(404, "Партия не найдена")
    return batch


def batch_out(batch: Batch) -> BatchOut:
    return BatchOut(
        **summarize(batch, batch.products).model_dump(),
        products=[ProductOut.model_validate(p) for p in batch.products],
    )


@router.post("/uploads/preview", response_model=PreviewOut)
async def preview(file: UploadFile = File(...)):
    settings = get_settings()
    data = await file.read(settings.max_file_bytes + 1)
    if len(data) > settings.max_file_bytes:
        raise HTTPException(413, f"Файл больше {settings.max_file_bytes // 1024} КБ")
    try:
        columns, rows = parse_table(
            file.filename or "file.csv", data, settings.max_rows_per_file, settings.max_cell_chars
        )
    except ParseError as e:
        raise HTTPException(422, str(e)) from e
    return PreviewOut(
        filename=file.filename or "file.csv",
        columns=columns,
        rows=rows,
        suggested_mapping=suggest_mapping(columns),
    )


@router.get("/uploads/sample")
async def sample():
    return Response(
        DEMO_CSV.read_bytes(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{DEMO_CSV.name}"'},
    )


@router.post("/batches", response_model=BatchOut, status_code=201)
async def create_batch(
    body: BatchCreate,
    session: SessionDep,
    redis: RedisDep,
    queue: QueueDep,
    ip: IpDep,
    owner: VisitorDep,
):
    settings = get_settings()
    if len(body.rows) > settings.max_rows_per_file:
        raise HTTPException(422, f"Не больше {settings.max_rows_per_file} строк в партии")
    if not body.mapping.get("name"):
        raise HTTPException(422, "Укажите колонку с названием товара")

    sources = []
    for row in body.rows:
        row = {k[:100]: str(v)[: settings.max_cell_chars] for k, v in row.items()}
        source = build_source(row, body.mapping, body.extra_as_attributes)
        if source.name:
            sources.append(source)
    if not sources:
        raise HTTPException(422, "Ни в одной строке нет названия товара")

    await hit_limit(redis, "batch", ip, settings.batches_per_hour)

    batch = Batch(
        owner=owner,
        filename=body.filename,
        marketplace=body.marketplace,
        tone=body.tone,
        length=body.length,
    )
    for i, source in enumerate(sources):
        batch.products.append(Product(row_index=i, source=source.model_dump(), warnings=[]))
    session.add(batch)
    await session.commit()

    await queue.enqueue([p.id for p in batch.products])
    return batch_out(await load_batch(session, batch.id, owner))


@router.get("/batches", response_model=list[BatchSummary])
async def list_batches(session: SessionDep, queue: QueueDep, owner: VisitorDep):
    pending = await ensure_demo(session, owner)
    if pending:
        await queue.enqueue(pending)
    batches = list(
        await session.scalars(
            select(Batch)
            .where(Batch.owner == owner)
            .options(selectinload(Batch.products))
            .order_by(Batch.created_at.desc())
        )
    )
    return [summarize(b, b.products) for b in batches]


@router.get("/batches/{batch_id}", response_model=BatchOut)
async def get_batch(batch_id: str, session: SessionDep, queue: QueueDep, owner: VisitorDep):
    batch = await load_batch(session, batch_id, owner)
    # Без фонового воркера (serverless) каждый опрос партии продвигает очередь на шаг
    if getattr(queue, "polling", False) and any(
        p.status in {"queued", "running"} for p in batch.products
    ):
        if await queue.advance(batch.id):
            batch = await load_batch(session, batch_id, owner)
    return batch_out(batch)


@router.delete("/batches/{batch_id}", status_code=204)
async def remove_batch(batch_id: str, session: SessionDep, owner: VisitorDep):
    batch = await load_batch(session, batch_id, owner)
    await delete_batches(session, [batch.id])


@router.post("/batches/{batch_id}/retry-failed", response_model=BatchOut)
async def retry_failed(
    batch_id: str,
    session: SessionDep,
    redis: RedisDep,
    queue: QueueDep,
    ip: IpDep,
    owner: VisitorDep,
):
    batch = await load_batch(session, batch_id, owner)
    failed = [p for p in batch.products if p.status == "error"]
    if not failed:
        return batch_out(batch)
    # Перезапуск упавших строк считается как новая партия
    await hit_limit(redis, "batch", ip, get_settings().batches_per_hour)
    for p in failed:
        p.status, p.error = "queued", None
    await session.commit()
    await queue.enqueue([p.id for p in failed])
    return batch_out(await load_batch(session, batch_id, owner))


@router.get("/batches/{batch_id}/export")
async def export_batch(batch_id: str, session: SessionDep, owner: VisitorDep):
    batch = await load_batch(session, batch_id, owner)
    done = await session.scalar(
        select(func.count()).where(Product.batch_id == batch.id, Product.status == "done")
    )
    if not done:
        raise HTTPException(409, "В партии ещё нет готовых карточек")
    name = batch.filename.rsplit(".", 1)[0] + f"-{batch.marketplace}.xlsx"
    return Response(
        build_xlsx(batch),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"},
    )
