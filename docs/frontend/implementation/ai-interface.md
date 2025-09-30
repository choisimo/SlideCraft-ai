# AI Chat Interface Implementation

## Overview
The AI Chat Interface provides a conversational UI for interacting with SlideCraft AI, supporting streaming responses, tool calling integration, context-aware interactions, and slide manipulation through natural language commands.

## File Locations
- Component: `src/components/AIChatInterface.tsx`
- API Integration: `src/lib/api.ts` (streamAIChat function)
- State Management: Local component state with conversation history
- Types: `src/lib/api.ts` (AIChatMessage, ChatRequestBody)

## Tech Stack
- **UI Framework**: React 18+ with TypeScript
- **Streaming**: Server-Sent Events (SSE) with EventSource polyfill
- **State**: React useState/useRef for conversation management
- **API Client**: Fetch API with AbortController for cancellation
- **UI Components**: shadcn/ui (Card, Button, Avatar, Input)
- **Icons**: lucide-react

## Core Implementation

### Type Definitions
```typescript
export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequestBody {
  messages: AIChatMessage[]
  model?: string
  documentId?: string
  selection?: {
    slideIndex: number
    elementIds: string[]
  }
  stream?: boolean
}

interface Message {
  id: string
  type: 'user' | 'ai' | 'system'
  content: string
  createdAt: number
  status?: 'processing' | 'completed' | 'error'
  actions?: Array<{
    id: string
    label: string
    type: 'primary' | 'secondary'
    icon?: IconComponent
  }>
}

interface StreamCallbacks {
  onToken: (token: string) => void
  onFunctionCall?: (call: FunctionCall) => void
  onError?: (error: any) => void
  onClose?: () => void
}

interface FunctionCall {
  name: string
  arguments: Record<string, any>
}
```

### SSE Streaming Client
```typescript
function streamAIChat(body: ChatRequestBody & StreamCallbacks) {
  const controller = new AbortController()
  
  const done = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          messages: body.messages,
          model: body.model,
          documentId: body.documentId,
          selection: body.selection,
          stream: true
        }),
        signal: controller.signal
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader!.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        
        for (let i = 0; i < parts.length - 1; i++) {
          parseSSEChunk(parts[i], body)
        }
        buffer = parts[parts.length - 1] || ''
      }
      
      if (buffer) parseSSEChunk(buffer, body)
      body.onClose?.()
      
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return
      body.onError?.(e)
      throw e
    }
  })()

  return {
    cancel: () => controller.abort(),
    done
  }
}

function parseSSEChunk(raw: string, callbacks: StreamCallbacks) {
  const lines = raw.split('\n').filter(Boolean)
  let eventType = 'message'
  let data = ''

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data = line.slice(5).trim()
    }
  }

  if (!data) return

  try {
    const parsed = JSON.parse(data)

    switch (eventType) {
      case 'content':
        callbacks.onToken(parsed.delta || '')
        break

      case 'function_call':
        callbacks.onFunctionCall?.({
          name: parsed.name,
          arguments: parsed.arguments
        })
        break

      case 'error':
        callbacks.onError?.(new Error(parsed.message || 'Stream error'))
        break

      case 'done':
        callbacks.onClose?.()
        break
    }
  } catch (error) {
    console.warn('Failed to parse SSE chunk:', data)
  }
}
```

### AI Chat Interface Component

#### Main Component Structure
```typescript
export const AIChatInterface = ({ 
  onSendMessage, 
  onProcessingChange, 
  isProcessing = false,
  className 
}: AIChatInterfaceProps) => {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [nowTick, setNowTick] = useState(Date.now())
  const cancelRef = useRef<(() => void) | null>(null)

  // Update relative timestamps every 60s
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelRef.current?.()
  }, [])

  return (
    <div className="flex-1 flex flex-col bg-background h-full overflow-hidden">
      <ChatHeader isProcessing={isProcessing} />
      <QuickActions />
      <MessagesList messages={messages} nowTick={nowTick} />
      <InputArea 
        message={message}
        setMessage={setMessage}
        onSend={handleSend}
        isProcessing={isProcessing}
      />
    </div>
  )
}
```

