# Music Knowledge Graph & GraphRAG

<p align="center">음악 메타데이터 지식 그래프 · GraphRAG · Spring Boot · PostgreSQL · GraphDB</p>

![Java](https://img.shields.io/badge/Java-Spring%20Boot-6DB33F?logo=springboot&logoColor=white)
![Python](https://img.shields.io/badge/Python-Data%20Pipeline-3776AB?logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)
![GraphDB](https://img.shields.io/badge/GraphDB-RDF%20%7C%20SPARQL-0F766E)
![Portfolio](https://img.shields.io/badge/Portfolio-GraphRAG-111827)

> 익명화한 앨범 메타데이터를 PostgreSQL, RDF 지식 그래프, 근거 기반 GraphRAG 추천으로 연결하기 위한 백엔드·데이터 파이프라인 프로젝트입니다.

## 구현 현황

공개 저장소에는 Java/Python 빌드 경계, fixture 기반 worker CLI, 로컬 환경 검증, SBOM·이미지 digest 검증, CI 명령이 구현되어 있습니다. 실제 데이터 마이그레이션, 공개 API, RDF/SHACL 검증, 외부 메타데이터 수집, GraphRAG 추천, 제품 화면은 아직 구현하지 않았습니다.

## 설계 방향

- 백엔드 API: `backend/`의 Spring Boot 기반 서비스 경계
- 데이터·AI 파이프라인: `pipeline/`의 Python worker CLI 경계
- 애플리케이션 DB·벡터 저장소: PostgreSQL + pgvector
- 지식 그래프: RDF/SPARQL/SHACL 처리를 위한 Ontotext GraphDB
- 외부 메타데이터 후보: Notion, MusicBrainz, Cover Art Archive, Last.fm, Wikidata, LLM Provider
- 프런트엔드 데모 UI: `DESIGN.md`, `docs/frontend-demo-ui-plan.md`에 설계만 정리

기술 선택 근거는 `docs/research/`와 `outputs/tech-stack-rationale.md`에서 확인할 수 있습니다.

## Quick Start

1. Copy the example environment file.

   ```bash
   cp .env.example .env
   ```

2. Fill the required local values in `.env`. The public service remains fixture-only; do not add real credentials or enable external calls.

3. Validate local configuration.

   ```bash
   bash scripts/check-env.sh .env
   ```

4. Validate Docker Compose without starting containers.

   ```bash
   docker compose config
   ```

5. 필요한 경우에만 로컬 서비스를 시작합니다. 운영 배포에는 `deployment/image-digests.lock`의 고정 digest를 사용합니다.

   ```bash
   docker compose up -d postgres graphdb
   ```

6. Stop local services.

   ```bash
   docker compose down
   ```

## 검증 방법

Use these commands from the repository root:

```bash
bash backend/gradlew -p backend test --no-daemon
uv run --directory pipeline --group dev pytest tests
uv run --directory pipeline --group dev python -m pipeline --help
bash scripts/check-env.sh .env
docker compose config
bash scripts/verify-supply-chain.sh
git diff --check
```

현재 구현 범위의 검증 결과는 `.omo/evidence/task-1-music-kg-evidence-graphrag.md`에서 확인할 수 있습니다.

## Repository Layout

```text
backend/        Spring Boot 서비스 기반
pipeline/       Python worker CLI 기반
frontend/       데모 UI 설계 문서
ontology/       RDF/OWL/SHACL 확장 예정 자산
queries/        SPARQL 확장 예정 쿼리
docs/           리서치·아키텍처·설계 문서
data/fixtures/  테스트·데모용 익명 fixture 데이터
scripts/        로컬 개발 스크립트
.omo/evidence/  구현 범위 검증 기록
```

## Guardrails

- Do not commit real `.env` files, credentials, or provider responses.
- Do not expose anything except anonymised fixtures in public surfaces.
- Do not use mutable image tags in release artifacts; validate digest locks before release.
- Do not start live external API calls from default tests.
- Do not alter existing Notion schema or overwrite user-entered Notion values.
- Do not treat GraphDB as the system of record; rebuild it from normalized data.
- Do not build frontend product screens before backend/data paths and contracts exist.
