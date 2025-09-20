# AI Gateway Implementation

## Overview
The AI Gateway serves as a unified proxy for multiple AI providers (OpenAI, OpenRouter, Google Gemini), handling prompt construction, response streaming, cost tracking, and safety measures for the SlideCraft AI platform.

## Service Responsibilities
- Multi-provider AI service integration and routing
- Streaming response handling with Server-Sent Events
- Context-aware prompt construction with document content
- Usage tracking, cost monitoring, and rate limiting
- Safety filtering and content moderation
- Tool function calling for slide operations
- Model fallback and error recovery
- Token optimization and compression

## Tech Stack
- **Runtime**: Node.js 20+ with TypeScript
- **HTTP Client**: Axios with retry capabilities
- **Streaming**: Server-Sent Events (SSE) with graceful fallback
- **Database**: PostgreSQL for usage logs and context storage
- **Cache**: Redis for prompt caching and rate limiting
- **Validation**: Zod for request/response schemas
- **Monitoring**: OpenTelemetry for latency and cost tracking

## Provider Integration

### Provider Configuration
```typescript
interface AIProvider {
  name: string;
  baseURL: string;
  apiKey: string;
  models: ModelConfig[];
  rateLimits: RateLimitConfig;
  pricing: PricingConfig;
  features: ProviderFeatures;
}

interface ModelConfig {
  name: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsFunctions: boolean;
  supportsStreaming: boolean;
  costPerInputToken: number;
  costPerOutputToken: number;
}

const PROVIDERS: Record<string, AIProvider> = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY!,
    models: [
      {
        name: 'gpt-4-turbo-preview',
        displayName: 'GPT-4 Turbo',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsFunctions: true,
        supportsStreaming: true,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003
      },
      {
        name: 'gpt-3.5-turbo',
        displayName: 'GPT-3.5 Turbo',
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsFunctions: true,
        supportsStreaming: true,
        costPerInputToken: 0.0000005,
        costPerOutputToken: 0.0000015
      }
    ],
    rateLimits: {
      requestsPerMinute: 3500,
      tokensPerMinute: 90000
    },
    pricing: { /* pricing config */ },
    features: { supportsImages: true, supportsFunctions: true }
  },
  
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
    models: [
      {
        name: 'anthropic/claude-3-sonnet',
        displayName: 'Claude 3 Sonnet',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsFunctions: false,
        supportsStreaming: true,
        costPerInputToken: 0.000003,
        costPerOutputToken: 0.000015
      }
    ],
    rateLimits: {
      requestsPerMinute: 200,
      tokensPerMinute: 100000
    },
    pricing: { /* pricing config */ },
    features: { supportsImages: false, supportsFunctions: false }
  }
};
```

### Provider Client Implementation
```typescript
class AIProviderClient {
  private httpClient: AxiosInstance;
  
  constructor(private provider: AIProvider) {
    this.httpClient = axios.create({
      baseURL: provider.baseURL,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    this.setupRetryLogic();
  }

  async chat(request: ChatRequest): Promise<ChatResponse | AsyncIterable<ChatChunk>> {
    const model = this.provider.models.find(m => m.name === request.model);
    if (!model) {
      throw new AIError(`Model ${request.model} not supported by ${this.provider.name}`);
    }

    const payload = this.buildChatPayload(request, model);

    if (request.stream && model.supportsStreaming) {
      return this.streamChat(payload, model);
    } else {
      return this.regularChat(payload, model);
    }
  }

  private async streamChat(payload: any, model: ModelConfig): Promise<AsyncIterable<ChatChunk>> {
    const response = await this.httpClient.post('/chat/completions', {
      ...payload,
      stream: true
    }, {
      responseType: 'stream'
    });

    return this.parseStreamResponse(response.data, model);
  }

  private async *parseStreamResponse(stream: any, model: ModelConfig): AsyncIterable<ChatChunk> {
    let buffer = '';
    
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta;
            
            if (delta?.content) {
              yield {
                type: 'content',
                content: delta.content,
                model: model.name,
                provider: this.provider.name
              };
            }

            if (delta?.function_call) {
              yield {
                type: 'function_call',
                functionCall: delta.function_call,
                model: model.name,
                provider: this.provider.name
              };
            }
            
          } catch (error) {
            console.warn('Failed to parse stream chunk:', data);
          }
        }
      }
    }
  }

  private buildChatPayload(request: ChatRequest, model: ModelConfig): any {
    const basePayload = {
      model: model.name,
      messages: request.messages,
      max_tokens: Math.min(request.maxTokens || 2000, model.maxOutputTokens),
      temperature: request.temperature || 0.7,
      top_p: request.topP || 1.0
    };

    // Add function calling if supported
    if (request.functions && model.supportsFunctions) {
      basePayload.functions = request.functions;
      if (request.functionCall) {
        basePayload.function_call = request.functionCall;
      }
    }

    // Provider-specific adjustments
    switch (this.provider.name) {
      case 'OpenAI':
        return basePayload;
        
      case 'OpenRouter':
        return {
          ...basePayload,
          // OpenRouter specific headers
          'HTTP-Referer': process.env.FRONTEND_URL,
          'X-Title': 'SlideCraft AI'
        };
        
      default:
        return basePayload;
    }
  }
}
```

