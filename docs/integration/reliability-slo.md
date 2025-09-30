# Reliability & SLO Specification

## Purpose
Define user-facing reliability objectives, internal service level indicators (SLIs), and error budget governance to guide capacity planning, alerting, and release risk management.

## Scope
Applies to core API surface (upload, convert, document create/get, export, AI chat), job processing pipeline, and realtime/SSE channels (job events, AI streaming).

## Reliability Philosophy
- Optimize for consistent latency + graceful degradation over raw peak throughput.
- Prefer partial functionality (read-only, delayed exports) to total outage.
- Guard error budgets to pace feature velocity vs stability.

## User-Centric Objectives
| Scenario | Objective | Rationale |
|----------|-----------|-----------|
| Upload & Convert small deck (<30 slides) | Completed & deck usable within 15s P95 | Author workflow continuity |
| Export to PPTX/PDF | Artifact available within 12s P95 | Fast iteration for stakeholders |
| AI first token (stream mode) | < 2s P95 | Conversational feel |
| AI full response (typical 300 tokens) | < 8s P95 | Maintain creative flow |
| Job status polling | Reflect state change within 2s P95 | UI responsiveness |
| Realtime job events SSE | 99.5% session continuation > 5 min | Continuous progress feedback |

## SLIs & SLO Targets
### Availability (30d rolling)
| Service Area | SLI Definition | Target |
|--------------|----------------|--------|
| Core API | Successful 2xx / (Total valid requests) excluding client 4xx | 99.9% |
| Job Queue Intake | Jobs accepted / enqueue attempts (excluding invalid) | 99.9% |
| AI Chat Endpoint | Successful start of stream / requests | 99.5% |
| SSE Streams | Sustained connection minutes / attempted minutes | 99.0% |

### Latency (P95 unless specified, 30d)
| Endpoint / Flow | SLI Window | Target |
|-----------------|------------|--------|
| POST /convert -> Job succeeded | enqueue to terminal | 15s P95 |
| POST /export -> Job succeeded | enqueue to terminal | 12s P95 |
| AI Chat first token | request to first data event | 2s P95 |
| GET /documents/{id} | server processing time | 120ms P95 |
| Upload Init | server processing time | 150ms P95 |

### Error Rate
| Metric | Definition | Target |
|--------|-----------|--------|
| Job terminal failure (non-user) | failed jobs / (succeeded+failed-canceled-user) | <2% |
| AI model invocation transient errors | retryable failures / total model invocations | <5% |

### Freshness / Propagation
| SLI | Definition | Target |
|-----|-----------|--------|
| Job event lag | last event timestamp vs now for active job | < 3s P95 |
| Document availability post-convert | convert succeeded -> document GET 200 | < 1s P95 |

## Error Budget
- For 99.9% availability SLO: Budget = 43m 49s unavailability / 30d.
- Burn alert tiers:
  - Warning: 20% budget burned < 7d
  - Critical: 40% budget burned < 7d or 60% < 14d
- Freeze policy: If critical triggered, feature deploys paused except reliability fixes until projected burn < 80%.

## Measurement Methodology
- All SLIs computed from raw events in time-series DB (Prometheus/OpenTelemetry metrics + logs for cross-check).
- Latency: use server-side observed durations; exclude client network variance for internal improvement, but external synthetic monitors track end-to-end.
- Availability: Count 5xx + explicit `QUEUE_OVERLOADED` as failures; exclude maintenance windows only if declared via status page & under pre-announced budget carve-out (max 0.05%).

## Instrumentation Mapping
| SLI | Metric / Signal | Transformation |
|-----|-----------------|---------------|
| Core API availability | `http_requests_total{route!="/health"}` | success = 2xx; failure = 5xx |
| Convert latency | `job_duration_seconds{job_type="convert"}` | histogram quantile |
| Export latency | `job_duration_seconds{job_type="export"}` | histogram quantile |
| AI first token | `ai_first_token_seconds` | histogram quantile |
| SSE continuity | `sse_connection_duration_seconds` | ratio of durations >= 300s |
| Job event lag | `now - job_last_event_timestamp` | aggregator P95 |

## Alerting Rules (Initial)
| Alert | Condition | Action |
|-------|----------|--------|
| High 5xx Rate | 5m error ratio > 2% & rising 3 intervals | Page on-call |
| Convert P95 Breach | 15m P95 > 18s & >300 jobs | Investigate workers/capacity |
| Export Failure Spike | 10m failure ratio >4% & >50 fails | Check storage/format service |
| AI First Token Slow | 15m P95 > 3s | Switch to fallback model tier |
| SSE Disconnect Surge | 10m disconnect > baseline + 50% | Evaluate edge/network |
| Error Budget Fast Burn | 7d projected > 40% | Initiate change freeze process |

## Capacity Safety Margins
- Maintain worker concurrency to keep P50 at ≤50% of P95 budget so transient spikes remain within SLO.
- Scale threshold: if sustained (15m) job queue wait time > 10% of P95 latency target, add capacity.

## Degradation Strategies
| Failure Mode | Strategy | User Experience |
|--------------|----------|-----------------|
| AI provider overload | Route to backup lower-tier model | Slightly lower response quality/slower tokens |
| Export backlog | Throttle new exports, allow convert & editing | Export delayed banner |
| Convert worker saturation | Shed large (>80 slides) jobs first | Large jobs queued notice |
| Storage latency spike | Extend backoff + reduce concurrency | Slightly longer job times |

## Reporting & Review
- Weekly reliability report: SLI snapshots, burn chart, top 3 latency regressions.
- Monthly postmortem summary appended if any critical alerts fired.

## Release Gates
- Block release if: rolling 24h core API availability < 99.5% OR convert P95 latency > target + 25%.
- Canary: first 5% traffic for new worker version; abort if error ratio > baseline +1% within 15m.

## Dependencies & Assumptions
- Accurate clock sync (NTP) across workers (<50ms skew).
- Metrics scrape interval 15s; SSE duration metric emitted on disconnect.

## Future Enhancements
- User-segment SLIs (paid vs free) for differentiated reliability goals.
- Per-document size buckets for convert/export latency stratification.
- Adaptive SLOs with seasonal adjustment.

## Acceptance Criteria
- Metrics enumerated exist or backlog tickets created.
- Alert rules codified in infrastructure-as-code.
- Published burn policy adopted by on-call runbook.

## Open Questions
- Do we treat 429 (rate limit) as availability failure or separate budget? (Proposed: separate)
- Separate SLO for large decks? (Maybe after baseline established)
