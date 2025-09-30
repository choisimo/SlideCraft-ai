# Error Taxonomy & Recovery

## 1. 목적 & 범위
통합 에러 코드, 사용자 메시지, 로깅/관측 레벨, 재시도/복구 정책을 표준화하여 일관된 UX와 진단 효율을 확보.

## 2. 설계 원칙
- 명확한 분류: Auth / Validation / Resource / Processing / External / System
- 재시도 가능 여부(explicit) 명시
- 사용자 친화 메시지 vs 개발자 디버그 정보 분리
- 에러 코드 안정성 (변경 시 Deprecation 절차)

## 3. 에러 코드命명 규칙
`<CATEGORY>_<VERB|NOUN>[_QUALIFIER]` 대문자 스네이크
예: `UPLOAD_INCOMPLETE`, `JOB_NOT_FOUND`, `AI_PROVIDER_ERROR`

## 4. 마스터 에러 테이블
| Code | Category | HTTP | Retry? | User Message (LOCALE=ko) | Log Level | Telemetry Tag | Recovery Action |
|------|----------|------|--------|---------------------------|-----------|---------------|----------------|
| AUTH_REQUIRED | Auth | 401 | No | 로그인 후 다시 시도해주세요. | warn | auth_required | 로그인 다이얼로그 표시 |
| PERMISSION_DENIED | AuthZ | 403 | No | 이 작업을 수행할 권한이 없습니다. | warn | permission_denied | 공유/권한 안내 |
| UPLOAD_INCOMPLETE | Upload | 400 | Yes | 업로드가 완료되지 않았습니다. 다시 시도하세요. | info | upload_incomplete | 미전송 part 재업로드 |
| CHECKSUM_MISMATCH | Upload | 409 | Yes | 파일 무결성 검증에 실패했습니다. | warn | checksum_mismatch | 해당 part 재전송 |
| CONVERT_UNSUPPORTED | Convert | 422 | No | 지원하지 않는 문서 형식입니다. | info | convert_unsupported | 지원 형식 목록 표시 |
| JOB_NOT_FOUND | Job | 404 | No | 요청한 작업을 찾을 수 없습니다. | info | job_not_found | 목록 새로고침 |
| JOB_TIMEOUT | Job | 504 | Maybe | 작업 시간이 초과되었습니다. | error | job_timeout | 재시도 버튼 제시 |
| EXPORT_FAILED | Export | 500 | Yes | 내보내기에 실패했습니다. 다시 시도하세요. | error | export_failed | Job 재시도 API |
| EXPORT_FORMAT_INVALID | Export | 400 | No | 지원되지 않는 내보내기 형식입니다. | warn | export_format_invalid | 지원 형식 안내 |
| AI_RATE_LIMIT | AI | 429 | Yes (delay) | AI 호출이 너무 잦습니다. 잠시 후 재시도. | warn | ai_rate_limit | 지수 백오프/대기 UI |
| AI_PROVIDER_ERROR | AI | 502 | Yes (fallback) | AI 서비스 연결이 불안정합니다. | error | ai_provider_error | 모델/프로바이더 fallback |
| STORAGE_NOT_AVAILABLE | Storage | 503 | Yes | 스토리지에 일시적 문제가 발생. | error | storage_unavailable | 재시도 큐 등록 |
| DB_CONFLICT | DB | 409 | Maybe | 데이터가 이미 변경되었습니다. 새로 고친 후 재시도. | warn | db_conflict | 최신 상태 재조회 |
| VALIDATION_FAILED | Validation | 422 | No | 입력 값을 확인해주세요. | info | validation_failed | 필드 하이라이트 |
| RATE_LIMITED | Throttle | 429 | Yes (wait) | 요청이 너무 많습니다. 잠시 후 재시도. | warn | rate_limited | 대기/쿨다운 표시 |
| INTERNAL_ERROR | System | 500 | Yes (cap) | 알 수 없는 오류가 발생했습니다. | error | internal_error | 재시도 + 로그 ID 표시 |
| SERVICE_DEGRADED | System | 503 | Yes | 시스템이 혼잡합니다. | error | service_degraded | 기능 제한 안내 |

