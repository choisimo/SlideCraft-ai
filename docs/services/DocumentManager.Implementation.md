# DocumentManager Implementation Spec (parse-prd)

## 1. 문제 정의
- 목적: 프로젝트/생성 문서를 한곳에서 검색, 필터, 액션(보기/다운로드/삭제) 제공.
- 사용자 가치: 산재된 산출물 가시화 + 후속 작업 진입점.
- Pain Point: 파일 시스템/외부 저장소 이동 없이 브라우저 내 관리.

## 2. 시나리오
| 시나리오 | 트리거 | 결과 | 예외 |
|----------|--------|------|------|
| UC-1: 검색 | 검색어 입력 | 목록 필터링 | 대소문자 무시 |
| UC-2: 업로드 준비 | 드래그/버튼 | Placeholder 안내 | 미지원 포맷 알림(미래) |
| UC-3: 문서 액션 | Eye/Download/Delete 클릭 | Placeholder or 동작 | 권한 실패(미래) |

## 3. 기능 요구
- FR-1: documents 배열 상태 관리.
- FR-2: 이름 부분 일치(case-insensitive) 필터.
- FR-3: 형식/타입 뱃지 색상/아이콘.
- FR-4: 기본 액션 버튼 노출(Eye/Download/Trash) - 현재 no-op.

### NFR
- NFR-1: 필터 입력 반응 < 30ms.
- NFR-2: 200개 문서 목록 성능 유지.

## 4. 데이터 구조
```ts
interface Document {
  id: string;
  name: string;
  type: 'project' | 'generated' | 'source';
  format: 'md' | 'pdf' | 'ppt' | 'html' | 'txt';
  size: string; // Display size
  lastModified: Date;
  status: 'active' | 'processing' | 'archived';
}
```

## 5. 아키텍처
- View: 업로드 영역, 검색 필드, 리스트.
- State: useState(documents, searchTerm).
- Integration(미래): Storage API (Supabase Storage / S3) + Metadata DB.
- Hook(미래): useDocuments({ filter }).

## 6. 흐름
1. 초기 렌더: static seed documents.
2. 검색 입력 변경 → filteredDocuments 계산.
3. 액션 클릭 → Placeholder (미래: 핸들러).

## 7. 상태 정의
| 키 | 타입 | 초기값 | 트리거 | 소비 |
|----|------|--------|--------|------|
| documents | Document[] | seed | fetch 성공(미래) | 리스트 |
| searchTerm | string | "" | onChange | 필터 |

## 8. 이벤트
| 이벤트 | 소스 | 처리 | 부수효과 |
|--------|------|------|-----------|
| 검색 입력 | Input | setSearchTerm | 필터 재계산 |
| Upload 클릭 | Button | onUpload(TBD) | 파일 선택 다이얼로그 |
| Eye 클릭 | Button | onView(TBD) | 미리보기 모달 |
| Download 클릭 | Button | onDownload(TBD) | 파일 전송 |
| Delete 클릭 | Button | onDelete(TBD) | Confirm → remove |

## 9. 외부 연동(미래)
| 대상 | 호출 | 목적 | 보안 |
|------|------|------|------|
| /api/documents | GET | 목록 | 사용자 권한 필터 |
| /api/documents | POST | 업로드 메타 | 검증/파일 스캔 |
| Storage Bucket | PUT/GET | 파일 저장/로드 | Signed URL |

## 10. 에러 전략
| 상황 | 메시지 | 전략 |
|------|--------|------|
| 업로드 실패 | "업로드 실패" | 재시도 버튼 |
| 권한 없음 | "권한 부족" | 로그인/역할 안내 |

## 11. 관측
- Metrics: 업로드 수, 포맷 분포.
- Logs: 삭제/다운로드 이벤트 기록.

## 12. 테스트
| 계층 | 항목 | 예시 |
|------|------|------|
| 단위 | 필터 로직 | 'api' → API Documentation 포함 |
| 컴포넌트 | 렌더 | 뱃지/아이콘 일치 |
| E2E | 업로드 플로우 | 선택 → 목록 추가 |

## 13. 확장/로드맵
- 폴더/태그/버전 지원.
- 문서 내용 인덱싱 + 검색(벡터 검색).
- 문서-생성 작업 추적(에이전트 출처 링크).

## 14. 성능
- 가상 스크롤 도입 (문서 1000+ 시점).
- Debounce 검색 (긴 입력 연속).

## 15. 보안 & 위험
| Risk | 영향 | 완화 |
|------|------|------|
| 악성 파일 업로드 | 시스템 악용 | MIME 검사/AV 스캔 |
| 민감정보 노출 | 데이터 유출 | DLP 정책/암호화 |

## 16. 마이그레이션
- Static → API Fetch → 실시간 변경(WebSocket) 단계.

## 17. Open Questions
- 파일 버전 관리 전략? (append-only vs overwrite)
- PDF/PPT 뷰어 내장 또는 외부 뷰어?
