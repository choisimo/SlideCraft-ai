# AI Governance & Cost Management Specification

## Purpose
Define model selection strategy, provider routing logic, cost tracking & budgeting framework, token usage governance, and guardrails for AI features to ensure responsible, cost-effective, and performant AI integration.

## Scope
Covers provider/model catalog, selection matrix, cost attribution & quotas, token optimization, safety filters, monitoring dashboards, and alerting policies for AI operations.

## AI Provider & Model Catalog

### Supported Providers
| Provider | Priority | Use Case | Routing Strategy | Notes |
|----------|----------|----------|------------------|-------|
| OpenAI | P0 | Primary GPT models, function calling | Default for all chat/completion | Best function calling support |
| OpenRouter | P1 | Fallback & cost optimization, Claude access | Fallback or user-selected Claude | Multi-model aggregator |
| Anthropic Direct | P2 | Future direct integration | Not yet implemented | Evaluate if OpenRouter insufficient |
| Google Gemini | P2 | Future multimodal features | Not yet implemented | Potential for document understanding |

### Model Inventory
| Model ID | Provider | Context Window | Max Output | Cost/1K Input | Cost/1K Output | Supports Functions | Supports Streaming | Use Case |
|----------|----------|----------------|------------|---------------|----------------|-------------------|-------------------|----------|
| `gpt-4-turbo-preview` | OpenAI | 128,000 | 4,096 | $0.01 | $0.03 | ✅ | ✅ | Complex reasoning, function calls |
| `gpt-4-turbo` | OpenAI | 128,000 | 4,096 | $0.01 | $0.03 | ✅ | ✅ | Latest GPT-4 (stable) |
| `gpt-4o` | OpenAI | 128,000 | 16,384 | $0.005 | $0.015 | ✅ | ✅ | Optimized GPT-4, lower cost |
| `gpt-3.5-turbo` | OpenAI | 16,385 | 4,096 | $0.0005 | $0.0015 | ✅ | ✅ | Fast responses, simple tasks |
| `anthropic/claude-3-opus` | OpenRouter | 200,000 | 4,096 | $0.015 | $0.075 | ❌ | ✅ | Max quality, long context |
| `anthropic/claude-3-sonnet` | OpenRouter | 200,000 | 4,096 | $0.003 | $0.015 | ❌ | ✅ | Balanced quality/cost |
| `anthropic/claude-3-haiku` | OpenRouter | 200,000 | 4,096 | $0.00025 | $0.00125 | ❌ | ✅ | Ultra-low cost, speed |

**Pricing Note:** Costs in USD as of 2024; subject to provider changes. Updated quarterly via config.

## Model Selection Strategy

### Default Model Rules
| Request Type | Document Context | User Preference | Selected Model | Rationale |
|-------------|------------------|-----------------|----------------|-----------|
| Chat (no functions) | <5 slides | None | `gpt-3.5-turbo` | Fast, cheap for simple queries |
| Chat (no functions) | >5 slides or >2K tokens | None | `gpt-4o` | Better context handling, cost-optimized |
| Chat (functions needed) | Any | None | `gpt-4o` | Best function calling at lower cost than gpt-4-turbo |
| Complex reasoning | Any | None | `gpt-4-turbo` | Deep analysis, multi-step tasks |
| User override | Any | `claude-3-sonnet` | `anthropic/claude-3-sonnet` | Honor user model choice (if quota permits) |

### Fallback Cascade (on Model Failure)
```
Primary: gpt-4o
  ↓ (on overload/error)
Fallback 1: gpt-3.5-turbo (if no functions required)
  ↓ (on failure)
Fallback 2: anthropic/claude-3-sonnet (via OpenRouter)
  ↓ (on failure)
Terminal Error: AI_SERVICE_UNAVAILABLE
```

**Exception:** If `allowFallback: false` in request, fail immediately without cascade.

