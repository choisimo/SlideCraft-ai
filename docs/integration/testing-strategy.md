# Testing Strategy

## 1. 목적 & 범위
SlideCraft AI 전 구성요소(Frontend, API Gateway, Workers, Realtime, AI Proxy, Export)의 품질을 체계적으로 보장하기 위한 다층 테스트 접근 방식을 정의한다.

## 2. 배경 / 문제 정의
현재 Acceptance 목록과 일부 구현 문서는 존재하나, 테스트 계층별 커버리지 기준, Contract/Fixture 생성 파이프라인, 성능·신뢰성 시험 절차가 산발적이다. 통합 전략 수립으로 회귀 리스크와 품질 가시성을 개선한다.

## 3. 목표 지표
| 카테고리 | 메트릭 | 목표 | 설명 |
|----------|--------|------|------|
| 단위 테스트 | 라인 커버리지(코어 로직) | ≥70% | 파서·핵심 util, 비즈니스 함수 |
| 계약 테스트 | 주요 엔드포인트 스키마 드리프트 | 0건/릴리즈 | OpenAPI 대비 불일치 |
| E2E | 주요 사용자 플로우 성공률 | ≥95% | Nightly run |
| 성능 | Convert 50MB PDF P95 | <15s | Worker 측정 |
| 안정성 | Flaky 테스트 비율 | <2% | 14일 롤링 |

## 4. 테스트 계층 정의
| 계층 | 목적 | 예시 | 툴/환경 |
|------|------|------|---------|
| Unit | 함수/모듈 순수 로직 | Deck normalizer | Vitest / Jest / Pytest |
| Component | UI 상호작용/렌더 | ExportDialog | React Testing Library |
| Contract (API) | 스키마/응답 일관성 | /convert, /jobs/:id | OpenAPI + schemathesis/MSW |
| Integration | 서비스 간 조합 | Convert→Documents | Local docker compose |
| E2E | 사용자 플로우 | Upload→AI→Export | Playwright |
| Performance | 지연/처리량 | Convert queue load | k6/Locust |
| Chaos | 장애 내성 | Redis latency spike | toxiproxy + scenarios |
| Security | 취약점 탐지 | JWT forgery attempt | zap/snyk + custom |

## 5. 커버리지 매트릭스 (샘플)
| 기능 | Unit | Component | Contract | Integration | E2E | Perf | Chaos |
|------|------|-----------|----------|-------------|-----|------|-------|
| Upload Multipart | ✓(checksum util) | ✓(Progress UI) | ✓ | ✓ | ✓ | ✓(대용량) | △ |
| Convert Pipeline | ✓(parser funcs) | - | ✓ | ✓ | ✓ | ✓ | ✓ |
| Realtime Presence | ✓(state reducers) | ✓ | ✓ | ✓ | ✓ | ✓(10 clients) | ✓ |
| AI Chat Stream | ✓(token parser) | ✓ | ✓ | ✓ | ✓ | ✓(latency) | △ |
| Export PPTX/PDF | ✓(option merge) | ✓ | ✓ | ✓ | ✓ | ✓ | △ |

## 6. OpenAPI 기반 Contract Test 파이프라인
1. openapi.yaml → 스키마 lint (spectral) → codegen (typescript, python stubs)
2. Schemathesis 혹은 Dredd로 기본 경로 fuzz
3. MSW (FE) / pytest + responses (BE) 로 성공/에러 시나리오 fixture 검증
4. CI Gate: 스키마 diff 감지 시 PR 실패 (semantic change 정책)

## 7. Fixture & Test Data 관리
- Golden Deck Samples: small_deck.json, medium_deck.json, stress_deck.json
- 문서 유형 세트: pptx_text, pdf_textheavy, pptx_imageheavy, docx_mixed
- 버전 태깅: fixtures/version.json (schemaVersion, updatedAt)
- Faker 기반 동적 data → Snapshot 안정성 위해 key sorting

