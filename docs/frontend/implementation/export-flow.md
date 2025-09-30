# Export Flow Implementation

## Overview
End-to-end export functionality for downloading presentations as PPTX or PDF files, including job creation, real-time progress tracking, download handling, and error management.

## File Locations
- Export UI Component: `src/components/ExportDialog.tsx` (to be created)
- API Integration: `src/lib/api.ts` (existing)
- Export Hooks: `src/hooks/useExport.ts` (to be created)
- Job Polling: `src/hooks/useJobPolling.ts` (to be created)

## Dependencies
```json
{
  "@tanstack/react-query": "^5.x",
  "@radix-ui/react-dialog": "^1.x",
  "@radix-ui/react-select": "^2.x",
  "@radix-ui/react-progress": "^1.x"
}
```

## Export Architecture

### Export Flow Stages
```
1. User initiates export (selects format + options)
   ↓
2. POST /export → { jobId }
   ↓
3. Poll GET /jobs/:jobId (status: pending → running → succeeded)
   ↓
4. GET /exports/:jobId/download → signed URL
   ↓
5. Download file via browser
   ↓
6. Show success notification + cleanup
```

### Export Request Flow
```typescript
interface ExportRequest {
  documentId: string
  format: 'pptx' | 'pdf'
  options?: ExportOptions
}

interface ExportOptions {
  // PPTX options
  includeNotes?: boolean
  preserveAnimations?: boolean
  masterTemplate?: string
  
  // PDF options
  pageSize?: 'A4' | 'Letter' | 'Custom'
  orientation?: 'portrait' | 'landscape'
  quality?: 'low' | 'medium' | 'high'
  includeSlideNumbers?: boolean
  
  // Common options
  startSlide?: number
  endSlide?: number
}

interface ExportJob extends Job {
  type: 'export'
  result?: {
    exportUrl?: string
    fileSize?: number
    expiresAt?: string
  }
}
```

## API Integration

### Export Endpoints (Already in api.ts)
```typescript
// src/lib/api.ts (existing)
export const api = {
  // Export
  postExport: (req: ExportRequest) => 
    http<{ jobId: string }>("POST", "/export", req),
  
  getExportDownload: (jobId: string) => 
    http<string>("GET", `/exports/${encodeURIComponent(jobId)}/download`),
  
  // Jobs (for polling)
  getJob: (id: string) => 
    http<Job>("GET", `/jobs/${encodeURIComponent(id)}`)
}
```

### Extended Types for Export
```typescript
// src/lib/api.ts (additions)
export interface ExportRequest {
  documentId: string
  format: 'pptx' | 'pdf'
  options?: ExportOptions
}

export interface ExportOptions {
  includeNotes?: boolean
  preserveAnimations?: boolean
  masterTemplate?: string
  pageSize?: 'A4' | 'Letter' | 'Custom'
  orientation?: 'portrait' | 'landscape'
  quality?: 'low' | 'medium' | 'high'
  includeSlideNumbers?: boolean
  startSlide?: number
  endSlide?: number
}

export interface ExportJobResult {
  exportUrl: string
  fileSize: number
  expiresAt: string
}
```

## Job Polling Hook

### useJobPolling Implementation
```typescript
// src/hooks/useJobPolling.ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Job } from '@/lib/api'
import { useEffect, useRef } from 'react'

interface UseJobPollingOptions {
  jobId: string
  enabled?: boolean
  onComplete?: (job: Job) => void
  onError?: (error: Error) => void
  pollingInterval?: number
  maxRetries?: number
}

export function useJobPolling({
  jobId,
  enabled = true,
  onComplete,
  onError,
  pollingInterval = 2000,
  maxRetries = 60 // 2 minutes max
}: UseJobPollingOptions) {
  const queryClient = useQueryClient()
  const retriesRef = useRef(0)
  const completedRef = useRef(false)

  const { data: job, error, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.getJob(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: (data) => {
      if (!data) return pollingInterval
      
      const status = data.status
      
      // Stop polling on terminal states
      if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
        return false
      }
      
      // Continue polling for pending/running
      if (status === 'pending' || status === 'running') {
        retriesRef.current += 1
        
        // Stop if max retries exceeded
        if (retriesRef.current > maxRetries) {
          return false
        }
        
        // Exponential backoff: 2s → 4s → 8s (capped at 8s)
        return Math.min(pollingInterval * Math.pow(1.5, Math.floor(retriesRef.current / 5)), 8000)
      }
      
      return false
    },
    retry: false
  })

  // Handle completion
  useEffect(() => {
    if (!job || completedRef.current) return

    if (job.status === 'succeeded') {
      completedRef.current = true
      onComplete?.(job)
    } else if (job.status === 'failed') {
      completedRef.current = true
      onError?.(new Error(job.error?.message || 'Export failed'))
    }
  }, [job, onComplete, onError])

  // Handle polling timeout
  useEffect(() => {
    if (retriesRef.current > maxRetries && job?.status === 'running') {
      onError?.(new Error('Export timeout: job is taking too long'))
    }
  }, [retriesRef.current, job, maxRetries, onError])

  return {
    job,
    error,
    isLoading,
    progress: job?.progress ?? 0,
    status: job?.status ?? 'pending',
    cancel: () => {
      queryClient.cancelQueries({ queryKey: ['job', jobId] })
    }
  }
}
```

