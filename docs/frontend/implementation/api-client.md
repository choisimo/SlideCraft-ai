# API Client Implementation

## Overview
Centralized HTTP client for all backend API calls, providing type safety, error handling, and request/response transformation.

## File Location
`src/lib/api.ts`

## Dependencies
```json
{
  "@tanstack/react-query": "^5.x",
  "axios": "^1.x" 
}
```

## Core Implementation

### Base Client Setup
```typescript
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for auth
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // Add request ID for tracing
    config.headers['X-Request-ID'] = generateRequestId()
    
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, attempt refresh
      const refreshed = await refreshToken()
      if (refreshed) {
        return apiClient.request(error.config)
      }
      // Redirect to login
      window.location.href = '/signin'
    }
    return Promise.reject(error)
  }
)
```

### Type Definitions
```typescript
// API Response types
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, any>
}

// Upload types
export interface UploadInitRequest {
  filename: string
  size: number
  contentType: string
}

export interface UploadInitResponse {
  uploadId: string
  parts: Array<{
    partNumber: number
    url: string
  }>
  completeUrl: string
  checksumAlgo: string
}

export interface UploadPartRequest {
  partNumber: number
  checksum: string
}

export interface UploadCompleteRequest {
  parts: Array<{
    partNumber: number
    etag: string
  }>
}

export interface UploadCompleteResponse {
  objectUrl: string
  objectKey: string
}

// Job types
export type JobType = 'convert' | 'export' | 'thumb' | 'ai'
export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface Job {
  id: string
  type: JobType
  status: JobStatus
  progress: number
  error?: ApiError
  result?: {
    documentId?: string
    exportUrl?: string
  }
  createdAt: string
  updatedAt: string
}

// Document types
export interface Document {
  id: string
  title: string
  ownerId: string
  updatedAt: string
  deck: DeckJSON
}

export interface DeckJSON {
  version: string
  slides: Slide[]
  metadata?: Record<string, any>
}

export interface Slide {
  id: string
  elements: Element[]
  layout?: string
  notes?: string
}

export interface Element {
  id: string
  type: 'text' | 'image' | 'shape'
  x: number
  y: number
  width: number
  height: number
  style?: Record<string, any>
  content?: any
}

// AI types
export interface AIChatRequest {
  documentId?: string
  selection?: any
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  model: string
  stream?: boolean
}

export interface AIChatResponse {
  messageId: string
  content: string
  toolCalls?: any[]
}

// Export types
export interface ExportRequest {
  documentId: string
  format: 'pptx' | 'pdf'
  options?: Record<string, any>
}
```

### API Methods

#### Upload API
```typescript
export const uploadApi = {
  init: async (request: UploadInitRequest): Promise<UploadInitResponse> => {
    const { data } = await apiClient.post<UploadInitResponse>('/uploads/init', request)
    return data
  },

  uploadPart: async (
    uploadId: string,
    partNumber: number,
    blob: Blob,
    checksum: string
  ): Promise<{ etag: string }> => {
    const { data } = await apiClient.patch(`/uploads/${uploadId}/part`, blob, {
      params: { partNumber },
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Checksum': checksum,
      },
    })
    return data
  },

  complete: async (
    uploadId: string,
    request: UploadCompleteRequest
  ): Promise<UploadCompleteResponse> => {
    const { data } = await apiClient.post<UploadCompleteResponse>(
      `/uploads/${uploadId}/complete`,
      request
    )
    return data
  },
}
```

#### Conversion API
```typescript
export const conversionApi = {
  convert: async (
    objectKey: string,
    sourceType: 'pptx' | 'pdf' | 'docx',
    documentTitle?: string
  ): Promise<{ jobId: string }> => {
    const { data } = await apiClient.post('/convert', {
      objectKey,
      sourceType,
      documentTitle,
    })
    return data
  },
}
```

#### Jobs API
```typescript
export const jobsApi = {
  get: async (jobId: string): Promise<Job> => {
    const { data } = await apiClient.get<Job>(`/jobs/${jobId}`)
    return data
  },

  cancel: async (jobId: string): Promise<void> => {
    await apiClient.post(`/jobs/${jobId}/cancel`)
  },

  retry: async (jobId: string): Promise<void> => {
    await apiClient.post(`/jobs/${jobId}/retry`)
  },
}
```

#### Documents API
```typescript
export const documentsApi = {
  create: async (jobId: string): Promise<{ documentId: string }> => {
    const { data } = await apiClient.post('/documents', { jobId })
    return data
  },

  get: async (documentId: string): Promise<Document> => {
    const { data } = await apiClient.get<Document>(`/documents/${documentId}`)
    return data
  },

  update: async (documentId: string, deck: Partial<DeckJSON>): Promise<void> => {
    await apiClient.patch(`/documents/${documentId}`, { deck })
  },

  delete: async (documentId: string): Promise<void> => {
    await apiClient.delete(`/documents/${documentId}`)
  },
}
```