### Provider Routing Logic
```typescript
function selectModel(request: AIChatRequest, context: RequestContext): ModelSelection {
  // User-specified model takes priority (subject to quota check)
  if (request.model && isModelAllowed(request.model, context.userId)) {
    return { provider: getProviderForModel(request.model), model: request.model };
  }

  // Function calling requirement forces OpenAI (only provider with function support)
  if (request.functions && request.functions.length > 0) {
    return { provider: 'openai', model: 'gpt-4o' };
  }

  // Context size determines tier
  const estimatedTokens = estimateContextTokens(request.messages, context.documentId);
  
  if (estimatedTokens < 2000) {
    return { provider: 'openai', model: 'gpt-3.5-turbo' };
  } else if (estimatedTokens < 8000) {
    return { provider: 'openai', model: 'gpt-4o' };
  } else {
    // Large context: use Claude or GPT-4 Turbo depending on cost/quota balance
    if (context.userTier === 'free' || context.monthlySpend > 50) {
      return { provider: 'openrouter', model: 'anthropic/claude-3-haiku' }; // Cheapest long context
    } else {
      return { provider: 'openai', model: 'gpt-4-turbo' };
    }
  }
}
```

## Cost Tracking & Attribution

### Cost Calculation
- **Per Request:** Cost = (inputTokens × costPerInputToken) + (outputTokens × costPerOutputToken)
- **Tracked Fields:**
  - `userId` - User/org attribution
  - `documentId` - Optional document context
  - `provider` - OpenAI, OpenRouter, etc.
  - `model` - Specific model name
  - `promptTokens` - Input token count
  - `completionTokens` - Output token count
  - `totalTokens` - Sum
  - `estimatedCost` - USD amount
  - `latencyMs` - Request duration
  - `timestamp` - Request time
  - `success` - Boolean (true/false/error)

### Cost Aggregation Levels
1. **Per-User Daily/Weekly/Monthly:** Total spend, request count, average cost per request
2. **Per-Document:** AI cost attributed to specific presentation (for team/project accounting)
3. **Per-Model:** Distribution of spend across models (inform optimization)
4. **Global:** Platform-wide AI spend (budget monitoring)

### Storage
- **Real-time:** Redis sorted set for user daily/monthly running totals (fast quota checks)
- **Historical:** Postgres `ai_usage_logs` table (analytics, billing, audits)
  - Retention: 90 days detailed logs, 2 years aggregated summaries

## Quota & Budget Management

### Free Tier Limits (MVP)
| Resource | Limit | Reset Period | Overage Handling |
|----------|-------|--------------|------------------|
| Requests | 50 requests/day | Rolling 24h | Block with upgrade prompt |
| Tokens | 100K tokens/month | Calendar month | Block or throttle to 10 req/day |
| Cost | $5/month | Calendar month | Hard stop at $5.00 |

### Pro Tier Limits (Future)
| Resource | Limit | Reset Period | Overage Handling |
|----------|-------|--------------|------------------|
| Requests | 500 requests/day | Rolling 24h | Soft limit, alert at 80% |
| Tokens | 1M tokens/month | Calendar month | Soft limit |
| Cost | $50/month | Calendar month | Alert at $40, hard stop at $60 (safety buffer) |

### Enterprise Tier (Future)
- Custom quotas negotiated per contract
- Cost tracking per team/department via `organizationId` attribute
- Spend alerts configurable (e.g., email CFO at >$1000/month)

