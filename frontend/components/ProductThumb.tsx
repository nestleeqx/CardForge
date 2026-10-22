"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

/** Фото товара по ссылке из таблицы; если ссылки нет или она не открылась — нейтральная заглушка.
 *  fit="contain" показывает товар целиком на белом фоне — как в карточке маркетплейса. */
export function ProductThumb({
  src,
  alt,
  className = "size-10",
  fit = "cover",
}: {
  src: string;
  alt: string;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`grid shrink-0 place-items-center rounded-lg bg-sunken text-ink-3 ${className}`}>
        <ImageOff className="size-1/3" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ссылки на фото приходят из таблицы пользователя, домен заранее неизвестен
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-lg ${fit === "contain" ? "bg-white object-contain" : "bg-sunken object-cover"} ${className}`}
    />
  );
}
