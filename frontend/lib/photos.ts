// Фото товаров демо-партии. Те же, что в backend/app/seed/uyutny-ugol.csv.
// Формат 3:4, как требуют Ozon и Wildberries. Подобранные фото лежат в public/demo (900×1200),
// для остальных товаров — Unsplash: CDN обрезает кадр по содержательной области,
// а длинные предметы на белом фоне вписывает целиком с белыми полями.
export const PHOTO_IDS: Record<string, string> = {
  "UU-001": "1663247131274-ecbf38ec087c",
  "UU-002": "1639690222445-595b0794bbd4",
  "UU-003": "1752861750079-0941cdcc530c",
  "UU-004": "1615894632464-c746c61feb6d",
  "UU-005": "1790854978368-20d85cac8ec4",
  "UU-006": "1627808566580-9fb1a2ab681b",
  "UU-007": "1692522034092-1e4dd2d19bef",
  "UU-008": "1708440996563-bfbe9617391d",
  "UU-009": "1784901393087-988ae280ea4c",
  "UU-010": "1523471826770-c437b4636fe6",
  "UU-011": "1590421198005-3139329e9222",
  "UU-012": "1592156328757-ae2941276b2c",
  "UU-013": "1587302108992-20648821725d",
  "UU-014": "1636412191749-53d84f5f3eb0",
  "UU-015": "1615205597144-5c7c885291d2",
  "UU-016": "1650008747211-e96447824d1c",
  "UU-017": "1591625591034-75d303d2e1a4",
  "UU-018": "1769255119650-f658d3dbc397",
  "UU-019": "1538030963603-00b7ae857574",
  "UU-020": "1674659803406-f3e0e5f5d965",
  "UU-021": "1641942575351-b78f37a990eb",
  "UU-022": "1766727923624-2e8eede5aa8c",
  "UU-023": "1622428051717-dcd8412959de",
  "UU-024": "1626497764746-6dc36546b388",
  "UU-025": "1684841566323-24a0a9961f19",
  "UU-026": "1608538620576-7c9095a91b90",
  "UU-027": "1580428456190-7348f304b927",
  "UU-028": "1552248524-10d9a7e4841c",
  "UU-029": "1591345299642-13726d9c80c1",
  "UU-030": "1572851500897-4481a98c2a29"
};

const LOCAL_PHOTOS: Record<string, string> = {
  "UU-001": "UU-001.jpg",
  "UU-002": "UU-002.webp",
  "UU-003": "UU-003.webp",
  "UU-004": "UU-004.webp",
  "UU-008": "UU-008.webp",
  "UU-009": "UU-009.jpg",
  "UU-011": "UU-011.webp",
  "UU-014": "UU-014.webp",
  "UU-016": "UU-016.webp",
  "UU-017": "UU-017.webp",
  "UU-018": "UU-018.jpg",
  "UU-019": "UU-019.webp",
  "UU-020": "UU-020.jpg",
  "UU-022": "UU-022.webp",
  "UU-023": "UU-023.webp",
  "UU-024": "UU-024.jpg",
  "UU-025": "UU-025.webp",
  "UU-026": "UU-026.webp",
  "UU-027": "UU-027.webp",
  "UU-028": "UU-028.webp",
  "UU-029": "UU-029.webp",
};

// В таблице демо-партии ссылки ведут на боевой сайт, чтобы их можно было открыть из выгрузки
export const DEMO_PHOTO_ORIGIN = "https://cardforge-weld.vercel.app";

const FILL = new Set(["UU-012"]);

function fitParams(sku: string) {
  if (FILL.has(sku)) return "fit=fill&fill=solid&fill-color=ffffff";
  return "fit=crop&crop=entropy";
}

export const photo = (sku: string, w = 480) =>
  LOCAL_PHOTOS[sku]
    ? `/demo/${LOCAL_PHOTOS[sku]}`
    : `https://images.unsplash.com/photo-${PHOTO_IDS[sku]}?w=${w}&h=${Math.round((w * 4) / 3)}&${fitParams(sku)}&q=75&auto=format`;

/** Демо-фото берём с текущего сайта, а не с боевого — так они открываются и при локальном запуске.
 *  Файл ищем по артикулу: в сохранённых партиях может остаться ссылка на прежний файл
 *  (например, UU-004.jpg, после того как фото заменили на UU-004.webp). */
export function displayPhoto(src: string) {
  if (!src.startsWith(`${DEMO_PHOTO_ORIGIN}/demo/`)) return src;
  const sku = src.match(/\/demo\/(UU-\d+)\.\w+$/)?.[1];
  return sku && LOCAL_PHOTOS[sku] ? `/demo/${LOCAL_PHOTOS[sku]}` : src.slice(DEMO_PHOTO_ORIGIN.length);
}
