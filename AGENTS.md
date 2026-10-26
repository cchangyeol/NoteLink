# NoteLink — AI 에이전트 안내

저장소 구조와 개발 규칙은 [README.md](README.md)를 따릅니다.

## Code Review Rules

PR 리뷰(`@codex review`, `scripts/codex-review.sh`)에 적용하는 규칙입니다.

- 리뷰는 **한국어**로 씁니다.
- 지적에는 근거가 되는 파일 경로와 함수 이름을 붙이고, 추측으로 지적하지 않습니다.
- 버그 · 보안 · 데이터 손실 · 경계 조건을 먼저 보고, 코드 스타일 취향 차이는 지적하지 않습니다(형식은 lint가 봅니다).

### 꼭 확인할 것

- **비밀값**: `.env`, API 키, 접속 문자열, 소셜 로그인 시크릿이 코드나 커밋에 들어가면 치명적 문제입니다. 비밀값은 서버(NestJS · FastAPI)에만 두고 앱(`apps/mobile`)에는 넣지 않습니다.
- **구조 규칙**: 앱은 NestJS 서버만 호출합니다. DB는 NestJS가 관리하고, FastAPI는 `ai_jobs` 컬렉션만 읽고 씁니다. 파일은 앱이 Blob에 직접 올리고 DB에는 주소만 저장합니다.
- **API 형식**: 주소는 `/api/v1/kebab-case`, 응답은 `{ data }`, 오류는 `{ code, message }`입니다.
- **시간**: 저장은 UTC, "오늘"은 서울 기준으로 자정(`DAY_RESET_HOUR = 0`)에 바뀝니다. 날짜 계산에서 시간대를 빠뜨리면 지적합니다.
- **이름**: 변수 · 함수 `camelCase`, 타입 · 컴포넌트 `PascalCase`, 상수 `UPPER_SNAKE`, 파일 `kebab-case`(컴포넌트 파일만 `PascalCase`), Python `snake_case`, DB 컬렉션 `snake_case` 복수형 · 필드 `camelCase`.
- **버전**: 패키지는 정확한 버전으로 고정하고 lock 파일을 함께 커밋합니다. Expo 패키지는 `npx expo install`로 설치한 버전이어야 합니다.
- **테스트**: 새 로직에 테스트가 없으면 "중요"로 적습니다. 파일 이름은 `*.test.ts(x)`, `test_*.py`입니다.
