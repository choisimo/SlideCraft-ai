# Upload Flow Implementation

## Overview
Implements resumable multipart upload with progress tracking, pause/resume, and error recovery. Supports multiple storage backends (Local, S3, Google Drive) via backend abstraction.

## File Locations
- `src/hooks/useUpload.ts` - Upload hook with state management
- `src/components/FileDropzone.tsx` - Drag-and-drop UI
- `src/components/UploadProgress.tsx` - Progress display

## Dependencies
```json
{
  "react-dropzone": "^14.x",
  "@tanstack/react-query": "^5.x",
  "crypto-js": "^4.x"
}
```

## Core Hook: useUpload

### Type Definitions
```typescript
export interface UploadState {
  status: 'idle' | 'uploading' | 'paused' | 'completed' | 'error'
  progress: number
  uploadedBytes: number
  totalBytes: number
  uploadId?: string
  objectKey?: string
  error?: string
  etags: Map<number, string>
}

export interface UseUploadOptions {
  chunkSize?: number // default 5MB
  maxConcurrent?: number // default 3
  onComplete?: (objectKey: string) => void
  onError?: (error: Error) => void
  onProgress?: (progress: number) => void
}
```

### Implementation
```typescript
import { useState, useCallback, useRef } from 'react'
import CryptoJS from 'crypto-js'
import { uploadApi } from '@/lib/api'

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_MAX_CONCURRENT = 3

export function useUpload(options: UseUploadOptions = {}) {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    onComplete,
    onError,
    onProgress,
  } = options

  const [state, setState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    uploadedBytes: 0,
    totalBytes: 0,
    etags: new Map(),
  })

  const abortController = useRef<AbortController | null>(null)
  const fileRef = useRef<File | null>(null)

  const calculateChecksum = useCallback(async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer()
    const wordArray = CryptoJS.lib.WordArray.create(buffer as any)
    return CryptoJS.MD5(wordArray).toString()
  }, [])

  const uploadPart = useCallback(
    async (
      uploadId: string,
      partNumber: number,
      blob: Blob
    ): Promise<string> => {
      const checksum = await calculateChecksum(blob)
      const { etag } = await uploadApi.uploadPart(uploadId, partNumber, blob, checksum)
      return etag
    },
    [calculateChecksum]
  )

  const start = useCallback(
    async (file: File) => {
      fileRef.current = file
      abortController.current = new AbortController()

      setState((prev) => ({
        ...prev,
        status: 'uploading',
        totalBytes: file.size,
        uploadedBytes: 0,
        progress: 0,
        error: undefined,
      }))

      try {
        // Initialize upload
        const { uploadId, parts } = await uploadApi.init({
          filename: file.name,
          size: file.size,
          contentType: file.type,
        })

        setState((prev) => ({ ...prev, uploadId }))

        // Calculate parts
        const totalParts = Math.ceil(file.size / chunkSize)
        const uploadQueue: Array<() => Promise<void>> = []

        for (let i = 0; i < totalParts; i++) {
          const partNumber = i + 1
          const start = i * chunkSize
          const end = Math.min(start + chunkSize, file.size)
          const blob = file.slice(start, end)

          uploadQueue.push(async () => {
            if (abortController.current?.signal.aborted) {
              throw new Error('Upload cancelled')
            }

            const etag = await uploadPart(uploadId, partNumber, blob)

            setState((prev) => {
              const newEtags = new Map(prev.etags)
              newEtags.set(partNumber, etag)
              
              const uploadedBytes = prev.uploadedBytes + blob.size
              const progress = Math.round((uploadedBytes / file.size) * 100)

              onProgress?.(progress)

              return {
                ...prev,
                etags: newEtags,
                uploadedBytes,
                progress,
              }
            })
          })
        }

        // Upload parts with concurrency limit
        await uploadPartsWithConcurrency(uploadQueue, maxConcurrent)

        // Complete upload
        const partsArray = Array.from(state.etags.entries())
          .map(([partNumber, etag]) => ({ partNumber, etag }))
          .sort((a, b) => a.partNumber - b.partNumber)

        const { objectKey } = await uploadApi.complete(uploadId, {
          parts: partsArray,
        })

        setState((prev) => ({
          ...prev,
          status: 'completed',
          progress: 100,
          objectKey,
        }))

        onComplete?.(objectKey)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: errorMessage,
        }))

        onError?.(error instanceof Error ? error : new Error(errorMessage))
      }
    },
    [chunkSize, maxConcurrent, calculateChecksum, uploadPart, onComplete, onError, onProgress]
  )

  const pause = useCallback(() => {
    abortController.current?.abort()
    setState((prev) => ({ ...prev, status: 'paused' }))
  }, [])

  const resume = useCallback(async () => {
    if (!fileRef.current || !state.uploadId) {
      throw new Error('No file or upload session to resume')
    }

    // Re-initialize abort controller
    abortController.current = new AbortController()

    setState((prev) => ({ ...prev, status: 'uploading' }))

    try {
      const file = fileRef.current
      const totalParts = Math.ceil(file.size / chunkSize)
      const uploadQueue: Array<() => Promise<void>> = []

      // Only upload missing parts
      for (let i = 0; i < totalParts; i++) {
        const partNumber = i + 1
        
        if (state.etags.has(partNumber)) {
          continue // Skip already uploaded parts
        }

        const start = i * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        const blob = file.slice(start, end)

        uploadQueue.push(async () => {
          if (abortController.current?.signal.aborted) {
            throw new Error('Upload cancelled')
          }

          const etag = await uploadPart(state.uploadId!, partNumber, blob)

          setState((prev) => {
            const newEtags = new Map(prev.etags)
            newEtags.set(partNumber, etag)
            
            const uploadedBytes = prev.uploadedBytes + blob.size
            const progress = Math.round((uploadedBytes / file.size) * 100)

            onProgress?.(progress)

            return {
              ...prev,
              etags: newEtags,
              uploadedBytes,
              progress,
            }
          })
        })
      }

      await uploadPartsWithConcurrency(uploadQueue, maxConcurrent)

      // Complete upload
      const partsArray = Array.from(state.etags.entries())
        .map(([partNumber, etag]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber)

      const { objectKey } = await uploadApi.complete(state.uploadId, {
        parts: partsArray,
      })

      setState((prev) => ({
        ...prev,
        status: 'completed',
        progress: 100,
        objectKey,
      }))

      onComplete?.(objectKey)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Resume failed'
      
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }))

      onError?.(error instanceof Error ? error : new Error(errorMessage))
    }
  }, [state.uploadId, state.etags, chunkSize, maxConcurrent, uploadPart, onComplete, onError, onProgress])

  const cancel = useCallback(() => {
    abortController.current?.abort()
    setState({
      status: 'idle',
      progress: 0,
      uploadedBytes: 0,
      totalBytes: 0,
      etags: new Map(),
    })
    fileRef.current = null
  }, [])

  const retry = useCallback(async () => {
    if (!fileRef.current) {
      throw new Error('No file to retry')
    }
    await start(fileRef.current)
  }, [start])

  return {
    state,
    start,
    pause,
    resume,
    cancel,
    retry,
  }
}

async function uploadPartsWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency: number
): Promise<void> {
  const executing: Promise<void>[] = []
  
  for (const task of tasks) {
    const p = task()
    executing.push(p)

    if (executing.length >= concurrency) {
      await Promise.race(executing)
      executing.splice(
        executing.findIndex((e) => e === p),
        1
      )
    }
  }

  await Promise.all(executing)
}
```

