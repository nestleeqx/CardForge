import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Рабочее пространство /app персональное и закрыто от индексации — в карте только лендинг
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: "monthly", priority: 1 }];
}
