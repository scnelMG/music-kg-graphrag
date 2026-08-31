# 근거 중심 개인 음악 아카이브

![Java](https://img.shields.io/badge/Java-Spring%20Boot-6DB33F?logo=springboot&logoColor=white)
![Python](https://img.shields.io/badge/Python-Data%20Pipeline-3776AB?logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)
![GraphDB](https://img.shields.io/badge/GraphDB-RDF%20%7C%20SPARQL-0F766E)

한국어 음악 기록을 위한 근거 중심 개인 음악 아카이브입니다. MusicBrainz를 정체성 기준으로
검색하고, 결과가 없을 때는 한국 iTunes Store 카탈로그를 보조 검색으로 사용합니다. 선택한 앨범을 사용자의 Notion 데이터베이스에 기록한 뒤, 저장된 개인
기록을 근거로 취향과 다음 앨범 후보를 보여 줍니다. 기본 테스트와 레거시
fixture 경로는 회귀 검증용으로만 남아 있으며, 연결 모드의 사용자 화면은 이를
읽거나 표시하지 않습니다.

## 현재 제공하는 기능

- Spring Boot API: MusicBrainz 앨범/아티스트 검색과 iTunes KR 보조 검색, Notion 개인 기록 읽기·쓰기,
  취향 집계, 사설 GraphDB SPARQL 개인 근거 투영·조회, 오류 계약
- Next.js 음악 기록장: 실제 앨범 검색, 커버 확인, 최애곡·감상·보유 여부 저장,
  개인 취향과 근거가 있는 다음 앨범 후보 확인
- Python 데이터 파이프라인: RDF/SHACL 검증, GraphDB 투영 계약, 검색
  평가와 실패-닫힘(fail-closed) 검증
- 운영 검증: PostgreSQL outbox 재시도, 이미지 digest 검사, Cloud Run
  매니페스트 검사, fresh-volume 복구 리허설, 릴리스 증거 attestation

## 연결 모드의 정직한 범위

- 앨범·아티스트·발매일은 MusicBrainz 실시간 검색 결과를 우선 사용합니다. 결과가 없을 때만
  iTunes KR 카탈로그의 출처·collection ID를 함께 보존해 선택할 수 있습니다. MBID가 없는 보조
  기록은 GraphRAG 정본으로 가장하지 않으며, 커버는 각 제공자가 실제로 제공할 때만 표시합니다.
- 개인 기록의 원본은 사용자가 연결한 Notion 데이터베이스입니다. 저장은
  `앨범명`과 `가수`가 같은 기존 항목을 갱신하거나 새 페이지를 생성합니다.
- 추천은 현재 Notion 기록의 최소 근거(페이지 ID·아티스트·발매 그룹 ID·가중치)를
  사설 GraphDB `music-kg-personal` 그래프에 투영하고 SPARQL로 집계한 뒤,
  MusicBrainz의 실제 다른 발매 그룹을 찾는 결정론적 경로입니다. 근거로 사용된
  Notion 페이지 ID와 시드 아티스트를 함께 제공합니다. GraphDB가 없거나 응답하지
  않으면 인메모리 추천으로 가장하지 않고 503을 반환합니다.
- 추천 후보와 순위에는 외부 LLM을 사용하지 않습니다. 선택형 설명 기능은 이미 고른 그래프 근거만
  문장으로 정리하며 기본적으로 비활성화됩니다. 벡터 검색은 영구 pgvector 검증이 통과하기 전까지
  연결 서비스에서 사용하지 않으며, fixture 평가 결과를 실제 서비스 성능으로 표시하지 않습니다.

공개 서비스는 [music-kg-graphrag.vercel.app](https://music-kg-graphrag.vercel.app)에서 확인할 수 있습니다.

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
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\start-personal-graphdb.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\start-connected-service.ps1
```

### Connected-service access policy

The deployed site is a public music portfolio with a private owner workspace. Visitors can search
MusicBrainz and see only redacted graph-backed recommendations. A signed owner session is always
required before the BFF reads the connected Notion archive, taste details, duplicate state, or
record list, and before it saves, archives, restores, refreshes, or generates an explanation.
There is no production flag that turns an unauthenticated visitor into an owner. The browser never
receives a Notion credential, Notion page ID, provider credential, or BFF shared secret.

The owner opens `/owner` once with the setup token to create an HttpOnly cookie, then continues to `/owner/workspace`; ordinary
visitors are never asked for that token. This prevents automated or casual public requests from
changing the connected Notion database while keeping the archive itself shareable.

Configure `MUSIC_KG_OWNER_SETUP_TOKEN` plus `MUSIC_KG_OWNER_SESSION_SECRET`; `/owner` creates an
HttpOnly owner session. This single-owner boundary is not a substitute for multi-user authentication.

연결 모드 설정과 Notion의 한 번뿐인 공유 절차는
[`docs/connected-service-setup.md`](docs/connected-service-setup.md)를 따르세요.
로컬 검증 명령은 계속 아래와 같습니다.

```powershell
.\backend\gradlew.bat -p backend test --no-daemon
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

For a safe connected-service readiness check and a dedicated-Notion E2E procedure, use [Connected Service Test Runbook](docs/connected-e2e-runbook.md). The E2E runner refuses production data-source IDs by design.

The current measured quality results, GraphRAG evaluation boundaries, and resolved
test-environment failures are recorded in [Connected Service Verification](docs/quality/connected-service-verification-2026-08-12.md).

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

## 이용 안내

이 저장소는 포트폴리오 검토와 학습·평가를 위해 공개합니다. 코드·문서·이미지의 재사용, 수정, 배포는 사전 문의가 필요합니다.
자세한 조건은 [`LICENSE`](LICENSE)를 확인하세요.
