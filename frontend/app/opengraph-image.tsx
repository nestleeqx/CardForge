import { ImageResponse } from "next/og";

export const alt = "CardForge — ИИ-генератор карточек товаров для Ozon и Wildberries";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "Карточки товаров для Ozon и Wildberries из вашей таблицы";
const SUBLINE = "Названия, описания, характеристики и поисковые запросы — с проверкой лимитов и выдумок";
const CHIPS = ["Ozon", "Wildberries", "OpenAI · YandexGPT", "Экспорт в XLSX"];

/** Шрифт по умолчанию в ImageResponse не содержит кириллицы — берём Onest из Google Fonts, только нужные глифы. */
async function loadOnest(weight: number, text: string): Promise<ArrayBuffer | null> {
  "use cache";
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Onest:wght@${weight}&text=${encodeURIComponent(text)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const allText = ["CardForge", HEADLINE, SUBLINE, ...CHIPS].join("");
  const [regular, bold] = await Promise.all([loadOnest(400, allText), loadOnest(600, allText)]);
  const fonts = [
    regular && { name: "Onest", data: regular, weight: 400 as const, style: "normal" as const },
    bold && { name: "Onest", data: bold, weight: 600 as const, style: "normal" as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f5f5f0",
          color: "#141414",
          fontFamily: "Onest",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#141414",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 26,
                height: 32,
                borderRadius: 5,
                background: "#c8f26b",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "7px 5px",
              }}
            >
              <div style={{ width: 15, height: 4, borderRadius: 2, background: "#141414" }} />
              <div style={{ width: 10, height: 4, borderRadius: 2, background: "#141414", opacity: 0.45 }} />
              <div style={{ width: 12, height: 4, borderRadius: 2, background: "#141414", opacity: 0.45 }} />
            </div>
          </div>
          <span style={{ fontSize: 34, fontWeight: 600 }}>CardForge</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 980 }}>
            {HEADLINE}
          </div>
          <div style={{ fontSize: 28, color: "#4a4a44", maxWidth: 940, lineHeight: 1.35 }}>{SUBLINE}</div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {CHIPS.map((c, i) => (
            <div
              key={c}
              style={{
                display: "flex",
                fontSize: 22,
                padding: "8px 16px",
                borderRadius: 10,
                background: i < 2 ? "#c8f26b" : "#ffffff",
                color: i < 2 ? "#24390a" : "#4a4a44",
                border: i < 2 ? "1px solid #b4e24a" : "1px solid #e4e4dc",
              }}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
