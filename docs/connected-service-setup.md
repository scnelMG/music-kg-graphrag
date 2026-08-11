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

현재 추천은 외부 LLM의 생성문이나 벡터 유사도가 아니다. 통찰 요청마다 현재
Notion 기록의 페이지 ID, 아티스트, release-group MBID, 근거 가중치만 사설
GraphDB의 `music-kg-personal` named graph에 투영하고 SPARQL 집계로 시드
아티스트와 근거 페이지를 조회한다. 이어 MusicBrainz 태그와 아티스트 연결을
통해 아직 기록하지 않은 실제 발매 그룹만 추천한다. GraphDB가 응답하지 않으면
서버는 인메모리 결과로 가장하지 않고 `GRAPHDB_UNAVAILABLE` 503을 반환한다.
기록이 없거나 하나뿐이면 시스템은 추천을 만들어 내지 않고 기록을 더 추가하라는
상태를 표시한다.

## 데이터 정합성 주의

Notion에 제목 또는 가수가 비어 있는 미완성 페이지가 있어도 서비스는 유효한 음악
기록을 계속 읽는다. 미완성 페이지는 추천과 취향 집계에서 제외되므로, 나중에 Notion에서
`앨범명`과 `가수`를 채우거나 삭제해 정리한다.

`MusicBrainz MBID` 텍스트 속성은 release-group ID를 저장한다. 서비스는 이 ID가 있는
기록끼리는 제목·가수가 같아도 MBID가 같을 때만 갱신한다. 기존 기록에 ID가 비어 있으면
한 번만 제목·가수로 찾아 해당 선택 앨범의 ID를 채워 넣는다.

개인 통찰은 하나의 Notion 기록 스냅샷으로 취향 집계와 추천 근거를 함께 계산한다. 이는
저장 직후 여러 번의 목록 조회가 Notion 요청 제한에 걸리는 문제를 줄이기 위한 동작이다.

## 배포 전 확인

원격 Spring 서비스에는 Notion 토큰을 Secret Manager 같은 서버 측 비밀 저장소로
등록하고, GraphDB는 Cloud Run Direct VPC가 닿는 사설 서브넷에만 배치한다.
`MUSIC_KG_GRAPHDB_BASE_URL`은 이 사설 주소를 가리키고
`MUSIC_KG_GRAPHDB_REPOSITORY=music-kg-personal`을 유지한다. Vercel에는 `BACKEND_BASE_URL`, `BACKEND_BFF_SHARED_SECRET`,
`MUSIC_KG_APP_ACCESS_TOKEN`만 서버 전용으로 설정해야 한다. 마지막 값은 32자 이상의
무작위 접근 토큰이며, Production에서는 이 토큰을 통과한 브라우저만 개인 기록 BFF에
접근할 수 있다. 이 저장소의 이전 fixture Preview 설정은 연결 모드 배포 증거가 아니다.
실제 Notion 토큰을 원격 비밀 저장소로 옮기는 작업은 별도 권한과 비용 검토가 필요한 외부 쓰기다.
연결 서비스를 Cloud Run에 배포할 때는 legacy fixture 템플릿이 아니라
`deployment/cloud-run/connected-production-service.yaml.tmpl` 또는
`connected-preview-service.yaml.tmpl`을 사용한다. Preview에는 Production 개인 기록과
분리된 Notion 데이터 소스와 비밀을 사용해야 한다.
