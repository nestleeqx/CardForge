import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.deps import IpDep, ProviderDep, QueueDep, RedisDep, SessionDep, VisitorDep
from app.llm import LLMError
from app.models import Batch, Product
from app.schemas import (
    CardResult,
    GenerationSettings,
    ProductOut,
    ProductPatch,
    RegenerateIn,
    SourceProduct,
)
from app.services.checks import check_card
from app.services.generator import NotShorter, regenerate_field
from app.services.redis_store import hit_limit

router = APIRouter(prefix="/api/products", tags=["products"])
log = logging.getLogger(__name__)


async def load_product(session, product_id: str, owner: str) -> Product:
    product = await session.scalar(
        select(Product)
        .join(Batch)
        .where(Product.id == product_id, Batch.owner == owner)
        .options(selectinload(Product.batch))
    )
    if product is None:
        raise HTTPException(404, "Товар не найден")
    return product


def _settings(product: Product) -> GenerationSettings:
    b = product.batch
    return GenerationSettings(marketplace=b.marketplace, tone=b.tone, length=b.length)


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, session: SessionDep, owner: VisitorDep):
    return await load_product(session, product_id, owner)


@router.patch("/{product_id}", response_model=ProductOut)
async def edit_product(product_id: str, body: ProductPatch, session: SessionDep, owner: VisitorDep):
    product = await load_product(session, product_id, owner)
    if product.result is None:
        raise HTTPException(409, "Карточка ещё не сгенерирована")
    changes = body.model_dump(exclude_none=True)
    card = CardResult.model_validate({**product.result, **changes})
    source = SourceProduct.model_validate(product.source)
    product.result = card.model_dump()
    product.warnings = [w.model_dump() for w in check_card(card, source, product.batch.marketplace)]
    product.edited = True
    await session.commit()
    await session.refresh(product)
    return product


@router.post("/{product_id}/regenerate", response_model=ProductOut)
async def regenerate(
    product_id: str,
    body: RegenerateIn,
    session: SessionDep,
    redis: RedisDep,
    provider: ProviderDep,
    ip: IpDep,
    owner: VisitorDep,
):
    product = await load_product(session, product_id, owner)
    if product.result is None:
        raise HTTPException(409, "Карточка ещё не сгенерирована")
    await hit_limit(redis, "gen", ip, get_settings().generations_per_hour)
    try:
        card, warnings = await regenerate_field(
            provider,
            redis,
            SourceProduct.model_validate(product.source),
            _settings(product),
            CardResult.model_validate(product.result),
            body.field,
            body.comment.strip(),
        )
    except NotShorter as e:
        # Текущий вариант не трогаем и честно говорим почему
        raise HTTPException(
            422, f"Короче не получится: {e} уже у минимальной длины площадки."
        ) from e
    except LLMError as e:
        # Подробности (код ответа API, текст ошибки) — только в лог, пользователю — что делать
        log.warning("Перегенерация %s/%s не удалась: %s", product_id, body.field, e)
        raise HTTPException(
            502, "Нейросеть сейчас не ответила. Попробуйте ещё раз через минуту."
        ) from e
    product.result = card.model_dump()
    product.warnings = [w.model_dump() for w in warnings]
    product.edited = True
    await session.commit()
    await session.refresh(product)
    return product


@router.post("/{product_id}/retry", response_model=ProductOut)
async def retry(
    product_id: str,
    session: SessionDep,
    redis: RedisDep,
    queue: QueueDep,
    ip: IpDep,
    owner: VisitorDep,
):
    """Перегенерировать карточку целиком — для упавшей строки или если результат не понравился."""
    product = await load_product(session, product_id, owner)
    if product.status in {"queued", "running"}:
        return product
    await hit_limit(redis, "gen", ip, get_settings().generations_per_hour)
    product.status, product.error = "queued", None
    await session.commit()
    await queue.enqueue([product.id])
    await session.refresh(product)
    return product