## AI Gateway Service

### Main Gateway Implementation
```typescript
class AIGatewayService {
  private providers: Map<string, AIProviderClient> = new Map();
  private rateLimiter: RateLimiter;
  private usageTracker: UsageTracker;
  private contextBuilder: ContextBuilder;

  constructor() {
    this.initializeProviders();
    this.rateLimiter = new RateLimiter();
    this.usageTracker = new UsageTracker();
    this.contextBuilder = new ContextBuilder();
  }

  async chat(request: AIChatRequest, userId: string): Promise<ChatResponse | AsyncIterable<ChatChunk>> {
    // Rate limiting
    const rateLimitResult = await this.rateLimiter.checkLimit(userId);
    if (!rateLimitResult.allowed) {
      throw new AIError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', {
        resetTime: rateLimitResult.resetTime
      });
    }

    // Model selection and fallback
    const { provider, model } = await this.selectOptimalModel(request);
    
    // Context building
    const enhancedRequest = await this.contextBuilder.buildContext(request, userId);
    
    // Safety filtering
    await this.safetyFilter(enhancedRequest);

    // Execute request
    const startTime = Date.now();
    try {
      const result = await provider.chat(enhancedRequest);
      
      // Track usage
      await this.trackUsage(userId, request, result, Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      // Attempt fallback if primary model fails
      if (error.code === 'MODEL_OVERLOADED' && request.allowFallback !== false) {
        return this.attemptFallback(enhancedRequest, userId, error);
      }
      
      throw error;
    }
  }

  private async selectOptimalModel(request: AIChatRequest): Promise<{ provider: AIProviderClient; model: ModelConfig }> {
    const requestedModel = request.model;
    
    // Find provider that has this model
    for (const [providerName, provider] of this.providers) {
      const model = provider.provider.models.find(m => m.name === requestedModel);
      if (model) {
        return { provider, model };
      }
    }

    // Fallback to default model
    const defaultProvider = this.providers.get('openai');
    const defaultModel = defaultProvider!.provider.models[0];
    
    return { provider: defaultProvider!, model: defaultModel };
  }

  private async attemptFallback(
    request: ChatRequest, 
    userId: string, 
    originalError: Error
  ): Promise<ChatResponse | AsyncIterable<ChatChunk>> {
    const fallbackModels = [
      'gpt-3.5-turbo',
      'anthropic/claude-3-sonnet'
    ];

    for (const fallbackModel of fallbackModels) {
      try {
        const { provider } = await this.selectOptimalModel({ ...request, model: fallbackModel });
        return await provider.chat({ ...request, model: fallbackModel });
      } catch (fallbackError) {
        logger.warn('fallback_model_failed', {
          userId,
          fallbackModel,
          error: fallbackError.message
        });
      }
    }

    // All fallbacks failed, throw original error
    throw originalError;
  }
}
```

### Context Building
```typescript
class ContextBuilder {
  constructor(private documentsService: DocumentsService) {}

  async buildContext(request: AIChatRequest, userId: string): Promise<ChatRequest> {
    let systemPrompt = this.getBaseSystemPrompt();
    let contextMessages: ChatMessage[] = [];

    // Add document context if specified
    if (request.documentId) {
      const documentContext = await this.getDocumentContext(request.documentId, userId);
      if (documentContext) {
        systemPrompt += `\n\nCurrent document context:\n${documentContext}`;
      }
    }

    // Add selection context if specified
    if (request.selection) {
      const selectionContext = this.formatSelection(request.selection);
      systemPrompt += `\n\nCurrent selection:\n${selectionContext}`;
    }

    // Build final message array
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...contextMessages,
      ...request.messages
    ];

    // Optimize for token limits
    const optimizedMessages = await this.optimizeTokenUsage(messages, request.model);

    return {
      ...request,
      messages: optimizedMessages,
      functions: this.getSlideFunctions()
    };
  }

  private async getDocumentContext(documentId: string, userId: string): Promise<string | null> {
    try {
      const document = await this.documentsService.getDocument(documentId, userId);
      if (!document || !document.deck) return null;

      // Extract key content for context
      const slides = document.deck.slides.slice(0, 5); // Limit to first 5 slides for context
      const context = slides.map((slide, index) => {
        const textElements = slide.elements
          .filter(el => el.type === 'text')
          .map(el => el.properties.text)
          .join(' ');
        
        return `Slide ${index + 1}: ${textElements}`;
      }).join('\n');

      return `Document: "${document.title}"\nTotal slides: ${document.deck.slides.length}\n\n${context}`;
      
    } catch (error) {
      logger.warn('failed_to_load_document_context', {
        documentId,
        userId,
        error: error.message
      });
      return null;
    }
  }

  private getBaseSystemPrompt(): string {
    return `You are an AI assistant specialized in creating and editing presentation slides. 
    
