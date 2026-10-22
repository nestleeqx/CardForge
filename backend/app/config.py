from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    database_url: str = "postgresql+asyncpg://cardforge:cardforge@localhost:5432/cardforge"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:3000"
    # За прокси (Render, Railway, nginx) реальный IP приходит в X-Forwarded-For
    trust_proxy: bool = True

    # Нейросеть: openai — любой OpenAI-совместимый API (OpenAI, OpenRouter, DeepSeek, vLLM),
    # yandex — YandexGPT, mock — шаблонный генератор без внешнего API
    llm_provider: Literal["openai", "yandex", "mock"] = "mock"
    llm_timeout: float = 60.0
    llm_temperature: float = 0.4
    # Пауза шаблонного генератора, чтобы в демо был виден прогресс
    mock_delay: float = 0.6

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    # json_schema — строгая схема (OpenAI, OpenRouter); json_object — для API без поддержки схем
    openai_json_mode: Literal["json_schema", "json_object"] = "json_schema"

    yandex_api_key: str = ""
    yandex_folder_id: str = ""
    yandex_model: str = "yandexgpt/latest"

    # Защита бюджета
    max_rows_per_file: int = 50
    max_file_bytes: int = 2 * 1024 * 1024
    max_cell_chars: int = 1000
    batches_per_hour: int = 3
    generations_per_hour: int = 20
    demo_resets_per_hour: int = 10
    cache_ttl_seconds: int = 7 * 24 * 3600
    # Пользовательские партии удаляются через сутки, демо-партия пересоздаётся
    batch_ttl_hours: int = 24

    # inline — обработка в процессе API (для тестов и запуска без воркера)
    queue_mode: Literal["arq", "inline"] = "arq"
    worker_concurrency: int = 5

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