#### Send Message Handler
```typescript
const toChatHistory = (list: Message[]): AIChatMessage[] => {
  return list
    .filter((m) => m.type === 'system' || m.type === 'user' || m.type === 'ai')
    .map((m) => ({
      role: m.type === 'ai' ? 'assistant' : (m.type as 'system' | 'user'),
      content: m.content,
    }))
}

const handleSend = () => {
  if (!message.trim()) return

  const createdAt = Date.now()
  const userMsg: Message = {
    id: createdAt.toString(),
    type: 'user',
    content: message,
    createdAt,
  }

  // Add user message immediately
  setMessages((prev) => [...prev, userMsg])
  onSendMessage?.(message)
  setMessage('')

  // Create placeholder AI message
  onProcessingChange?.(true)
  const aiMsgId = `ai-${Date.now()}`
  setMessages((prev) => [
    ...prev,
    {
      id: aiMsgId,
      type: 'ai',
      content: '',
      createdAt: Date.now(),
      status: 'processing',
    },
  ])

  // Convert to chat history format
  const history = toChatHistory([...messages, userMsg])

  // Start streaming
  const { cancel, done } = api.streamAIChat({
    messages: history,
    onToken: (token) => {
      setMessages((prev) =>
        prev.map((m) => 
          m.id === aiMsgId 
            ? { ...m, content: m.content + token } 
            : m
        )
      )
    },
    onError: () => {
      setMessages((prev) => 
        prev.map((m) => 
          m.id === aiMsgId 
            ? { ...m, status: 'error' } 
            : m
        )
      )
      onProcessingChange?.(false)
    },
    onClose: () => {
      setMessages((prev) => 
        prev.map((m) => 
          m.id === aiMsgId 
            ? { ...m, status: 'completed' } 
            : m
        )
      )
      onProcessingChange?.(false)
    },
  })

  cancelRef.current = cancel
  void done.catch(() => {})
}
```

#### Quick Actions UI
```typescript
const QuickActions = () => {
  const { isMobile, isTablet } = useBreakpoint()
  
  const quickActions = [
    { id: 'convert-doc', label: 'Document to Slides', icon: FileText, color: 'bg-primary' },
    { id: 'generate-slides', label: 'Generate Slides', icon: Sparkles, color: 'bg-secondary' },
    { id: 'add-images', label: 'Add Images', icon: Image, color: 'bg-success' },
    { id: 'export-ppt', label: 'Export PPT', icon: Download, color: 'bg-warning' },
  ]

  return (
    <div className="border-b border-border bg-muted/30 p-4">
      <div 
        className={cn(
          'grid gap-3',
          isMobile ? 'grid-cols-2' : isTablet ? 'grid-cols-3' : 'grid-cols-4'
        )}
      >
        {quickActions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 h-auto py-3 px-4"
            onClick={() => handleQuickAction(action.id)}
          >
            <div className={cn(action.color, 'rounded-lg p-2')}>
              <action.icon className="w-4 h-4 text-white" />
            </div>
            <span className="font-medium text-sm">{action.label}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
```

#### Messages List Rendering
```typescript
const MessagesList = ({ messages, nowTick }: { messages: Message[], nowTick: number }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} nowTick={nowTick} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}

const MessageBubble = ({ message, nowTick }: { message: Message, nowTick: number }) => {
  return (
    <div className={cn(
      'flex gap-3',
      message.type === 'user' && 'flex-row-reverse'
    )}>
      {/* Avatar */}
      <Avatar className="w-8 h-8 mt-1 shrink-0">
        {message.type === 'ai' || message.type === 'system' ? (
          <div className="w-full h-full bg-primary rounded-full flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
        ) : (
          <>
            <AvatarImage src="" alt="User" />
            <AvatarFallback>U</AvatarFallback>
          </>
        )}
      </Avatar>

      {/* Content */}
      <div className={cn('flex-1 space-y-2 min-w-0')}>
        <Card className={cn(
          'p-3 max-w-md',
          message.type === 'user'
            ? 'bg-primary text-white ml-auto'
            : message.type === 'system'
            ? 'bg-gradient-to-r from-primary/10 to-secondary/10 border-dashed'
            : 'bg-card'
        )}>
          <p className="text-sm leading-relaxed whitespace-pre-line break-words">
            {message.content}
          </p>

          {/* Status Indicator */}
          {message.status && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/20">
              {message.status === 'processing' && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-xs">Processing...</span>
                </>
              )}
              {message.status === 'completed' && (
                <>
                  <CheckCircle2 className="w-3 h-3 text-success" />
                  <span className="text-xs">Completed</span>
                </>
              )}
              {message.status === 'error' && (
                <>
                  <AlertCircle className="w-3 h-3 text-destructive" />
                  <span className="text-xs">Error occurred</span>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Action Buttons */}
        {message.actions && (
          <div className="flex gap-2 flex-wrap">
            {message.actions.map((action) => (
              <Button
                key={action.id}
                variant={action.type === 'primary' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
              >
                {action.icon && <action.icon className="w-3 h-3 mr-1" />}
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(message.createdAt, nowTick)}
        </p>
      </div>
    </div>
  )
}
```

