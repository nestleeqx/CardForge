export type Marketplace = "ozon" | "wb";
export type Tone = "neutral" | "selling" | "premium";
export type Length = "short" | "medium" | "long";
export type ProductStatus = "queued" | "running" | "done" | "error";
export type CardField = "title" | "description" | "attributes" | "keywords";
export type SourceField = "sku" | "name" | "category" | "brand" | "attributes" | "photo";

export interface Attribute {
  name: string;
  value: string;
}

export interface SourceProduct {
  sku: string;
  name: string;
  category: string;
  brand: string;
  attributes: Attribute[];
  photo: string;
  /** Размер фото, если сервер смог его открыть по ссылке */
  photo_width?: number | null;
  photo_height?: number | null;
  /** Вес файла в байтах, если сервер его сообщил */
  photo_size?: number | null;
  photo_error?: string | null;
}

export interface CardResult {
  title: string;
  description: string;
  attributes: Attribute[];
  keywords: string[];
  notes: string[];
}

export interface CardWarning {
  code:
    | "missing_data"
    | "too_long"
    | "too_short"
    | "forbidden_word"
    | "suspected_fabrication"
    | "keywords_count"
    | "model_note"
    | "photo";
  field: CardField | null;
  message: string;
  terms: string[];
}

export interface Product {
  id: string;
  row_index: number;
  status: ProductStatus;
  error: string | null;
  attempts: number;
  source: SourceProduct;
  result: CardResult | null;
  warnings: CardWarning[];
  edited: boolean;
  updated_at: string;
}

export interface BatchSummary {
  id: string;
  filename: string;
  marketplace: Marketplace;
  tone: Tone;
  length: Length;
  is_demo: boolean;
  created_at: string;
  total: number;
  counts: Record<ProductStatus, number>;
  warnings: number;
}

export interface Batch extends BatchSummary {
  products: Product[];
}

export interface Preview {
  filename: string;
  columns: string[];
  rows: Record<string, string>[];
  suggested_mapping: Record<SourceField, string | null>;
}

export interface Limits {
  max_rows_per_file: number;
  max_file_bytes: number;
  batches_per_hour: number;
  generations_per_hour: number;
  batches_left: number;
  generations_left: number;
  provider: string;
}
