# 음악 온톨로지 기반 Knowledge Graph 및 GraphRAG 추천 서비스 기획

## 1. 프로젝트 개요

본 프로젝트는 개인이 기록한 음악 앨범 감상 데이터를 중심으로, 외부 음악 메타데이터를 결합해 음악 도메인 Knowledge Graph를 구축하는 서비스이다.

단순히 앨범을 저장하는 아카이브가 아니라, 아티스트, 앨범, 트랙, 장르, 무드, 청취 상황, 개인 감상평 간의 관계를 온톨로지로 모델링하고 GraphDB에 적재한다. 이후 SPARQL 질의, 추천 로직, 벡터 검색, GraphRAG를 활용해 사용자의 취향에 맞는 앨범 추천과 페스티벌 대비 청취 가이드를 제공한다.

## 2. 프로젝트 목표

* 개인 음악 감상 기록을 구조화된 취향 데이터로 변환
* MusicBrainz, Wikidata 등 외부 음악 메타데이터와 개인 감상 기록을 통합
* RDF/OWL 기반 음악 온톨로지 설계
* GraphDB에 음악 Knowledge Graph 구축
* SHACL 기반 데이터 품질 검증 적용
* SPARQL을 활용한 관계 기반 음악 탐색 구현
* 사용자 취향 기반 앨범 추천 기능 구현
* GraphRAG를 활용한 추천 근거 설명 기능 구현

## 3. 문제 정의

기존 음악 아카이브는 보통 앨범명, 아티스트명, 평점, 감상평을 단순 텍스트로 저장하는 수준에 머문다. 이 방식은 기록을 남기는 데는 유용하지만, 다음과 같은 한계가 있다.

* 내가 어떤 음악을 왜 좋아하는지 구조적으로 파악하기 어렵다.
* 감상평이 쌓여도 추천이나 탐색에 재사용되기 어렵다.
* 앨범, 아티스트, 장르, 분위기, 청취 상황 간 관계를 분석하기 어렵다.
* 페스티벌 라인업을 볼 때 내 취향 기준으로 어떤 아티스트와 앨범을 먼저 들어야 할지 판단하기 어렵다.
* LLM 기반 추천을 사용해도 추천 근거가 불명확하고 일반적인 설명에 머물기 쉽다.

이 프로젝트는 개인 감상 기록을 Knowledge Graph의 개인화 레이어로 활용해, 단순 인기 기반 추천이 아닌 설명 가능한 음악 추천을 구현하는 것을 목표로 한다.

## 4. 핵심 사용자 시나리오

### 시나리오 1. 아티스트 대표 앨범 추천

사용자가 특정 아티스트를 입력하면 해당 아티스트의 대표 앨범을 추천한다.

예시:

```text
입력: Radiohead

출력:
1. OK Computer
2. Kid A
3. In Rainbows
```

추천 근거는 단순 인기순이 아니라 다음 요소를 함께 반영한다.

* 아티스트 디스코그래피 내 중요도
* 장르 대표성
* 외부 메타데이터 기반 평가 및 인지도
* 사용자 취향 태그와의 일치도
* 사용자가 과거에 높게 평가한 앨범과의 관계

### 시나리오 2. 개인 취향 기반 앨범 추천

사용자가 높게 평가한 앨범들의 공통 속성을 분석해 새로운 앨범을 추천한다.

예시:

```text
사용자가 높게 평가한 앨범:
- Radiohead - OK Computer
- Portishead - Dummy
- Björk - Homogenic

추출된 취향:
- 어두운 분위기
- 실험적인 사운드
- 앨범 단위의 몰입감
- 1990년대 얼터너티브/일렉트로닉 계열
```

이후 동일하거나 유사한 장르, 무드, 청취 상황, 감상 키워드를 가진 앨범을 추천한다.

### 시나리오 3. 페스티벌 대비 청취 가이드

사용자가 페스티벌 라인업을 입력하면 아티스트별로 먼저 들어야 할 앨범과 대표곡을 추천한다.

예시:

```text
입력:
The Strokes
King Gizzard & The Lizard Wizard
Japanese Breakfast
```

출력:

```text
The Strokes
- 먼저 들을 앨범: Is This It
- 이유: 밴드의 대표 사운드와 핵심 트랙이 포함된 입문 앨범

King Gizzard & The Lizard Wizard
- 먼저 들을 앨범: Nonagon Infinity
- 이유: 라이브 에너지와 밴드의 실험적 성향이 잘 드러나는 앨범
```

추가로 사용자의 기존 감상 기록을 반영해 “내 취향 기준 우선 청취 순서”를 제공한다.