#### Input Area
```typescript
const InputArea = ({ 
  message, 
  setMessage, 
  onSend, 
  isProcessing 
}: {
  message: string
  setMessage: (v: string) => void
  onSend: () => void
  isProcessing: boolean
}) => {
  const { isMobile } = useBreakpoint()

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg border border-border p-3">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                isMobile 
                  ? "Ask AI..." 
                  : "Ask AI to help... (e.g., Convert PDF to slides)"
              }
              className="border-0 bg-transparent focus:ring-0 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
              disabled={isProcessing}
            />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="w-8 h-8">
                <Paperclip className="w-4 h-4" />
              </Button>
              {!isMobile && (
                <Button variant="ghost" size="icon" className="w-8 h-8">
                  <Mic className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
        
        <Button
          onClick={onSend}
          disabled={!message.trim() || isProcessing}
          className="rounded-lg w-12 h-12"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Status Indicators */}
      {!isMobile && (
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span>AI ready</span>
          </div>
          <div className="flex items-center gap-4">
            <span>⚡ Auto mode</span>
            <span>🎯 Smart suggestions</span>
          </div>
        </div>
      )}
    </div>
  )
}
```

## Tool Calling Integration

### Function Call Handling
```typescript
interface ToolCall {
  name: string
  arguments: Record<string, any>
  status: 'pending' | 'executing' | 'completed' | 'failed'
  result?: any
}

const handleFunctionCall = async (call: FunctionCall, messageId: string) => {
  // Add tool call indicator to message
  setMessages((prev) => 
    prev.map((m) => 
      m.id === messageId 
        ? { 
            ...m, 
            toolCalls: [...(m.toolCalls || []), {
              ...call,
              status: 'pending'
            }]
          } 
        : m
    )
  )

  // Execute tool based on function name
  try {
    let result: any

    switch (call.name) {
      case 'insert_slide':
        result = await executeInsertSlide(call.arguments)
        break

      case 'edit_slide':
        result = await executeEditSlide(call.arguments)
        break

      case 'delete_slide':
        result = await executeDeleteSlide(call.arguments)
        break

      case 'generate_image':
        result = await executeGenerateImage(call.arguments)
        break

      default:
        throw new Error(`Unknown function: ${call.name}`)
    }

    // Update tool call status
    setMessages((prev) => 
      prev.map((m) => 
        m.id === messageId 
          ? {
              ...m,
              toolCalls: m.toolCalls?.map((tc) =>
                tc.name === call.name
                  ? { ...tc, status: 'completed', result }
                  : tc
              )
            }
          : m
      )
    )

    return result

  } catch (error) {
    // Update with error status
    setMessages((prev) => 
      prev.map((m) => 
        m.id === messageId 
          ? {
              ...m,
              toolCalls: m.toolCalls?.map((tc) =>
                tc.name === call.name
                  ? { ...tc, status: 'failed', result: error.message }
                  : tc
              )
            }
          : m
      )
    )
    
    throw error
  }
}
```

