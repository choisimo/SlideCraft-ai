# AIAgent Implementation Spec (parse-prd)

## 1. 제품/문제 정의 (Problem)
- 목적: 사용자가 자연어로 문서 생성, 코드 분석, 변환 요청을 수행할 수 있는 대화형 인터페이스 제공.
- 사용자 가치: 단일 창구(Chat)에서 기능 탐색/실행, 결과(파일/요약) 즉시 획득.
- Pain Point: 분산된 도구/CLI를 몰라도 문서 자동화 기능 접근 가능.

## 2. 주요 사용자 시나리오 (Primary Use Cases)
| 시나리오 | 트리거 | Happy Path 결과 | 확장/예외 |
|----------|--------|-----------------|-----------|
| UC-1: 기본 질문 | 사용자가 일반 텍스트 입력 | 에이전트 답변 메시지 렌더 | 네트워크 장애 → 재시도 버튼 제공 예정 |
| UC-2: 문서 변환(PPT) | 입력에 'ppt' 포함 | 다운로드 가능한 첨부 표시 | 미지원 포맷 → 오류 메시지 |
| UC-3: 긴 작업 진행 | 대용량 처리 요청 | "processing" 상태 후 결과 | 타임아웃 → partial 실패 안내 |
| UC-4: 능력 탐색 | 사용자 특정 기능 언급 | Capability 참조/플랜 응답 | 기능 미등록 → 제안 메시지 |

## 3. 기능 요구 (Functional Requirements)
- FR-1: 메시지 목록을 시간 순으로 유지하고 자동 스크롤한다.
- FR-2: Enter 전송 / Shift+Enter 개행을 지원한다.
- FR-3: 처리 중 상태(isProcessing) 동안 입력/전송 버튼을 비활성화한다.
- FR-4: 특정 키워드(ppt|pdf) 감지 시 첨부(다운로드 placeholder) 제공.
- FR-5: 시스템 초기 메시지를 첫 렌더 시 주입한다.
- FR-6: (미래) 백엔드 스트리밍 API 연동을 위한 추상화 포인트 제공.

### 비기능 요구 (NFR)
- NFR-1: 60fps 스크롤 성능, 200개 이하 메시지에서 렌더 지연 < 50ms.
- NFR-2: XSS 방지(plain text 렌더, HTML 미해석).
- NFR-3: 접근성: 버튼 role, 키보드로 전송 가능.
- NFR-4: 상태 관리 단순성(로컬 useState, 전역 스토어 불필요 초기 버전).

## 4. 도메인 모델 & 데이터 구조
```ts
interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  status?: 'processing' | 'completed' | 'error';
  attachments?: { type: 'file' | 'download'; name: string; url?: string }[];
}
```
- 상태 소유권: 컴포넌트 내부 (messages, input, isProcessing).
- 파생 상태: 없음 (필요 시 메시지 그룹핑, 날짜 헤더 등 향후 계산 필드 추가 가능).

## 5. 아키텍처 & 컴포넌트 분해
- View Layer: Card / ScrollArea / Input / Button / Badge UI 컴포넌트.
- State Layer: React useState (messages, input, isProcessing) + useEffect for autoscroll.
- Integration Layer(미래): `AgentService` (fetch + SSE) 추상화 예정.
- 확장 Hook 예정: `useAgentConversation({ backendMode: 'local' | 'remote' })`.

## 6. 흐름 다이어그램 (논리 서술)
### 6.1 기본 처리 흐름
1. 사용자 입력 → handleSendMessage 호출.
2. 검증(공백, 중복 처리 중 여부) → 메시지 상태 append.
3. isProcessing=true 설정.
4. (현재) setTimeout 시뮬레이션 → 결과 메시지 push.
5. isProcessing=false, ScrollArea 바닥으로 스크롤.

### 6.2 에러/재시도 흐름 (미래)
- API 실패 → agent 메시지(status=error) + 재시도 버튼 → 동일 payload 재요청.

## 7. 상태(State) 정의
| State 키 | 타입 | 초기값 | 변경 트리거 | 소비 위치 |
|----------|------|--------|-------------|-----------|
| messages | Message[] | 시스템 초기 메시지 | 전송/응답 수신 | 목록 렌더/자동스크롤 |
| input | string | "" | onChange | Input value |
| isProcessing | boolean | false | 전송 시작/응답 완료 | 버튼/입력 disabled |

## 8. 이벤트 & 핸들러
| 이벤트 | 소스 | 처리 함수 | 부수효과 |
|--------|------|-----------|-----------|
| 키 입력 Enter | Input | handleSendMessage | messages append, 상태 전환 |
| 클릭 Send | Button | handleSendMessage | 동일 |
| 메시지 배열 변화 | useEffect | scrollToBottom | UI 스크롤 |

## 9. 외부 연동 (API / SDK / Storage)
| 연동 대상 | 호출 형태 | 목적 | 인증/보안 고려 |
|-----------|-----------|------|-----------------|
| (미래) /api/agent | POST+SSE | LLM 응답 스트림 | JWT / 세션 기반 권한 |

## 10. 에러 분류 & 사용자 피드백 전략
| 코드/상황 | 원인 | 사용자 메시지 | 재시도 전략 |
|-----------|------|---------------|--------------|
| network_failure | 백엔드 연결 실패 | "네트워크 오류" | 재시도 버튼 |
| parse_error | 응답 형식 오류 | "응답 처리 실패" | 로컬 fall-back |
| timeout | 30s 초과 | "시간 초과" | 동일 요청 재시도 |

## 11. 로깅 & 관측 (Observability)
- Metrics(미래): 요청 횟수, 평균 처리 시간, 오류율.
- Logs: 전송 payload 길이, 실패 사유(error code).
- Tracing: message id 기준 span 구성.

## 12. 테스트 전략
| 계층 | 범위 | 예시 |
|------|------|------|
| 단위 | 핸들러 | handleSendMessage 입력 검증 |
| 단위 | 유틸 | 첨부 조건 필터(ppt/pdf) |
| 컴포넌트 | Interaction | Enter 전송, disabled 상태, autoscroll |
| E2E | 시나리오 | PPT 요청 → 첨부 노출 |

## 13. 확장/로드맵 (Evolution)
- Short-term: 스트리밍 API 연동, 토큰별 업데이트.
- Mid-term: 멀티탭 대화, 문맥 파일 첨부.
- Long-term: Self-evolving capability suggestion + 실행 플로우.

## 14. 성능/최적화 포인트
- 메시지 500+ 예상 시 가상 스크롤 도입 고려.
- 대화 스트리밍 시 부분 렌더(batch) 적용.

## 15. 보안 & 위험 (Risks)
| Risk | 영향 | 완화 전략 |
|------|------|-----------|
| XSS | 사용자 입력 기반 렌더 | plain text escape 유지 |
| 메모리 누수 | 대량 메시지 | pagination / limit |
| 민감정보 노출 | 로그에 원문 저장 | 길이/PII 마스킹 |

## 16. 마이그레이션 / 도입 전략
- 로컬 시뮬레이션 → feature flag 로 원격 모드 점진 전환.

## 17. Open Questions
- 다국어 지원 시 tokenizer/stream 처리 전략?
- Capability 선택 UX (자동 vs 수동) 우선순위?
