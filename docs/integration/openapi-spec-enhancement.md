# OpenAPI Specification Enhancement Plan

## Purpose
Establish a governed, iteration-friendly API specification process that ensures:
- Consistency of resource + error models across services
- High-fidelity examples powering code generation, mock servers, SDKs, and documentation portals
- Backwards compatible evolution with explicit versioning & deprecation workflow
- Automated quality gates (lint, diff, breaking-change detection) integrated into CI

## Current State Summary (Baseline 0.1.0)
Observations from existing `docs/backend/openapi.yaml`:
- Single file, limited to core flows: upload init, convert job enqueue, job status, document create/get, export enqueue/download, AI chat (basic), job events SSE, health.
- No global `securitySchemes`; no auth documented yet.
- Error model implicit: only `Job.error` shape partially defined; no standard Error envelope for non-2xx responses.
- Missing response schemas for many status codes (e.g., 4xx, 5xx, 302 download redirect body unspecified, SSE event media types not explicit).
- No pagination/query pattern examples (list endpoints absent).
- SSE endpoints do not define `text/event-stream` content or event object schema components.
- No explicit `JobType`, `JobStatus` reusability via `enum` component outside inline fields.
- Lacks examples for requests/responses (all minimal schema definitions, no `example` / `examples`).
- AI streaming response semantics in prose only (not machine-validated schema).
- No tags grouping endpoints.

## Target Scope (Milestone M1)
Introduce a structured spec achieving:
1. Unified Error Schema (`ErrorResponse`) with deterministic `code`, `message`, `details`, `requestId`.
2. Component enums for `JobType`, `JobStatus`, `ExportFormat`, `SourceType`, `AIModelProvider`.
3. Explicit media type for streaming endpoints: `text/event-stream` with schema refs for `JobEvent` + `AIStreamEvent`.
4. Reference schemas for `UploadInitResponse`, `ConvertRequest`, `ExportRequest`, `ChatRequest`, `ChatResponse`, `Document`, `Job` (refactored), `JobResult`.
5. Add `x-sdk-group` vendor extensions to cluster resources for codegen (optional but helpful).
6. Provide realistic JSON examples for each 2xx and at least one 4xx/5xx per tag.
7. Introduce `servers` variable support for environment substitution.
8. Add `traceparent` propagation guidance in headers section (non-normative note).
9. Provide error code catalog alignment with `error-taxonomy-and-recovery.md`.
10. Annotate long-running operations with `x-long-running: true` to facilitate client polling abstractions.

## Future Scope (Milestone M2+)
- Authentication schemes (`bearerAuth` / `oidc`), rate-limit header documentation.
- Pagination & filtering patterns once list endpoints exist.
- Webhook callback objects for async job completion.
- Multi-version strategy (e.g., `v1` path vs header negotiation).

## Governance Workflow
1. Authoring: All changes via PR modifying `openapi.yaml` (single source) + matching changelog fragment under `docs/changes/api/`.
2. Lint: Spectral ruleset (custom) enforced in CI: naming, tags present, no inline duplicated schemas, examples required.
3. Breaking Change Detection: Use `oasdiff` against `main` copy; fail CI on unapproved breaking changes (removed endpoint, removed field, narrowed enum, type change).
4. Review Checklist (PR template addition):
   - [ ] Added/updated examples
   - [ ] Updated error codes references
   - [ ] Non-breaking or approved with `BREAKING:` label
   - [ ] Added test coverage (contract tests updated/generated)
5. Version Bump Policy:
   - Patch: New examples, clarifications, non-functional metadata
   - Minor: Backward compatible field additions, new endpoints
   - Major: Any breaking change (rare; must provide deprecation window & migration notes)
6. Release Artifact: Publish rendered HTML/Redoc bundle as CI artifact, optional S3 upload for internal portal.

## File Structure Additions
```
docs/
  backend/
    openapi.yaml (single source)
  changes/
    api/
      YYYY-MM-DD-short-summary.md
spectral/
  ruleset.yaml
scripts/
  validate-openapi.mjs
  diff-openapi.mjs
```

## Component Model Draft (Conceptual)
```
components:
  schemas:
    ErrorResponse { code, message, details?, requestId }
    Job { id, type: JobType, status: JobStatus, progress, error?: ErrorResponse, result?: JobResult, createdAt, updatedAt }
    JobResult { documentId?, exportUrl? }
    Document { id, title, ownerId, updatedAt, deck }
    UploadInitResponse { uploadId, parts[], completeUrl }
    JobEvent { id, jobId, stage, progress, timestamp, message? }
    AIStreamEvent { provider, delta?, final?, done? }
    ChatRequest { documentId?, selection?, messages[], model, stream }
    ChatResponse { provider, content, usage? }
  parameters:
    JobIdPath { in: path, name: id }
  enums (as schemas with enum): JobType, JobStatus, ExportFormat, SourceType, AIModelProvider
```

## Example Policy
- Each endpoint must have at least one `x-example-id` vendor extension referencing a JSON example file under `openapi-examples/`.
- Example filenames: `<method>-<path-slug>-<variant>.json` (e.g., `post-convert-success.json`).
- Automated script validates presence + JSON parse + conformity to schema (using `ajv`).

## Streaming Semantics
- SSE endpoints specify `text/event-stream` with schema for each `data:` payload; final sentinel `[DONE]` documented as plain text event.
- Clients must treat unknown fields on events as forward-compatible.

## Error Catalog Alignment
Cross-reference `error-taxonomy-and-recovery.md` mapping top-level `ErrorResponse.code` values. Codes are stable identifiers, not localized.

## Tooling & Automation
- `npm run api:lint` -> spectral
- `npm run api:diff` -> oasdiff vs cached main spec
- `npm run api:bundle` -> redocly or widdershins generation
- `npm run api:check` -> composite (lint + diff + examples validate)

## Acceptance Criteria (M1 Complete when):
- All existing endpoints refactored to use component schemas
- Error responses defined for 400, 401 (placeholder), 404, 409 (where applicable), 429 (future), 500, 503
- At least one valid example per response code (2xx + representative 4xx/5xx)
- Spectral CI integration documented & script stubs present
- README snippet added in `docs/backend/` describing how to regenerate artifacts

## Open Questions
- Auth mechanism selection timeline (needed for `securitySchemes` definition)
- Whether to split large spec into multi-file and bundle (kept single-file initially for simplicity)
- Adoption of `x-operation-id` naming convention vs generated

## Next Actions
1. Inventory missing schemas vs conceptual list (DONE above)
2. Implement automation scripts + spectral ruleset (separate task)
3. Refactor `openapi.yaml` in branch to adopt components & examples
4. Add changelog entries & PR template updates