### Tool Execution Functions
```typescript
async function executeInsertSlide(args: {
  position: number
  title: string
  content: string[]
  layout?: string
}) {
  const documentId = getCurrentDocumentId()
  
  const response = await api.post(`/documents/${documentId}/slides`, {
    position: args.position,
    slide: {
      layout: args.layout || 'content_slide',
      elements: [
        {
          type: 'text',
          properties: {
            text: args.title,
            fontSize: 32,
            bold: true,
            position: { x: 50, y: 50 }
          }
        },
        ...args.content.map((text, index) => ({
          type: 'text',
          properties: {
            text: `• ${text}`,
            fontSize: 18,
            position: { x: 80, y: 150 + (index * 50) }
          }
        }))
      ]
    }
  })

  return {
    slideId: response.data.slideId,
    message: `Added slide "${args.title}" at position ${args.position}`
  }
}

async function executeEditSlide(args: {
  slideIndex: number
  title?: string
  content?: string[]
}) {
  const documentId = getCurrentDocumentId()
  
  const updates = []
  
  if (args.title) {
    updates.push({
      elementId: 'title',
      properties: { text: args.title }
    })
  }
  
  if (args.content) {
    args.content.forEach((text, index) => {
      updates.push({
        elementId: `content-${index}`,
        properties: { text: `• ${text}` }
      })
    })
  }

  await api.patch(`/documents/${documentId}/slides/${args.slideIndex}`, {
    updates
  })

  return {
    message: `Updated slide ${args.slideIndex + 1}`
  }
}

async function executeGenerateImage(args: {
  prompt: string
  slideIndex: number
  position: { x: number; y: number }
}) {
  const response = await api.post('/ai/generate-image', {
    prompt: args.prompt,
    size: '1024x768'
  })

  const documentId = getCurrentDocumentId()
  
  await api.post(`/documents/${documentId}/slides/${args.slideIndex}/elements`, {
    type: 'image',
    properties: {
      url: response.data.imageUrl,
      position: args.position,
      width: 512,
      height: 384
    }
  })

  return {
    imageUrl: response.data.imageUrl,
    message: 'Image generated and added to slide'
  }
}
```

## Context Management

### Document Context Provider
```typescript
interface DocumentContext {
  documentId: string
  currentSlideIndex: number
  selection: {
    slideIndex: number
    elementIds: string[]
  } | null
}

const DocumentContextProvider = ({ children }) => {
  const [context, setContext] = useState<DocumentContext>({
    documentId: '',
    currentSlideIndex: 0,
    selection: null
  })

  return (
    <DocumentContext.Provider value={context}>
      {children}
    </DocumentContext.Provider>
  )
}

// Use context in chat
const handleSendWithContext = () => {
  const context = useContext(DocumentContext)
  
  const { cancel, done } = api.streamAIChat({
    messages: history,
    documentId: context.documentId,
    selection: context.selection,
    onToken: handleToken,
    onFunctionCall: handleFunctionCall,
    onError: handleError,
    onClose: handleClose
  })
}
```

### Conversation History Management
```typescript
const MAX_HISTORY_MESSAGES = 20

const trimConversationHistory = (messages: Message[]): Message[] => {
  // Keep system messages
  const systemMessages = messages.filter(m => m.type === 'system')
  
  // Keep recent user/ai messages
  const conversationMessages = messages
    .filter(m => m.type !== 'system')
    .slice(-MAX_HISTORY_MESSAGES)
  
  return [...systemMessages, ...conversationMessages]
}

const saveConversationHistory = (documentId: string, messages: Message[]) => {
  const key = `chat_history_${documentId}`
  const trimmed = trimConversationHistory(messages)
  
  try {
    localStorage.setItem(key, JSON.stringify({
      documentId,
      messages: trimmed,
      timestamp: Date.now()
    }))
  } catch (error) {
    console.warn('Failed to save conversation history:', error)
  }
}

const loadConversationHistory = (documentId: string): Message[] => {
  const key = `chat_history_${documentId}`
  
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return []
    
    const { messages, timestamp } = JSON.parse(stored)
    
    // Expire history after 24 hours
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key)
      return []
    }
    
    return messages
  } catch (error) {
    console.warn('Failed to load conversation history:', error)
    return []
  }
}
```

## Stop/Regenerate Controls

### Stop Generation
```typescript
const StopButton = ({ onStop, isVisible }: { onStop: () => void, isVisible: boolean }) => {
  if (!isVisible) return null

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onStop}
      className="absolute top-4 right-4 z-10"
    >
      <Square className="w-4 h-4 mr-2" />
      Stop generating
    </Button>
  )
}

// In main component
const handleStop = () => {
  cancelRef.current?.()
  
  setMessages((prev) => 
    prev.map((m) => 
      m.status === 'processing'
        ? { ...m, status: 'error', content: m.content + '\n[Stopped by user]' }
        : m
    )
  )
  
  onProcessingChange?.(false)
}
```