## Export Hook

### useExport Implementation
```typescript
// src/hooks/useExport.ts
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, ExportRequest, Job } from '@/lib/api'
import { useJobPolling } from './useJobPolling'
import { toast } from 'sonner'

interface UseExportOptions {
  documentId: string
  onSuccess?: (downloadUrl: string) => void
  onError?: (error: Error) => void
}

export function useExport({ documentId, onSuccess, onError }: UseExportOptions) {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)

  // Create export job
  const exportMutation = useMutation({
    mutationFn: (req: Omit<ExportRequest, 'documentId'>) => 
      api.postExport({ documentId, ...req }),
    onSuccess: (data) => {
      setCurrentJobId(data.jobId)
      toast.info('Export started', {
        description: 'Your file is being generated...'
      })
    },
    onError: (error: any) => {
      toast.error('Export failed', {
        description: error.message || 'Failed to start export'
      })
      onError?.(error)
    }
  })

  // Poll export job
  const { job, progress, status, cancel } = useJobPolling({
    jobId: currentJobId || '',
    enabled: !!currentJobId,
    onComplete: async (completedJob) => {
      if (completedJob.status === 'succeeded') {
        try {
          // Get download URL
          const downloadUrl = await api.getExportDownload(completedJob.id)
          
          toast.success('Export complete', {
            description: 'Your file is ready to download',
            action: {
              label: 'Download',
              onClick: () => window.open(downloadUrl, '_blank')
            }
          })
          
          onSuccess?.(downloadUrl)
          setCurrentJobId(null)
        } catch (err: any) {
          toast.error('Download failed', {
            description: err.message || 'Failed to get download URL'
          })
          onError?.(err)
        }
      }
    },
    onError: (error) => {
      toast.error('Export failed', {
        description: error.message
      })
      onError?.(error)
      setCurrentJobId(null)
    }
  })

  const startExport = (format: 'pptx' | 'pdf', options?: ExportRequest['options']) => {
    exportMutation.mutate({ format, options })
  }

  const cancelExport = () => {
    if (currentJobId) {
      cancel()
      setCurrentJobId(null)
      toast.info('Export canceled')
    }
  }

  return {
    startExport,
    cancelExport,
    isExporting: !!currentJobId && (status === 'pending' || status === 'running'),
    progress,
    status,
    job,
    error: exportMutation.error
  }
}
```

## Export Dialog Component

