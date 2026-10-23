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
