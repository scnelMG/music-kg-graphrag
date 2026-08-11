# Music KG GraphRAG Design System

## Product position

이 서비스는 개인 음악 기록을 위한 **근거가 보이는 음악 기록장**이다. 첫 화면의
목표는 사용자가 실제 앨범을 찾고, 선택하고, 자신의 감상을 Notion에 남기도록
돕는 것이다. 추천과 그래프 탐색 근거는 선택을 뒷받침하며 채팅 제품의 전면
장식이 아니다.

연결 모드에서 앨범 검색은 MusicBrainz, 개인 기록의 원본은 사용자가 공유한
Notion 데이터베이스다. 연결할 수 없는 데이터는 결과·커버·기록·추천으로
꾸미지 않으며, 사용자가 해결할 수 있는 상태와 다음 행동을 명시한다.

## 디자인 원칙

- 분위기는 따뜻한 음악 기록장이다. 종이 같은 여백, 잉크색 본문, 광물성
  청색 행동색과 선택된 음반의 절제된 버건디 표식을 사용한다.
- 정보는 한 장의 작업면에 모은다. KPI 카드 벽, 대시보드 사이드바, 과도한
  테두리 상자, 보라색/파란색 AI 그라데이션, 챗봇 크롬, 이모지는 사용하지 않는다.
- 기본 경로는 한국어로 짧고 직접적으로 쓴다. 기술 식별자·점수·근거 ID는
  필요한 사람이 펼쳐 보는 상세 정보에만 둔다.
- 상태는 문장과 아이콘으로 설명한다. 색, 점이 붙은 상태 배지, 둥근 pill만으로
  상태를 전달하지 않는다.

## 토큰

| 역할 | 토큰 | 값 |
| --- | --- | --- |
| Canvas | `--canvas` | `#f5f1e9` |
| Paper | `--paper` | `#fffdf8` |
| Paper muted | `--paper-muted` | `#ece6db` |
| Ink | `--ink` | `#24211d` |
| Ink muted | `--ink-muted` | `#665f56` |
| Rule | `--rule` | `#d9d0c3` |
| Action | `--action` | `#315e72` |
| Action pressed | `--action-pressed` | `#204655` |
| Selection | `--selection` | `#8b3f35` |
| Success | `--success` | `#25663b` |
| Warning | `--warning` | `#9a5a12` |
| Error | `--error` | `#aa332b` |
| Focus | `--focus` | `#005f9e` |

색은 상태의 유일한 신호가 아니다. 선택·저장·오류는 텍스트와 구조로도
구별된다.

## 타이포그래피와 간격

- UI: `Pretendard Variable`, `Noto Sans KR`, `Geist`, sans-serif
- 편집적 문장/인용: `Noto Serif KR`, Georgia, serif
- opt-in 기술 식별자: `IBM Plex Mono KR`, `Geist Mono`, Consolas, monospace

간격은 4px 배수(`--space-1`~`--space-14`)를 사용한다. 제목은 한 페이지에
하나만 두고, 세리프체는 소개 문장과 증거 답변처럼 읽기 중심의 부분에만 쓴다.

## 화면 구성

### Journal header

서비스 이름, 한 문장 가치 제안, 개인 데이터 연결 상태 안내를 둔다. 설정 오류는
행동 가능한 복구 문장으로 표시한다.

### Listening search

앨범/아티스트 검색어와 검색 버튼을 제공한다. 유휴·로딩·결과·없음·오류 상태를
입력 가까이에 표시한다.

### Record row and selected record

후보는 앨범명·아티스트·사람이 읽을 수 있는 선택 힌트로 표현한다. 원본 ID는
행에 노출하지 않는다. 선택된 음반은 개인 메모 위의 명확한 맥락이 된다.

### Listening note

최애곡, 감상, 보유 여부를 작성한다. 유효성 오류, 저장 중, Notion 저장 확인,
오류를 인접한 live region으로 알린다. 저장 확인은 생성 또는 갱신된 실제 기록을
명확히 말한다.

### Insight note

한 개의 근거 영역에서 추천, 자연어 답변, 회복 상태, 선택적 provenance를
순서대로 보여 준다. 근거가 없으면 답변을 만들지 않고 이유와 다음 행동을
표시한다.

## 반응형·접근성

- 문서가 세로 스크롤을 소유하며, 주 작업 영역에 중첩 스크롤을 만들지 않는다.
- 데스크톱은 검색/기록과 읽기 노트의 2열, 900px 이하는 같은 DOM 순서의
  단일 열이다.
- 375px 및 200% zoom에서 가로 스크롤이 없어야 한다. 한국어는 자연스럽게
  줄바꿈하고, 긴 기술 ID는 상세 정보에서만 비상 줄바꿈한다.
- 모든 조작은 44px 이상의 대상, 보이는 3px focus outline, 키보드 접근,
  polite live announcement를 제공한다.
- `prefers-reduced-motion`에서는 불필요한 변환·부드러운 스크롤을 제거한다.

## 구현 품질 기준

- 실제 DOM과 의미론적 `main`, `header`, `nav`, `section`, `article`, `form`,
  `button`, `details`를 사용한다. 스크린샷·canvas로 UI를 흉내 내지 않는다.
- 외부 참고는 Gesso의 일관된 디자인 사양, Select Craft의 절제된 상태 전환,
  WCAG 2.2의 focus/target-size 기준을 참고하되 브랜드·레이아웃을 복제하지 않는다.
- 새 화면은 desktop, tablet, mobile에서 실제 브라우저로 확인하고 Korean CJK
  줄바꿈과 에러·복구 경로를 함께 검증한다.

## 현재 제외 범위

외부 LLM 문장 생성과 벡터 검색은 연결 모드의 범위가 아니다. 다만 개인 취향·추천은
현재 Notion 기록의 최소 근거를 사설 GraphDB named graph에 투영하고 SPARQL로
집계한 뒤, 실제 MusicBrainz 발매 그룹을 탐색하는 결정론적 경로로 표현한다.
GraphDB가 사용할 수 없으면 추천을 대체 결과로 가장하지 않고 복구 상태를 표시한다.
fixture는 회귀 테스트에만 남고 사용자 화면의 실제 데이터인 것처럼 나타나지 않는다.