Your capabilities:
- Create new slides with engaging content
- Edit existing slide content for clarity and impact  
- Suggest improvements to slide layout and design
- Generate speaker notes and talking points
- Adapt content for different audiences

When creating slides, focus on:
- Clear, concise messaging
- Visual hierarchy and readability
- Engaging titles and bullet points
- Appropriate content for business presentations

You can use the following functions to make changes:
- insert_slide: Add a new slide at a specific position
- edit_slide: Modify existing slide content
- delete_slide: Remove a slide
- reorder_slides: Change slide order

Always confirm significant changes with the user before applying them.`;
  }

  private getSlideFunctions(): Function[] {
    return [
      {
        name: 'insert_slide',
        description: 'Insert a new slide at the specified position',
        parameters: {
          type: 'object',
          properties: {
            position: {
              type: 'number',
              description: 'Position to insert the slide (0-based index)'
            },
            title: {
              type: 'string',
              description: 'Slide title'
            },
            content: {
              type: 'array',
              description: 'Slide content as array of text elements',
              items: { type: 'string' }
            },
            layout: {
              type: 'string',
              enum: ['title_slide', 'content_slide', 'two_column', 'image_slide'],
              description: 'Slide layout template'
            }
          },
          required: ['position', 'title', 'content']
        }
      },
      {
        name: 'edit_slide',
        description: 'Edit content of an existing slide',
        parameters: {
          type: 'object',
          properties: {
            slideIndex: {
              type: 'number',
              description: 'Index of slide to edit (0-based)'
            },
            title: {
              type: 'string',
              description: 'New slide title'
            },
            content: {
              type: 'array',
              description: 'Updated slide content',
              items: { type: 'string' }
            }
          },
          required: ['slideIndex']
        }
      }
    ];
  }
}
```

## Streaming Implementation

### SSE Handler
```typescript
class StreamingHandler {
  async handleStreamingChat(req: Request, res: Response, chatStream: AsyncIterable<ChatChunk>) {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });

    // Send initial connection event
    this.sendEvent(res, 'connected', { timestamp: new Date().toISOString() });

    let functionCallBuffer = '';
    let currentFunctionCall: any = null;

    try {
      for await (const chunk of chatStream) {
        switch (chunk.type) {
          case 'content':
            this.sendEvent(res, 'content', {
              delta: chunk.content,
              model: chunk.model,
              provider: chunk.provider
            });
            break;

          case 'function_call':
            if (chunk.functionCall.name && !currentFunctionCall) {
              // Start of function call
              currentFunctionCall = {
                name: chunk.functionCall.name,
                arguments: ''
              };
            }
            
            if (chunk.functionCall.arguments) {
              currentFunctionCall.arguments += chunk.functionCall.arguments;
            }
            break;

          case 'function_call_complete':
            if (currentFunctionCall) {
              try {
                const args = JSON.parse(currentFunctionCall.arguments);
                this.sendEvent(res, 'function_call', {
                  name: currentFunctionCall.name,
                  arguments: args
                });
                currentFunctionCall = null;
              } catch (error) {
                this.sendEvent(res, 'error', {
                  code: 'INVALID_FUNCTION_ARGS',
                  message: 'Invalid function call arguments'
                });
              }
            }
            break;
        }
      }

      this.sendEvent(res, 'done', { timestamp: new Date().toISOString() });
      
    } catch (error) {
      this.sendEvent(res, 'error', {
        code: error.code || 'STREAM_ERROR',
        message: error.message
      });
    } finally {
      res.end();
    }
  }

  private sendEvent(res: Response, event: string, data: any) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
```