### 시나리오 4. 자연어 기반 음악 탐색

사용자가 자연어로 원하는 분위기를 입력하면 그래프 검색과 벡터 검색을 결합해 앨범을 추천한다.

예시:

```text
입력:
비 오는 밤에 들을 만한 차갑고 몽환적인 앨범 추천해줘.
```

처리 방식:

```text
1. 자연어 질의에서 무드와 청취 상황 추출
2. 감상평 원문을 대상으로 벡터 검색
3. GraphDB에서 장르, 무드, 아티스트 관계 탐색
4. 후보 앨범 재랭킹
5. GraphRAG로 추천 근거 생성
```

## 5. 데이터 구성

### 외부 음악 메타데이터

외부 데이터는 음악 세계의 객관적인 관계를 구축하는 데 사용한다.

* 아티스트
* 앨범
* 트랙
* 발매연도
* 장르
* 레이블
* 국가
* 외부 식별자
* 관련 아티스트
* 대표 앨범
* 디스코그래피 정보

주요 데이터 소스:

* MusicBrainz
* Wikidata
* Last.fm
* ListenBrainz

### 개인 감상 기록

개인 감상 기록은 사용자 취향을 표현하는 핵심 데이터로 사용한다.

* 앨범명
* 아티스트명
* 평점
* 감상평 원문
* 좋았던 이유
* 별로였던 이유
* 무드 태그
* 듣기 좋은 상황
* 기억에 남는 트랙
* 재청취 의향

예시:

```text
앨범: Dummy
아티스트: Portishead
평점: 4.5
감상평: 어둡고 눅눅한 분위기가 좋았다. 밤에 혼자 들을 때 몰입감이 강하다.
무드: Dark, Moody
청취 상황: Night, Alone
좋았던 요소: Atmosphere, Immersion
```

## 6. 개인 감상 기록 활용 방식

감상 기록은 단순 텍스트로 저장하지 않고, 원문과 구조화 데이터를 함께 관리한다.

```text
감상평 원문
→ LLM 또는 규칙 기반 태그 추출
→ 무드, 청취 상황, 선호 요소 정규화
→ RDF Triple 변환
→ GraphDB 적재
→ 추천, 검색, GraphRAG 응답에 활용
```

감상 기록의 활용 방식은 다음과 같다.

* 평점: 추천 점수 계산에 활용
* 감상평 원문: 벡터 검색과 GraphRAG 응답 생성에 활용
* 무드 태그: 그래프 기반 추천에 활용
* 청취 상황: 상황별 음악 추천에 활용
* 좋았던 요소: 추천 근거 생성에 활용
* 싫었던 요소: 추천 제외 조건에 활용

즉, 외부 음악 데이터가 음악 세계의 지도라면, 개인 감상 기록은 사용자의 취향 좌표 역할을 한다.

## 7. 온톨로지 모델링

### 핵심 클래스

```text
Artist
Album
Track
Genre
Label
Producer
User
UserReview
Mood
ListeningContext
Festival
Performance
Recommendation
RecommendationReason
```

### 핵심 관계

```text
Artist - created - Album
Album - containsTrack - Track
Album - hasGenre - Genre
Album - releasedBy - Label
Album - producedBy - Producer
Album - hasMood - Mood
User - wroteReview - UserReview
UserReview - targetAlbum - Album
UserReview - hasRating - Rating
UserReview - hasComment - Text
Album - recommendedFor - ListeningContext
Album - similarTo - Album
Artist - influencedBy - Artist
Festival - includesArtist - Artist
Recommendation - hasReason - RecommendationReason
```

### RDF 예시

```turtle
:OKComputer a :Album ;
    :title "OK Computer" ;
    :createdBy :Radiohead ;
    :releasedInYear 1997 ;
    :hasGenre :AlternativeRock, :ArtRock ;
    :hasMood :Cold, :Anxious, :Experimental ;
    :containsTrack :ParanoidAndroid ;
    :reviewedByUser :Review_001 .

:Review_001 a :UserReview ;
    :targetAlbum :OKComputer ;
    :writtenBy :User_Mingyu ;
    :rating 4.5 ;
    :comment "차갑고 불안한 분위기가 좋았다. 앨범 전체 흐름이 강하게 남았다." ;
    :hasListeningContext :Night, :Focus ;
    :hasPreferenceFactor :AlbumCohesion, :ExperimentalSound .
```

## 8. 데이터 품질 관리

외부 API 데이터를 그대로 저장하지 않고, SHACL을 사용해 RDF 데이터의 품질을 검증한다.

검증 규칙 예시:

```text
Album은 title을 반드시 가져야 한다.
Album은 createdBy Artist를 반드시 가져야 한다.
Album은 releasedInYear를 가져야 한다.
Track은 title과 partOfAlbum을 가져야 한다.
UserReview는 targetAlbum, rating, comment를 가져야 한다.
rating은 0 이상 5 이하이어야 한다.
releasedInYear는 정수여야 한다.
```

이 과정을 통해 누락된 속성, 잘못된 평점 범위, 관계 누락 등을 사전에 탐지한다.

## 9. 추천 로직

추천은 단순 인기순이 아니라 그래프 기반 점수와 사용자 취향 점수를 함께 사용한다.

### 대표 앨범 추천 점수

```text
대표 앨범 점수 =
아티스트 디스코그래피 내 중요도
+ 외부 인기도 점수
+ 장르 대표성
+ 사용자 취향 태그 일치도
+ 사용자 고평점 앨범과의 관계 유사도
```

### 취향 기반 추천 점수

```text
취향 기반 추천 점수 =
공통 장르 수
+ 공통 무드 수
+ 공통 청취 상황 수
+ 감상평 벡터 유사도
+ 사용자가 선호한 요소와의 일치도
- 사용자가 싫어한 요소와의 일치도
```

### 페스티벌 대비 추천 점수

```text
페스티벌 선청취 점수 =
아티스트 대표성
+ 라이브 적합도
+ 대표곡 포함 여부
+ 사용자 취향과의 일치도
+ 입문 난이도
```

## 10. GraphRAG 처리 흐름

GraphRAG는 LLM이 임의로 추천하는 것이 아니라, 그래프에서 찾은 관계와 감상 기록을 근거로 답변하게 하는 구조이다.

```text
사용자 질문
→ 아티스트, 앨범, 장르, 무드 등 엔티티 추출
→ GraphDB에서 SPARQL 기반 관계 탐색
→ 감상평 원문 벡터 검색
→ 후보 앨범 랭킹
→ 관련 그래프 경로 추출
→ LLM이 추천 이유 생성
```

예시 응답:

```text
Radiohead를 처음 듣는다면 OK Computer를 먼저 추천합니다.

추천 근거:
- Radiohead의 대표 앨범으로 연결되어 있습니다.
- Alternative Rock, Art Rock 장르와 연결됩니다.
- 사용자가 높게 평가한 ‘차가움’, ‘불안함’, ‘앨범 단위 완성도’ 속성과 겹칩니다.
- 이후 Kid A로 넘어가면 전자음악적 실험성을 더 확장해서 들을 수 있습니다.
```

## 11. 기술 스택

### 데이터 수집 및 전처리

```text
Python
requests
pandas
MusicBrainz API
Wikidata SPARQL
Last.fm API
```

### 온톨로지 및 그래프 구축

```text
RDF
OWL
rdflib
SHACL
Ontotext GraphDB
SPARQL
```

### 추천 및 검색

```text
SPARQL Query
Graph-based Recommendation
Embedding-based Vector Search
Hybrid Retrieval
GraphRAG
```

### 백엔드

```text
Spring Boot
REST API
GraphDB SPARQL endpoint 연동
```

### 프론트엔드

```text
Vue
앨범 상세 페이지
아티스트 상세 페이지
추천 결과 페이지
페스티벌 가이드 페이지
```

### 선택 확장

```text
LLM API
Vector DB
LlamaIndex 또는 LangChain
Neo4j 실험 레이어
```

## 12. 시스템 아키텍처

```text
[개인 감상 기록]
        ↓
[MusicBrainz / Wikidata / Last.fm 외부 메타데이터]
        ↓
[Python ETL Pipeline]
        ↓
[Entity Resolution / Normalization]
        ↓
[RDF/OWL Ontology Mapping]
        ↓
[SHACL Data Validation]
        ↓
[GraphDB Repository]
        ↓
[SPARQL Query Layer]
        ↓
[Recommendation Engine]
        ↓
[Vector Search + GraphRAG]
        ↓
[Spring Boot API]
        ↓
[Vue UI]
```

## 13. MVP 범위

처음부터 모든 기능을 구현하지 않고, 포트폴리오에 필요한 핵심 기능을 우선 구현한다.

### 1차 MVP

```text
아티스트 50명
앨범 300개
트랙 3,000개 이하
사용자 감상 기록 50개 이상
RDF/OWL 온톨로지 설계
GraphDB 적재
SHACL 검증
SPARQL 쿼리 10개 작성
아티스트별 대표 앨범 추천
개인 취향 기반 앨범 추천
```

### 2차 확장

