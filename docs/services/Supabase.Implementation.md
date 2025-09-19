# Supabase Integration Implementation Spec (parse-prd)

## 1. 문제 정의
- 목적: 인증/데이터 영속/문서 자동화 메타 저장을 위한 BaaS 계층.
- 사용자 가치: 백엔드 구축 비용 절감 + 즉시 타입 안전 접근.
- Pain Point: 초기 MVP 단계의 인프라 과다구현 방지.

## 2. 시나리오
| 시나리오 | 트리거 | 결과 | 예외 |
|----------|--------|------|------|
| UC-1: 사용자 로그인 | AuthInterface 제출 | 세션 persisted | 네트워크 실패 |
| UC-2: 저장소 추가 | GitIntegrations Connect | Row insert | 정책 거부(RLS) |
| UC-3: 최근 작업 조회 | GitIntegrations mount | operations select | 빈 결과 |

## 3. 기능 요구
- FR-1: typed client 생성(createClient<Database>).
- FR-2: 로컬 스토리지 세션 유지.
- FR-3: github_integrations / git_operations 스키마 타입 사용.
- FR-4: 환경변수(.env)와 코드 상수 일치 검증 문서화.

### NFR
- NFR-1: Auth state 전환 latency < 500ms.
- NFR-2: 타입 미스매치 0 (generated types 최신 유지).

## 4. 데이터 모델
- Database.types.ts 참고 (자동 생성) - 주요 테이블: github_integrations, git_operations, manifest_configs, profiles.

## 5. 아키텍처
- Integration Layer: supabase singleton export.
- 소비 컴포넌트: AuthInterface, GitIntegrations.
- (미래) Server edge function ↔ client RPC.

## 6. 흐름
1. client import → createClient 호출.
2. Auth call → session 저장(localStorage) → UI 반영.
3. CRUD 호출 → typed 결과 반환.

## 7. 상태
- Supabase client 자체는 무상태(stateless) (세션은 내부 auth storage 관리).

## 8. 이벤트
| 이벤트 | 소스 | 효과 |
|--------|------|------|
| signIn/signUp | auth API | 세션 변경 브라우저 저장 |
| token refresh | 내부 타이머 | 세션 연장 |

## 9. 외부 연동
| 대상 | 목적 | 인증 |
|------|------|------|
| Supabase REST/Postgrest | CRUD | anon key JWT |
| Supabase Auth | 세션 관리 | email/pass + magic link(미래) |

## 10. 에러 전략
| 상황 | 메시지 | 전략 |
|------|--------|------|
| Auth 실패 | error.message | Toast + 입력 유지 |
| RLS 거부 | not authorized | 사용자 권한 안내 |

## 11. 관측(미래)
- Metrics: 테이블별 쿼리 빈도.
- Logs: Edge functions 호출 로그.

## 12. 테스트
| 계층 | 항목 | 예시 |
|------|------|------|
| 단위 | 타입 추론 | insert payload 필드 오타 감지 |
| 통합 | Auth 흐름 | signUp→signIn 시 session 유지 |

## 13. 확장/로드맵
- Edge Functions: 문서 생성 파이프라인 enqueue.
- Row Level Policies 세분화 (role 기반).
- Realtime 채널: git_operations live 업데이트.

## 14. 성능
- 요청 배치(RPC) 고려.
- 캐시 레이어(SWR/React Query) 도입.

## 15. 보안 & 위험
| Risk | 영향 | 완화 |
|------|------|------|
| Service role key 노출 | 권한 남용 | build-time 변수 제한 |
| 과도한 anon 권한 | 데이터 유출 | 엄격 RLS 정책 |
| 타입 불일치 | 런타임 오류 | schema 변경 후 재생성 자동화 |

## 16. 마이그레이션
- 단일 anon 키 → 역할별 키 / Edge proxy.

## 17. Open Questions
- manifest_configs version 관리 전략?
- Realtime 채널 구독 기준(사용자 vs repo)?
