import { config } from "./config";

export type AIChatRole = "system" | "user" | "assistant";
export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const API_BASE = `${config.apiBaseUrl.replace(/\/$/, "")}/v1`;

function join(path: string): string {
  const base = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function authHeader(): Record<string, string> {
  try {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function http<T>(method: HttpMethod, path: string, body?: any, init?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...authHeader(),
    ...(init?.headers || {}),
  };
  const res = await fetch(join(path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
  if (!res.ok) {
    let detail: any = undefined;
    try { detail = await res.json(); } catch { /* ignore */ }
    const err = new Error(detail?.message || res.statusText);
    (err as any).status = res.status;
    (err as any).detail = detail;
    throw err;
  }
  // If no content
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  // Fallback to text
  return (await res.text()) as unknown as T;
}

export interface UploadInitRequest {
  filename: string;
  size: number;
  contentType: string;
}
export interface UploadInitResponse {
  uploadId: string;
  parts: Array<{ partNumber: number; url: string }>;
  completeUrl: string;
}

export type SourceType = "pptx" | "pdf" | "docx";

export interface ConvertRequest {
  objectKey: string;
  sourceType: SourceType;
  documentTitle?: string;
}
export interface Job {
  id: string;
  type: string;
  status: "pending" | "running" | "succeeded" | "failed" | "canceled";
  progress?: number; // 0-100
  error?: { code?: string; message?: string };
  result?: { documentId?: string; exportUrl?: string };
}

export interface CreateDocumentResponse { documentId: string }

export interface ExportRequest { documentId: string; format: "pptx" | "pdf" }

export interface ChatRequestBody {
  documentId?: string;
  selection?: Record<string, unknown>;
  messages: AIChatMessage[];
  model?: string;
}

// --- SSE helpers (POST streaming) ---
export interface StreamHandlers {
  onToken?: (token: string) => void;
  onMessage?: (payload: any) => void; // raw JSON per event
  onError?: (err: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

function parseSSEChunk(buffer: string, handlers: StreamHandlers) {
  // Splits on double-newline. Each event can have multiple lines starting with optional 'event:' and one or more 'data:'
  const events = buffer.split(/\n\n/);
  for (const evt of events) {
    const lines = evt.split(/\n/).filter(Boolean);
    if (!lines.length) continue;
    let eventName: string | undefined;
    const dataParts: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataParts.push(line.slice(5).trimStart());
      }
    }
    const dataRaw = dataParts.join("\n");
    if (!dataRaw) continue;

    // OpenAI-like terminator
    if (dataRaw === "[DONE]" || dataRaw === "DONE") {
      handlers.onClose?.();
      continue;
    }

    try {
      const payload = JSON.parse(dataRaw);
      handlers.onMessage?.(payload);
      // Common shapes: { content: string, done?: boolean } or { choices: [{ delta: { content } }] }
      if (typeof payload?.content === "string") {
        handlers.onToken?.(payload.content);
      } else if (payload?.choices?.length) {
        const delta = payload.choices[0]?.delta?.content ?? payload.choices[0]?.delta?.text;
        if (typeof delta === "string") handlers.onToken?.(delta);
      }
      if (payload?.done === true) handlers.onClose?.();
    } catch {
      // Treat as plain text token
      handlers.onToken?.(dataRaw);
    }
  }
}

export function streamAIChat(
  body: ChatRequestBody & { signal?: AbortSignal } & StreamHandlers
): { cancel: () => void; done: Promise<void> } {
  const controller = new AbortController();
  const signal = body.signal || controller.signal;

  const url = new URL(join("/ai/chat"));
  url.searchParams.set("stream", "1");

  const done = (async () => {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...authHeader(),
      },
      body: JSON.stringify({
        documentId: body.documentId,
        selection: body.selection,
        messages: body.messages,
        model: body.model,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(text || res.statusText);
      (err as any).status = res.status;
      throw err;
    }

    body.onOpen?.();

    const reader = res.body?.getReader();
    if (!reader) {
      // No body to read; treat as closed
      body.onClose?.();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done: rDone, value } = await reader.read();
        if (rDone) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete events in buffer; keep trailing partial chunk
        const parts = buffer.split(/\n\n(?=event:|data:|$)/);
        // All except last are complete
        for (let i = 0; i < parts.length - 1; i++) {
          parseSSEChunk(parts[i], body);
        }
        buffer = parts[parts.length - 1] || "";
      }
      if (buffer) parseSSEChunk(buffer, body);
      body.onClose?.();
    } catch (e) {
      if ((e as any)?.name === "AbortError") return; // silent on cancel
      body.onError?.(e);
      throw e;
    }
  })();

  return {
    cancel: () => controller.abort(),
    done,
  };
}

export const api = {
  // Uploads (multipart pre-signed flow)
  postUploadInit: (req: UploadInitRequest) => http<UploadInitResponse>("POST", "/uploads/init", req),
  // Note: server contracts may vary by storage provider; align with backend routes
  patchUploadPart: (uploadId: string, partNumber: number, body: any) =>
    http("PATCH", `/uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}`, body),
  postUploadComplete: (uploadId: string, parts: Array<{ etag: string; partNumber: number }>) =>
    http("POST", `/uploads/${encodeURIComponent(uploadId)}/complete`, { parts }),

  // Conversion + Jobs
  postConvert: (req: ConvertRequest) => http<{ jobId: string }>("POST", "/convert", req),
  getJob: (id: string) => http<Job>("GET", `/jobs/${encodeURIComponent(id)}`),

  // Documents
  postDocuments: (jobId: string) => http<CreateDocumentResponse>("POST", "/documents", { jobId }),
  getDocument: (id: string) => http<any>("GET", `/documents/${encodeURIComponent(id)}`),

  // Export
  postExport: (req: ExportRequest) => http<{ jobId: string }>("POST", "/export", req),
  getExportDownload: (jobId: string) => http<string>("GET", `/exports/${encodeURIComponent(jobId)}/download`),

  // AI Chat (non-stream)
  postAIChat: (req: ChatRequestBody) => http<{ messageId: string; content: string }>("POST", "/ai/chat", req),

  // Stream helper (SSE over POST)
  streamAIChat,
};
