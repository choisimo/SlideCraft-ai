# GitIntegrations Implementation Spec (parse-prd)

## 1. 문제 정의
- 목적: GitHub 저장소 연결로 자동 문서화 파이프라인 트리거 및 변경 추적.
- 사용자 가치: 커밋/PR 발생 시 문서 재생성 자동화 기반.
- Pain Point: 수동 문서 동기화/추적 비효율.

## 2. 시나리오
| 시나리오 | 트리거 | 결과 | 예외 |
|----------|--------|------|------|
| UC-1: 저장소 추가 | URL 입력+Connect | integrations 리스트 갱신 | URL 형식 오류 |
| UC-2: 목록 조회 | 페이지 접근 | Connected repos 렌더 | DB empty → 안내 |
| UC-3: 작업 로그 조회 | 페이지 접근 | 최근 10 operations 표기 | 없음 시 placeholder |

## 3. 기능 요구
- FR-1: Supabase에서 github_integrations select 정렬.
- FR-2: URL 파싱(owner/repo) 후 insert.
- FR-3: git_operations 최근 10개 조회.
- FR-4: 상태별 아이콘 (completed/pending/error/default) 매핑.
- FR-5: Connect 비활성화(입력 비어있음).

### NFR
- NFR-1: 최초 데이터 로딩 중 로딩 스피너.
- NFR-2: 삽입 후 목록 자동 새로고침.

## 4. 데이터 구조 (Supabase 스키마 매핑)
```ts
interface GitIntegration {
  id: string;
  repository_name: string;
  repository_full_name: string;
  repository_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
interface GitOperation {
  id: string;
  operation_type: string;
  status: string; // completed|pending|error|...
  commit_message?: string;
  file_path: string;
  created_at: string;
  error_message?: string;
}
```

## 5. 아키텍처
- View: 추가 폼, 리포 리스트, operations 카드.
- State: integrations, operations, repoUrl, loading.
- Integration: Supabase client (select/insert).
- Hook(미래): useGitIntegrations({ refreshInterval }).

## 6. 흐름
1. useEffect mount → fetchIntegrations + fetchOperations.
2. 사용자 URL 입력 + Connect → validate regex.
3. insert 성공 → toast + refetch integrations.
4. operations 목록은 별도 호출.

## 7. 상태 정의
| 키 | 타입 | 초기값 | 트리거 | 소비 |
|----|------|--------|--------|------|
| integrations | GitIntegration[] | [] | fetch 성공 | 리스트 |
| operations | GitOperation[] | [] | fetch 성공 | 최근 작업 표시 |
| repoUrl | string | "" | 입력 변경, 추가 후 reset | 입력 필드 |
| loading | boolean | true | fetch start/end | 로딩 스피너 |

## 8. 이벤트
| 이벤트 | 소스 | 핸들러 | 부수효과 |
|--------|------|--------|-----------|
| Connect 클릭 | Button | addIntegration | insert + toast + refetch |
| 초기 마운트 | useEffect | fetch* | 로딩 표시 |

## 9. 외부 연동
| 대상 | 호출 | 목적 | 보안 |
|------|------|------|------|
| Supabase github_integrations | select/insert | 저장소 메타 | RLS (user_id) |
| Supabase git_operations | select | 최근 작업 조회 | RLS (소유자 제한) |

## 10. 에러 전략
| 상황 | 메시지 | 전략 |
|------|--------|------|
| URL 형식 오류 | Invalid GitHub URL | 사용자 교정 |
| insert 실패 | Error adding integration | Toast (destructive) |
| fetch 실패 | Error fetching integrations | Toast |

## 11. 관측(미래)
- Metrics: repo count, op error율.
- Logs: insert 오류, webhook 이벤트.

## 12. 테스트
| 계층 | 항목 | 예시 |
|------|------|------|
| 단위 | URL regex | 다양한 변형(.git 포함) |
| 컴포넌트 | 로딩 스피너 | loading=true 시 노출 |
| E2E | 추가 플로우 | 입력→Connect→목록 증가 |

## 13. 확장/로드맵
- GitHub App 설치 흐름 (installation_id 실데이터).
- Webhook ingestion (push/PR) → git_operations append.
- Manifest 기반 문서 생성 파이프라인.
- 재시도/취소 액션.

## 14. 성능
- 다수 repo 시 pagination.
- operations polling or realtime channel.

## 15. 보안 & 위험
| Risk | 영향 | 완화 |
|------|------|------|
| 임의 저장소 주입 | 데이터 오염 | URL 검사 + user_id 검증 |
| 비공개 repo 메타 노출 | 정보 유출 | OAuth 설치 스코프 제한 |

## 16. 마이그레이션
- Manual insertion → GitHub App OAuth → Webhook 자동 동기화.

## 17. Open Questions
- operations 보존 기간? (rollup 필요?)
- inactive 전환 조건 자동화?
