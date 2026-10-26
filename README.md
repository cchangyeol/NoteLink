# 노트링크 (NoteLink)

> 수기 대신 스마트하게, AI와 함께 배우는 노트 앱

공부 시간 **기록** → 필기·녹음 **AI 가공** → 퀴즈·플래시카드 **복습**이 한 앱에서 이어지도록 만드는 학습 앱입니다.
필기 사진, PDF, 강의 녹음을 올리면 AI가 요약·퀴즈·아바타 설명으로 바꿔 줍니다.

> **현재 상태**: 폴더 구조만 먼저 만든 초기 단계입니다. `package.json`, 설정 파일, 소스 코드는 아직 없습니다.
> 아래 "시작하기"의 설치·실행 명령은 저장소 세팅이 끝난 뒤에 사용할 수 있습니다.

---

## 1. 기술 스택

| 영역 | 사용 기술 | 버전 |
| --- | --- | --- |
| 모바일 앱 | Expo (React Native) + TypeScript | Expo SDK 57 · RN 0.86.3 · TS 6.0.3 |
| 메인 서버 | NestJS (Node.js) | NestJS 12 · Node 24 |
| AI 서버 | FastAPI (Python) | FastAPI 0.142 · Python 3.13 |
| 데이터베이스 | MongoDB Atlas (Azure 코리아 중부) | MongoDB 8.0 |
| 파일 저장소 | Azure Blob Storage | — |
| 배포 | Azure App Service (Linux) | — |
| 실시간 | Socket.IO (NestJS 서버에 직접) | 4.8 |
| 캠 · 음성 스터디 | LiveKit Cloud | — |

### AI 서비스

| 기능 | 서비스 |
| --- | --- |
| 요약 · 퀴즈 · AI 설명 | Claude Opus 5.5 |
| 필기 사진 · PDF 읽기 | Claude (이미지 · PDF 직접 입력) |
| 필기 인식 보조 (테스트 후 결정) | Azure AI Document Intelligence |
| 음성 인식 | Azure AI Speech (단어별 시간 정보) |
| 음성 합성 · 아바타 입 모양 | Azure AI Speech (TTS + viseme) |

---

## 2. 구조

```
모바일 앱 ──REST · Socket.IO──▶ NestJS 서버 ──▶ MongoDB Atlas
   │                              │  ▲
   │                              ▼  │ (ai_jobs만)
   │                           FastAPI ──▶ Claude · Azure Speech
   ├── 사진·녹음·PDF 직접 업로드 ──▶ Azure Blob Storage
   └── 캠·음성 ─────────────────▶ LiveKit Cloud (입장 토큰은 NestJS가 발급)
```

- 앱은 **NestJS 서버만** 호출합니다.
- DB는 **NestJS가 관리**하고, FastAPI는 `ai_jobs` 컬렉션만 씁니다.
- 오래 걸리는 AI 작업은 `ai_jobs`에 넣고 처리하며, 진행률은 Socket.IO로 앱에 보냅니다.
- 파일은 앱이 **Blob에 직접** 올리고, DB에는 파일 주소만 저장합니다.
- 캠 영상·음성은 우리 서버를 거치지 않고 **LiveKit으로 직접** 갑니다.

---

## 3. 폴더 구조

```
NoteLink/
├─ apps/
│  ├─ mobile/                 # Expo (React Native) 앱
│  │  ├─ app/                 #   expo-router 화면: (auth) · (tabs) · shop
│  │  ├─ src/
│  │  │  ├─ features/         #   auth, session, content, quiz, social, reward, calendar, progress
│  │  │  ├─ components/  hooks/  stores/
│  │  │  ├─ lib/              #   api, upload(Blob 업로드), socket
│  │  │  ├─ theme/            #   색·글꼴·간격 토큰 (Noto Sans KR)
│  │  │  └─ i18n/             #   한·영·일·중
│  │  └─ assets/
│  ├─ api/                    # NestJS 서버
│  │  ├─ src/
│  │  │  ├─ config/  common/  migrations/
│  │  │  ├─ modules/          #   auth, session, content, ai, quiz, social, studyroom,
│  │  │  │                    #   reward, calendar, progress, notification, upload
│  │  │  ├─ realtime/         #   Socket.IO 게이트웨이 (채팅 · 스터디룸 · AI 진행률)
│  │  │  ├─ ai-jobs/          #   ai_jobs 등록 · 변화 감지 · 결과 반영
│  │  │  └─ clients/          #   FastAPI 호출, Blob 클라이언트
│  │  └─ test/
│  └─ ai/                     # FastAPI AI 서버
│     ├─ app/
│     │  ├─ core/  api/v1/  worker/  services/  clients/  schemas/
│     └─ tests/
├─ packages/
│  └─ shared/                 # 모바일·Node 공용: zod 스키마, 상수, 열거값, 타입
├─ infra/                     # 로컬 개발용 docker-compose (MongoDB, Azurite)
├─ docs/                      # 규칙 · 구조 · API 문서
└─ .github/workflows/         # CI(lint · typecheck · test), 배포
```

---

## 4. 시작하기

### 필요한 것

Git, Node 24, Python 3.13, Docker Desktop, Android 앱 빌드용 JDK 17 + Android Studio.
Mac에서 iOS를 빌드하려면 Xcode 26.4 이상이 추가로 필요합니다.

### Windows

PowerShell을 **관리자 권한**으로 열고 진행합니다.

```powershell
winget install Git.Git
winget install CoreyButler.NVMforWindows
winget install Python.Python.3.13
wsl --install                      # 이후 컴퓨터를 다시 시작
winget install Docker.DockerDesktop
winget install Microsoft.OpenJDK.17
winget install Google.AndroidStudio

nvm install 24
nvm use 24
```

