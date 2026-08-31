"use client";

import { ArrowRight, Check, CheckCircle, FloppyDisk, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/ssr";
import ky from "ky";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { InsightNote, type EvidenceState, type Recommendation } from "./evidence-panels";
import { requestBff } from "../lib/review-bff-contract";

type Candidate = { readonly artist: string; readonly id: string; readonly source: "PUBLIC_FIXTURE"; readonly title: string };
type Health = { readonly mode: "fixture" | "production"; readonly status: "ok" };
type HealthState =
  | { readonly kind: "error"; readonly configurationRequired: boolean; readonly message: string; readonly recovery: string }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly value: Health };
type SearchState = "empty" | "error" | "idle" | "loading" | "results";
type SavedReview = { readonly reviewId: string; readonly status: "SAVED_IN_FIXTURE_MODE" };
type SaveState =
  | { readonly kind: "error" }
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "success"; readonly value: SavedReview };
type Notice = { readonly message: string; readonly tone: "error" | "success" };

const candidateSchema = z.object({ artist: z.string(), id: z.string(), source: z.literal("PUBLIC_FIXTURE"), title: z.string() });
const candidatesSchema = z.object({ candidates: z.array(candidateSchema), mode: z.literal("fixture") });
const healthSchema = z.object({ mode: z.union([z.literal("fixture"), z.literal("production")]), status: z.literal("ok") });
const savedReviewSchema = z.object({ reviewId: z.string().min(1), status: z.literal("SAVED_IN_FIXTURE_MODE") });
const evidenceReadySchema = z.object({
  answer: z.string().min(1),
  claims: z.array(z.object({ evidenceIds: z.array(z.string().min(1)).min(1), text: z.string().min(1) })),
  records: z.array(z.object({ id: z.string().min(1), subjectId: z.string().min(1), summary: z.string().min(1) })).min(1),
  selectionStatus: z.literal("FIXTURE_SELECTED"),
  state: z.literal("ready")
});
const recommendationSchema = z.object({
  policyVersion: z.string().min(1),
  reviewCandidateId: z.string().min(1),
  recommendation: z.object({
    candidateId: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
    score: z.object({
      diversity: z.number(),
      metadataRelevance: z.number(),
      novelty: z.number(),
      pathStrength: z.number(),
      personalEvidence: z.number()
    }),
    title: z.string().min(1),
    totalScore: z.number()
  })
});

function koreanFailure(message: string): { readonly configurationRequired: boolean; readonly message: string; readonly recovery: string } {
  const normalized = message.toLowerCase();
  if (/[가-힣]/u.test(message)) {
    return { configurationRequired: false, message, recovery: "입력 내용은 유지됩니다. 안내를 확인한 뒤 다시 시도해 주세요." };
  }
  if (normalized.includes("configuration") || normalized.includes("not configured")) {
    return { configurationRequired: true, message: "백엔드 연결 설정이 완료되지 않았습니다.", recovery: "서버의 백엔드 주소와 공유 비밀 설정을 확인한 뒤 다시 시도해 주세요." };
  }
  if (normalized.includes("auth")) {
    return { configurationRequired: true, message: "백엔드 인증 설정을 확인할 수 없습니다.", recovery: "서버의 공유 비밀 설정을 갱신한 뒤 다시 시도해 주세요." };
  }
  if (normalized.includes("contract") || normalized.includes("invalid response")) {
    return { configurationRequired: false, message: "백엔드 응답 형식을 확인하지 못했습니다.", recovery: "입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요." };
  }
  return { configurationRequired: false, message: "백엔드 연결에 실패했습니다.", recovery: "입력은 유지됩니다. 복구 후 재시도해 주세요." };
}

function evidenceState(health: HealthState, selectedEvidence: EvidenceState): EvidenceState {
  if (health.kind === "error") {
    return health.configurationRequired
      ? { reason: health.message, recovery: health.recovery, state: "configuration-required" }
      : { reason: `${health.message} ${health.recovery}`, state: "error" };
  }
  return selectedEvidence;
}

