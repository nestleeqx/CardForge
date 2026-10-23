"""Размер фото по ссылке из таблицы: скачиваем только начало файла и читаем заголовок."""

import asyncio
import ipaddress
import logging
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
from PIL import ImageFile

log = logging.getLogger(__name__)

# Заголовка JPEG/PNG/WebP почти всегда хватает первых десятков килобайт
MAX_BYTES = 256 * 1024
MAX_REDIRECTS = 3
# Требования площадок к фото товара
MIN_WIDTH, MIN_HEIGHT = 900, 1200
MAX_FILE_BYTES = 10 * 1024 * 1024
TIMEOUT = 5.0


class PhotoProbeError(Exception):
    """Фото не удалось открыть — текст пойдёт пользователю в предупреждение."""


async def _ensure_public(url: str) -> None:
    """Ссылку присылает пользователь, поэтому ходим только в публичный интернет —
    не во внутреннюю сеть сервера (защита от SSRF)."""
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise PhotoProbeError("ссылка должна начинаться с http:// или https://")
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            parts.hostname, None, type=socket.SOCK_STREAM
        )
    except socket.gaierror as e:
        raise PhotoProbeError("сайт с фото не найден") from e
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise PhotoProbeError("адрес фото недоступен")


@dataclass(frozen=True)
class PhotoInfo:
    width: int
    height: int
    # Вес файла в байтах, если сервер его сообщил
    size: int | None = None


def _file_size(resp: httpx.Response) -> int | None:
    """Вес файла из заголовков: при частичной загрузке он в Content-Range после «/»."""
    content_range = resp.headers.get("content-range", "")
    if "/" in content_range:
        total = content_range.rsplit("/", 1)[1]
        return int(total) if total.isdigit() else None
    length = resp.headers.get("content-length", "")
    return int(length) if resp.status_code == 200 and length.isdigit() else None


async def _read_info(resp: httpx.Response) -> PhotoInfo:
    if resp.status_code >= 400:
        raise PhotoProbeError(f"сервер ответил {resp.status_code}")
    if not resp.headers.get("content-type", "image/").startswith("image/"):
        raise PhotoProbeError("по ссылке не изображение")
    parser = ImageFile.Parser()
    read = 0
    async for chunk in resp.aiter_bytes():
        parser.feed(chunk)
        read += len(chunk)
        if parser.image is not None:
            width, height = parser.image.size
            return PhotoInfo(width, height, _file_size(resp))
        if read >= MAX_BYTES:
            break
    raise PhotoProbeError("не удалось прочитать изображение")


async def probe_photo(url: str, client: httpx.AsyncClient | None = None) -> PhotoInfo:
    """Размер и вес фото по ссылке или PhotoProbeError."""
    own_client = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT)
    try:
        # Редиректы проходим вручную: каждый новый адрес тоже проверяем на публичность
        for _ in range(MAX_REDIRECTS + 1):
            await _ensure_public(url)
            headers = {"Range": f"bytes=0-{MAX_BYTES - 1}"}
            async with client.stream("GET", url, headers=headers, follow_redirects=False) as resp:
                if resp.is_redirect:
                    url = str(resp.url.join(resp.headers["location"]))
                    continue
                return await _read_info(resp)
        raise PhotoProbeError("слишком много перенаправлений")
    except httpx.HTTPError as e:
        raise PhotoProbeError("фото не загрузилось") from e
    finally:
        if own_client:
            await client.aclose()


def photo_problems(width: int, height: int, size: int | None = None) -> list[str]:
    """Замечания к фото по требованиям Ozon и Wildberries: 3:4, от 900×1200, до 10 МБ."""
    problems = []
    if abs(width / height - 3 / 4) > 0.03 * 3 / 4:
        if width > height:
            shape = "горизонтальное"
        elif width == height:
            shape = "квадратное"
        else:
            shape = "вертикальное, но не 3:4"
        problems.append(
            f"Фото {width}×{height} — {shape}. Ozon и Wildberries требуют вертикальное 3:4, "
            "например 900×1200"
        )
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        problems.append(
            f"Фото {width}×{height} меньше {MIN_WIDTH}×{MIN_HEIGHT} — "
            "на странице товара оно будет выглядеть нечётким"
        )
    if size and size > MAX_FILE_BYTES:
        megabytes = f"{size / 1024 / 1024:.1f}".replace(".", ",")
        problems.append(f"Файл фото весит {megabytes} МБ — площадки принимают до 10 МБ")
    return problems