Docker Desktop과 Android Studio를 한 번씩 실행해 둡니다(Android SDK가 설치됨). 그다음 환경 변수를 등록합니다.

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:LOCALAPPDATA\Android\Sdk\platform-tools", "User")
```

- Android 앱: `cd apps\mobile` → `npx expo run:android`
- iOS 앱: Windows에서는 직접 빌드할 수 없어 EAS 클라우드 빌드(`npx eas-cli build --profile development --platform ios`)를 씁니다. Apple 개발자 계정이 필요합니다.

### Mac

```bash
brew install git fnm python@3.13
brew install --cask docker-desktop zulu@17 android-studio

fnm install 24
fnm use 24
```

- Xcode 26.4 이상을 App Store에서 설치하고, **Settings > Locations**에서 Command Line Tools를 선택한 뒤 iOS 시뮬레이터를 받습니다.
- `~/.zshrc`에 아래를 추가하고 `source ~/.zshrc`를 실행합니다.

```bash
eval "$(fnm env --use-on-cd --shell zsh)"
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

- iOS 시뮬레이터: `cd apps/mobile` → `npx expo run:ios`
- Android 앱: `cd apps/mobile` → `npx expo run:android`

### 프로젝트 실행 (저장소 세팅 완료 후)

```bash
git clone <저장소 주소>
cd NoteLink
npm install
docker compose -f infra/docker-compose.yml up -d
```

AI 서버용 가상환경 (Windows는 `py -3.13`, `apps\ai\.venv\Scripts\pip`)

```bash
python3.13 -m venv apps/ai/.venv
apps/ai/.venv/bin/pip install -r apps/ai/requirements-dev.txt
```

터미널 3개에서 각각 실행합니다.

```bash
npm run dev:api      # NestJS 서버
npm run dev:ai       # FastAPI 서버
npm run dev:mobile   # 앱 개발 서버
```

> Expo SDK 57에서는 Watchman이 필요 없습니다. iPhone 실기기에 설치하려면 Apple 개발자 계정이 필요합니다.

---

## 5. 개발 규칙

### 이름

- 변수·함수 `camelCase`, 타입·컴포넌트 `PascalCase`, 상수 `UPPER_SNAKE`
- 파일 `kebab-case` (컴포넌트 파일만 `PascalCase`), Python은 `snake_case`
- DB 컬렉션 `snake_case` 복수형 (`study_sessions`), 필드 `camelCase`

### API

- 주소 `/api/v1/study-sessions` 형태, 응답 `{ data }`, 오류 `{ code, message }`
- 시간은 UTC로 저장하고, "오늘"은 서울 기준으로 계산합니다. 하루는 **자정**에 바뀝니다 (`DAY_RESET_HOUR = 0`).

### Git

- 브랜치: `main` ← `develop` ← `feature/FR-번호-설명`
- 커밋: `feat(quiz): 퀴즈 결과 화면 추가 (FR-58)`
- PR은 리뷰 1명 + 린트·테스트 통과 후 병합합니다.
  - **CI**: 모든 커밋과 PR마다 `.github/workflows/ci.yml`이 lint · typecheck · build · test를 돌립니다. `CI 결과`가 통과해야 병합할 수 있습니다.
  - **승인**: `develop` · `main` 병합에는 최완우(`Choiwanwoo-03`) 또는 최한결(`cchangyeol`) 중 최소 한 명의 Approve가 필요합니다(`.github/CODEOWNERS`). 새 커밋을 올리면 이전 승인은 사라지니 다시 받아야 합니다.
  - **Codex 리뷰**: `develop`으로 가는 PR은 리뷰어가 `scripts/codex-review.sh <PR번호>`로 Codex 리뷰를 돌려 PR 댓글(치명적 문제 · 중요 · 제안 · 좋았던 점 · 권장 조치)로 남깁니다. CI가 실패한 상태면 리뷰 대신 실패 로그를 남깁니다. 지적을 고쳐 커밋을 올리면 같은 명령으로 재리뷰합니다(이전 지적 반영 여부를 먼저 확인). 리뷰 기준은 `AGENTS.md`의 Code Review Rules입니다.

### 버전 · 보안

- 모든 패키지는 정확한 버전으로 고정하고, lock 파일은 커밋합니다.
- Expo 패키지는 `npx expo install`로 설치합니다.
- `.env`는 커밋하지 않습니다 (`.env.example`만 커밋).
- 소셜 로그인 시크릿 같은 비밀값은 **서버에만** 두고 앱에는 넣지 않습니다.

---

## 6. 결정 사항

| 항목 | 결정 |
| --- | --- |
| 실시간 통신 | Socket.IO 직접 (App Service에서 WebSocket 켜기) |
| 캠 · 음성 스터디 | 이번 학기 개발 (LiveKit Cloud) |
| 앱 차단 | Android 먼저, iOS는 Apple 승인 후 |
| 소셜 로그인 | 개발용 테스트 키부터 (카카오 · 네이버 · Google) |
| 결제 | 나중에 개발 (포인트 충전 · 요금제 결제만 미룸) |

## 7. 남은 일

- [ ] 요금제별 AI 사용 한도 — 요금제 기능 개발 때
- [ ] 필기 인식 비교 테스트 (Claude만 vs Document Intelligence + Claude) — 노트 개발 첫 주
- [ ] 캠 · 음성 스터디 화면 설계 — 스터디룸 담당
- [ ] 요구사항 FR-24의 하루 기준 시각을 자정으로 수정
- [ ] viseme ↔ FR-56 입 모양 연결표 — 아바타 담당
- [ ] 결제 방식 — 결제 개발 시작 때
