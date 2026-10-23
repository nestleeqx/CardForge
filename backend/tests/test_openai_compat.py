import json

import httpx
import pytest

from app.llm import LLMError
from app.llm.openai_compat import OpenAICompatibleProvider
from app.schemas import CardResult

OK = {"choices": [{"message": {"content": "{}"}}]}


def _provider(handler, **kwargs) -> tuple[OpenAICompatibleProvider, list[dict]]:
    """Провайдер с подменённым HTTP: запоминает тела запросов и отвечает через handler."""
    sent: list[dict] = []

    def record(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append(body)
        return handler(body)

    provider = OpenAICompatibleProvider(
        api_key="test", base_url="https://api.test/v1", model="gpt-5.6-luna", **kwargs
    )
    provider._client = httpx.AsyncClient(transport=httpx.MockTransport(record))
    return provider, sent


def _unsupported(param: str) -> httpx.Response:
    error = {"message": f"Unsupported parameter: '{param}'", "param": param}
    return httpx.Response(400, json={"error": error})


async def test_rejected_temperature_is_dropped_and_remembered():
    def handler(body):
        return (
            _unsupported("temperature") if "temperature" in body else httpx.Response(200, json=OK)
        )

    provider, sent = _provider(handler, reasoning_effort="none")
    await provider._complete("system", "user", CardResult)
    await provider._complete("system", "user", CardResult)
    # Первый запрос отклонён, дальше температура не отправляется, а reasoning_effort остаётся
    assert ["temperature" in b for b in sent] == [True, False, False]
    assert all(b["reasoning_effort"] == "none" for b in sent)


async def test_other_client_errors_are_not_retried():
    provider, sent = _provider(
        lambda body: httpx.Response(401, json={"error": {"message": "bad key"}})
    )
    with pytest.raises(LLMError):
        await provider._complete("system", "user", CardResult)
    assert len(sent) == 1


async def test_reasoning_effort_is_not_sent_by_default():
    provider, sent = _provider(lambda body: httpx.Response(200, json=OK))
    await provider._complete("system", "user", CardResult)
    assert "reasoning_effort" not in sent[0] and sent[0]["temperature"] == 0.4


def test_strict_schema_keeps_fields_named_title():
    from app.llm.base import strict_schema
    from app.services.generator import FIELD_SCHEMAS, CardDraft

    schema = strict_schema(CardDraft)
    assert "title" in schema["properties"] and "title" in schema["required"]
    assert strict_schema(FIELD_SCHEMAS["title"])["required"] == ["title"]
    # Служебные заголовки Pydantic при этом убраны
    assert "title" not in schema and "title" not in schema["properties"]["description"]


def test_attribute_values_keep_source_spelling():
    from app.schemas import Attribute, SourceProduct
    from app.services.generator import _clean

    source = SourceProduct(
        name="Коврик",
        attributes=[
            Attribute(name="Цвет", value="лавандовый"),
            Attribute(name="Вес, г", value="900"),
            Attribute(name="Объём, мл", value="600"),
        ],
    )
    card = CardResult(
        title="Коврик",
        description="Текст",
        attributes=[
            Attribute(name="Цвет", value="Лавандовый"),
            Attribute(name="Размер", value="183 × 61 см"),
            # Единица потеряна вместе с названием колонки / осталась в названии
            Attribute(name="Вес", value="900"),
            Attribute(name="Объём, мл", value="600"),
        ],
        keywords=[],
    )
    attrs = [(a.name, a.value) for a in _clean(card, source).attributes]
    assert attrs == [
        ("Цвет", "лавандовый"),
        ("Размер", "183 × 61 см"),
        ("Вес", "900 г"),
        ("Объём", "600 мл"),
    ]


def test_removed_brand_is_hidden_from_rewrite():
    from app.schemas import SourceProduct
    from app.services.generator import _without_removed_brand

    source = SourceProduct(name="Скакалка", brand="Jumpy")
    card = CardResult(
        title="Скакалка скоростная, 3 м",
        description="Скакалка Jumpy для тренировок",
        attributes=[],
        keywords=["скакалка", "jumpy скакалка"],
    )
    # Бренд убран из названия — при «короче» модель его не увидит
    assert _without_removed_brand(source, card, "title", "короче").brand == ""
    # …но если о бренде просят, или он ещё есть в поле, — передаём как есть
    assert _without_removed_brand(source, card, "title", "верни бренд").brand == "Jumpy"
    assert _without_removed_brand(source, card, "description", "короче").brand == "Jumpy"
    assert _without_removed_brand(source, card, "keywords", "").brand == "Jumpy"
