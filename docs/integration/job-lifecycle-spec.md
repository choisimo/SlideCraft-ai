# Job Lifecycle Specification

## Purpose
Define authoritative state machine, transitions, timing, and reliability semantics for all asynchronous jobs (conversion, export, AI tasks) to ensure consistent UX, observability, and recovery strategies.

## Job Types
- convert: Source asset -> normalized internal deck JSON
- export: Deck JSON -> target artifact (pptx/pdf)
- ai: AI chat/completion tied optionally to a document/selection

## Canonical States
| State | Meaning | Entry Conditions | Exit Conditions |
|-------|---------|------------------|-----------------|
| pending | Accepted, not yet executing | Job enqueued | Worker starts processing -> running; cancel request -> canceled |
| running | Actively executing work | Worker lock acquired | Normal completion -> succeeded; fault unrecoverable -> failed; cancel request -> canceled |
| succeeded | Completed with result | All required operations successful | Terminal |
| failed | Permanently failed | Retries exhausted OR non-retryable error | Terminal |
| canceled | User/system cancellation acknowledged | Cancellation requested & honored before succeed/fail | Terminal |

## Extended Internal Stages (Progress Granularity)
Progress percentages are coarse externally; internal `stage` provides higher fidelity via Job Events SSE.

### Convert Job Stages
1. validating_input (0-5%)
2. fetching_source (5-15%)
3. extracting (15-55%)
4. normalizing (55-80%)
5. generating_preview (80-90%)
6. finalizing (90-100%)

### Export Job Stages
1. preparing (0-10%)
2. rendering_slides (10-70%)
3. packaging (70-90%)
4. uploading_artifact (90-98%)
5. finalizing (98-100%)

### AI Job Stages
1. preparing_context (0-10%)
2. sending_prompt (10-20%)
3. streaming_response (20-95%)
4. finalizing (95-100%)

## State Machine (Formal)
```
[pending] --(start)--> [running]
[pending] --(cancel)--> [canceled]
[running] --(success)--> [succeeded]
[running] --(error & retryable && attempts < max)--> [running] (backoff wait)
[running] --(error & non-retryable)--> [failed]
[running] --(error & retryable && attempts == max)--> [failed]
[running] --(cancel)--> [canceled]
```
No transitions allowed out of terminal states.

## Retry & Backoff Policy
| Job Type | Retryable Error Classes | Max Attempts | Backoff Strategy | Jitter |
|----------|------------------------|-------------|------------------|--------|
| convert | transient_storage, network_timeout, ai_rate_limit | 3 | exponential (base 2s, cap 30s) | full (0-1x) |
| export | transient_storage, network_timeout | 3 | exponential (base 2s, cap 30s) | full |
| ai | model_overloaded, network_timeout | 2 | exponential (base 1s, cap 10s) | decorrelated |

Non-retryable classes: validation_error, unsupported_format, quota_exceeded (except maybe ai_rate_limit if 429), internal_bug (escalate immediately), corruption_detected.

## Cancellation Semantics
- Cancellation request while `pending`: mark `canceled`, remove from queue (best effort).
- Cancellation request while `running`: Cooperative; worker checks at safe boundaries between stages. If not safe, completes current stage then transitions to `canceled` (no partial artifact persisted unless atomic already written).

## Idempotency
- Enqueue endpoints should support optional `Idempotency-Key` header; server stores mapping (key -> jobId, type, payload hash, createdAt) with TTL (24h) to avoid duplicate processing.
- If same key & payload hash: return existing Job.
- If same key different payload hash: 409 conflict.

## Concurrency Control
- Per-document single active convert job constraint (enqueue returns 409 if another convert pending/running for same source).
- Export jobs allowed concurrently (bounded by queue config) but per-document limit N (configurable, default 2) to avoid thrash.
- AI jobs unbounded logically but rate-limited globally per user/org.

## Persistence & Ephemerality
- Job record persisted with: id, type, status, progress, attempts, maxAttempts, createdAt, updatedAt, startedAt?, completedAt?, error?, resultRef?, metadata (opaque JSON).
- Event log (for SSE) may be ephemeral (Redis stream) with retention window (e.g., 24h) after terminal state; clients reconstruct from snapshot + subsequent events.

