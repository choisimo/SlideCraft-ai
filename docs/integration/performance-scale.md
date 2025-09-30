# Performance & Scale Specification

## Purpose
Define load profiles, capacity models, scaling thresholds, and performance test suites to ensure SlideCraft meets latency SLOs under expected and peak traffic while maintaining cost-efficiency.

## Scope
Covers frontend API gateway, backend job workers (convert, export, AI), storage subsystems, realtime SSE infrastructure, and third-party service (AI provider) integration points.

## Design Principles
- Horizontal scalability for stateless components (API gateway, workers).
- Vertical optimization for compute-bound tasks (conversion parsing, export rendering).
- Asynchronous job queue to decouple spiky ingress from worker capacity.
- Cache-first for read-heavy document retrieval.
- Rate-limit upstream dependencies to prevent cascading overload.

## Traffic Assumptions (Baseline Year 1)
| Metric | Value | Notes |
|--------|-------|-------|
| Active users (monthly) | 10,000 | Steady state after launch ramp |
| Peak concurrent users | 500 | 5% of MAU, typical SaaS ratio |
| Avg sessions/user/month | 8 | Weekly usage pattern |
| Avg document uploads/session | 1.2 | Mix of new + edit existing |
| Convert jobs/day | 4,000 | ~167/hr avg, 400/hr peak |
| Export jobs/day | 6,000 | ~250/hr avg, 500/hr peak (2:1 exports per deck) |
| AI chat messages/day | 12,000 | 3 messages/session avg |
| Realtime SSE connections (concurrent) | 200 | Subset of active editing sessions |

## Load Profiles
### Profile A: Normal Daytime
- Convert: 200 jobs/hr, median deck 18 slides, 90th %ile 45 slides
- Export: 300 jobs/hr, 60% PPTX, 40% PDF
- AI: 600 msgs/hr, avg 150 tokens out
- SSE: 150 active connections

### Profile B: Peak Launch/Campaign
- Convert: 400 jobs/hr
- Export: 500 jobs/hr
- AI: 1,000 msgs/hr
- SSE: 250 connections
- Duration: 2-4 hours sustained

### Profile C: Batch Upload Scenario
- Burst: 100 convert jobs submitted within 5 min (corporate training deck batch)
- Queue depth spikes to 80-100
- Worker autoscale response time critical

## Component Capacity Models
### API Gateway (Cloudflare Workers / Edge)
- Target: 1,000 req/s per instance, P99 <50ms (excluding backend processing)
- Scaling: Auto (Cloudflare edge), no explicit provisioning
- Bottleneck watch: KV read latency if session cache grows large

### Convert Worker Pool
- Unit capacity: 1 worker = 3 concurrent jobs (I/O bound: fetch source, upload result)
- Baseline provisioning: 5 workers (15 concurrent) for Profile A (200/hr)
- Peak provisioning: 10 workers (30 concurrent) for Profile B
- Scaling trigger: queue wait time >5s OR queue depth >20 for >2 min
- Scale-down policy: if queue empty for 10 min, reduce to baseline

### Export Worker Pool
- Unit capacity: 1 worker = 4 concurrent jobs (CPU heavier but shorter than convert)
- Baseline: 8 workers (32 concurrent) for Profile A
- Peak: 15 workers (60 concurrent) for Profile B
- Scaling trigger: similar to convert

### AI Gateway / Provider Pool
- Provider rate limits: OpenAI tier 2 = 3,500 req/min, Anthropic tier 1 = 1,000 req/min
- Baseline load: 600 msg/hr = 10/min (well under limits)
- Peak: 1,000 msg/hr = ~17/min (safe)
- Failover strategy: switch provider on 429 or >5% error rate
- Local queuing: max 50 concurrent in-flight per provider to avoid breaching limits

### Database (Document Store)
- Read pattern: 80% cache hit (Redis) for GET /documents/{id}
- Write pattern: bursty on convert completion (insert normalized deck)
- Baseline: Postgres single instance (or managed DB) with read replica
- Scale trigger: P95 query latency >100ms or connection pool >70%

### Storage (R2 / S3)
- Upload: multipart (handled by presigned URLs, offloaded from workers)
- Download: signed URL redirects (bandwidth unbounded by workers)
- No explicit scaling action; monitor 5xx rate from provider

### Realtime SSE Infrastructure
- Connection broker: Redis Pub/Sub or dedicated SSE service (Cloudflare Durable Objects)
- Baseline: 200 connections per instance, memory ~50MB per 100 conns
- Scaling: horizontal (add instances), sticky via connection ID

## Latency Budgets (Breakdown)
### Convert Job End-to-End (Target P95 15s)
| Stage | Budget | Notes |
|-------|--------|-------|
| Queue wait | 2s | If exceeded, scale workers |
| Fetch source from storage | 1s | Network + R2 latency |
| Parse & extract | 8s | Largest component, CPU-bound |
| Normalize to deck JSON | 2s | Transform logic |
| Upload result | 1.5s | Write to storage |
| DB persist + emit event | 0.5s | Finalize job record |
| **Total** | **15s** | Aligned with SLO |

