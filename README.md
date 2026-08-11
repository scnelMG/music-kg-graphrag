# Music Knowledge Graph & GraphRAG

한국어 음악 기록을 위한 개인 음악 서비스입니다. 실제 MusicBrainz에서 앨범을
찾고, 선택한 앨범을 사용자의 Notion 데이터베이스에 기록한 뒤, 저장된 개인
기록을 근거로 취향과 다음 앨범 후보를 보여 줍니다. 기본 테스트와 레거시
fixture 경로는 회귀 검증용으로만 남아 있으며, 연결 모드의 사용자 화면은 이를
읽거나 표시하지 않습니다.

## 현재 제공하는 기능

- Spring Boot API: MusicBrainz 앨범/아티스트 검색, Notion 개인 기록 읽기·쓰기,
  취향 집계, 개인 기록 그래프 탐색, 오류 계약
- Next.js 음악 기록장: 실제 앨범 검색, 커버 확인, 최애곡·감상·보유 여부 저장,
  개인 취향과 근거가 있는 다음 앨범 후보 확인
- Python 데이터 파이프라인: RDF/SHACL 검증, GraphDB 투영 계약, 검색
  평가와 실패-닫힘(fail-closed) 검증
- 운영 검증: PostgreSQL outbox 재시도, 이미지 digest 검사, Cloud Run
  매니페스트 검사, fresh-volume 복구 리허설, 릴리스 증거 attestation

## 연결 모드의 정직한 범위

- 앨범·아티스트·발매일은 MusicBrainz 실시간 검색 결과이며, 커버는 Cover Art
  Archive가 실제 커버를 제공할 때만 표시합니다.
- 개인 기록의 원본은 사용자가 연결한 Notion 데이터베이스입니다. 저장은
  `앨범명`과 `가수`가 같은 기존 항목을 갱신하거나 새 페이지를 생성합니다.
- 추천은 현재 개인 기록의 아티스트를 그래프의 시작점으로 삼아 MusicBrainz의
  다른 발매 그룹을 찾는 결정론적 탐색입니다. 근거로 사용된 Notion 페이지 ID와
  시드 아티스트를 함께 제공합니다.
- 외부 LLM 문장 생성, 벡터 검색, GraphDB 질의는 연결 모드에서 사용하지
  않습니다. 따라서 그 기능이 동작하는 것처럼 표시하지 않습니다.

원격 배포는 별도 서비스 설정이 필요합니다. 이 README는 특정 Preview 또는
Production URL의 가용성을 보장하지 않습니다.

## 구조

- `backend/`: Spring Boot 연결 API와 fixture 회귀 검증 계약
- `frontend/`: Next.js BFF와 한국어 개인 음악 기록장
- `pipeline/`: RDF/SHACL·GraphRAG 평가·투영 검증 CLI
- `ontology/`, `shapes/`, `queries/`: 지식 그래프 모델·검증·고정 질의
- `deployment/`, `scripts/`: digest 고정, Cloud Run, 복구 및 릴리스 검증
- `data/fixtures/`: 공개 가능한 결정론적 fixture

Vercel은 Next.js 화면과 서버 측 BFF만 제공하고, Spring API는 별도 서비스로
둡니다. 브라우저에는 BFF 공유 비밀, GraphDB 접속 정보, 공급자 자격 증명을
노출하지 않습니다.

## 로컬 시작

필수 도구는 Java 21, Python 3.12, Node.js/pnpm, Docker Desktop입니다.
PowerShell에서는 아래처럼 실행할 수 있습니다.

```powershell
Copy-Item .env.example .env
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\start-connected-service.ps1
```

연결 모드 설정과 Notion의 한 번뿐인 공유 절차는
[`docs/connected-service-setup.md`](docs/connected-service-setup.md)를 따르세요.
로컬 검증 명령은 계속 아래와 같습니다.

```powershell
.\backend\gradlew.bat -p backend test --no-daemon
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

파이프라인 개발 의존성을 설치한 뒤에는 다음을 실행합니다.

```powershell
Set-Location pipeline
.\.venv\Scripts\python.exe -m pytest tests -q
```

기존 사용자 임시 폴더 ACL이 깨져 pytest가 실패한다면, 제품 결함과 구분하기
위해 작업공간의 새 임시 경로를 지정해 재현할 수 있습니다.

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q --basetemp ..\.tmp\pytest-local -p no:cacheprovider
```

Docker 기반 통합 테스트는 Docker Desktop 엔진이 실행 중이어야 합니다.

## 안전 원칙

- 실제 `.env`, 토큰, 쿠키, 개인 내보내기 파일은 커밋하지 않습니다.
- 기본 테스트는 실제 외부 API 호출과 개인 데이터 전송을 하지 않습니다.
- 릴리스 이미지는 mutable tag가 아닌 digest로 고정합니다.
- GraphDB는 시스템 원장이 아니라 정규화된 데이터에서 재구축 가능한
  파생 저장소입니다.
- Notion 토큰은 백엔드 환경 변수에만 두고 브라우저·커밋·로그에는 노출하지
  않습니다.