### Quota Enforcement Flow
```typescript
async function checkQuota(userId: string, estimatedCost: number): Promise<QuotaCheckResult> {
  const userTier = await getUserTier(userId); // 'free' | 'pro' | 'enterprise'
  const monthlySpend = await getMonthlySpend(userId); // From Redis
  const dailyRequests = await getDailyRequestCount(userId);

  const limits = TIER_LIMITS[userTier];

  // Check daily request limit
  if (dailyRequests >= limits.requestsPerDay) {
    return { allowed: false, reason: 'DAILY_REQUEST_LIMIT', resetTime: getNextDayReset() };
  }

  // Check monthly cost limit
  if ((monthlySpend + estimatedCost) > limits.costPerMonth) {
    return { allowed: false, reason: 'MONTHLY_BUDGET_EXCEEDED', resetTime: getNextMonthReset() };
  }

  // Soft warning at 80% threshold
  if ((monthlySpend + estimatedCost) > (limits.costPerMonth * 0.8)) {
    return { allowed: true, warning: 'APPROACHING_BUDGET_LIMIT', remainingBudget: limits.costPerMonth - monthlySpend };
  }

  return { allowed: true };
}
```

## Token Usage Optimization

### Context Compression Strategies
1. **Slide Summarization:** For documents >10 slides, extract key text from first 5 + last 2 slides only (configurable)
2. **Message History Trimming:** Keep only last 10 messages in conversation context; summarize older history into single system message
3. **Function Schema Minification:** Remove verbose descriptions if token budget tight (fallback: include only required params)

### Token Estimation
- **Library:** `tiktoken` (OpenAI) or `anthropic-tokenizer` (Anthropic)
- **Pre-request Estimation:** Calculate before API call to enforce max context window
- **Dynamic Adjustment:** If request exceeds context limit, auto-trim messages/context and retry once

### Caching (Future Enhancement)
- **Semantic Caching:** Hash (user intent + document context) → cache response for 5 minutes (Redis)
- **Prompt Prefix Caching:** For repeated system prompts (provider-level caching if supported, e.g., Anthropic prompt caching)
- **Cost Savings:** Reduce redundant API calls by ~30-50% for repetitive workflows

## Safety & Governance Guardrails

### Content Filtering
| Filter Type | Implementation | Action on Violation |
|-------------|----------------|---------------------|
| Profanity/Hate Speech | Pattern matching + OpenAI Moderation API | Block request, log incident |
| PII Detection | Regex (email, SSN, credit card) | Warn user, redact from logs |
| Malicious Intent | Keyword blocklist (hack, exploit, fraud) | Block request, flag for review |
| NSFW Content | OpenAI Moderation API (if image inputs) | Block or strip images |

### Output Validation
- **Function Call Validation:** Ensure function arguments conform to schema before execution
- **Injection Prevention:** Sanitize user input to prevent prompt injection attacks (e.g., "Ignore previous instructions...")
- **Response Sanitization:** Strip sensitive data from AI responses before sending to client (API keys, internal URLs)

### Audit Logging
- **All AI Requests:** Log sanitized prompts (strip PII), model, user, timestamp, cost
- **Retention:** 90 days (compliance/security); summarized metadata retained 2 years
- **Access:** Admin dashboard for audit trail queries

### Rate Limiting (Abuse Prevention)
| Limit Type | Threshold | Action |
|------------|-----------|--------|
| Per-user requests/minute | 10 req/min | Throttle (429 response, retry after 60s) |
| Per-user tokens/minute | 10K tokens/min | Throttle |
| Global requests/second | 500 req/s | Shed load (503 response) |
| Concurrent streams/user | 3 concurrent | Queue or reject new requests |

## Monitoring & Alerting

### Key Metrics (Reference: `monitoring-observability.md`)
| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `ai_requests_total` | Counter | provider, model, status, user_tier | — |
| `ai_latency_seconds` | Histogram | provider, model | P95 >5s |
| `ai_tokens_consumed_total` | Counter | provider, model, type (prompt/completion) | — |
| `ai_cost_total` | Counter | provider, model | >$100/day |
| `ai_errors_total` | Counter | provider, model, error_code | >5% error rate |
| `ai_quota_exceeded_total` | Counter | user_tier, reason | Spike >10/min (abuse) |