### Export Job (Target P95 12s)
| Stage | Budget |
|-------|--------|
| Queue wait | 1.5s |
| Fetch deck JSON | 0.5s |
| Render slides (PPTX lib) | 7s |
| Package artifact | 2s |
| Upload to storage | 1s |
| **Total** | **12s** |

### AI Chat First Token (Target P95 2s)
| Stage | Budget |
|-------|--------|
| Request validation + context prep | 0.2s |
| Send to provider | 0.3s |
| Provider TTFT (time to first token) | 1.2s |
| Stream relay setup | 0.3s |
| **Total** | **2s** |

## Performance Test Suites
### Suite 1: Baseline Load Test
- Tool: k6 or Artillery
- Scenario: Ramp to Profile A over 10 min, sustain 30 min, ramp down
- Metrics: P95/P99 latency per endpoint, error rate, queue depth
- Pass criteria: All SLOs met, no errors >0.5%

### Suite 2: Peak Surge Test
- Scenario: Jump from Profile A to Profile B within 2 min (simulates campaign launch)
- Metrics: Autoscale response time, max queue depth, P95 latency during ramp
- Pass criteria: Latency <target +20% during scale-up window, recover to target within 5 min post-scale

### Suite 3: Batch Burst Test
- Scenario: Submit 100 convert jobs in 1 min (Profile C)
- Metrics: Queue saturation, reject rate, P99 latency for batch
- Pass criteria: No 503 errors, all jobs complete within 3x baseline P95

### Suite 4: Sustained Endurance
- Scenario: Profile A for 4 hours
- Metrics: Memory/CPU drift, connection leaks, error accumulation
- Pass criteria: No degradation trend, stable resource usage

### Suite 5: Chaos / Failure Injection
- Scenario: Kill 50% of workers mid-load, or introduce 10% storage latency spike
- Metrics: Recovery time, user-visible error rate
- Pass criteria: Jobs retry successfully, <5% failure rate, recovery <5 min

## Scaling Automation
### Horizontal Scaling Rules (Kubernetes HPA or equivalent)
- Convert workers: 
  - Scale up: avg queue depth >15 OR avg job wait time >5s over 2 min window
  - Scale down: queue depth <5 for 10 min
  - Min replicas: 3, Max: 20
- Export workers:
  - Scale up: avg queue depth >20 OR wait time >3s
  - Min: 5, Max: 25
- API gateway: Auto (Cloudflare) or fixed pool if self-hosted

### Vertical Scaling
- Database: manual upgrade to next tier if sustained query latency >200ms P95 after tuning
- No vertical autoscale for workers; optimize code instead

## Resource Limits per Component
| Component | CPU | Memory | Replicas (Baseline) |
|-----------|-----|--------|---------------------|
| API Gateway | N/A (edge) | N/A | Auto |
| Convert Worker | 1 vCPU | 2GB | 5 |
| Export Worker | 2 vCPU | 3GB | 8 |
| AI Gateway | 0.5 vCPU | 1GB | 3 |
| SSE Broker | 1 vCPU | 2GB | 2 |
| DB (Postgres) | 2 vCPU | 8GB | 1 (+1 replica) |

## Caching Strategy
- Document GET: Redis cache, TTL 5 min, invalidate on PUT
- Job status: Cache job record for 10s (reduce DB poll load)
- AI model metadata: Cache provider list for 1 hour

## Cost Efficiency Targets
- Cost per convert job: <$0.02 (compute + storage amortized)
- Cost per export job: <$0.015
- Cost per AI message: variable by model; target <$0.005 for GPT-3.5-class
- Idle cost (zero traffic): <$50/day (baseline infra kept warm)

## Monitoring & Observability for Scale
- Dashboard panels: Queue depth trends, worker utilization %, autoscale events timeline, cost per job type
- Alerts tied to SLO breaches (see reliability-slo.md)
- Capacity forecast: weekly report projecting when current max replicas will saturate (trigger infra planning)

## Capacity Headroom Policy
- Maintain 30% headroom above observed peak for unexpected spikes.
- Annual review: adjust baseline assumptions based on actual growth.

## Future Scaling Considerations
- Multi-region deployment for global latency reduction.
- Dedicated worker pools per customer tier (enterprise isolation).
- GPU workers for future AI features (image gen, video).

## Acceptance Criteria
- All test suites (1-5) pass in staging environment.
- Autoscale rules codified in infrastructure-as-code.
- Cost per job tracked in metrics system.
- Capacity dashboard published.

## Open Questions
- Redis cluster (single vs sharded) for high SSE connection count?
- Preemptive scaling (ML-based forecast) vs reactive only?
- Geographic distribution of convert workers (data residency)?
