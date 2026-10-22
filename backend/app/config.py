from functools import lru_cache
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str) -> str:
    """Приводит строку подключения Neon/Heroku-вида к драйверу asyncpg.

    postgres://…?sslmode=require&channel_binding=require → postgresql+asyncpg://…?ssl=require
    """
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme in {"postgres", "postgresql"}:
        scheme = "postgresql+asyncpg"
    if not scheme.startswith("postgresql"):
        return url
    query = []
    for key, value in parse_qsl(parts.query):
        if key == "sslmode":
            query.append(("ssl", value))
        elif key != "channel_binding":
            query.append((key, value))
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    # Интеграции Vercel (Neon, Upstash) называют переменные по-своему.
    # Прямое подключение без пулера предпочтительнее: asyncpg и pgbouncer плохо дружат.
    database_url: str = Field(
        default="postgresql+asyncpg://cardforge:cardforge@localhost:5432/cardforge",
        validation_alias=AliasChoices(
            "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"
        ),
    )
    redis_url: str = Field(
        default="redis://localhost:6379/0", validation_alias=AliasChoices("REDIS_URL", "KV_URL")
    )
    cors_origins: str = "http://localhost:3000"
    # Превью-деплои Vercel получают случайные адреса — их удобнее разрешить регуляркой
    cors_origin_regex: str | None = None
    # За прокси (Render, Railway, nginx) реальный IP приходит в X-Forwarded-For
    trust_proxy: bool = True
    # Vercel выставляет VERCEL=1 во всех своих окружениях
    vercel: bool = False
    # Секрет, который Vercel Cron передаёт в Authorization: Bearer …
    cron_secret: str = ""

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

    # arq — отдельный воркер (Docker, VPS); inline — фоновые задачи в процессе API (тесты);
    # poll — без фоновых процессов: строки обрабатываются, пока клиент опрашивает партию
    # (serverless, например Vercel). По умолчанию на Vercel — poll, иначе arq.
    queue_mode: Literal["arq", "inline", "poll"] | None = None
    worker_concurrency: int = 5

    @field_validator("database_url")
    @classmethod
    def _normalize_db(cls, v: str) -> str:
        return normalize_database_url(v)

    @model_validator(mode="after")
    def _default_queue(self) -> "Settings":
        if self.queue_mode is None:
            self.queue_mode = "poll" if self.vercel else "arq"
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
