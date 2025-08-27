# Integration Plan — E2E, Contracts, Quality Gates

## Journeys
- J1 DOCX→Convert→Edit→Export PPTX (primary demo)
- J2 PPTX→Convert→Co-edit→Export PDF

## Contracts
- Upload init/parts/complete (multipart) and tus alternative; storage providers: Local FS, S3-compatible, Google Drive
- Job events: {status, progress, message}
- Realtime presence: {userId, name, color, cursor, selection}
- AI stream: text/event-stream with delta chunks
- Export: {jobId}→signed URL

## Quality Gates
- Visibility: progress ≥1Hz; editor opens <2s after done
- Fidelity: snapshot tolerance checklist per sample deck
- Latency SLOs: upload init <300ms; job status <200ms; AI gateway P95 <1.5s server-side

## Demo Script
1) DOCX 업로드(중간에 일시정지/재개) → 진행률 표시
2) 변환 완료 알림 → 에디터 자동 진입
3) AI "3장으로 요약" → diff 확인 → 삽입
4) 동시편집 2명 접속 → 원격 커서 확인, 간단 편집
5) PPTX Export → 다운로드 → PowerPoint 열기 검증

## Readiness Checklist
- Test samples prepared; credentials in .env; feature flags set
- Monitoring dashboard with job durations and AI latency
