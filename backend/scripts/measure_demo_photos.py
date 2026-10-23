"""Измеряет фото демо-партии и сохраняет размеры в app/seed/uyutny-ugol.photos.json.

Демо-карточки не проходят генерацию, поэтому и фото в них не проверяются на лету —
размеры берутся из этого файла. Запускать после замены фото:

    cd backend && uv run python scripts/measure_demo_photos.py
"""

import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.demo import DEMO_CSV, SEED_DIR  # noqa: E402
from app.services.parsing import build_source, parse_table, suggest_mapping  # noqa: E402
from app.services.photo_probe import probe_photo  # noqa: E402

# Фото с нашего сайта берём из папки фронтенда: на боевом сайте может лежать старая версия
LOCAL_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public"
SITE = "cardforge-weld.vercel.app"


async def measure(url: str) -> list[int | None]:
    parts = urlsplit(url)
    local = LOCAL_DIR / parts.path.lstrip("/")
    if parts.hostname == SITE and local.is_file():
        with Image.open(local) as im:
            return [*im.size, local.stat().st_size]
    info = await probe_photo(url)
    return [info.width, info.height, info.size]


async def main() -> None:
    columns, rows = parse_table(DEMO_CSV.name, DEMO_CSV.read_bytes(), max_rows=100, max_cell=5000)
    mapping = suggest_mapping(columns)
    result = {}
    for row in rows:
        source = build_source(row, mapping, extra_as_attributes=True)
        if source.photo:
            result[source.sku] = await measure(source.photo)
            print(source.sku, result[source.sku])
    out = SEED_DIR / "uyutny-ugol.photos.json"
    # По строке на товар: [ширина, высота, вес в байтах]
    lines = [f'  "{sku}": {json.dumps(dims)}' for sku, dims in result.items()]
    out.write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")
    print("Сохранено:", out)


if __name__ == "__main__":
    asyncio.run(main())