### Regenerate Response
```typescript
const RegenerateButton = ({ 
  messageId, 
  onRegenerate 
}: { 
  messageId: string
  onRegenerate: (id: string) => void 
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onRegenerate(messageId)}
      className="text-xs"
    >
      <RefreshCw className="w-3 h-3 mr-1" />
      Regenerate
    </Button>
  )
}

const handleRegenerate = (messageId: string) => {
  // Find the message and get conversation up to that point
  const messageIndex = messages.findIndex(m => m.id === messageId)
  if (messageIndex === -1) return

  // Get conversation history before this message
  const historyBeforeMessage = messages.slice(0, messageIndex)
  
  // Remove the old AI response and any messages after it
  setMessages(historyBeforeMessage)

  // Find the last user message
  const lastUserMessage = [...historyBeforeMessage]
    .reverse()
    .find(m => m.type === 'user')

  if (!lastUserMessage) return

  // Re-send with same context
  const history = toChatHistory(historyBeforeMessage)
  startNewAIResponse(history)
}
```

## Error Handling

### Error Display
```typescript
interface ErrorMessage {
  code: string
  message: string
  retryable: boolean
}

const ErrorBanner = ({ error, onRetry, onDismiss }: {
  error: ErrorMessage
  onRetry?: () => void
  onDismiss: () => void
}) => {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{error.message}</span>
        <div className="flex gap-2">
          {error.retryable && onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
```

### Connection Status
```typescript
const ConnectionStatus = ({ status }: { status: 'connected' | 'connecting' | 'disconnected' }) => {
  const statusConfig = {
    connected: {
      color: 'bg-success',
      text: 'Connected',
      icon: CheckCircle2
    },
    connecting: {
      color: 'bg-warning',
      text: 'Connecting...',
      icon: Loader2
    },
    disconnected: {
      color: 'bg-destructive',
      text: 'Disconnected',
      icon: AlertCircle
    }
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={cn('w-2 h-2 rounded-full', config.color)} />
      <Icon className="w-3 h-3" />
      <span>{config.text}</span>
    </div>
  )
}
```

## Performance Optimizations

### Message Virtualization
```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

const VirtualizedMessagesList = ({ messages }: { messages: Message[] }) => {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated message height
    overscan: 5
  })

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <MessageBubble message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Debounced Token Updates
```typescript
import { useDebouncedCallback } from 'use-debounce'

const useStreamingTokens = (messageId: string) => {
  const [tokenBuffer, setTokenBuffer] = useState('')

  const flushTokens = useDebouncedCallback(() => {
    if (tokenBuffer) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: m.content + tokenBuffer }
            : m
        )
      )
      setTokenBuffer('')
    }
  }, 50) // Flush every 50ms

  const addToken = (token: string) => {
    setTokenBuffer((prev) => prev + token)
    flushTokens()
  }

  return { addToken }
}
```

### Memoized Components
```typescript
const MessageBubble = memo(({ message, nowTick }: { message: Message, nowTick: number }) => {
  // Component implementation
}, (prev, next) => {
  // Only re-render if message content or timestamp changes
  return prev.message.content === next.message.content &&
         prev.message.status === next.message.status &&
         Math.floor(prev.nowTick / 60000) === Math.floor(next.nowTick / 60000)
})
```

## Accessibility

### Keyboard Navigation
```typescript
const useKeyboardShortcuts = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus chat input
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('[data-chat-input]')?.focus()
      }

      // Escape to stop generation
      if (e.key === 'Escape' && isProcessing) {
        e.preventDefault()
        handleStop()
      }

      // Cmd/Ctrl + Enter to send
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isProcessing])
}
```

### Screen Reader Support
```typescript
<div
  role="log"
  aria-live="polite"
  aria-atomic="false"
  aria-label="AI chat messages"
>
  {messages.map((msg) => (
    <div
      key={msg.id}
      role="article"
      aria-label={`${msg.type} message at ${formatTime(msg.createdAt)}`}
    >
      <MessageBubble message={msg} />
    </div>
  ))}
</div>

<Input
  data-chat-input
  aria-label="Chat message input"
  aria-describedby="chat-help-text"
  placeholder="Ask AI..."
/>

<span id="chat-help-text" className="sr-only">
  Type your message and press Enter to send, or Cmd+Enter to send immediately