## Progress Rules
- Progress monotonically increases (never decreases) per job.
- Stage progress ranges must not overlap; stage transition sets progress to at least min of next stage range.
- On success progress == 100; on failure/canceled progress may reflect last achieved percentage.

## Metrics Mapping
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| job_enqueue_total | counter | job_type | Jobs accepted |
| job_start_total | counter | job_type | Jobs begun execution |
| job_duration_seconds | histogram | job_type, outcome | Wall time from start->terminal |
| job_attempts | histogram | job_type | Attempts per job (final) |
| job_in_progress | gauge | job_type | Running jobs count |
| job_retry_total | counter | job_type, error_class | Retry occurrences |
| job_failure_total | counter | job_type, error_class | Terminal failures |
| job_canceled_total | counter | job_type | Cancellations |
| job_stage_time_seconds | histogram | job_type, stage | Time per stage |

## Event Model
`JobEvent` fields: `id` (UUID), `jobId`, `timestamp` (RFC3339), `stage`, `progress` (int 0-100), `message?` (human-readable), `attempt` (int), `metadata?`.

## Dead Letter Queue (DLQ)
- Upon terminal `failed` with retryable class exhausted, record copied to DLQ collection with snapshot (payload, attempts, lastError, timestamps) for manual inspection.
- Optional automated reprocessor can move DLQ record back into queue after fix (new job id) while linking `parentJobId`.

## SLA / SLO Targets (Initial)
| Job Type | P50 | P95 | P99 | Notes |
|----------|-----|-----|-----|-------|
| convert | 6s | 15s | 30s | Medium deck (<30 slides) |
| export | 4s | 12s | 25s | PPTX baseline |
| ai | 1.2s | 4s | 8s | First token latency (stream) |

Failure rate target < 2% (excluding user errors) per rolling 7d.

## Consistency & Atomicity
- Convert job success implies normalized deck persisted before status flips to `succeeded`.
- Export job success implies artifact uploaded + signed URL valid for minimum TTL.
- AI job success implies final response persisted (for retrieval or audit) if policy permits.

## Security & Audit
- Record `requestedBy` principal id; for AI include `model` and `tokenUsage` if available.
- Sensitive payload elements (e.g., raw doc) not duplicated in job metadata.

## OpenAPI Integration
- `Job` schema extended with: `attempts`, `maxAttempts`, `stage`, `createdAt`, `updatedAt`, `startedAt?`, `completedAt?`.
- SSE endpoint event schema references `JobEvent`.
- Error codes from taxonomy integrated (e.g., `CONVERT_UNSUPPORTED_FORMAT`).

## Edge Cases
- Lost Worker (heartbeat expired): system transitions job back to `pending` incrementing attempt if below max; else `failed` with `worker_lost` error class.
- Duplicate Completion Signal: ignore if job already terminal; log warning.
- Clock Skew: server authoritative timestamps; workers use server-issued timestamp when reporting events.

## Backpressure & Queue Depth
- Queue depth metric triggers shedding (reject new jobs with 503 + `QUEUE_OVERLOADED`) when above high watermark.
- Adaptive backoff: if global convert failure rate spikes > threshold, reduce concurrency to mitigate cascading failures.

## Future Enhancements
- Partial progress resume for long conversions (checkpointing)
- Webhook callbacks on terminal state
- Priority classes (normal, high) with separate sub-queues
- Scheduled jobs (delayed enqueue)

## Acceptance Criteria
- Implementation provides defined states & transitions
- Metrics emitted with listed labels
- SSE events conform to `JobEvent` schema
- OpenAPI updated with extended `Job` and documented retry/backoff section
- Cancellation endpoint or mechanism documented

## Open Questions
- Final persistence store (Redis vs Postgres) for durable job log?
- Do we expose attempts & stage externally now or behind preview flag?
- Should AI jobs unify streaming events with job SSE or kept separate?
