# Quality & Risk Register

## Risks
- Large files → memory/timeout; Mitigation: chunking, streaming parse, backpressure
- Fidelity gaps → fonts/shapes; Mitigation: documented limits, font embedding map
- Provider limits → rate caps/outages; Mitigation: circuit breakers, fallback models
- Realtime scale → fanout; Mitigation: presence sampling, snapshot compaction

## QA Matrix
- File sizes: 1MB, 50MB, 500MB
- Types: DOCX text-heavy, PDF text-first, PPTX image-heavy
- Browsers: Chrome, Edge, Safari (latest-1)
- Concurrency: 2, 5, 10 editors; offline reconcilation

## Test Cases (E2E)
- Upload resume after crash; checksum mismatch handling
- Conversion of headings H1/H2 to slides; PDF text block extraction
- Editor IME, undo/redo 20 steps; presence jitter tolerance
- AI insertion respects selection; diff preview rollback
- Export opens without repair dialog

## Observability
- Metrics: upload time, convert time, export time, AI latency, error rates
- Alerts: queue depth spike, job error spike, export failure rate