### Cost Dashboards
1. **Daily Spend Trend:** Line chart of cost per day (by provider, model)
2. **Top Users by Cost:** Table of highest-spending users/orgs (identify optimization targets)
3. **Model Distribution:** Pie chart of request volume by model
4. **Error Rate by Model:** Track unreliable models for fallback tuning

### Alert Rules
| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Daily cost >$200 | Sum(ai_cost_total) >200 in 24h | Critical | Page on-call, review spend |
| P95 latency >10s | ai_latency_seconds{quantile="0.95"} >10 | Warning | Investigate slow provider |
| Error rate >10% | ai_errors_total / ai_requests_total >0.1 | Critical | Activate fallback cascade |
| Quota abuse spike | ai_quota_exceeded_total >50/5min | Warning | Investigate potential abuse |

## Provider Cost Optimization Strategies

### 1. Intelligent Routing (Cost-Aware)
- Route simple queries to `gpt-3.5-turbo` or `claude-3-haiku` (10x cheaper than GPT-4)
- Reserve `gpt-4-turbo` for complex reasoning or explicit user requests
- Monitor response quality per model; auto-adjust routing if lower-tier model quality degrades

### 2. Token Budget Enforcement
- Cap `maxOutputTokens` per request tier:
  - Free: 500 tokens
  - Pro: 2000 tokens
  - Enterprise: 4000 tokens
- Prompt users to be concise ("Generate 3 bullet points" vs open-ended)

### 3. Batching (Future)
- Aggregate multiple small requests into single batch API call (if provider supports, e.g., OpenAI batch API)
- Save on per-request overhead costs

### 4. Downtime Avoidance
- Use fallback providers during primary provider outages to maintain service (prevents revenue loss)
- Monitor provider status pages, pre-emptively route around known issues

## Error Taxonomy (AI-Specific)
| Error Code | Trigger | User Message | Retryable | Fallback Model |
|------------|---------|--------------|-----------|----------------|
| `AI_QUOTA_EXCEEDED` | User quota limit hit | "Daily AI limit reached. Upgrade or try tomorrow." | No | — |
| `AI_MODEL_OVERLOADED` | Provider 503/429 | "AI service busy, retrying..." | Yes (backoff) | Use fallback cascade |
| `AI_RATE_LIMIT` | Rate limiter reject | "Too many requests, slow down." | Yes (after delay) | — |
| `AI_CONTENT_BLOCKED` | Safety filter violation | "Request blocked by content policy." | No | — |
| `AI_INVALID_FUNCTION` | Bad function call args | "AI action failed, try rephrasing." | No (log for debug) | — |
| `AI_SERVICE_UNAVAILABLE` | All providers down | "AI temporarily unavailable." | Yes (after 30s) | — |
| `AI_CONTEXT_TOO_LARGE` | Exceeds max tokens | "Document too large for AI. Try smaller selection." | No (user action) | Auto-trim context & retry once |

## Provider API Key Management

### Security
- **Storage:** Secrets manager (e.g., Cloudflare Workers Secrets, AWS Secrets Manager)
- **Rotation:** Quarterly key rotation policy; automated via script
- **Access Control:** Keys accessible only to AI Gateway service (not frontend, not other workers)
- **Logging:** Never log full API keys; redact in logs (`sk-...abc123` → `sk-***`)