## 8. 성능 & 부하 테스트 전략
| 시나리오 | 도구 | 지표 | 합격 기준 |
|----------|------|------|-----------|
| Convert 10 동시 50MB PDF | Locust | 평균 처리시간 | <18s |
| Export 20 동시 PPTX | k6 | 실패율 | <2% |
| Realtime 10 동시 편집 | Custom harness | 메시지 지연 | <250ms P95 |
| AI 30 동시 chat | k6 + SSE | 첫 토큰 지연 | <2s P95 |

- 실행 시점: Nightly + Release Candidate
- 결과 저장: artifacts/perf/YYYYMMDD.json

## 9. Chaos Engineering (초기 범위)
| 실험 | 방법 | 기대 | 관측 |
|------|------|------|------|
| Redis latency 500ms 주입 | toxiproxy | Job 처리 지연 증가 감지 | job_duration 상승 경보 |
| Worker 50% 실패 | fault injection | 재시도 정상 수행 | retry 메트릭 상승 |
| WebSocket drop 연속 | 네트워크 차단 | 재연결 backoff 적용 | reconnect attempt 로그 |

## 10. 보안/취약점 테스트
- 정적 분석: ESLint(Security rules), Bandit(Python)
- 종속성 스캔: npm audit, pip safety, snyk
- 동적: ZAP baseline scan 프록시 CI
- JWT 위조 케이스: 잘못된 서명 → 401 기대

## 11. 테스트 실행 파이프라인 (CI)
| 단계 | 훅 | 내용 |
|------|-----|------|
| pre-commit | lint-staged | 포맷/린트 subset |
| PR | GitHub Actions | lint, typecheck, unit, component, contract(mock) |
| nightly | Scheduler | integration(docker-compose), e2e, perf 샘플 |
| release | Tag push | full e2e, perf 확장, security scan |

## 12. 품질 게이트
| 게이트 | 조건 | 실패 조치 |
|--------|------|-----------|
| Lint | 오류=0 | PR 차단 |
| Type Errors | 0 | PR 차단 |
| Unit 실패 | 0 | PR 차단 |
| OpenAPI Drift | 없음 | PR 차단 |
| Flaky Rate | <2% | 관찰/이슈 생성 |
| P95 Convert | <15s | 릴리즈 보류 |

## 13. Flaky 테스트 관리
- 태깅: @flaky 주석 → 주기적 리트라이 통계 저장
- 자동 재시도: 2회 (JUnit report 집계)
- 2주 연속 flake → 리팩터 이슈 자동 생성

## 14. 로컬 개발자 워크플로
- `npm run test:unit` : 빠른 (<5s) 피드백
- `npm run test:contract` : MSW + 스키마 검증
- `docker compose up` 후 `npm run test:integration`

## 15. 리포팅 & 대시보드
- Coverage: html + lcov → Codecov 업로드
- Trend: perf_histories.csv 누적 그래프 (변동 ±10% 이상 경보)
- Slack 알림: 실패 타입 요약 + 재시도 링크

## 16. 위험 & 완화
| 위험 | 설명 | 완화 |
|------|------|------|
| 과도한 테스트 시간 | CI 지연 | 병렬화, test shard |
| 대형 Fixture 유지비 | 업데이트 번거로움 | 최소 샘플 + 합성 데이터 |
| API Drift 누락 | 런타임 오류 | 스키마 diff 자동 게이트 |

## 17. 향후 로드맵
- Mutation Testing(임계 유틸) 도입
- Contract test fuzz 비율 확장(경계값/Invalid cases)
- Realtime synthetic 사용자 로봇 증가(10→50)
- Chaos 자동화 스케줄 월 1회

## 18. 참고 문서
- end-to-end-workflows.md
- monitoring-observability.md
- error-taxonomy-and-recovery.md
- openapi-spec-enhancement.md
