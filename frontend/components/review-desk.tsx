"use client";

import { CheckCircle, Database, FloppyDisk, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/ssr";
import ky from "ky";
import { useEffect, useState } from "react";

type Candidate = { readonly artist: string; readonly id: string; readonly source: "PUBLIC_FIXTURE"; readonly title: string };
type Health = { readonly externalBackend: { readonly state: "unavailable"; readonly summary: string }; readonly mode: "fixture"; readonly status: "ok" };
type ReviewFailure = { readonly code: string; readonly field: string; readonly message: string };
type SavedReview = { readonly id: string; readonly status: "SAVED_IN_FIXTURE_MODE" };

function isReviewFailure(value: SavedReview | ReviewFailure): value is ReviewFailure {
  return "code" in value;
}

export function ReviewDesk(): React.JSX.Element {
  const [candidates, setCandidates] = useState<readonly Candidate[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState("Fixture Album");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [rating, setRating] = useState("5");
  const [review, setReview] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void ky.get("/api/fixture/health").json<Health>().then(setHealth);
  }, []);

  async function search(): Promise<void> {
    const result = await ky.get("/api/fixture/candidates", { searchParams: { q: query } }).json<{ readonly candidates: readonly Candidate[] }>();
    setCandidates(result.candidates);
    setSelectedCandidate(result.candidates[0] ?? null);
    setNotice(result.candidates.length === 0 ? "일치하는 fixture 후보를 찾지 못했습니다." : "후보를 확인하고 검토 기록을 남길 수 있습니다.");
  }

  async function saveReview(): Promise<void> {
    if (selectedCandidate === null) {
      setNotice("검토할 후보를 먼저 선택해 주세요.");
      return;
    }
    const response = await ky.post("/api/fixture/reviews", { json: { candidateId: selectedCandidate.id, rating: Number(rating), review }, throwHttpErrors: false });
    const result = await response.json<SavedReview | ReviewFailure>();
    setNotice(isReviewFailure(result) ? result.message : "fixture 검토 기록을 저장했습니다. 외부 쓰기는 수행하지 않았습니다.");
  }

  return (
    <main className="desk-shell">
      <header className="masthead">
        <div><p className="eyebrow">MUSIC KG / REVIEW DESK</p><h1>앨범 근거 검토</h1></div>
        <dl className="environment-record" aria-label="실행 환경"><div><dt>모드</dt><dd data-testid="fixture-label">fixture only</dd></div><div><dt>상태</dt><dd>{health?.status ?? "확인 중"}</dd></div></dl>
      </header>
      <section className="workspace" aria-label="fixture 검토 작업공간">
        <aside className="context-rail"><Database size={22} weight="fill" aria-hidden="true" /><p>현재 검토는 저장소에 포함된 공개 fixture만 사용합니다.</p><dl><div><dt>외부 백엔드</dt><dd>{health?.externalBackend.state ?? "확인 중"}</dd></div><div><dt>복구 방법</dt><dd>이 미리보기에서는 fixture 경로를 계속 사용합니다.</dd></div></dl></aside>
        <section className="work-sheet" aria-labelledby="task-heading">
          <p className="section-index">01 / 후보 검색</p><h2 id="task-heading">어떤 앨범을 검토할까요?</h2><p className="instruction">제목이나 아티스트를 입력하면 공개 fixture 후보만 같은 출처에서 찾습니다.</p>
          <div className="search-row"><label htmlFor="album-search">앨범 또는 아티스트</label><input id="album-search" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" onClick={() => void search()}><MagnifyingGlass size={18} weight="bold" /> 후보 찾기</button></div>
          <div className="result-region" aria-live="polite"><p className="result-caption">결과: {candidates.length}건</p>{candidates.map((candidate) => <button className={`candidate-row${selectedCandidate?.id === candidate.id ? " selected" : ""}`} type="button" key={candidate.id} onClick={() => setSelectedCandidate(candidate)} aria-pressed={selectedCandidate?.id === candidate.id}><span><strong>{candidate.title}</strong><small>{candidate.artist}</small></span><span className="mono">{candidate.id}</span><span>{candidate.source}</span></button>)}</div>
          <section className="review-form" aria-labelledby="review-heading"><p className="section-index">02 / 검토 기록</p><h2 id="review-heading">선택한 후보에 짧은 메모를 남깁니다.</h2><div className="field-grid"><label htmlFor="rating">평점 (1–5)<input id="rating" type="number" min="1" max="5" value={rating} onChange={(event) => setRating(event.target.value)} /></label><label htmlFor="review">검토 메모<textarea id="review" value={review} onChange={(event) => setReview(event.target.value)} placeholder="fixture 검토에 남길 메모" /></label></div><button type="button" className="save-button" onClick={() => void saveReview()}><FloppyDisk size={18} weight="fill" /> fixture에 저장</button></section>
          {notice.length > 0 && <p className="notice" role="status">{notice.includes("저장") ? <CheckCircle size={18} weight="fill" /> : <WarningCircle size={18} weight="fill" />}{notice}</p>}
        </section>
      </section>
    </main>
  );
}
