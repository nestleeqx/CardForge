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


def test_field_prompt_for_every_field():
    from app.schemas import Attribute, GenerationSettings, SourceProduct
    from app.services.prompts import field_prompt

    card = CardResult(
        title="Коврик",
        description="Текст",
        attributes=[Attribute(name="Цвет", value="лавандовый")],
        keywords=["коврик"],
    )
    settings = GenerationSettings(marketplace="ozon", tone="selling", length="short")
    for field in ("title", "description", "attributes", "keywords"):
        _, user = field_prompt(SourceProduct(name="Коврик"), settings, card, field, "")
        assert '"current"' in user, field
    _, user = field_prompt(SourceProduct(name="Коврик"), settings, card, "attributes", "")
    assert "лавандовый" in user


async def test_field_rewrite_retries_when_too_short():
    from app.llm.base import LLMProvider
    from app.schemas import GenerationSettings, SourceProduct
    from app.services.generator import regenerate_field

    class Scripted(LLMProvider):
        name, model = "scripted", "test"

        def __init__(self, replies):
            self.replies, self.prompts = list(replies), []

        async def _complete(self, system, user, schema):
            self.prompts.append(user)
            return json.dumps({"description": self.replies.pop(0)})

    # «Короче» сначала ушло ниже минимума описания, после замечания — в пределах
    provider = Scripted(["Короткий текст. " * 10, "Нормальный текст описания. " * 25])
    card = CardResult(title="Плед", description="Длинный текст. " * 60, attributes=[], keywords=[])
    settings = GenerationSettings(marketplace="ozon", tone="selling", length="short")
    result, _ = await regenerate_field(
        provider,
        SourceProduct(name="Плед"),
        settings,
        card,
        "description",
        "короче",
    )
    assert len(provider.prompts) == 2 and "минимум 500" in provider.prompts[1]
    assert len(result.description) >= 500


async def test_shorter_never_returns_longer_text():
    from app.llm.base import LLMProvider
    from app.schemas import GenerationSettings, SourceProduct
    from app.services.generator import NotShorter, regenerate_field

    class Scripted(LLMProvider):
        name, model = "scripted", "test"

        def __init__(self, replies):
            self.replies, self.prompts = list(replies), []

        async def _complete(self, system, user, schema):
            self.prompts.append(user)
            return json.dumps({"description": self.replies.pop(0)})

    # Описание уже у минимума: модель ушла ниже 500, а исправляя — длиннее исходного
    current = "Текст описания. " * 33  # 528 символов
    provider = Scripted(["Коротко. " * 20, "Длинный ответ. " * 50])
    card = CardResult(title="Плед", description=current, attributes=[], keywords=[])
    settings = GenerationSettings(marketplace="ozon", tone="selling", length="short")
    with pytest.raises(NotShorter):
        await regenerate_field(
            provider,
            SourceProduct(name="Плед"),
            settings,
            card,
            "description",
            "короче",
        )
    # Во второй попытке модель получила точный коридор длины
    assert f"от 500 до {len(current) - 1}" in provider.prompts[1]


async def test_repeated_rewrite_asks_the_model_again():
    from app.llm.base import LLMProvider
    from app.schemas import GenerationSettings, SourceProduct
    from app.services.generator import regenerate_field

    class Counting(LLMProvider):
        name, model = "counting", "test"
        calls = 0

        async def _complete(self, system, user, schema):
            self.calls += 1
            # Без цифр: число не из таблицы проверки сочли бы выдумкой и переспросили
            return json.dumps(
                {"title": ["Плед вязаный мягкий", "Плед вязаный тёплый"][self.calls - 1]}
            )

    provider = Counting()
    card = CardResult(title="Плед", description="Текст", attributes=[], keywords=[])
    settings = GenerationSettings(marketplace="ozon", tone="selling", length="short")
    source = SourceProduct(name="Плед")
    first, _ = await regenerate_field(provider, source, settings, card, "title", "живее")
    second, _ = await regenerate_field(provider, source, settings, card, "title", "живее")
    # Тот же запрос — но новый вариант, а не ответ из кэша
    assert provider.calls == 2 and first.title != second.title
