# 기술 스택 선택 근거

## 결론

이 프로젝트의 권장 기술 스택은 **Spring Boot 중심 백엔드 + Python 기반 데이터/AI 파이프라인**이다.

```text
Backend API: Spring Boot
AI/Data Pipeline: Python
Main DB: PostgreSQL
Vector Search: pgvector, 필요 시 Qdrant 확장
Knowledge Graph: 1차는 Ontotext GraphDB(RDF/SPARQL/SHACL), 선택 비교군은 Neo4j
External APIs: Notion API, MusicBrainz, Wikidata, Last.fm
LLM Layer: OpenAI API 또는 교체 가능한 LLM adapter
Infra: Docker Compose
```

이 선택은 “AI 프로젝트니까 Python으로 전부 만든다”보다 취업 타깃에 더 잘 맞는다. 지원 방향이 공기업 전산직, 은행 IT/디지털, 기업 AI/AX라면 Java/Spring 기반 운영형 백엔드 역량과 Python 기반 데이터/AI 파이프라인 역량을 함께 보여주는 편이 유리하다.

## 지원 직무 관점

### 공기업 전산직

공기업 전산직은 AI 자체보다 시스템 운영, DB, API, 유지보수, 장애 대응, 보안, 문서화 역량을 중요하게 본다. 따라서 백엔드 API를 Spring Boot로 구현하면 기존 서버 배포 경험과 연결되며, 면접에서 “운영 가능한 백엔드 시스템을 설계했다”는 이야기를 하기 쉽다.

이 프로젝트에서 Spring Boot가 보여주는 역량은 다음과 같다.

- REST API 설계
- 계층형 아키텍처
- PostgreSQL 연동
- 외부 API 연동
- 배치/동기화 요청 관리
- 인증/권한, 설정 관리 확장 가능성
- Actuator 기반 health check, metrics 등 운영 관점

Spring Boot 공식 문서도 Actuator를 “production-ready features”로 설명하며, 운영 환경에서 모니터링과 관리 기능을 제공한다고 명시한다.

### 은행 IT/디지털

은행 IT/디지털 직무는 안정적인 백엔드, 데이터 정합성, 외부 시스템 연동, 운영 가능한 구조가 중요하다. 금융권 채용 공고에서도 Java/Spring 계열 백엔드와 Python 기반 데이터/AI 역량이 함께 등장하는 경우가 많다.

이 프로젝트에서는 Spring Boot가 금융/공공권에 익숙한 서비스 백엔드 역할을 맡고, Python이 데이터 수집, RDF 변환, GraphRAG 같은 AI 파이프라인을 맡는다. 이 구조는 “기존 엔터프라이즈 시스템에 AI 기능을 붙이는 AX 프로젝트”처럼 설명할 수 있다.

### 기업 AI/AX

AI/AX 직무에서는 Python, 데이터 전처리, RAG, LLM, 자동화 경험이 중요하다. 그러나 실제 현업의 AX는 독립적인 AI 데모보다 기존 시스템과 AI 기능을 연결하는 일이 많다.

따라서 이 프로젝트는 다음 메시지를 줄 수 있다.

> Spring Boot로 운영 가능한 서비스 API를 만들고, Python 파이프라인으로 음악 메타데이터 수집, RDF 생성, SHACL 검증, GraphDB 적재, GraphRAG 질의를 처리했다.

이 문장은 “AI를 써봤다”보다 훨씬 강하다. 데이터 모델링, 파이프라인, 백엔드 운영, LLM 질의 시스템을 하나의 흐름으로 연결했기 때문이다.

## 현업 개발자 관점의 선택 기준

### 1. 사용자-facing API는 Spring Boot가 더 설득력 있다

앨범 검색, 저장, 평가 입력, Notion 동기화 요청, 추천 결과 조회는 사용자가 직접 호출하는 서비스 API다. 이 영역은 트랜잭션, 예외 처리, 입력 검증, 계층 분리, 운영 모니터링이 중요하다.

Spring Boot는 이런 웹 백엔드의 표준적인 구조를 보여주기 좋다. 특히 사용자가 이미 Spring으로 서버 배포 경험이 있다면, 포트폴리오의 연속성이 생긴다.

### 2. 데이터/AI 파이프라인은 Python이 더 효율적이다

MusicBrainz, Wikidata, Last.fm에서 메타데이터를 수집하고, 정규화하고, RDF triple로 변환하고, SHACL로 검증하고, 임베딩을 생성하는 작업은 Python 생태계가 자연스럽다.

Python은 다음 영역에서 장점이 있다.