## 5. 사용자 메시지 국제화 전략
- i18n key 예: `errors.AUTH_REQUIRED = "로그인이 필요합니다."`
- Fallback: 언어 키 누락 시 en → ko
- Dynamic detail(예: partNumber) 치환: `errors.UPLOAD_PART_FAILED = "{part}번 조각 업로드 실패"`

## 6. 재시도 정책 표 (클라이언트)
| 그룹 | 기준 코드 | Backoff | Max Attempts | 중단 조건 |
|------|-----------|---------|-------------|-----------|
| 네트워크/일시 | 5xx, 429 | exp(1s, factor2, cap 8s) | 5 | 4xx 비재시도 코드 수신 |
| 업로드 part | CHECKSUM_MISMATCH | 선형 1s | 3 | 동일 오류 반복 |
| AI Rate Limit | AI_RATE_LIMIT | exp 시작 2s cap 30s | 6 | 사용자 취소 |
| Export 실패 | EXPORT_FAILED | exp 1→4→9s | 3 | 포맷 오류 등 비재시도 코드 |

## 7. Job 실패 → 사용자 피드백 매핑
| Job type | 실패 코드 예 | UX 처리 | 추가 행동 |
|----------|--------------|---------|-----------|
| convert | CONVERT_UNSUPPORTED | 형식 안내 모달 | 지원 문서 링크 |
| convert | JOB_TIMEOUT | 재시도 버튼 | Support 로그 ID 제공 |
| export | EXPORT_FAILED | 재시도/로그 보기 | Issue 트래킹 옵션 |
| ai | AI_PROVIDER_ERROR | fallback 모델 안내 | 모델 전환 Toast |

## 8. 에러 로그 레벨 기준
| 레벨 | 조건 |
|------|------|
| info | 사용자 행동 기인 예측 가능 오류 (validation, unsupported) |
| warn | 권한 문제, 재시도 가능 업로드 오류 |
| error | 시스템/외부 서비스 실패, 비정상 지연 |
| critical | 데이터 손상 가능성, 다수 사용자 영향 |

## 9. Observability 연계
- Metrics increment: `errors_total{code}`→대시보드 Top5 표시
- Trace span status=error 시 code attribute 추가
- 로그: `error_id` (UUID) 생성 → FE 표시 (복사 기능)

## 10. 디버깅 절차 (예시: Export 실패)
1. FE: error toast 표시(error_id)
2. 사용자 Retry 시 새 Job 생성 + correlation 유지
3. BE 로그에서 error_id 검색 → stack/환경변수 체크
4. 재현 필요 시 fixture + job payload 저장 확인

## 11. Edge Cases & Partial Failure
| 시나리오 | 설명 | 처리 |
|----------|------|------|
| 부분 슬라이드 변환 실패 | 일부 요소만 누락 | Placeholder + warn 로그 |
| AI 부분 응답 중단 | SSE 조기 종료 | 수신된 delta만 diff 표시 + 재생성 옵션 |
| Export 중 asset 누락 | 이미지 fetch 실패 | 기본 fallback asset 삽입 |

## 12. 테스트 전략 연계
- Contract: 각 에러 코드 예시 response → snapshot
- E2E: 강제 변환 실패(mock) → UI 메시지 검증
- Chaos: AI provider 50% 오류 주입 → fallback 동작

## 13. Deprecation 정책
1. 코드 비활성화 예정 → `X-Error-Deprecated: <version>` 헤더 1 릴리즈 전 공지
2. FE 수용 후 제거
3. 문서 테이블에서 Deprecated 마크 유지 2 릴리즈

## 14. 위험 & 완화
| 위험 | 영향 | 완화 |
|------|------|------|
| 코드 증가로 복잡성 | 유지보수 비용 | 카테고리 주기 리뷰 |
| 중복/유사 코드 | UX 혼란 | 통합/정리 스프린트 |
| FE/BE 매핑 누락 | 잘못된 메시지 | OpenAPI examples + linter |

## 15. 향후 개선
- 자동 에러 코드 사용 통계 리포트
- Error Budget 소모 vs 코드 빈도 상관 분석
- 사용자 세션 기반 Error Funnel

## 16. 참고 문서
- openapi-spec-enhancement.md
- monitoring-observability.md
- testing-strategy.md
- end-to-end-workflows.md
