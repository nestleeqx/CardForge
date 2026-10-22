import json

import httpx
from pydantic import BaseModel

from app.llm.base import LLMError, LLMProvider, strict_schema
from app.llm.http import post_with_retry


class OpenAICompatibleProvider(LLMProvider):
    """OpenAI Chat Completions. Подходит для OpenAI, OpenRouter, DeepSeek, vLLM, Ollama."""

    name = "openai"

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        json_mode: str = "json_schema",
        temperature: float = 0.4,
        timeout: float = 60.0,
    ):
        if not api_key:
            raise LLMError("Не задан OPENAI_API_KEY")
        self.model = model
        self.json_mode = json_mode
        self.temperature = temperature
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._client = httpx.AsyncClient(timeout=timeout)

    async def _complete(self, system: str, user: str, schema: type[BaseModel]) -> str:
        if self.json_mode == "json_schema":
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "schema": strict_schema(schema),
                    "strict": True,
                },
            }
        else:
            # Без нативной поддержки схем передаём её в промпте
            system += "\n\nJSON Schema ответа:\n" + json.dumps(
                schema.model_json_schema(), ensure_ascii=False
            )
            response_format = {"type": "json_object"}

        data = await post_with_retry(
            self._client,
            self._url,
            headers=self._headers,
            json={
                "model": self.model,
                "temperature": self.temperature,
                "response_format": response_format,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
        )
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError) as e:
            raise LLMError(f"Неожиданный ответ API: {str(data)[:300]}") from e

    async def aclose(self) -> None:
        await self._client.aclose()
