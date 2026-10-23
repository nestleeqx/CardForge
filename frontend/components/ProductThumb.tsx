"use client";

import { ImageOff } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { displayPhoto } from "@/lib/photos";

/** Фото почти совпадает с рамкой по пропорциям — тот же допуск 3%, что и в проверке 3:4 на сервере. */
function fitsFrame(img: HTMLImageElement) {
  if (!img.naturalHeight || !img.clientHeight) return false;
  const photo = img.naturalWidth / img.naturalHeight;
  const frame = img.clientWidth / img.clientHeight;
  return Math.abs(photo / frame - 1) <= 0.03;
}

/** Фото товара по ссылке из таблицы; если ссылки нет или она не открылась — нейтральная заглушка.
 *  fit="contain" показывает товар целиком на белом фоне — как в карточке маркетплейса.
 *  Если фото почти совпадает с рамкой (например, 1502×1999 в рамке 3:4), оно заполняет её целиком,
 *  иначе по краю осталась бы полоска фона в пару пикселей. */
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
  const [fills, setFills] = useState(false);
  if (!src || failed) {
    return (
      <span className={`grid shrink-0 place-items-center rounded-lg bg-sunken text-ink-3 ${className}`}>
        <ImageOff className="size-1/3" />
      </span>
    );
  }
  const cover = fit === "cover" || fills;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ссылки на фото приходят из таблицы пользователя, домен заранее неизвестен
    <img
      src={displayPhoto(src)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      onLoad={fit === "contain" ? (e: SyntheticEvent<HTMLImageElement>) => setFills(fitsFrame(e.currentTarget)) : undefined}
      className={`shrink-0 rounded-lg ${cover ? "bg-sunken object-cover" : "bg-white object-contain"} ${className}`}
    />
  );
}
