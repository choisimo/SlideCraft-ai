# CapabilityRegistry Implementation Spec (parse-prd)

## 1. 문제 정의
- 목적: AI Agent가 보유/학습 중인 기능(capability)을 가시화하여 신뢰성과 탐색 용이성 제공.
- 사용자 가치: 가능한 행동 영역 인식, 실패 기능 상태 파악, 학습 진행 추적.
- Pain Point: 추상적 "무엇이 가능?" 질문을 UI로 구조화.

## 2. 시나리오
| 시나리오 | 트리거 | 결과 | 예외 |
|----------|--------|------|------|
| UC-1: 목록 열람 | 페이지 접근 | Capability 카드 렌더 | 없음 |
| UC-2: 상태 파악 | 카드 아이콘 시각 확인 | status 아이콘/Badge | 알 수 없음 상태 default 처리 |
| UC-3: 코드 보기 | View Code 클릭 | (미구현) 코드 뷰 모달 | 백엔드 미연결 |
| UC-4: 오류 기능 진단 | Debug 클릭(error status) | (미구현) 디버그 액션 | 권한 제한 필요 |

## 3. 기능 요구
- FR-1: capability 배열을 상태로 보유 후 리스트 렌더.
- FR-2: category별 색상/Badge 적용.
- FR-3: status별 아이콘 결정(active/learning/error).
- FR-4: usageCount, lastUsed 메타정보 표시.
- FR-5: dependencies 목록 Badge로 출력.

### NFR
- NFR-1: 렌더 성능 (capability 100개 이하 50ms 내 렌더).
- NFR-2: 확장성: 백엔드 교체 시 인터페이스 최소 변경.

## 4. 데이터 구조
```ts
interface Capability {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'generated' | 'experimental';
  status: 'active' | 'learning' | 'error';
  lastUsed?: Date;
  usageCount: number;
  dependencies: string[];
}
```

## 5. 아키텍처 & 분해
- View: 카드/배지/아이콘 구성.
- State: 로컬 useState (정적 seed).
- Integration(미래): Supabase or API fetch → setCapabilities.
- Hook(미래): useCapabilityRegistry(filters?).

## 6. 흐름
1. 초기 렌더: static list.
2. (미래) useEffect fetch → 상태 갱신.
3. 사용자 액션(View Code/Debug) → Placeholder.

## 7. 상태 정의
| 키 | 타입 | 초기값 | 트리거 | 소비 |
|----|------|--------|--------|------|
| capabilities | Capability[] | 하드코딩 배열 | (미래) fetch 성공 | 리스트 렌더 |

## 8. 이벤트 & 핸들러
| 이벤트 | 소스 | 함수 | 부수효과 |
|--------|------|------|-----------|
| View Code 클릭 | Button | onViewCode(TBD) | 모달 열기 예정 |
| Debug 클릭 | Button | onDebug(TBD) | 오류 진단 프로세스 |

## 9. 외부 연동 (미래)
| 대상 | 호출 | 목적 | 보안 |
|------|------|------|------|
| /api/capabilities | GET | 목록 수신 | 사용자 권한(읽기) |
| /api/capabilities/:id/execute | POST | 실행 | RBAC / RateLimit |

## 10. 에러 전략
| 상황 | 메시지 | 전략 |
|------|--------|------|
| fetch 실패 | "불러오기 실패" | 재시도 버튼 |
| execute 실패 | "실행 오류" | status=error 전환 |

## 11. 관측
- Metrics: capability execute count, error ratio.
- Logs: 실행 실패 원인, latency.

## 12. 테스트
| 계층 | 항목 | 예시 |
|------|------|------|
| 단위 | getStatusIcon | status별 아이콘 반환 |
| 단위 | getCategoryColor | category별 클래스 |
| 컴포넌트 | 렌더 | usageCount / lastUsed 표시 |

## 13. 확장/로드맵
- Dynamic CRUD (추가/삭제/학습 단계).
- Telemetry 실시간 업데이트 (WebSocket/SSE).
- Capability dependency graph 시각화.

## 14. 성능
- Lazy load (pagination) 필요 시 도입.
- memoization for derived filters.

## 15. 보안 & 위험
| Risk | 영향 | 완화 |
|------|------|------|
| 임의 실행 | 시스템 오남용 | 서버 권한 체크 |
| PII 포함 설명 | 정보 유출 | 필터링/검열 파이프라인 |

## 16. 마이그레이션
- Static → Fetch → Realtime 단계적.

## 17. Open Questions
- Generated vs Experimental 구분 전환 규칙?
- UsageCount 증가 타이밍 (요청 성공 기준?)
