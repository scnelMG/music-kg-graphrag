# 개인 음악 서비스 연결 및 직접 테스트

## 현재 데이터 경로

브라우저는 `/api/music/*`만 호출한다. Next.js BFF는 서버에서 Spring 연결 API에
인증하고, Spring API는 MusicBrainz·사용자가 공유한 Notion 데이터 소스·사설
GraphDB에만 접근한다. Notion API 토큰과 BFF 공유 비밀, GraphDB 내부 주소는
브라우저, Git, 로그에 노출하지 않는다.

```text
브라우저 → Next.js BFF → Spring 연결 API → MusicBrainz
                                      ├→ Notion 개인 음악 데이터베이스
                                      └→ 사설 GraphDB 개인 근거 그래프
```

## 한 번만 할 사용자 작업

연결할 Notion 데이터베이스를 열고 우측 상단 `•••`에서
`연결 추가(Add connections)`를 선택한 뒤, 이 서비스용 Internal Integration을
추가한다. 이 작업이 끝나야 API가 기존 기록을 읽고 새 앨범을 저장할 수 있다.

토큰은 채팅에 보내거나 프런트엔드 환경 변수에 넣지 않는다. 이미 로컬 `.env`에
있는 `NOTION_API_KEY`는 백엔드 프로세스만 읽는다.

## 로컬 실행

PowerShell에서 저장소 루트로 이동한 다음 실행한다.

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\start-personal-graphdb.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\start-connected-service.ps1
```

화면은 기본적으로 `http://127.0.0.1:3000`에서 열린다. 스크립트는 매 실행마다
프로세스 안에서만 쓰는 BFF 공유 비밀을 만들며 `.env.local`에 쓰지 않는다.
GraphDB 컨테이너는 `127.0.0.1:7200`에만 바인딩되고, 개인 Notion 투영은 별도
`music-kg-personal` 저장소에만 쓴다.

## 직접 확인할 순서

1. 앨범명 또는 아티스트를 검색한다. 결과는 실시간 MusicBrainz 발매 그룹이다.
2. 하나를 고른다. Cover Art Archive에 실제 표지가 있을 때만 표지가 나타난다.
3. Notion 데이터베이스에 정의된 감상 선택지, 최애곡, 보유 여부를 작성하고
   저장한다.
4. Notion에서 생성 또는 갱신된 `앨범명`, `가수`, `앨범커버`, `개인 감상평`,
   `개인 최애곡`, `앨범 보유` 속성을 확인한다.
5. 기록이 충분히 쌓이면 취향과 다음 앨범 후보를 연다. 각 결과의 세부 정보에는
   어떤 개인 기록과 아티스트 탐색이 근거였는지 표시된다.

## 추천과 그래프 근거의 의미

현재 추천 순위는 외부 LLM의 생성문이나 벡터 유사도가 아니다. 통찰 요청마다 현재
Notion 기록의 페이지 ID, 아티스트, release-group MBID, 근거 가중치만 사설
GraphDB의 `music-kg-personal` named graph에 투영하고 SPARQL 집계로 시드
아티스트와 근거 페이지를 조회한다. 이어 MusicBrainz 태그와 아티스트 연결을
통해 아직 기록하지 않은 실제 발매 그룹만 추천한다. GraphDB가 응답하지 않으면
서버는 인메모리 결과로 가장하지 않고 `GRAPHDB_UNAVAILABLE` 503을 반환한다.
기록이 없거나 하나뿐이면 시스템은 추천을 만들어 내지 않고 기록을 더 추가하라는
상태를 표시한다.

### 선택형 LLM GraphRAG 설명

추천이 이미 GraphDB와 MusicBrainz 근거로 결정된 뒤에만, 사용자가 화면에서
`근거로 설명 만들기`를 누를 수 있다. 이 요청은 앨범명·가수·감상·최애곡·이미 계산된
관계만 LLM에 보내 두 문장 이내의 한국어 설명과 근거 라벨을 받는다. 추천 순위와 점수,
Notion 저장은 LLM 결과로 바뀌지 않는다. Notion 페이지 ID, URL, 비공개 메모, 토큰은
LLM 문맥과 브라우저 응답에서 제외된다.

기본값은 비활성화다. 서버 측 비밀 저장소에 값을 넣은 뒤에만 아래 네 변수를 설정한다.
프런트엔드 환경 변수나 Git 파일에는 절대 넣지 않는다.

```text
MUSIC_KG_LLM_ENABLED=true
MUSIC_KG_LLM_BASE_URL=https://<OpenAI-compatible-provider>/v1
MUSIC_KG_LLM_API_KEY=<server-side secret>
MUSIC_KG_LLM_MODEL=<provider model id>
```

모델 미설정은 정상적인 `DISABLED` 상태다. 제공자 장애나 검증 실패는 `UNAVAILABLE`로
표시되며, 결정론적 GraphRAG 추천은 계속 읽을 수 있다. 이 기능은 Microsoft GraphRAG의
전역·커뮤니티 검색이나 벡터 검색을 구현했다고 주장하지 않는다.

## 데이터 정합성 주의

Notion에 제목 또는 가수가 비어 있는 미완성 페이지가 있어도 서비스는 유효한 음악
기록을 계속 읽는다. 미완성 페이지는 추천과 취향 집계에서 제외되므로, 나중에 Notion에서
`앨범명`과 `가수`를 채우거나 삭제해 정리한다.

