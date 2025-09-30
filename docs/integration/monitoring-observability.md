# Monitoring & Observability

## 1. 목적 & 범위
SlideCraft AI 전 구성요소(Frontend, API Gateway, Workers, Realtime, AI Gateway)의 메트릭·로그·트레이스·알림 체계를 정의하여 SLO 준수, 장애 진단, 용량 계획을 지원한다.

## 2. 관측 전략 원칙
- RED + USE 혼합: (Rate, Errors, Duration) + (Utilization, Saturation, Errors)
- Correlation Keys: request_id, trace_id, job_id, document_id, user_id 최소 공통 필드
- 샘플링: 기본 100% error / 10% 정상 trace (초기), 동적 조정
- Cardinality 관리: user_id → hashing(telemetry), raw 저장 최소화

## 3. 서비스별 주요 메트릭 카탈로그
| 서비스 | 메트릭 이름 | 타입 | 라벨 | 목적 |
|--------|-------------|------|------|------|
| Gateway | http_requests_total | counter | route, method, status | 트래픽량 |
| Gateway | http_request_duration_seconds | histogram | route, status | 지연 분석 |
| Gateway | active_sse_connections | gauge | endpoint | 스트리밍 상태 |
| Worker(Convert) | job_duration_seconds | histogram | type=convert,status | 변환 시간 |
| Worker(Convert) | job_fail_total | counter | type=convert,error_code | 실패 모니터 |
| Worker(Export) | job_duration_seconds | histogram | type=export,format | 내보내기 시간 |
| Realtime | ws_active_connections | gauge | region | 동시 연결 |
| Realtime | ws_message_rate | counter | channel_type | 부하 + QoS |
| AI Gateway | ai_request_total | counter | provider,model,status | 호출량/성공률 |
| AI Gateway | ai_latency_seconds | histogram | provider,model | 성능/선택 알고리즘 |
| Storage | object_put_bytes_total | counter | provider,type | 비용 추정 |
| System | queue_depth | gauge | queue_name | 백프레셔 감시 |
| FE (RUM) | web_vitals_lcp_ms | histogram | browser,release | UX 성능 |
| FE (RUM) | web_vitals_cls | histogram | browser,release | 시각 안정성 |

## 4. 로그 구조 표준 (JSON)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| timestamp | RFC3339 | ✓ | UTC
| level | string | ✓ | info|warn|error
| message | string | ✓ | 주 로그 메시지
| service | string | ✓ | gateway|worker|realtime|ai
| trace_id | string | ✓ | W3C traceparent 상관
| span_id | string | - | 세부 구간
| request_id | string | - | HTTP 요청 상관
| job_id | string | - | Job 연계
| document_id | string | - | 문서 연계
| user_id | hash | - | 해시 사용자 식별
| code | string | - | 에러 코드 / 상태 명명
| latency_ms | number | - | 요청 지연
| payload_size | number | - | 바이트 단위

- PII/민감정보 필드 금지: prompt raw, email → 마스킹

## 5. 트레이싱 설계
- Propagation: W3C traceparent + baggage: job_id, document_id
- Span 네이밍 규칙: `<layer>.<action>` (예: `upload.init`, `convert.parse`, `export.render`)
- Critical Path: upload.init → convert.enqueue → worker.parse → deck.persist → export.render → download.sign
- Sampling: head-based 10% + tail-based error 확장

## 6. 대시보드 구성 (섹션)
1. Overview: 요청수, 오류율, 평균/95p 지연, 활성 연결
2. Jobs: queue_depth, job_duration_seconds histogram, 실패율 추세
3. AI: ai_latency_seconds heatmap(모델 × 시간), 비용 추정(토큰 계산)
4. Realtime: ws_active_connections, message_rate, reconnect_attempts
5. Storage/Export: object_put_bytes_total, export 실패율, 평균 artifact 크기
6. RUM: LCP/CLS/TTI, 에러 이벤트

## 7. SLO & Alert 룰 (요약)
| SLO | 목표 | 측정 | Alert 임계(경고/위기) |
|-----|------|------|----------------------|
| API 가용성 | 99.5% | 성공/전체 | 99.2%/99.0% |
| Convert P95 | <15s | job_duration_seconds | 16s/18s |
| Export 실패율 | <3% | 실패/전체 | 4%/6% |
| AI 첫토큰 P95 | <1.5s | ai_latency_seconds | 1.7s/2.0s |
| Realtime 연결 drop rate | <5%/h | disconnect/active | 6%/8% |
| LCP P75 | <2500ms | RUM | 2700ms/3000ms |

## 8. 알림 정책
- 경고(Alert warn): PagerDuty 낮은 우선순위 / Slack 채널 알림
- 위기(Alert critical): PagerDuty 즉시 호출 + Slack @here
- 집계 윈도: 5분 (AI latency), 10분 (job failure), 1시간 (LCP)
- 소거(Silence): 유지보수 배포 창 라벨 기반

## 9. 수집 & 파이프라인
| 계층 | 수집 에이전트 | 목적 |
|------|--------------|------|
| Node.js | OpenTelemetry SDK | Trace + Metrics export |
| Python Worker | OTEL Python SDK | 동일 |
| Realtime | Custom ws middleware | 연결/메시지 카운트 |
| Frontend | web-vitals + fetch wrapper | RUM, custom events |
| Logs | Fluent Bit / Vector | JSON → Loki/Elastic |

## 10. 비용 최적화 전략 (관측)
- 고카디널리티 라벨(사용자, 문서) Top-K 샘플링 제한
- 장기 보관: Trace 7일, Metrics 30일 집계(rollup), Logs 14일(압축)
- AI 토큰/Latency 상관 분석으로 모델 교체 후보 도출

## 11. 예외/오류 패턴
| 패턴 | 탐지 | 조치 |
|------|------|------|
| Job stuck (progress 0, 5m) | watch job_age | 워커 재시작 / DLQ 이동 |
| Realtime reconnect 폭증 | reconnect_rate 상승 | Ingress/네트워크 점검 |
| AI provider 오류율 급증 | ai_request_total{status=error} | Model fallback 전환 |
| Export artifact 사이즈 폭증 | size p95 증가 | 이미지 압축 파라미터 확인 |

## 12. 운영 Runbook 연계
- Incident triage: incident-response-runbook.md 참조
- 재시도 정책: job-lifecycle-spec.md
- 에러 레벨: error-taxonomy-and-recovery.md

## 13. 테스트 & 검증
- Synthetic: 5분 간격 /healthz + 샘플 /jobs/:id
- SLO Budget 계산 스크립트: 주간 리포트 생성 (GitHub Actions Cron)
- Chaos: Redis latency 실험 후 metrics/alerts 반응성 검증

## 14. 위험 & 완화
| 위험 | 영향 | 완화 |
|------|------|------|
| 메트릭 폭증(카디널리티) | TSDB 비용 증가 | 라벨 화이트리스트 + 리미터 |
| Trace 샘플 부족 | 근본 원인 불명 | Tail-based 추가采样 |
| 로그 PII 유출 | 규제 리스크 | 필터/마스킹 레이어 |
| Alert 피로도 | 경보 무시 | 다단계 임계치 / 소거 윈도 |

## 15. 향후 개선
- Adaptive Sampling (동적 트래픽 기반)
- 사용자 여정 RUM Trace 연결(Frontend→Backend)
- anomaly detection (latency/에러율)

## 16. 참고 문서
- testing-strategy.md
- end-to-end-workflows.md
- job-lifecycle-spec.md
- error-taxonomy-and-recovery.md