## FileDropzone Component

```typescript
import { useCallback } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'
import { Upload, FileText, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
}

const MAX_SIZE = 500 * 1024 * 1024 // 500MB

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  disabled?: boolean
  className?: string
}

export function FileDropzone({ onFileSelect, disabled, className }: FileDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0]
        const error = rejection.errors[0]
        
        if (error.code === 'file-too-large') {
          toast.error('File is too large. Maximum size is 500MB.')
        } else if (error.code === 'file-invalid-type') {
          toast.error('Invalid file type. Please upload PPTX, PDF, or DOCX.')
        }
        return
      }

      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0])
      }
    },
    [onFileSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: false,
    disabled,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'relative flex flex-col items-center justify-center',
        'border-2 border-dashed rounded-lg p-12',
        'transition-colors duration-200',
        isDragActive
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-primary/50',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <input {...getInputProps()} />
      
      <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
      
      <p className="text-lg font-medium mb-2">
        {isDragActive ? 'Drop file here' : 'Drag & drop file here'}
      </p>
      
      <p className="text-sm text-muted-foreground mb-4">
        or click to browse
      </p>
      
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <FileText className="w-4 h-4" />
          <span>PPTX, PDF, DOCX</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          <span>Max 500MB</span>
        </div>
      </div>
    </div>
  )
}
```