## Usage Tracking & Analytics

### Usage Tracker
```typescript
class UsageTracker {
  constructor(private db: DatabaseService) {}

  async trackUsage(
    userId: string, 
    request: AIChatRequest, 
    response: ChatResponse | AsyncIterable<ChatChunk>,
    duration: number
  ) {
    const usage: AIUsageLog = {
      id: uuid(),
      userId,
      documentId: request.documentId,
      provider: this.extractProvider(response),
      model: request.model,
      promptTokens: await this.countTokens(request.messages),
      completionTokens: await this.countResponseTokens(response),
      totalTokens: 0, // Will be calculated
      cost: 0, // Will be calculated
      latency: duration,
      createdAt: new Date()
    };

    usage.totalTokens = usage.promptTokens + usage.completionTokens;
    usage.cost = this.calculateCost(usage);

    // Save to database
    await this.db.saveAIUsageLog(usage);

    // Update user quota
    await this.updateUserQuota(userId, usage);

    // Emit metrics
    METRICS.aiRequestsTotal.inc({
      provider: usage.provider,
      model: usage.model,
      user_id: userId
    });

    METRICS.aiLatency.observe(
      { provider: usage.provider, model: usage.model },
      duration / 1000
    );

    METRICS.aiTokensConsumed.add(
      { provider: usage.provider, model: usage.model, type: 'prompt' },
      usage.promptTokens
    );

    METRICS.aiTokensConsumed.add(
      { provider: usage.provider, model: usage.model, type: 'completion' },
      usage.completionTokens
    );
  }

  private calculateCost(usage: AIUsageLog): number {
    const provider = PROVIDERS[usage.provider];
    if (!provider) return 0;

    const model = provider.models.find(m => m.name === usage.model);
    if (!model) return 0;

    const promptCost = usage.promptTokens * model.costPerInputToken;
    const completionCost = usage.completionTokens * model.costPerOutputToken;

    return promptCost + completionCost;
  }

  async getUserUsage(userId: string, period: 'day' | 'week' | 'month'): Promise<UsageSummary> {
    const startDate = this.getStartDate(period);
    
    const query = `
      SELECT 
        provider,
        model,
        COUNT(*) as request_count,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(cost) as total_cost,
        AVG(latency_ms) as avg_latency
      FROM ai_logs 
      WHERE user_id = $1 
        AND created_at >= $2
      GROUP BY provider, model
      ORDER BY total_cost DESC
    `;

    const result = await this.db.query(query, [userId, startDate]);
    
    return {
      period,
      usage: result.rows,
      totalRequests: result.rows.reduce((sum, row) => sum + row.request_count, 0),
      totalCost: result.rows.reduce((sum, row) => sum + row.total_cost, 0)
    };
  }
}
```

## Safety & Content Filtering

### Safety Filter
```typescript
class SafetyFilter {
  private blockedPatterns: RegExp[] = [
    /\b(?:attack|hack|exploit|malware)\b/i,
    /\b(?:suicide|self-harm|violence)\b/i,
    /\b(?:illegal|criminal|fraud)\b/i
  ];

  async filterRequest(request: ChatRequest): Promise<void> {
    for (const message of request.messages) {
      if (message.role === 'user') {
        await this.checkContent(message.content);
      }
    }
  }

  async filterResponse(content: string): Promise<string> {
    // Check for sensitive information
    const sensitivePatterns = [
      /\b(?:password|secret|token|key)\s*[:=]\s*\S+/gi,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g // Email addresses
    ];

    let filtered = content;
    for (const pattern of sensitivePatterns) {
      filtered = filtered.replace(pattern, '[REDACTED]');
    }

    return filtered;
  }

  private async checkContent(content: string): Promise<void> {
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(content)) {
        throw new AIError(
          'Content blocked by safety filter',
          'CONTENT_BLOCKED',
          { pattern: pattern.source }
        );
      }
    }

    // Additional checks could include:
    // - External moderation API calls
    // - Machine learning-based content classification
    // - User-specific filtering rules
  }
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('AIGatewayService', () => {
  let service: AIGatewayService;
  let mockProvider: jest.Mocked<AIProviderClient>;

  beforeEach(() => {
    mockProvider = createMockProvider();
    service = new AIGatewayService();
    service.providers.set('test', mockProvider);
  });

  describe('chat', () => {
    it('should handle regular chat request', async () => {
      const request: AIChatRequest = {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Create a slide about AI benefits' }
        ],
        stream: false
      };

      mockProvider.chat.mockResolvedValue({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Here are the key benefits of AI...'
          }
        }],
        usage: { prompt_tokens: 20, completion_tokens: 50, total_tokens: 70 }
      });

      const result = await service.chat(request, 'user-123');
      
      expect(result).toEqual(
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({
              message: expect.objectContaining({
                content: 'Here are the key benefits of AI...'
              })
            })
          ])
        })
      );
    });

    it('should handle streaming response', async () => {
      const request: AIChatRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Help me create slides' }],
        stream: true
      };

      const mockStream = (async function* () {
        yield { type: 'content', content: 'I can help', model: 'gpt-3.5-turbo' };
        yield { type: 'content', content: ' you create', model: 'gpt-3.5-turbo' };
        yield { type: 'content', content: ' great slides!', model: 'gpt-3.5-turbo' };
      })();

      mockProvider.chat.mockResolvedValue(mockStream);

      const result = await service.chat(request, 'user-123');
      
      let fullContent = '';
      for await (const chunk of result as AsyncIterable<ChatChunk>) {
        if (chunk.type === 'content') {
          fullContent += chunk.content;
        }
      }
      
      expect(fullContent).toBe('I can help you create great slides!');
    });

    it('should apply rate limiting', async () => {
      // Mock rate limiter to return not allowed
      const mockRateLimiter = jest.spyOn(service.rateLimiter, 'checkLimit');
      mockRateLimiter.mockResolvedValue({ 
        allowed: false, 
        resetTime: new Date(Date.now() + 60000) 
      });

      const request: AIChatRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test' }]
      };

      await expect(service.chat(request, 'user-123')).rejects.toThrow('Rate limit exceeded');
    });
  });
});
```

