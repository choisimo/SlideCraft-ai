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

async function http<T>(method: HttpMethod, path: string, body?: unknown, init?: RequestInit): Promise<T> {
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
    let detail: unknown = undefined;
    try { detail = await res.json(); } catch { /* ignore */ }
    const err = new Error((detail as { message?: string })?.message || res.statusText);
    (err as Error & { status?: number; detail?: unknown }).status = res.status;
    (err as Error & { status?: number; detail?: unknown }).detail = detail;
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
  objectKey: string;
  completeUrl: string;
}
export interface UploadPartResponse {
  partNumber: number;
  etag: string;
}
export interface UploadCompleteResponse {
  uploadId: string;
  objectKey: string;
  size: number;
  status: string;
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
  progress?: number;
  error?: { code?: string; message?: string };
  result?: { documentId?: string; exportUrl?: string };
}

export interface Document {
  id: string;
  jobId: string;
  title: string;
  description?: string;
  tags?: string[];
  slideCount: number;
  createdAt: string;
  updatedAt: string;
  status: string;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateDocumentRequest {
  jobId: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface CreateDocumentResponse {
  documentId: string;
  title: string;
  slideCount: number;
  createdAt: string;
}

export interface UpdateDocumentRequest {
  title?: string;
  description?: string;
  tags?: string[];
}

export interface ExportRequest {
  documentId: string;
  format: "pptx" | "pdf";
  options?: {
    includeNotes?: boolean;
    preserveAnimations?: boolean;
    pageSize?: string;
    orientation?: "portrait" | "landscape";
    quality?: "low" | "medium" | "high";
    includeSlideNumbers?: boolean;
    startSlide?: number;
    endSlide?: number | null;
  };
}

export interface ExportResponse {
  exportId: string;
  status: string;
  message: string;
}

export interface ExportStatusResponse {
  exportId: string;
  documentId: string;
  format: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  message: string;
  downloadUrl?: string;
  downloadExpiry?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ChatRequestBody {
  documentId?: string;
  selection?: Record<string, unknown>;
  messages: AIChatMessage[];
  model?: string;
}

// --- SSE helpers (POST streaming) ---
export interface StreamHandlers {
  onToken?: (token: string) => void;
  onMessage?: (payload: unknown) => void;
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
      const payload: unknown = JSON.parse(dataRaw);
      handlers.onMessage?.(payload);
      if (typeof (payload as Record<string, unknown>)?.content === "string") {
        handlers.onToken?.((payload as { content: string }).content);
      } else if (Array.isArray((payload as Record<string, unknown>)?.choices)) {
        const choices = (payload as { choices: Array<{ delta?: { content?: string; text?: string } }> }).choices;
        const delta = choices[0]?.delta?.content ?? choices[0]?.delta?.text;
        if (typeof delta === "string") handlers.onToken?.(delta);
      }
      if ((payload as { done?: boolean })?.done === true) handlers.onClose?.();
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
      (err as Error & { status?: number }).status = res.status;
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
      if ((e as Error & { name?: string })?.name === "AbortError") return;
      body.onError?.(e);
      throw e;
    }
  })();

  return {
    cancel: () => controller.abort(),
    done,
  };
}

async function uploadMultipartFile(file: File, onProgress?: (progress: number) => void): Promise<UploadCompleteResponse> {
  const initResponse = await api.initUpload({
    filename: file.name,
    size: file.size,
    contentType: file.type
  });

  const CHUNK_SIZE = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const parts: Array<{ partNumber: number; etag: string }> = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('file', chunk);

    const partResponse = await fetch(
      join(`/uploads/${initResponse.uploadId}/parts/${i + 1}`),
      {
        method: 'POST',
        headers: authHeader(),
        body: formData,
      }
    );

    if (!partResponse.ok) {
      throw new Error(`Failed to upload part ${i + 1}`);
    }

    const partData: UploadPartResponse = await partResponse.json();
    parts.push({ partNumber: partData.partNumber, etag: partData.etag });

    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }

  return api.completeUpload(initResponse.uploadId, parts);
}

async function directUpload(file: File, onProgress?: (progress: number) => void): Promise<UploadCompleteResponse> {
  const initResponse = await api.initUpload({
    filename: file.name,
    size: file.size,
    contentType: file.type
  });

  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response: UploadCompleteResponse = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          reject(new Error('Failed to parse upload response'));
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('POST', join(`/uploads/${initResponse.uploadId}/direct`));
    const headers = authHeader();
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.send(formData);
  });
}

export const api = {
  initUpload: (req: UploadInitRequest) => http<UploadInitResponse>("POST", "/uploads/init", req),
  
  uploadPart: async (uploadId: string, partNumber: number, chunk: Blob): Promise<UploadPartResponse> => {
    const formData = new FormData();
    formData.append('file', chunk);
    
    const res = await fetch(join(`/uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}`), {
      method: 'POST',
      headers: authHeader(),
      body: formData,
    });
    
    if (!res.ok) {
      throw new Error(`Failed to upload part ${partNumber}`);
    }
    
    return res.json();
  },
  
  completeUpload: (uploadId: string, parts: Array<{ partNumber: number; etag: string }>) =>
    http<UploadCompleteResponse>("POST", `/uploads/${encodeURIComponent(uploadId)}/complete`, { parts }),

  uploadFile: uploadMultipartFile,
  uploadFileDirect: directUpload,

  postConvert: (req: ConvertRequest) => http<{ jobId: string }>("POST", "/convert", req),
  getJob: (id: string) => http<Job>("GET", `/jobs/${encodeURIComponent(id)}`),

  createDocument: (req: CreateDocumentRequest) => http<CreateDocumentResponse>("POST", "/documents", req),
  getDocument: (id: string) => http<Document>("GET", `/documents/${encodeURIComponent(id)}`),
  updateDocument: (id: string, req: UpdateDocumentRequest) => 
    http<Document>("PATCH", `/documents/${encodeURIComponent(id)}`, req),
  deleteDocument: (id: string) => http<void>("DELETE", `/documents/${encodeURIComponent(id)}`),
  listDocuments: (params?: { search?: string; tags?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.tags) query.set('tags', params.tags);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    return http<DocumentListResponse>("GET", `/documents?${query.toString()}`);
  },

  initExport: (req: ExportRequest) => http<ExportResponse>("POST", "/exports/init", req),
  getExportStatus: (exportId: string) => http<ExportStatusResponse>("GET", `/exports/${encodeURIComponent(exportId)}`),
  downloadExport: (exportId: string): string => join(`/exports/${encodeURIComponent(exportId)}/download`),
  cancelExport: (exportId: string) => http<void>("DELETE", `/exports/${encodeURIComponent(exportId)}`),

  postAIChat: (req: ChatRequestBody) => http<{ messageId: string; content: string }>("POST", "/ai/chat", req),

  streamAIChat,
};