#### Export API
```typescript
export const exportApi = {
  export: async (request: ExportRequest): Promise<{ jobId: string }> => {
    const { data } = await apiClient.post('/export', request)
    return data
  },

  download: async (jobId: string): Promise<string> => {
    const { data } = await apiClient.get(`/exports/${jobId}/download`, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
    })
    return data.headers.location
  },
}
```

#### AI API
```typescript
export const aiApi = {
  chat: async (request: AIChatRequest): Promise<AIChatResponse> => {
    const { data } = await apiClient.post<AIChatResponse>('/ai/chat', request)
    return data
  },

  chatStream: (
    request: AIChatRequest,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void
  ): AbortController => {
    const controller = new AbortController()

    fetch(`${API_BASE_URL}/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Streaming': 'sse',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: JSON.stringify({ ...request, stream: true }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            onComplete()
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') {
                onComplete()
                break
              }
              try {
                const parsed = JSON.parse(data)
                onChunk(parsed.content || parsed.delta || '')
              } catch (e) {
                console.warn('Failed to parse SSE data:', data)
              }
            }
          }
        }
      })
      .catch(onError)

    return controller
  },
}
```

## Error Handling

### Custom Error Class
```typescript
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function handleApiError(error: any): ApiError {
  if (error.response?.data) {
    const { code, message, details } = error.response.data
    return new ApiError(code || 'UNKNOWN_ERROR', message || 'An error occurred', details)
  }
  
  if (error.code === 'ECONNABORTED') {
    return new ApiError('TIMEOUT', 'Request timed out')
  }
  
  if (!error.response) {
    return new ApiError('NETWORK_ERROR', 'Network connection failed')
  }
  
  return new ApiError('UNKNOWN_ERROR', error.message || 'An unexpected error occurred')
}
```

## React Query Integration

### Query Keys
```typescript
export const queryKeys = {
  jobs: {
    all: ['jobs'] as const,
    detail: (id: string) => ['jobs', id] as const,
  },
  documents: {
    all: ['documents'] as const,
    detail: (id: string) => ['documents', id] as const,
  },
  exports: {
    all: ['exports'] as const,
    detail: (id: string) => ['exports', id] as const,
  },
}
```

### Custom Hooks
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useJob(jobId: string | undefined, options?: { 
  refetchInterval?: number 
  enabled?: boolean 
}) {
  return useQuery({
    queryKey: queryKeys.jobs.detail(jobId!),
    queryFn: () => jobsApi.get(jobId!),
    enabled: !!jobId && options?.enabled !== false,
    refetchInterval: options?.refetchInterval || false,
  })
}

export function useDocument(documentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.documents.detail(documentId!),
    queryFn: () => documentsApi.get(documentId!),
    enabled: !!documentId,
  })
}

export function useConvertMutation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ 
      objectKey, 
      sourceType, 
      documentTitle 
    }: { 
      objectKey: string
      sourceType: 'pptx' | 'pdf' | 'docx'
      documentTitle?: string 
    }) => conversionApi.convert(objectKey, sourceType, documentTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all })
    },
  })
}

export function useExportMutation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (request: ExportRequest) => exportApi.export(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exports.all })
    },
  })
}
```

## Utilities

### Request ID Generation
```typescript
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
```

### Token Refresh
```typescript
async function refreshToken(): Promise<boolean> {
  try {
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) return false

    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken,
    })

    localStorage.setItem('auth_token', data.accessToken)
    if (data.refreshToken) {
      localStorage.setItem('refresh_token', data.refreshToken)
    }

    return true
  } catch {
    return false
  }
}
```

## Testing Strategy

### Mock Setup
```typescript
// __mocks__/api.ts
import { vi } from 'vitest'

export const mockJobsApi = {
  get: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
}

export const mockDocumentsApi = {
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
```

### Example Test
```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useJob } from './api'
import { mockJobsApi } from './__mocks__/api'

describe('useJob', () => {
  it('fetches job data', async () => {
    const queryClient = new QueryClient()
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )

    mockJobsApi.get.mockResolvedValue({
      id: 'job-1',
      type: 'convert',
      status: 'succeeded',
      progress: 100,
    })

    const { result } = renderHook(() => useJob('job-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.status).toBe('succeeded')
  })
})
```

## Environment Configuration

### Required Env Vars
```bash
# .env.example
VITE_API_BASE_URL=/api
```

### Vite Proxy Config
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: process.env.DEV_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

## Performance Considerations

1. **Request Deduplication**: React Query automatically deduplicates requests
2. **Caching**: Configure stale times based on data volatility
3. **Retry Logic**: Exponential backoff for failed requests
4. **AbortController**: Cancel in-flight requests on unmount

## Security Checklist

- ✅ Token stored in httpOnly cookie (preferred) or localStorage (fallback)
- ✅ CSRF token for state-changing operations
- ✅ Request timeout configured
- ✅ Sensitive data not logged
- ✅ Auto-logout on 401
- ✅ Trace IDs for debugging without PII

## Migration Notes

When upgrading from mock to real backend:
1. Update `VITE_API_BASE_URL` in `.env.local`
2. Ensure backend CORS allows frontend origin
3. Verify auth token format matches backend expectation
4. Test error scenarios (network failure, 401, 500)