### ExportDialog UI
```typescript
// src/components/ExportDialog.tsx
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useExport } from '@/hooks/useExport'
import { ExportOptions } from '@/lib/api'

interface ExportDialogProps {
  documentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportDialog({ documentId, open, onOpenChange }: ExportDialogProps) {
  const [format, setFormat] = useState<'pptx' | 'pdf'>('pptx')
  const [options, setOptions] = useState<ExportOptions>({
    includeNotes: true,
    preserveAnimations: false,
    pageSize: 'A4',
    orientation: 'landscape',
    quality: 'high',
    includeSlideNumbers: true
  })

  const { startExport, cancelExport, isExporting, progress, status } = useExport({
    documentId,
    onSuccess: (downloadUrl) => {
      // Auto-download
      window.open(downloadUrl, '_blank')
      onOpenChange(false)
    }
  })

  const handleExport = () => {
    startExport(format, options)
  }

  const handleCancel = () => {
    cancelExport()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Presentation</DialogTitle>
          <DialogDescription>
            Choose export format and options
          </DialogDescription>
        </DialogHeader>

        {isExporting ? (
          <ExportProgress progress={progress} status={status} onCancel={cancelExport} />
        ) : (
          <ExportOptions
            format={format}
            options={options}
            onFormatChange={setFormat}
            onOptionsChange={setOptions}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          {!isExporting && (
            <Button onClick={handleExport}>
              Export {format.toUpperCase()}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Export progress component
function ExportProgress({ 
  progress, 
  status, 
  onCancel 
}: { 
  progress: number
  status: string
  onCancel: () => void 
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {status === 'pending' && 'Preparing export...'}
            {status === 'running' && 'Generating file...'}
          </span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
      <Button variant="outline" onClick={onCancel} className="w-full">
        Cancel Export
      </Button>
    </div>
  )
}

// Export options component
function ExportOptions({
  format,
  options,
  onFormatChange,
  onOptionsChange
}: {
  format: 'pptx' | 'pdf'
  options: ExportOptions
  onFormatChange: (format: 'pptx' | 'pdf') => void
  onOptionsChange: (options: ExportOptions) => void
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>Format</Label>
        <Select value={format} onValueChange={(v) => onFormatChange(v as 'pptx' | 'pdf')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pptx">PowerPoint (.pptx)</SelectItem>
            <SelectItem value="pdf">PDF Document (.pdf)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {format === 'pptx' && (
        <PPTXOptions options={options} onChange={onOptionsChange} />
      )}

      {format === 'pdf' && (
        <PDFOptions options={options} onChange={onOptionsChange} />
      )}
    </div>
  )
}

// PPTX-specific options
function PPTXOptions({ 
  options, 
  onChange 
}: { 
  options: ExportOptions
  onChange: (options: ExportOptions) => void 
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="include-notes">Include speaker notes</Label>
        <Switch
          id="include-notes"
          checked={options.includeNotes}
          onCheckedChange={(checked) => 
            onChange({ ...options, includeNotes: checked })
          }
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="preserve-animations">Preserve animations</Label>
        <Switch
          id="preserve-animations"
          checked={options.preserveAnimations}
          onCheckedChange={(checked) => 
            onChange({ ...options, preserveAnimations: checked })
          }
        />
      </div>
    </div>
  )
}

// PDF-specific options
function PDFOptions({ 
  options, 
  onChange 
}: { 
  options: ExportOptions
  onChange: (options: ExportOptions) => void 
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Page Size</Label>
        <Select 
          value={options.pageSize} 
          onValueChange={(v) => onChange({ ...options, pageSize: v as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A4">A4</SelectItem>
            <SelectItem value="Letter">Letter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Orientation</Label>
        <Select 
          value={options.orientation} 
          onValueChange={(v) => onChange({ ...options, orientation: v as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="landscape">Landscape</SelectItem>
            <SelectItem value="portrait">Portrait</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Quality</Label>
        <Select 
          value={options.quality} 
          onValueChange={(v) => onChange({ ...options, quality: v as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low (smaller file)</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High (larger file)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="slide-numbers">Include slide numbers</Label>
        <Switch
          id="slide-numbers"
          checked={options.includeSlideNumbers}
          onCheckedChange={(checked) => 
            onChange({ ...options, includeSlideNumbers: checked })
          }
        />
      </div>
    </div>
  )
}
```

## Download Flow

