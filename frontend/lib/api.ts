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

const NETWORK_ERROR = "Не удалось связаться с сервером. Проверьте подключение к интернету и попробуйте ещё раз.";
const SERVER_ERROR = "Что-то пошло не так. Попробуйте ещё раз через минуту.";

/** Текст ошибки для пользователя: понятные сообщения API показываем как есть,
 *  технические (коды 5xx, ответы валидации FastAPI) заменяем общими формулировками. */
async function errorMessage(resp: Response): Promise<string> {
  let detail: unknown;
  try {
    detail = (await resp.json()).detail;
  } catch {}
  // 502 — наш ответ «нейросеть не ответила», он уже написан для пользователя
  if (typeof detail === "string" && (resp.status < 500 || resp.status === 502)) return detail;
  if (resp.status === 422) return "Проверьте введённые данные и попробуйте ещё раз.";
  return SERVER_ERROR;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Visitor-Id", visitorId());
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let resp: Response;
  try {
    resp = await fetch(API_URL + path, { ...init, headers });
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  if (!resp.ok) throw new ApiError(await errorMessage(resp), resp.status);
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

async function download(path: string, fallbackName: string) {
  let resp: Response;
  try {
    resp = await fetch(API_URL + path, { headers: { "X-Visitor-Id": visitorId() } });
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  if (!resp.ok) throw new ApiError(await errorMessage(resp), resp.status);
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
  restoreDemo: () => request<Batch>("/api/demo/restore", { method: "POST" }),

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