</span>
```

## Testing Strategy

### Unit Tests
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AIChatInterface } from './AIChatInterface'

describe('AIChatInterface', () => {
  it('should send message and display user message', () => {
    const onSendMessage = jest.fn()
    
    render(<AIChatInterface onSendMessage={onSendMessage} />)
    
    const input = screen.getByPlaceholderText(/Ask AI/i)
    const sendButton = screen.getByRole('button', { name: /send/i })

    fireEvent.change(input, { target: { value: 'Create a slide about AI' } })
    fireEvent.click(sendButton)

    expect(onSendMessage).toHaveBeenCalledWith('Create a slide about AI')
    expect(screen.getByText('Create a slide about AI')).toBeInTheDocument()
  })

  it('should stream AI response tokens', async () => {
    const mockStream = jest.fn()
    
    // Mock streamAIChat
    jest.spyOn(api, 'streamAIChat').mockImplementation(({ onToken, onClose }) => {
      setTimeout(() => onToken('Hello'), 10)
      setTimeout(() => onToken(' world'), 20)
      setTimeout(() => onClose?.(), 30)
      
      return {
        cancel: jest.fn(),
        done: Promise.resolve()
      }
    })

    render(<AIChatInterface />)
    
    const input = screen.getByPlaceholderText(/Ask AI/i)
    fireEvent.change(input, { target: { value: 'Hi' } })
    fireEvent.submit(input)

    await waitFor(() => {
      expect(screen.getByText(/Hello world/i)).toBeInTheDocument()
    })
  })

  it('should handle stop generation', async () => {
    const cancel = jest.fn()
    jest.spyOn(api, 'streamAIChat').mockReturnValue({
      cancel,
      done: new Promise(() => {})
    })

    render(<AIChatInterface />)
    
    const input = screen.getByPlaceholderText(/Ask AI/i)
    fireEvent.change(input, { target: { value: 'Generate slides' } })
    fireEvent.submit(input)

    const stopButton = await screen.findByText(/Stop/i)
    fireEvent.click(stopButton)

    expect(cancel).toHaveBeenCalled()
  })
})
```

### Integration Tests
```typescript
describe('AI Chat Integration', () => {
  it('should execute function calls from AI', async () => {
    const mockFunctionCall = {
      name: 'insert_slide',
      arguments: {
        position: 0,
        title: 'AI Benefits',
        content: ['Fast', 'Accurate', 'Scalable']
      }
    }

    jest.spyOn(api, 'streamAIChat').mockImplementation(({ onFunctionCall, onClose }) => {
      setTimeout(() => onFunctionCall?.(mockFunctionCall), 10)
      setTimeout(() => onClose?.(), 20)
      
      return {
        cancel: jest.fn(),
        done: Promise.resolve()
      }
    })

    const mockInsertSlide = jest.spyOn(api, 'post').mockResolvedValue({
      data: { slideId: 'slide-123' }
    })

    render(<AIChatInterface />)
    
    const input = screen.getByPlaceholderText(/Ask AI/i)
    fireEvent.change(input, { target: { value: 'Create a slide about AI benefits' } })
    fireEvent.submit(input)

    await waitFor(() => {
      expect(mockInsertSlide).toHaveBeenCalledWith(
        expect.stringContaining('/slides'),
        expect.objectContaining({
          position: 0,
          slide: expect.objectContaining({
            elements: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                properties: expect.objectContaining({
                  text: 'AI Benefits'
                })
              })
            ])
          })
        })
      )
    })
  })
})
```

## Future Enhancements

### Planned Features
- **Voice Input**: Speech-to-text for voice commands (Web Speech API)
- **Image Attachments**: Upload images in chat for context
- **Message Reactions**: Like/dislike AI responses for feedback
- **Conversation Branching**: Fork conversations from any point
- **Smart Suggestions**: Auto-complete and command suggestions
- **Multi-modal Input**: Support for images, files, and rich media
- **Conversation Templates**: Pre-built conversation starters
- **AI Personas**: Different AI personalities for different tasks
- **Collaborative Chat**: Multi-user chat sessions
- **Export Conversations**: Save chat history as markdown/PDF

### Technical Improvements
- WebSocket support for lower latency
- Offline message queue with sync
- Advanced caching strategies
- Message search and filtering
- Conversation analytics
- A/B testing for prompts
- Custom function definitions per workspace