### Browser Download Implementation
```typescript
// src/lib/download.ts
export async function downloadFile(url: string, filename?: string) {
  try {
    // Use anchor tag for direct download
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'presentation'
    a.target = '_blank'
    
    // Trigger download
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    
    return true
  } catch (error) {
    console.error('Download failed:', error)
    throw new Error('Failed to download file')
  }
}

// Alternative: fetch + blob for progress tracking
export async function downloadFileWithProgress(
  url: string,
  filename: string,
  onProgress?: (loaded: number, total: number) => void
) {
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`)
  }
  
  const contentLength = response.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : 0
  
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Response body is null')
  
  const chunks: Uint8Array[] = []
  let loaded = 0
  
  while (true) {
    const { done, value } = await reader.read()
    
    if (done) break
    
    chunks.push(value)
    loaded += value.length
    
    if (onProgress && total > 0) {
      onProgress(loaded, total)
    }
  }
  
  // Create blob and download
  const blob = new Blob(chunks)
  const blobUrl = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  
  URL.revokeObjectURL(blobUrl)
}
```

### Integration with Export Hook
```typescript
// Enhanced useExport with download handling
export function useExport({ documentId, onSuccess, onError }: UseExportOptions) {
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)

  // ... existing code ...

  const { job, progress, status, cancel } = useJobPolling({
    jobId: currentJobId || '',
    enabled: !!currentJobId,
    onComplete: async (completedJob) => {
      if (completedJob.status === 'succeeded') {
        try {
          const downloadUrl = await api.getExportDownload(completedJob.id)
          
          // Extract filename from job result or use default
          const format = completedJob.result?.format || 'pptx'
          const filename = `presentation-${documentId}.${format}`
          
          // Download with progress
          setIsDownloading(true)
          await downloadFileWithProgress(
            downloadUrl, 
            filename,
            (loaded, total) => {
              setDownloadProgress((loaded / total) * 100)
            }
          )
          
          setIsDownloading(false)
          setDownloadProgress(0)
          
          toast.success('Export complete', {
            description: 'File downloaded successfully'
          })
          
          onSuccess?.(downloadUrl)
          setCurrentJobId(null)
        } catch (err: any) {
          setIsDownloading(false)
          toast.error('Download failed', {
            description: err.message || 'Failed to download file'
          })
          onError?.(err)
        }
      }
    },
    onError: (error) => {
      toast.error('Export failed', { description: error.message })
      onError?.(error)
      setCurrentJobId(null)
    }
  })

  return {
    startExport,
    cancelExport,
    isExporting: !!currentJobId && (status === 'pending' || status === 'running'),
    isDownloading,
    progress,
    downloadProgress,
    status,
    job,
    error: exportMutation.error
  }
}
```

## Error Handling

### Export Error Types
```typescript
// src/lib/errors.ts
export class ExportError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message)
    this.name = 'ExportError'
  }
}

export const EXPORT_ERRORS = {
  JOB_CREATION_FAILED: {
    code: 'JOB_CREATION_FAILED',
    message: 'Failed to start export job',
    retryable: true
  },
  JOB_TIMEOUT: {
    code: 'JOB_TIMEOUT',
    message: 'Export is taking too long',
    retryable: true
  },
  JOB_FAILED: {
    code: 'JOB_FAILED',
    message: 'Export processing failed',
    retryable: false
  },
  DOWNLOAD_FAILED: {
    code: 'DOWNLOAD_FAILED',
    message: 'Failed to download export file',
    retryable: true
  },
  EXPIRED_URL: {
    code: 'EXPIRED_URL',
    message: 'Download link has expired',
    retryable: false
  }
} as const

