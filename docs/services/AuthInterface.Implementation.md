# AuthInterface Implementation Spec (parse-prd)

## 1. 제품/문제 정의 (Problem)
- 목적: 이메일/비밀번호 기반 최소 인증 진입점 제공.
- 사용자 가치: 계정 생성 및 로그인 후 문서화 에이전트 기능 접근.
- Pain Point: 별도 인증 포털 없이 임베디드 간결 UI 필요.

## 2. 주요 사용자 시나리오
| 시나리오 | 트리거 | Happy Path 결과 | 확장/예외 |
|----------|--------|-----------------|-----------|
| UC-1: 회원가입 | 이메일/비밀번호 입력 후 제출 | 확인 메일 안내 Toast | 중복 이메일 → 에러 Toast |
| UC-2: 로그인 | 유효 자격 제출 | 세션 생성 → 리다이렉트 | 비밀번호 오류 → 에러 Toast |
| UC-3: 모드 전환 | 링크 클릭 | SignIn ↔ SignUp UI 전환 | 상태 유지 실패 → 기본값 SignIn |

## 3. 기능 요구(FR)
- FR-1: 이메일/비밀번호 필드 검증(required, email format, minLength=6).
- FR-2: SignUp / SignIn 모드 토글.
- FR-3: Loading 동안 버튼 비활성화 및 텍스트 변경.
- FR-4: Supabase Auth API 호출 에러를 Toast로 노출.
- FR-5: 회원가입 성공 시 안내 메시지.

### NFR
- NFR-1: 입력 처리 중 UI 응답 시간 < 100ms.
- NFR-2: 보안: 자격 증명 콘솔 미출력.
- NFR-3: 접근성: label 연결, submit 키보드 제출.

## 4. 도메인 모델 & 데이터 구조
```ts
interface AuthState {
  email: string;
  password: string;
  isSignUp: boolean;
  loading: boolean;
}
```
- 상태 소유권: 컴포넌트 로컬.

## 5. 아키텍처 & 컴포넌트 분해
- View: Card / Input / Button.
- State: useState.
- Integration: `supabase.auth.signUp` / `signInWithPassword`.
- Toast Layer: useToast Hook.

## 6. 흐름
1. Form submit → preventDefault.
2. loading=true 설정.
3. 분기(isSignUp) → 각 Supabase 호출.
4. 오류 시 catch → Toast variant destructive.
5. finally → loading=false.

## 7. 상태 정의
| Key | 타입 | 초기값 | 변경 트리거 | 소비 위치 |
|-----|------|--------|-------------|-----------|
| email | string | "" | onChange | Input value |
| password | string | "" | onChange | Input value |
| isSignUp | boolean | false | Toggle 버튼 | Title/버튼 라벨 |
| loading | boolean | false | 요청 시작/종료 | 버튼 disabled/라벨 |

## 8. 이벤트 & 핸들러
| 이벤트 | 소스 | 함수 | 부수효과 |
|--------|------|------|-----------|
| form submit | form | handleAuth | Auth API 호출 |
| toggle click | Button | setIsSignUp | UI re-render |

## 9. 외부 연동
| 대상 | 호출 | 목적 | 보안 |
|------|------|------|------|
| Supabase Auth | signUp/signInWithPassword | 사용자 인증 | 공개 anon key, HTTPS |

## 10. 에러 & 피드백
| 상황 | 메시지 | 전략 |
|------|--------|------|
| Invalid creds | Authentication error | 즉시 Toast |
| Network fail | Authentication error | 재시도 안내 |

## 11. 로깅/관측(미래)
- Metrics: 성공율, 에러율.
- Logs: 에러 코드(비밀번호/존재X) 식별.

## 12. 테스트 전략
| 계층 | 항목 | 예시 |
|------|------|------|
| 단위 | isSignUp 분기 | signUp path 호출 여부 |
| 컴포넌트 | Loading 상태 | 버튼 disabled 확인 |
| E2E | 가입/로그인 | 브라우저 폼 흐름 |

## 13. 확장/로드맵
- OAuth 공급자 버튼 추가.
- Magic Link / Password Reset.
- 다단 MFA.

## 14. 성능/최적화
- 불필요 re-render 최소 (입력 state만 변경).

## 15. 보안 & 위험
| Risk | 영향 | 완화 |
|------|------|------|
| 약한 비밀번호 | 계정 탈취 | Supabase 정책 (min length) |
| Brute force | 시도 폭증 | Rate limit / Edge function |
| Token 노출 | 세션 탈취 | HTTPS+SameSite 쿠키(미래) |

## 16. 마이그레이션
- 단순 이메일 패스 → OAuth 병행 단계적.

## 17. Open Questions
- 세션 만료 UX 알림 필요 여부?
- 가입 후 즉시 자동 로그인 처리 선택?
