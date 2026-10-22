import type { ReactNode } from "react";
import type { CardField, CardWarning } from "@/lib/types";

export type Mark = { term: string; tone: "warn" | "danger" };

/** Фрагменты поля, которые проверки пометили как запрещённые или выдуманные. */
export function marksFor(warnings: CardWarning[], field: CardField): Mark[] {
  return warnings
    .filter((w) => w.field === field && w.terms?.length)
    .flatMap((w) => w.terms.map((term) => ({ term, tone: w.code === "forbidden_word" ? "danger" : "warn" }) as Mark));
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlight({ text, marks }: { text: string; marks: Mark[] }): ReactNode {
  if (!marks.length) return text;
  const byTerm = new Map(marks.map((m) => [m.term.toLowerCase(), m.tone]));
  // Длинные фрагменты первыми, чтобы «лучший» не перекрывался «лучш»
  const terms = [...byTerm.keys()].sort((a, b) => b.length - a.length).map(escape);
  const parts = text.split(new RegExp(`(${terms.join("|")})`, "gi"));
  return parts.map((part, i) => {
    const tone = byTerm.get(part.toLowerCase());
    return tone ? (
      <mark key={i} className={tone === "danger" ? "hl-danger" : "hl-warn"}>
        {part}
      </mark>
    ) : (
      part
    );
  });
}