### Integration Tests
```typescript
describe('AI Gateway Integration', () => {
  let app: Application;
  let mockOpenAI: nock.Scope;

  beforeEach(() => {
    app = createTestApp();
    mockOpenAI = nock('https://api.openai.com');
  });

  it('should handle complete streaming chat flow', async () => {
    const user = await createTestUser();
    const token = createJWTToken(user.id);

    // Mock OpenAI streaming response
    mockOpenAI
      .post('/v1/chat/completions')
      .reply(200, (uri, requestBody) => {
        const mockStream = `data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n` +
                          `data: {"choices":[{"delta":{"content":" world"}}]}\n\n` +
                          `data: [DONE]\n\n`;
        return mockStream;
      }, {
        'Content-Type': 'text/event-stream'
      });

    const response = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say hello' }],
        stream: true
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    
    // Parse SSE response
    const events = parseSSEResponse(response.text);
    expect(events).toContainEqual({
      event: 'content',
      data: expect.objectContaining({ delta: 'Hello' })
    });
  });
});
```

## Monitoring & Observability

### Metrics Collection
```typescript
const METRICS = {
  aiRequestsTotal: new Counter({
    name: 'ai_requests_total',
    help: 'Total AI requests',
    labelNames: ['provider', 'model', 'status', 'user_id']
  }),

  aiLatency: new Histogram({
    name: 'ai_latency_seconds',
    help: 'AI request latency',
    labelNames: ['provider', 'model'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  }),

  aiTokensConsumed: new Counter({
    name: 'ai_tokens_consumed_total', 
    help: 'Total tokens consumed',
    labelNames: ['provider', 'model', 'type']
  }),

  aiCostTotal: new Counter({
    name: 'ai_cost_total',
    help: 'Total AI costs',
    labelNames: ['provider', 'model']
  })
};
```

## Deployment Configuration

### Environment Variables
```bash
# AI Provider Keys
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...

# Rate Limiting
AI_RATE_LIMIT_RPM=60
AI_RATE_LIMIT_TPM=40000

# Safety
ENABLE_CONTENT_FILTERING=true
MAX_CONTEXT_TOKENS=16000
MAX_RESPONSE_TOKENS=2000

# Monitoring
TRACK_AI_USAGE=true
LOG_AI_REQUESTS=true
ENABLE_COST_ALERTS=true
COST_ALERT_THRESHOLD=100.00
```

## Future Enhancements

### Planned Features
- **Advanced Function Calling**: Complex slide operations and batch edits
- **Image Generation**: Integration with DALL-E, Midjourney for slide visuals
- **Voice Integration**: Speech-to-text for voice commands
- **Custom Models**: Fine-tuned models for presentation-specific tasks
- **Advanced Caching**: Semantic caching for similar queries
- **Multi-modal Support**: Image and document understanding
- **Workflow Automation**: AI-driven presentation workflows
- **Enterprise Features**: Custom model deployment and data privacy controls