import io

import httpx
import pytest
from PIL import Image

from app.schemas import CardResult, SourceProduct
from app.services import photo_probe
from app.services.checks import check_card
from app.services.photo_probe import PhotoInfo, PhotoProbeError, photo_problems, probe_photo


def _jpeg(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture
def public_only(monkeypatch):
    async def ok(url: str) -> None:
        if "internal" in url:
            raise PhotoProbeError("адрес фото недоступен")

    monkeypatch.setattr(photo_probe, "_ensure_public", ok)


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_probe_reads_size(public_only):
    body = _jpeg(600, 800)

    def handler(request: httpx.Request) -> httpx.Response:
        # Сервер отдал только запрошенный кусок, полный вес — в Content-Range
        headers = {"content-range": f"bytes 0-{len(body) - 1}/12582912"}
        return httpx.Response(206, content=body, headers=headers)

    async with _client(handler) as client:
        info = await probe_photo("https://cdn.example/p.jpg", client)
    assert info == PhotoInfo(600, 800, 12582912)


async def test_probe_checks_redirect_target(public_only):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://internal/secret"})

    async with _client(handler) as client:
        with pytest.raises(PhotoProbeError, match="недоступен"):
            await probe_photo("https://cdn.example/p.jpg", client)


async def test_probe_rejects_not_image(public_only):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>", headers={"content-type": "text/html"})

    async with _client(handler) as client:
        with pytest.raises(PhotoProbeError, match="не изображение"):
            await probe_photo("https://cdn.example/p.jpg", client)


@pytest.mark.parametrize("url", ["ftp://example.com/p.jpg", "http://127.0.0.1/p.jpg"])
async def test_private_and_odd_urls_blocked(url):
    with pytest.raises(PhotoProbeError):
        await probe_photo(url)


def test_photo_problems():
    assert photo_problems(900, 1200) == []
    assert photo_problems(1502, 1999, 2_000_000) == []
    assert "горизонтальное" in photo_problems(1800, 1200)[0]
    assert "квадратное" in photo_problems(1200, 1200)[0]
    assert "меньше 900×1200" in photo_problems(600, 800)[0]
    assert "12,0 МБ" in photo_problems(900, 1200, 12582912)[0]


def test_photo_warning_in_checks():
    card = CardResult(
        title="Кружка керамическая",
        description="Кружка из керамики. " * 20,
        keywords=[f"слово{i}" for i in range(12)],
        attributes=[],
    )
    base = {"name": "Кружка", "category": "Посуда", "photo": "https://x/p.jpg"}
    codes = lambda src: [w.code for w in check_card(card, src, "ozon")]  # noqa: E731
    assert "photo" in codes(SourceProduct(**base, photo_width=1200, photo_height=800))
    assert "photo" in codes(SourceProduct(**base, photo_error="сервер ответил 404"))
    assert "photo" not in codes(SourceProduct(**base, photo_width=900, photo_height=1200))
    assert "photo" in codes(SourceProduct(name="Кружка", category="Посуда"))
