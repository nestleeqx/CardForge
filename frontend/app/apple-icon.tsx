import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Тот же знак, что в icon.svg, нарисованный блоками: Satori не растеризует произвольный SVG с трансформациями
export default function AppleIcon() {
  const bar = (width: number, opacity = 1) => (
    <div style={{ width, height: 12, borderRadius: 6, background: "#141414", opacity }} />
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#141414",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 78,
            height: 100,
            borderRadius: 14,
            background: "rgba(200,242,107,.35)",
            transform: "rotate(-9deg) translate(-8px, 2px)",
          }}
        />
        <div
          style={{
            width: 76,
            height: 96,
            borderRadius: 14,
            background: "#c8f26b",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "20px 14px",
            transform: "translate(6px, 0)",
          }}
        >
          {bar(46)}
          {bar(31, 0.45)}
          {bar(38, 0.45)}
        </div>
      </div>
    ),
    size,
  );
}