function ResultRegion(props: {
  readonly candidates: readonly Candidate[];
  readonly onSelect: (candidate: Candidate) => void;
  readonly selectedCandidate: Candidate | null;
  readonly state: SearchState;
}): React.JSX.Element {
  const { candidates, onSelect, selectedCandidate, state } = props;
  return <div className="result-region" aria-live="polite" aria-busy={state === "loading"}>
    <p className="result-caption">{state === "results" ? `찾은 음반 ${candidates.length}장` : "검색 결과"}</p>
    {state === "idle" && <p className="result-message">제목이나 아티스트를 입력하면 고를 수 있는 음반을 보여드려요.</p>}
    {state === "loading" && <div className="loading-record"><span />음반을 찾고 있습니다.</div>}
    {state === "empty" && <p className="result-message">아직 맞는 음반을 찾지 못했습니다. 제목이나 아티스트를 조금 다르게 입력해 보세요.</p>}
    {state === "error" && <p className="result-message">검색을 완료하지 못했습니다. 위 복구 안내를 확인해 주세요.</p>}
    {candidates.map((candidate) => {
      const selected = selectedCandidate?.id === candidate.id;
      return <button className={`candidate-row${selected ? " selected" : ""}`} type="button" key={candidate.id} onClick={() => onSelect(candidate)} aria-pressed={selected}><span><strong>{candidate.title}</strong><small>{candidate.artist}</small></span><span className="selection-label">{selected ? <><Check size={16} weight="bold" aria-hidden="true" />고름</> : <><ArrowRight size={16} weight="bold" aria-hidden="true" />기록하기</>}</span></button>;
    })}
  </div>;
}

