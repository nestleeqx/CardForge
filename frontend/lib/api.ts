import type {
  Batch,
  BatchSummary,
  CardField,
  CardResult,
  Length,
  Limits,
  Marketplace,
  Preview,
  Product,
  SourceField,
  Tone,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

const VISITOR_KEY = "cardforge:visitor";

/** Анонимный id посетителя: у каждого своя копия демо-партии и история загрузок. */
export function visitorId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
  } catch {
    // Приватный режим без localStorage — id живёт до перезагрузки
    id ??= (globalThis as { __visitor?: string }).__visitor ??= crypto.randomUUID();
  }
  return id;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Visitor-Id", visitorId());
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let resp: Response;
  try {
    resp = await fetch(API_URL + path, { ...init, headers });
  } catch {
    throw new ApiError("Сервер недоступен. Проверьте, что бэкенд запущен.", 0);
  }
  if (!resp.ok) {
    let message = `Ошибка ${resp.status}`;
    try {
      const data = await resp.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {}
    throw new ApiError(message, resp.status);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

async function download(path: string, fallbackName: string) {
  const resp = await fetch(API_URL + path, { headers: { "X-Visitor-Id": visitorId() } });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new ApiError(data.detail ?? `Ошибка ${resp.status}`, resp.status);
  }
  const disposition = resp.headers.get("Content-Disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/.exec(disposition);
  const name = match ? decodeURIComponent(match[1] ?? match[2]) : fallbackName;
  const url = URL.createObjectURL(await resp.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  limits: () => request<Limits>("/api/limits"),
  batches: () => request<BatchSummary[]>("/api/batches"),
  batch: (id: string) => request<Batch>(`/api/batches/${id}`),
  deleteBatch: (id: string) => request<void>(`/api/batches/${id}`, { method: "DELETE" }),
  retryFailed: (id: string) => request<Batch>(`/api/batches/${id}/retry-failed`, { method: "POST" }),
  exportBatch: (id: string) => download(`/api/batches/${id}/export`, "cards.xlsx"),
  downloadSample: () => download("/api/uploads/sample", "uyutny-ugol.csv"),
  resetDemo: () => request<Batch>("/api/demo/reset", { method: "POST" }),

  preview: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Preview>("/api/uploads/preview", { method: "POST", body: form });
  },

  createBatch: (body: {
    filename: string;
    mapping: Record<SourceField, string | null>;
    rows: Record<string, string>[];
    marketplace: Marketplace;
    tone: Tone;
    length: Length;
    extra_as_attributes: boolean;
  }) => request<Batch>("/api/batches", { method: "POST", body: JSON.stringify(body) }),

  editProduct: (id: string, patch: Partial<Omit<CardResult, "notes">>) =>
    request<Product>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  regenerate: (id: string, field: CardField, comment: string) =>
    request<Product>(`/api/products/${id}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ field, comment }),
    }),
  retryProduct: (id: string) => request<Product>(`/api/products/${id}/retry`, { method: "POST" }),
};