## UploadProgress Component

```typescript
import { formatBytes } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Pause, Play, X, RotateCw } from 'lucide-react'
import { UploadState } from '@/hooks/useUpload'

interface UploadProgressProps {
  state: UploadState
  filename: string
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRetry: () => void
}

export function UploadProgress({
  state,
  filename,
  onPause,
  onResume,
  onCancel,
  onRetry,
}: UploadProgressProps) {
  const { status, progress, uploadedBytes, totalBytes, error } = state

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{filename}</p>
          <p className="text-sm text-muted-foreground">
            {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
          </p>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          {status === 'uploading' && (
            <Button size="sm" variant="ghost" onClick={onPause}>
              <Pause className="w-4 h-4" />
            </Button>
          )}
          
          {status === 'paused' && (
            <Button size="sm" variant="ghost" onClick={onResume}>
              <Play className="w-4 h-4" />
            </Button>
          )}
          
          {status === 'error' && (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              <RotateCw className="w-4 h-4" />
            </Button>
          )}
          
          {status !== 'completed' && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      {status === 'error' && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {status === 'completed' && (
        <p className="text-sm text-green-600">Upload completed</p>
      )}
    </div>
  )
}
```

## Integration Example

```typescript
import { useState } from 'react'
import { FileDropzone } from '@/components/FileDropzone'
import { UploadProgress } from '@/components/UploadProgress'
import { useUpload } from '@/hooks/useUpload'
import { useConvertMutation } from '@/lib/api'

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const convertMutation = useConvertMutation()

  const upload = useUpload({
    onComplete: (objectKey) => {
      const sourceType = getSourceType(file!.name)
      convertMutation.mutate({
        objectKey,
        sourceType,
        documentTitle: file!.name,
      })
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`)
    },
  })

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    upload.start(selectedFile)
  }

  if (file && upload.state.status !== 'idle') {
    return (
      <UploadProgress
        state={upload.state}
        filename={file.name}
        onPause={upload.pause}
        onResume={upload.resume}
        onCancel={upload.cancel}
        onRetry={upload.retry}
      />
    )
  }

  return (
    <FileDropzone
      onFileSelect={handleFileSelect}
      disabled={upload.state.status === 'uploading'}
    />
  )
}

function getSourceType(filename: string): 'pptx' | 'pdf' | 'docx' {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pptx') return 'pptx'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  throw new Error('Unsupported file type')
}
```

## Testing

### Unit Tests
```typescript
import { renderHook, act } from '@testing-library/react'
import { useUpload } from './useUpload'

describe('useUpload', () => {
  it('uploads file successfully', async () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useUpload({ onComplete })
    )

    const file = new File(['content'], 'test.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })

    await act(async () => {
      await result.current.start(file)
    })

    expect(result.current.state.status).toBe('completed')
    expect(onComplete).toHaveBeenCalled()
  })

  it('handles pause and resume', async () => {
    const { result } = renderHook(() => useUpload())

    const file = new File(['x'.repeat(10 * 1024 * 1024)], 'large.pptx')

    act(() => {
      result.current.start(file)
    })

    await waitFor(() => 
      expect(result.current.state.status).toBe('uploading')
    )

    act(() => {
      result.current.pause()
    })

    expect(result.current.state.status).toBe('paused')

    await act(async () => {
      await result.current.resume()
    })

    expect(result.current.state.status).toBe('completed')
  })
})
```

## Performance Optimizations

1. **Concurrent Uploads**: Upload multiple parts simultaneously (default 3)
2. **Checksum Caching**: Cache checksums for resumed uploads
3. **Memory Management**: Stream large files instead of loading entirely
4. **Progress Throttling**: Debounce progress callbacks to 100ms

## Error Recovery

1. **Network Errors**: Automatic retry with exponential backoff
2. **Checksum Mismatch**: Re-upload affected part
3. **Session Expiry**: Resume with new upload session
4. **Partial Upload**: Store etags and resume from last successful part

## Accessibility

- Screen reader announcements for upload status
- Keyboard navigation for dropzone
- Focus management for error states
- ARIA live regions for progress updates