```text
페스티벌 라인업 대비 청취 가이드
감상평 임베딩 검색
GraphRAG 추천 설명 생성
자연어 음악 탐색
ListenBrainz 청취 이력 연동
장르 계층 추론
아티스트 영향 관계 보강
```

## 14. 주요 API 설계

```text
GET /api/artists/{artistId}/albums
- 특정 아티스트의 앨범 목록 조회

GET /api/artists/{artistId}/representative-albums
- 특정 아티스트의 대표 앨범 추천

GET /api/users/{userId}/recommendations
- 사용자 감상 기록 기반 앨범 추천

POST /api/festival/guide
- 페스티벌 라인업 기반 선청취 가이드 생성

POST /api/search/natural-language
- 자연어 질의 기반 음악 추천

GET /api/albums/{albumId}/graph
- 특정 앨범과 연결된 그래프 관계 조회
```

## 15. 산출물

포트폴리오에서 보여줄 수 있는 산출물은 다음과 같다.

```text
README.md
docs/architecture.md
docs/ontology-design.md
ontology/music-ontology.ttl
shapes/music-shapes.ttl
data/sample_artists.csv
data/sample_albums.csv
data/sample_tracks.csv
data/sample_user_reviews.csv
scripts/fetch_musicbrainz.py
scripts/fetch_wikidata.py
scripts/build_rdf.py
scripts/load_graphdb.sh
queries/artist_albums.rq
queries/representative_albums.rq
queries/user_based_recommendation.rq
queries/festival_guide.rq
backend/Spring Boot API
frontend/Vue UI
```

## 16. Codex 활용 전략

Codex에게 전체 프로젝트를 한 번에 맡기지 않고, 단계별로 작업을 나눈다.

### 내가 직접 주도할 부분

```text
프로젝트 목적 정의
MVP 기능 확정
온톨로지 클래스와 관계 검수
추천 기준 설계
데이터 품질 기준 정의
포트폴리오 설명 정리
```

### Codex에게 맡길 부분

```text
프로젝트 폴더 구조 생성
README 및 문서 초안 작성
Python ETL 코드 작성
RDF 변환 스크립트 작성
SHACL shape 작성
SPARQL 쿼리 작성
GraphDB 적재 스크립트 작성
Spring Boot API 구현
Vue 화면 구현
테스트 코드 작성
```

## 17. 면접 어필 포인트

이 프로젝트는 단순 음악 추천 프로젝트가 아니라, Knowledge Graph 기반 개인화 추천 서비스로 설명할 수 있다.

면접에서는 다음과 같이 말할 수 있다.

```text
개인 음악 감상 기록을 단순 텍스트 메모로 저장하지 않고, 평점, 무드, 청취 상황, 선호 요소로 구조화해 Knowledge Graph의 개인화 레이어로 사용했습니다. MusicBrainz와 Wikidata의 외부 음악 메타데이터를 수집해 아티스트, 앨범, 트랙, 장르 관계를 RDF로 모델링했고, SHACL을 통해 데이터 품질을 검증한 뒤 GraphDB에 적재했습니다.

이후 SPARQL 질의와 벡터 검색을 결합해 사용자의 선호 앨범과 관계적으로 유사한 앨범을 추천하고, GraphRAG 방식으로 추천 근거를 생성하는 구조를 설계했습니다. 이를 통해 단순 인기 기반 추천이 아니라, 사용자가 특정 앨범을 왜 좋아했는지에 기반한 설명 가능한 추천을 구현하고자 했습니다.
```

## 18. 프로젝트 차별점

기존 음악 추천 프로젝트는 보통 Spotify API나 평점 데이터를 활용해 유사도 추천을 구현하는 수준에 머무는 경우가 많다.

이 프로젝트의 차별점은 다음과 같다.

```text
단순 API 활용이 아니라 온톨로지 기반 도메인 모델링을 수행함
외부 음악 데이터와 개인 감상 기록을 결합함
GraphDB와 SPARQL을 활용해 관계 기반 탐색을 구현함
SHACL로 데이터 품질 검증을 수행함
감상평 원문을 벡터 검색에 활용함
GraphRAG를 통해 추천 이유를 설명함
페스티벌 대비 청취 가이드라는 실제 사용 시나리오를 제공함
```

## 19. 최종 한 줄 소개

개인 앨범 감상 기록과 외부 음악 메타데이터를 RDF 기반 Knowledge Graph로 통합하고, GraphDB, SPARQL, SHACL, Vector Search, GraphRAG를 활용해 설명 가능한 음악 추천과 페스티벌 대비 청취 가이드를 제공하는 개인화 음악 탐색 서비스.