- ETL 스크립트 작성
- 데이터 정제와 실험
- RDF/OWL 처리
- 임베딩 생성
- LLM API 연동
- GraphRAG 프로토타이핑

FastAPI는 Python 파이프라인을 별도 내부 서비스로 노출할 때 적합하다. 다만 MVP에서는 반드시 FastAPI 서버를 따로 띄우기보다, Python worker/CLI batch로 시작하고 필요할 때 FastAPI로 승격하는 편이 낫다.

### 3. PostgreSQL은 기준 데이터 저장소로 적합하다

앱 DB는 Notion이나 GraphDB보다 더 안정적인 기준 데이터 저장소가 되어야 한다. 앨범, 아티스트, 트랙, 사용자 평가, 외부 식별자, 동기화 상태를 정규화해서 저장해야 하기 때문이다.

PostgreSQL을 쓰면 다음을 보여줄 수 있다.

- 정규화된 관계형 모델링
- 트랜잭션과 데이터 정합성
- 외부 ID 기반 entity resolution
- 동기화 상태 관리
- pgvector를 통한 임베딩 검색 확장

pgvector는 PostgreSQL 안에 벡터를 저장하고 유사도 검색을 수행할 수 있어, MVP 단계에서는 별도 Vector DB를 추가하지 않아도 된다.

### 4. GraphDB는 포트폴리오 주제와 잘 맞는다

기획의 핵심이 “온톨로지 모델링 및 GraphDB 구축”이라면 Neo4j만 쓰는 것보다 RDF/OWL/SPARQL/SHACL 기반의 Ontotext GraphDB가 주제 적합성이 높다.

GraphDB를 쓰면 다음 키워드를 명확하게 가져갈 수 있다.

- RDF triple
- OWL ontology
- SPARQL query
- SHACL validation
- knowledge graph
- ontology-driven data modeling

Neo4j는 개발 경험과 시각화, GraphRAG 예제가 풍부하다는 장점이 있다. 하지만 이번 프로젝트의 차별점이 온톨로지와 SHACL이라면 1차 선택은 GraphDB가 더 적절하다. 단, 면접 대비를 위해 문서에서 “Neo4j 대안 검토”를 함께 남기는 것이 좋다.

### 5. Notion은 원천 UI이자 동기화 대상이지 기준 DB가 아니다

현재 사용자는 Notion에 음악 기록을 이미 관리하고 있다. 기존 Notion 양식은 바꾸면 안 되며, 필요한 경우에만 추가해야 한다.

따라서 Notion은 다음 역할로 제한한다.

- 사용자가 계속 보는 개인 기록장
- 기존 데이터 import source
- 저장 결과를 반영하는 sync target
- 수동 편집이 가능한 human-friendly interface

기준 데이터와 외부 ID, 정규화 상태, 동기화 로그는 앱 DB가 가진다. 이렇게 해야 Notion 스키마를 깨지 않고도 GraphDB와 추천 시스템을 안정적으로 만들 수 있다.

## 비교안

### 안 A. Python/FastAPI 단독

장점:

- AI/데이터 구현 속도가 빠르다.
- LLM, RDF, 임베딩, ETL 구현이 단순하다.
- 작은 MVP를 빠르게 만들기 좋다.

단점:

- 공기업/은행 IT 지원에서는 기존 Spring 배포 경험과 연결이 약하다.
- 운영형 백엔드 역량을 보여주기 상대적으로 약하다.
- “AI 데모”처럼 보일 위험이 있다.

판단:

순수 AI 스타트업 또는 데이터 엔지니어링 포지션만 노린다면 좋지만, 공기업/은행/AX를 함께 노리는 현재 목표에는 단독 선택으로는 아쉽다.

### 안 B. Java/Spring 단독

장점:

- 공공/금융권 백엔드 포트폴리오로 안정적이다.
- 운영, API, DB, 배포 경험을 어필하기 좋다.
- 기존 Spring 프로젝트 경험과 이어진다.

단점:

- RDF/GraphRAG/LLM 실험 속도가 느릴 수 있다.
- Python 중심 AI 생태계 활용을 보여주기 어렵다.
- 데이터 파이프라인과 AI/AX 포지션 어필이 약해질 수 있다.

판단:

전통적인 백엔드 포트폴리오로는 좋지만, 이 프로젝트의 핵심인 데이터/AI 백엔드 차별점을 충분히 살리기 어렵다.

### 안 C. Spring Boot + Python 하이브리드

장점:

- Spring Boot로 공공/금융권 백엔드 역량을 보여준다.
- Python으로 AI/데이터 파이프라인 역량을 보여준다.
- “기존 시스템에 AI 기능을 연결하는 AX” 구조로 설명하기 좋다.
- 서비스 API, DB, 파이프라인, GraphDB, LLM 질의 시스템이 역할별로 분리된다.

단점:

- 구성 요소가 많아져 MVP 범위 관리가 필요하다.
- 서비스 간 인터페이스를 명확히 정의해야 한다.
- Docker Compose와 환경 설정 문서화가 중요해진다.

판단:

현재 지원 목표에는 가장 적합하다. 단, MVP에서는 마이크로서비스처럼 과하게 쪼개지 않고, Spring Boot API + Python worker/batch + Docker Compose 구조로 시작한다.

## 최종 선택

최종 선택은 **안 C. Spring Boot + Python 하이브리드**다.

### 역할 분리

```text
Spring Boot
- 사용자 API
- 앨범 검색 요청 endpoint
- 앨범 기록 저장
- PostgreSQL transaction 관리
- Notion 동기화 요청
- 추천/GraphRAG 결과 조회
- 인증, 설정, health check 확장

Python
- MusicBrainz/Wikidata/Last.fm metadata 수집
- entity resolution
- RDF/OWL mapping
- SHACL validation
- GraphDB load
- embedding 생성
- GraphRAG retrieval pipeline

PostgreSQL
- 기준 앱 데이터 저장
- Notion sync state
- 외부 식별자 매핑
- 사용자 평가 기록
- pgvector 기반 감상평/앨범 설명 embedding 저장

Ontotext GraphDB
- RDF triple 저장
- SPARQL 질의
- SHACL 검증
- 온톨로지 기반 추천 근거 탐색

Notion
- 기존 음악 기록장 유지
- 사용자가 직접 보는 sync target
- 기존 양식 보존
```

## 면접용 설명

```text
이 프로젝트는 Spring Boot와 Python을 역할에 따라 분리했습니다.
사용자 요청, 기록 저장, Notion 동기화, 추천 결과 제공처럼 운영 안정성이 중요한 서비스 API는 Spring Boot로 구현했습니다.
반면 외부 음악 메타데이터 수집, RDF 변환, SHACL 검증, GraphDB 적재, GraphRAG 질의처럼 데이터 처리와 AI 실험이 많은 영역은 Python 파이프라인으로 분리했습니다.

이 구조를 통해 공공/금융권에서 요구되는 Java/Spring 기반 백엔드 역량과 AI/AX 직무에서 요구되는 Python 데이터 파이프라인, LLM/RAG 활용 역량을 하나의 서비스 흐름으로 연결했습니다.
```

## 기획서에 반영할 수정 사항

기존 기획의 기술 스택 항목은 다음처럼 바꾸는 것이 좋다.

```text
Backend
- Spring Boot
- Spring Web
- Spring Data JPA
- Spring Batch 또는 Scheduler
- Spring Actuator

Data/AI Pipeline
- Python
- requests/httpx
- pandas
- rdflib
- pySHACL
- SPARQLWrapper
- LangChain 또는 LlamaIndex는 선택 적용

Storage
- PostgreSQL
- pgvector
- Ontotext GraphDB
- Notion database

External Metadata
- MusicBrainz
- Cover Art Archive
- Wikidata
- Last.fm

LLM
- OpenAI API 또는 교체 가능한 LLM adapter

Infra
- Docker Compose
- 환경변수 기반 secret 관리
- Makefile 또는 task runner
```

## 참고 근거

- Spring Boot Actuator 공식 문서: https://docs.spring.io/spring-boot/reference/actuator/index.html
- Spring AI RAG 공식 문서: https://docs.spring.io/spring-ai/reference/api/retrieval-augmented-generation.html
- FastAPI Background Tasks 공식 문서: https://fastapi.tiangolo.com/tutorial/background-tasks/
- pgvector 공식 저장소: https://github.com/pgvector/pgvector
- Neo4j Knowledge Graph RAG 자료: https://neo4j.com/blog/developer/rag-tutorial/
- 신한은행 디지털/ICT AI 채용 예시: https://www.kofia.or.kr/brd/m_96/view.do?seq=16926
- 금융 IT Java 채용 검색 예시: https://kr.indeed.com/q-%EA%B8%88%EC%9C%B5-it-java-%EC%B1%84%EC%9A%A9%EA%B3%B5%EA%B3%A0.html
- RAG 채용 검색 예시: https://kr.indeed.com/q-rag-%EC%B1%84%EC%9A%A9%EA%B3%A0.html