export function handleExportError(error: any): ExportError {
  if (error instanceof ExportError) return error
  
  const status = error.status || error.response?.status
  const message = error.message || 'Unknown export error'
  
  // Map HTTP errors to export errors
  if (status === 404) {
    return new ExportError(
      'Export job not found',
      'JOB_NOT_FOUND',
      false
    )
  }
  
  if (status === 410) {
    return new ExportError(
      EXPORT_ERRORS.EXPIRED_URL.message,
      EXPORT_ERRORS.EXPIRED_URL.code,
      false
    )
  }
  
  if (status >= 500) {
    return new ExportError(
      'Server error during export',
      'SERVER_ERROR',
      true
    )
  }
  
  return new ExportError(message, 'UNKNOWN_ERROR', true)
}
```

### Error Recovery UI
```typescript
// Error state in ExportDialog
function ExportError({ 
  error, 
  onRetry, 
  onDismiss 
}: { 
  error: ExportError
  onRetry?: () => void
  onDismiss: () => void 
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="rounded-lg bg-destructive/10 p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-destructive">
              Export Failed
            </p>
            <p className="text-sm text-muted-foreground">
              {error.message}
            </p>
          </div>
        </div>
      </div>
      
      <div className="flex gap-2">
        <Button variant="outline" onClick={onDismiss} className="flex-1">
          Dismiss
        </Button>
        {error.retryable && onRetry && (
          <Button onClick={onRetry} className="flex-1">
            Retry Export
          </Button>
        )}
      </div>
    </div>
  )
}
```

## Multi-Format Support

### Format-Specific UI
```typescript
// src/components/FormatSelector.tsx
export function FormatSelector({ 
  value, 
  onChange 
}: { 
  value: 'pptx' | 'pdf'
  onChange: (format: 'pptx' | 'pdf') => void 
}) {
  const formats = [
    {
      value: 'pptx',
      label: 'PowerPoint',
      description: 'Editable PPTX file with animations',
      icon: FilePresentation,
      recommended: true
    },
    {
      value: 'pdf',
      label: 'PDF',
      description: 'Static document for sharing',
      icon: FileText,
      recommended: false
    }
  ] as const

  return (
    <RadioGroup value={value} onValueChange={onChange as any}>
      <div className="grid gap-3">
        {formats.map((format) => (
          <Label
            key={format.value}
            htmlFor={format.value}
            className={cn(
              "flex items-center space-x-3 rounded-lg border p-4 cursor-pointer",
              "hover:bg-accent transition-colors",
              value === format.value && "border-primary bg-accent"
            )}
          >
            <RadioGroupItem value={format.value} id={format.value} />
            <format.icon className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{format.label}</span>
                {format.recommended && (
                  <Badge variant="secondary" className="text-xs">
                    Recommended
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {format.description}
              </p>
            </div>
          </Label>
        ))}
      </div>
    </RadioGroup>
  )
}
```

## Performance Optimizations

### Debounced Progress Updates
```typescript
// src/hooks/useExport.ts (optimization)
import { useDebouncedValue } from '@/hooks/use-debounced-value'

export function useExport({ documentId, onSuccess, onError }: UseExportOptions) {
  const [rawProgress, setRawProgress] = useState(0)
  
  // Debounce progress updates to avoid excessive re-renders
  const debouncedProgress = useDebouncedValue(rawProgress, 100)

  // ... rest of implementation uses debouncedProgress instead of progress
}
```

### Cached Export Results
```typescript
// Cache recent exports in query cache
export function useExportHistory(documentId: string) {
  return useQuery({
    queryKey: ['export-history', documentId],
    queryFn: async () => {
      // Get recent export jobs from backend
      const response = await api.getExportHistory(documentId)
      return response.exports
    },
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

// Quick re-download UI
function RecentExports({ documentId }: { documentId: string }) {
  const { data: exports } = useExportHistory(documentId)
  
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Recent Exports</h4>
      {exports?.map((exp) => (
        <Button
          key={exp.id}
          variant="outline"
          size="sm"
          onClick={() => window.open(exp.downloadUrl, '_blank')}
          disabled={new Date(exp.expiresAt) < new Date()}
        >
          <Download className="h-4 w-4 mr-2" />
          {exp.format.toUpperCase()} • {formatFileSize(exp.fileSize)}
          {new Date(exp.expiresAt) < new Date() && ' (expired)'}
        </Button>
      ))}
    </div>
  )
}
```

## Testing Strategy

### Unit Tests
```typescript
// src/hooks/__tests__/useExport.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useExport } from '../useExport'
import { api } from '@/lib/api'

vi.mock('@/lib/api')

describe('useExport', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )

  it('starts export and polls job', async () => {
    vi.mocked(api.postExport).mockResolvedValue({ jobId: 'job-123' })
    vi.mocked(api.getJob)
      .mockResolvedValueOnce({ 
        id: 'job-123', 
        status: 'pending', 
        type: 'export' 
      })
      .mockResolvedValueOnce({ 
        id: 'job-123', 
        status: 'running', 
        progress: 50,
        type: 'export' 
      })
      .mockResolvedValue({ 
        id: 'job-123', 
        status: 'succeeded', 
        progress: 100,
        type: 'export',
        result: { exportUrl: 'https://download.url' }
      })

    const { result } = renderHook(
      () => useExport({ documentId: 'doc-123' }), 
      { wrapper }
    )

    // Start export
    result.current.startExport('pptx')

    await waitFor(() => {
      expect(result.current.isExporting).toBe(true)
    })

    // Wait for completion
    await waitFor(() => {
      expect(result.current.status).toBe('succeeded')
    }, { timeout: 5000 })

    expect(api.getExportDownload).toHaveBeenCalledWith('job-123')
  })

  it('handles export errors', async () => {
    vi.mocked(api.postExport).mockRejectedValue(
      new Error('Export failed')
    )

    const onError = vi.fn()
    const { result } = renderHook(
      () => useExport({ documentId: 'doc-123', onError }), 
      { wrapper }
    )

    result.current.startExport('pdf')

    await waitFor(() => {
      expect(onError).toHaveBeenCalled()
    })
  })

  it('cancels export job', async () => {
    vi.mocked(api.postExport).mockResolvedValue({ jobId: 'job-123' })
    vi.mocked(api.getJob).mockResolvedValue({ 
      id: 'job-123', 
      status: 'running', 
      type: 'export' 
    })

    const { result } = renderHook(
      () => useExport({ documentId: 'doc-123' }), 
      { wrapper }
    )

    result.current.startExport('pptx')
    
    await waitFor(() => {
      expect(result.current.isExporting).toBe(true)
    })

    result.current.cancelExport()

    expect(result.current.isExporting).toBe(false)
  })
})
```

### Integration Tests
```typescript
// src/components/__tests__/ExportDialog.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportDialog } from '../ExportDialog'
import { api } from '@/lib/api'

vi.mock('@/lib/api')

describe('ExportDialog', () => {
  it('exports PPTX with selected options', async () => {
    vi.mocked(api.postExport).mockResolvedValue({ jobId: 'job-123' })
    vi.mocked(api.getJob).mockResolvedValue({
      id: 'job-123',
      status: 'succeeded',
      type: 'export',
      result: { exportUrl: 'https://download.url' }
    })
    vi.mocked(api.getExportDownload).mockResolvedValue('https://download.url')

    const onOpenChange = vi.fn()
    render(
      <ExportDialog 
        documentId="doc-123" 
        open={true} 
        onOpenChange={onOpenChange} 
      />
    )

    // Select PPTX format
    await userEvent.click(screen.getByRole('combobox', { name: /format/i }))
    await userEvent.click(screen.getByText(/PowerPoint/i))

    // Toggle options
    await userEvent.click(screen.getByLabelText(/include speaker notes/i))

    // Start export
    await userEvent.click(screen.getByRole('button', { name: /export pptx/i }))

    await waitFor(() => {
      expect(api.postExport).toHaveBeenCalledWith({
        documentId: 'doc-123',
        format: 'pptx',
        options: expect.objectContaining({
          includeNotes: false // toggled off
        })
      })
    })
  })

  it('shows progress during export', async () => {
    vi.mocked(api.postExport).mockResolvedValue({ jobId: 'job-123' })
    vi.mocked(api.getJob)
      .mockResolvedValueOnce({ 
        id: 'job-123', 
        status: 'running', 
        progress: 30,
        type: 'export' 
      })
      .mockResolvedValue({ 
        id: 'job-123', 
        status: 'running', 
        progress: 70,
        type: 'export' 
      })

    render(
      <ExportDialog 
        documentId="doc-123" 
        open={true} 
        onOpenChange={vi.fn()} 
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /export/i }))

    await waitFor(() => {
      expect(screen.getByText(/30%/i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/70%/i)).toBeInTheDocument()
    })
  })
})
```

### E2E Tests
```typescript
// e2e/export.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Export Flow', () => {
  test('exports presentation as PPTX', async ({ page }) => {
    await page.goto('/d/doc-123')
    
    // Open export dialog
    await page.click('button:has-text("Export")')
    
    // Select format
    await page.selectOption('select[name="format"]', 'pptx')
    
    // Configure options
    await page.check('input[name="includeNotes"]')
    
    // Start export
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Export PPTX")')
    
    // Wait for progress
    await expect(page.locator('text=Generating file')).toBeVisible()
    
    // Wait for download
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.pptx')
    
    // Verify success notification
    await expect(page.locator('text=Export complete')).toBeVisible()
  })

  test('handles export errors gracefully', async ({ page }) => {
    // Mock export failure
    await page.route('**/api/v1/export', (route) => {
      route.fulfill({ status: 500, body: 'Export failed' })
    })
    
    await page.goto('/d/doc-123')
    await page.click('button:has-text("Export")')
    await page.click('button:has-text("Export PDF")')
    
    // Verify error message
    await expect(page.locator('text=Export failed')).toBeVisible()
    
    // Verify retry button
    await expect(page.locator('button:has-text("Retry Export")')).toBeVisible()
  })

  test('cancels export job', async ({ page }) => {
    await page.goto('/d/doc-123')
    await page.click('button:has-text("Export")')
    await page.click('button:has-text("Export PPTX")')
    
    // Wait for export to start
    await expect(page.locator('text=Generating file')).toBeVisible()
    
    // Cancel export
    await page.click('button:has-text("Cancel Export")')
    
    // Verify cancellation
    await expect(page.locator('text=Export canceled')).toBeVisible()
  })
})
```

## Accessibility

### Keyboard Navigation
```typescript
// Export dialog keyboard shortcuts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open) return

    // Escape to close
    if (e.key === 'Escape') {
      if (isExporting) {
        cancelExport()
      }
      onOpenChange(false)
    }

    // Enter to export (when not exporting)
    if (e.key === 'Enter' && !isExporting) {
      handleExport()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [open, isExporting, cancelExport, handleExport, onOpenChange])
