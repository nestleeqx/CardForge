import re
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.llm import LLMProvider
from app.services.redis_store import get_redis

_VISITOR_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def client_ip(request: Request) -> str:
    if get_settings().trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def visitor_id(x_visitor_id: Annotated[str | None, Header()] = None) -> str:
    """Анонимный id посетителя из localStorage: у каждого своя копия демо и история."""
    if not x_visitor_id or not _VISITOR_RE.match(x_visitor_id):
        raise HTTPException(400, "Нет заголовка X-Visitor-Id")
    return x_visitor_id


def get_provider(request: Request) -> LLMProvider:
    return request.app.state.provider


def get_queue(request: Request):
    return request.app.state.queue


SessionDep = Annotated[AsyncSession, Depends(get_session)]
RedisDep = Annotated[Redis, Depends(get_redis)]
IpDep = Annotated[str, Depends(client_ip)]
VisitorDep = Annotated[str, Depends(visitor_id)]
ProviderDep = Annotated[LLMProvider, Depends(get_provider)]
QueueDep = Annotated[object, Depends(get_queue)]