export function ReviewDesk(): React.JSX.Element {
  const [candidates, setCandidates] = useState<readonly Candidate[]>([]);
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [rating, setRating] = useState("5");
  const [review, setReview] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceState>({ state: "no-evidence" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const evidenceRequestId = useRef(0);

  useEffect(() => {
    void requestBff(ky.get("/api/fixture/health", { throwHttpErrors: false }), healthSchema).then((outcome) => {
      if (outcome.kind === "success") {
        setHealth({ kind: "ready", value: outcome.value });
        return;
      }
      const failure = koreanFailure(outcome.message);
      setHealth({ kind: "error", ...failure });
      setNotice({ message: `${failure.message} ${failure.recovery}`, tone: "error" });
    });
  }, []);

  async function search(): Promise<void> {
    evidenceRequestId.current += 1;
    setSearchState("loading");
    setNotice(null);
    setSelectedCandidate(null);
    setSelectedEvidence({ state: "no-evidence" });
    const outcome = await requestBff(ky.get("/api/fixture/candidates", { searchParams: { q: query }, throwHttpErrors: false }), candidatesSchema);
    if (outcome.kind === "failure") {
      const failure = koreanFailure(outcome.message);
      setCandidates([]);
      setSearchState("error");
      setNotice({ message: `${failure.message} ${failure.recovery}`, tone: "error" });
      return;
    }
    setCandidates(outcome.value.candidates);
    setSearchState(outcome.value.candidates.length === 0 ? "empty" : "results");
  }

  async function selectCandidate(candidate: Candidate): Promise<void> {
    const requestId = evidenceRequestId.current + 1;
    evidenceRequestId.current = requestId;
    setSelectedCandidate(candidate);
    setSaveState({ kind: "idle" });
    setSelectedEvidence({ state: "loading" });
    const evidenceOutcome = requestBff(
      ky.post(`/api/fixture/candidates/${encodeURIComponent(candidate.id)}/evidence`, { throwHttpErrors: false }),
      evidenceReadySchema
    );
    const recommendationOutcome = requestBff(
      ky.post("/api/fixture/recommendations", { json: { selectedCandidateId: candidate.id }, throwHttpErrors: false }),
      recommendationSchema
    );
    const outcome = await evidenceOutcome;
    if (requestId !== evidenceRequestId.current) return;
    if (outcome.kind === "success") {
      setSelectedEvidence(outcome.value);
      void recommendationOutcome.then((recommendationResult) => {
        if (requestId !== evidenceRequestId.current) return;
        const recommendationMatchesSelection = recommendationResult.kind === "success"
          && recommendationResult.value.reviewCandidateId === candidate.id;
        const recommendation: Recommendation | undefined = recommendationMatchesSelection && recommendationResult.kind === "success"
          ? {
            ...recommendationResult.value.recommendation,
            policyVersion: recommendationResult.value.policyVersion,
            reviewCandidateId: recommendationResult.value.reviewCandidateId
          }
          : undefined;
        const recommendationError = recommendationResult.kind === "failure"
          ? koreanFailure(recommendationResult.message)
          : recommendationMatchesSelection
            ? undefined
            : koreanFailure("BACKEND_CONTRACT_ERROR");
        setSelectedEvidence((current) => current.state === "ready"
          ? {
            ...current,
            recommendation,
            recommendationError: recommendationError === undefined
              ? undefined
              : `${recommendationError.message} ${recommendationError.recovery}`
          }
          : current);
      });
      return;
    }
    const failure = koreanFailure(outcome.message);
    setSelectedEvidence(failure.configurationRequired
      ? { reason: failure.message, recovery: failure.recovery, state: "configuration-required" }
      : { reason: `${failure.message} ${failure.recovery}`, state: "error" });
    setNotice({ message: `${failure.message} ${failure.recovery}`, tone: "error" });
  }

  async function saveReview(): Promise<void> {
    if (selectedCandidate === null) return;
    setSaveState({ kind: "saving" });
    setNotice(null);
    const outcome = await requestBff(ky.post("/api/fixture/reviews", { json: { candidateId: selectedCandidate.id, rating: Number(rating), review }, throwHttpErrors: false }), savedReviewSchema);
    if (outcome.kind === "failure") {
      const failure = koreanFailure(outcome.message);
      setSaveState({ kind: "error" });
      setNotice({ message: `${failure.message} ${failure.recovery}`, tone: "error" });
      return;
    }
    setSaveState({ kind: "success", value: outcome.value });
    setNotice({ message: "데모 기록을 저장했습니다. 외부 저장은 하지 않았습니다.", tone: "success" });
  }

  const visibleEvidence = evidenceState(health, selectedEvidence);
  const saveEnabled = selectedCandidate !== null && saveState.kind !== "saving";
  const healthLabel = health.kind === "loading" ? "연결 확인 중" : health.kind === "ready" ? "연결됨" : "조치 필요";

  return <main className="music-journal">
    <header className="journal-header">
      <h1>내 음악 기록</h1>
      <p className="journal-intro">무슨 음악을 다시 듣고 싶은지, 한 장씩 <span className="keep-together">기록해 보세요.</span></p>
      <div className="journal-context"><p>연결 상태: <strong>{healthLabel}</strong></p><details className="demo-disclosure"><summary>데모 데이터 정보</summary><p>현재는 안전한 데모 데이터로 동작합니다. <span data-testid="fixture-label" className="mono">fixture only</span></p></details></div>
    </header>
    <nav className="task-navigation" aria-label="음악 기록 순서"><a href="#candidate-search">음반 찾기</a><a href="#review-record">내 기록 남기기</a><a href="#evidence-review">추천 이유 보기</a></nav>
    <section className="journal-workspace" aria-label="음악 기록 작업공간">
      <section className="journal-page" aria-labelledby="task-heading">
        <section className="search-section" id="candidate-search"><p className="section-kicker">찾아보기</p><h2 id="task-heading">어떤 음반을 찾고 있나요?</h2><p className="instruction">제목이나 아티스트를 입력한 뒤 <span className="keep-together">음반을 골라 보세요.</span></p><form className="search-row" onSubmit={(event) => { event.preventDefault(); void search(); }}><label htmlFor="album-search">앨범 또는 아티스트</label><input id="album-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 앨범명 또는 아티스트" /><button type="submit" disabled={searchState === "loading"}><MagnifyingGlass size={18} weight="bold" aria-hidden="true" />{searchState === "loading" ? "찾는 중" : "음반 찾기"}</button></form><ResultRegion candidates={candidates} onSelect={(candidate) => void selectCandidate(candidate)} selectedCandidate={selectedCandidate} state={searchState} /></section>
        <section className="listening-note" id="review-record" aria-labelledby="review-heading"><p className="section-kicker">내 기록</p><h2 id="review-heading">이번엔 어떻게 들렸나요?</h2><div className="selected-record" id="selection-feedback">{selectedCandidate === null ? <p>먼저 음반을 고르면, 여기에 내 기록을 남길 수 있어요.</p> : <><p className="section-kicker">선택한 음반</p><strong>{selectedCandidate.title}</strong><span>{selectedCandidate.artist}</span></>}</div><div className="field-grid"><label htmlFor="rating">내 평점 (1-5)<input id="rating" type="number" min="1" max="5" value={rating} onChange={(event) => setRating(event.target.value)} /></label><label htmlFor="review">한 줄 메모<textarea id="review" value={review} onChange={(event) => setReview(event.target.value)} placeholder="기억하고 싶은 순간이나 최애곡을 적어 보세요." /></label></div><button type="button" className="save-button" disabled={!saveEnabled} aria-describedby="selection-feedback" onClick={() => void saveReview()}><FloppyDisk size={18} weight="fill" aria-hidden="true" />{saveState.kind === "saving" ? "저장 중" : "기록 저장"}</button>{saveState.kind === "success" && <dl className="save-record" data-testid="save-confirmation"><div><dt>기록 ID</dt><dd className="mono">{saveState.value.reviewId}</dd></div><div><dt>상태</dt><dd>데모 기록 저장 완료</dd></div></dl>}</section>
        {notice !== null && <p className={`notice ${notice.tone}`} role="status">{notice.tone === "success" ? <CheckCircle size={18} weight="fill" aria-hidden="true" /> : <WarningCircle size={18} weight="fill" aria-hidden="true" />}<span>{notice.message}</span></p>}
      </section>
      <aside className="insight-region" aria-label="추천과 근거"><InsightNote evidence={visibleEvidence} /></aside>
    </section>
  </main>;
}