### Multi-Tenancy (Enterprise Future)
- Allow enterprise customers to BYO API keys (bring your own keys) for direct billing
- Store customer keys encrypted at rest; decrypt only for their requests
- Separate cost tracking (platform cost vs customer's own spend)

## Acceptance Criteria (MVP)

### Model Selection
- ✅ Default to `gpt-4o` for function calls, `gpt-3.5-turbo` for simple queries
- ✅ Fallback cascade implemented and tested (primary fail → fallback → error)
- ✅ User can override model via request parameter (subject to quota)

### Cost Tracking
- ✅ Every AI request logged with tokens, cost, model, user
- ✅ User dashboard shows daily/monthly spend, remaining quota
- ✅ Admin dashboard shows platform-wide cost trends

### Quota Enforcement
- ✅ Free tier: 50 req/day, $5/month hard limits enforced
- ✅ 429 response when quota exceeded, with clear error message
- ✅ Quota resets at midnight UTC (daily) and 1st of month (monthly)

### Safety
- ✅ OpenAI Moderation API integrated, blocks flagged content
- ✅ PII redaction in logs (emails, etc.)
- ✅ No sensitive data in AI responses (API keys, secrets)

### Monitoring
- ✅ Metrics exported to Prometheus (ai_requests_total, ai_cost_total, ai_latency_seconds)
- ✅ Alert fires if daily cost >$200
- ✅ Dashboard shows real-time cost, error rate, model distribution

## Future Enhancements

### Advanced Cost Optimization
- **Prompt Caching:** Leverage Anthropic's prompt caching (reduce cost for repeated system prompts by ~90%)
- **Fine-Tuned Models:** Train custom GPT-3.5 model on SlideCraft data (cheaper inference, better quality)
- **Edge Inference:** Run small models (e.g., 7B) on-device for offline/low-latency tasks

### Enhanced Governance
- **AI Usage Analytics:** Per-feature cost breakdown (chat vs slide generation vs export descriptions)
- **A/B Testing:** Compare model quality/cost trade-offs (gpt-4o vs claude-3-sonnet for specific tasks)
- **User Feedback Loop:** "Was this AI response helpful?" → correlate feedback with model/cost to optimize routing

### Multi-Modal Features
- **Image Understanding:** GPT-4 Vision or Gemini for slide layout analysis, chart interpretation
- **Image Generation:** DALL-E 3 or Stable Diffusion for auto-generating slide visuals (separate quota/budget)
- **Voice Input:** Whisper API for speech-to-text (transcribe voice commands into slide content)

### Enterprise Features
- **Team Quotas:** Shared budgets across organization, departmental breakdown
- **Custom Models:** Allow enterprises to deploy fine-tuned or private models (Azure OpenAI, AWS Bedrock)
- **Compliance Modes:** Data residency (EU-only models), no data retention (ephemeral requests)

## Open Questions

### Cost Allocation
- **Q:** Should document-level AI costs be surfaced to end users (e.g., "This presentation used $2.50 in AI credits")?
- **Decision Needed:** Product decision; if yes, requires UI changes + schema update.

### Model Quality Baselines
- **Q:** What's acceptable quality threshold for auto-routing to cheaper models (e.g., if GPT-3.5 response quality <80% of GPT-4, always use GPT-4)?
- **Decision Needed:** Run quality evals (human review or LLM-as-judge) to set thresholds.

### Fallback Strategy for Function Calls
- **Q:** If GPT-4 (only function-capable model in catalog) is down, should we disable function-based features or have Claude attempt text-based equivalents?
- **Decision Needed:** UX trade-off; maybe degrade gracefully (manual action prompts instead of function calls).

### OpenRouter Reliability
- **Q:** OpenRouter adds latency/cost overhead vs direct provider integrations. Evaluate direct Anthropic API for Claude?
- **Decision Needed:** Benchmark latency, cost, reliability over 30 days; switch if significant savings/improvement.

## Cross-References
- **AI Gateway Implementation:** `/docs/backend/implementation/ai-gateway.md` (detailed code, provider clients)
- **Monitoring & Observability:** `/docs/integration/monitoring-observability.md` (metrics definitions, dashboards)
- **Error Taxonomy:** `/docs/integration/error-taxonomy-and-recovery.md` (error codes, retry policies)
- **Job Lifecycle:** `/docs/integration/job-lifecycle-spec.md` (AI job stages, retry logic)
- **Testing Strategy:** `/docs/integration/testing-strategy.md` (AI integration tests, mock providers)