```

### ARIA Labels
```typescript
// Accessible export dialog
<Dialog 
  open={open} 
  onOpenChange={onOpenChange}
  aria-labelledby="export-dialog-title"
  aria-describedby="export-dialog-description"
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle id="export-dialog-title">
        Export Presentation
      </DialogTitle>
      <DialogDescription id="export-dialog-description">
        Choose format and options for exporting your presentation
      </DialogDescription>
    </DialogHeader>

    <Progress 
      value={progress} 
      aria-label={`Export progress: ${progress}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    />

    <Button 
      onClick={cancelExport}
      aria-label="Cancel export operation"
    >
      Cancel Export
    </Button>
  </DialogContent>
</Dialog>
```

### Screen Reader Support
```typescript
// Live region for export status updates
function ExportStatus({ status, progress }: { status: string; progress: number }) {
  const statusText = useMemo(() => {
    if (status === 'pending') return 'Export is being prepared'
    if (status === 'running') return `Export in progress: ${progress}% complete`
    if (status === 'succeeded') return 'Export completed successfully'
    if (status === 'failed') return 'Export failed'
    return ''
  }, [status, progress])

  return (
    <div 
      role="status" 
      aria-live="polite" 
      aria-atomic="true"
      className="sr-only"
    >
      {statusText}
    </div>
  )
}
```

## Integration Points

### Header Export Button
```typescript
// src/components/Header.tsx (addition)
import { ExportDialog } from './ExportDialog'

export function Header({ documentId }: { documentId?: string }) {
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <header>
      {/* ... existing header content ... */}
      
      {documentId && (
        <>
          <Button 
            variant="outline" 
            onClick={() => setExportOpen(true)}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>

          <ExportDialog
            documentId={documentId}
            open={exportOpen}
            onOpenChange={setExportOpen}
          />
        </>
      )}
    </header>
  )
}
```

### Slides Page Integration
```typescript
// src/pages/Slides.tsx (future)
import { useExport } from '@/hooks/useExport'

export function SlidesPage() {
  const { documentId } = useParams()
  const { startExport, isExporting, progress } = useExport({
    documentId: documentId!,
    onSuccess: (url) => {
      console.log('Export ready:', url)
    }
  })

  return (
    <div>
      {/* ... slide editor ... */}
      
      <ExportButton 
        onExport={(format, options) => startExport(format, options)}
        isExporting={isExporting}
        progress={progress}
      />
    </div>
  )
}
```

## Future Enhancements

### Planned Features
- **Batch Export**: Export multiple documents at once
- **Scheduled Exports**: Automatic periodic exports
- **Export Templates**: Save and reuse export configurations
- **Format Presets**: Quick export with predefined settings
- **Export History**: View and re-download past exports
- **Cloud Storage Integration**: Export directly to Google Drive/Dropbox
- **Email Delivery**: Send export to email address
- **Export Analytics**: Track export usage and file sizes
- **Custom Branding**: Apply organization branding to exports
- **Watermarking**: Add watermarks to exported files
- **Export Permissions**: Control who can export documents
- **Export Audit Log**: Track all export activities

### Advanced Options
- **Slide Range Selection**: Export specific slides
- **Custom Page Sizes**: Define custom dimensions
- **Font Embedding**: Ensure font compatibility
- **Compression Settings**: Control file size vs quality
- **Metadata Preservation**: Keep document properties
- **Accessibility Tags**: PDF/UA compliance for PDFs
- **Color Profile Management**: Ensure color consistency
- **Multi-language Support**: Export with locale-specific formatting