`MusicBrainz MBID` 텍스트 속성은 release-group ID를 저장한다. 서비스는 이 ID가 있는
기록끼리는 제목·가수가 같아도 MBID가 같을 때만 갱신한다. 기존 기록에 ID가 비어 있으면
한 번만 제목·가수로 찾아 해당 선택 앨범의 ID를 채워 넣는다.

개인 통찰은 하나의 Notion 기록 스냅샷으로 취향 집계와 추천 근거를 함께 계산한다. 이는
저장 직후 여러 번의 목록 조회가 Notion 요청 제한에 걸리는 문제를 줄이기 위한 동작이다.

초기 화면은 목록 전체를 내려받지 않고 최근 Notion 기록 12개만 먼저 읽는다. `다음 기록 더 보기`를
눌렀을 때에만 다음 Notion 페이지를 요청한다. 취향·그래프 추천은 체크포인트가 없을 때만 Notion
기록을 한 번 읽어 private GraphDB 스냅샷을 만들고, 이후에는 Notion의 수정 시각 변경분과 그
스냅샷으로 계산한다. 따라서 추천을 계산하는 동안에도 검색과 첫 기록 목록은 사용할 수 있으며,
사용자의 기록을 자동으로 쓰거나 보관하지 않는다.

## 운영 쓰기 안전

Production의 기록 생성·보관·복원 요청은 브라우저에서 `Notion에 저장하기` 같은 명시적 확인을
거친 뒤에만 BFF가 받아들인다. 확인 없는 쓰기 요청은 `428 WRITE_CONFIRMATION_REQUIRED`로
차단되어 Notion까지 전달되지 않는다. 이 헤더는 사용자 인증 수단이 아니라 실수 방지용 의도
확인 경계다.

자동화는 Production URL이나 Production Notion 데이터 소스를 대상으로 쓰기 흐름을 실행하면 안
된다. 로컬 fixture 또는 Production과 분리된 Preview Notion 데이터 소스만 E2E 쓰기 테스트에
사용한다. Production에서는 읽기 전용 smoke 확인만 허용하고, 실제 개인 기록을 바꾸는 검증은
사용자가 직접 확인 가능한 분리된 데이터 소스에서 수행한다.

## 배포 전 확인

원격 Spring 서비스에는 Notion 토큰을 Secret Manager 같은 서버 측 비밀 저장소로
등록하고, GraphDB는 Cloud Run Direct VPC가 닿는 사설 서브넷에만 배치한다.
`MUSIC_KG_GRAPHDB_BASE_URL`은 이 사설 주소를 가리키고
`MUSIC_KG_GRAPHDB_REPOSITORY=music-kg-personal`을 유지한다. 로컬 기존 `.env`에
일반 `GRAPHDB_BASE_URL`만 있다면 시작·스모크 스크립트가 연결형 주소 별칭으로
안전하게 읽는다. 일반 `GRAPHDB_REPOSITORY`는 정규 파이프라인용이므로 개인
추천에는 재사용하지 않으며, 값이 없으면 전용 `music-kg-personal`을 쓴다. 배포
템플릿에는 명시적인 `MUSIC_KG_*` 값을 사용한다. Vercel에는 `BACKEND_BASE_URL`과
`BACKEND_BFF_SHARED_SECRET`만 서버 전용으로 설정해야 한다. 개인 기록 접근은 앱 안의
공유 토큰이 아니라 Vercel Deployment Protection의 SSO로 제한한다. 이 저장소의 이전
fixture Preview 설정은 연결 모드 배포 증거가 아니다.
실제 Notion 토큰을 원격 비밀 저장소로 옮기는 작업은 별도 권한과 비용 검토가 필요한 외부 쓰기다.

## 공개 카탈로그와 개인 기록의 경계

MusicBrainz 앨범·트랙 검색은 공개 서비스 기능이다. 반대로 Notion 목록, 취향 분석,
GraphRAG 추천, 기록 생성·수정·보관·복원은 한 사람의 개인 데이터이므로 공개 BFF 경로가
아니다. Production Vercel 환경에는 아래의 서버 전용 변수를 설정한다.

```text
MUSIC_KG_OWNER_SESSION_REQUIRED=true
MUSIC_KG_OWNER_SETUP_TOKEN=<32 bytes or more, random>
MUSIC_KG_OWNER_SESSION_SECRET=<different 32 bytes or more, random>
```

소유자는 `/owner`에서 설정 토큰으로 한 번 확인한 뒤에만 HttpOnly 세션 쿠키를 받는다.
토큰·Notion 페이지 ID·BFF 비밀은 브라우저 저장소, URL, 로그, 소스에 남기지 않는다.
이 방식은 단일 소유자 개인 도구의 안전한 운영 경계다. 여러 사용자 계정, 공유, 권한 회수,
감사 로그가 필요해지는 시점에는 이 세션 설정값을 사용자 인증으로 오인하지 말고 OAuth/OIDC
공급자로 교체해야 한다.

This policy supersedes earlier documentation that described Vercel Deployment Protection
alone as the personal-record boundary. Vercel protection is useful for preview review, but it
does not authenticate an individual owner to a publicly reachable production BFF.
연결 서비스를 Cloud Run에 배포할 때는 legacy fixture 템플릿이 아니라
`deployment/cloud-run/connected-production-service.yaml.tmpl` 또는
`connected-preview-service.yaml.tmpl`을 사용한다. Preview에는 Production 개인 기록과
분리된 Notion 데이터 소스와 비밀을 사용해야 한다.
