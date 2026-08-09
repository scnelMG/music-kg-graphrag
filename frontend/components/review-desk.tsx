"use client";

import { CheckCircle, FloppyDisk, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/ssr";
import ky from "ky";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { EvidencePathViewer, EvidenceSynthesisPanel, type EvidenceState, type Recommendation } from "./evidence-panels";
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

function noticeMessage(notice: Notice): React.ReactNode {
  const phrase = notice.tone === "success" ? "외부 쓰기" : undefined;
  if (phrase === undefined) return notice.message;
  const parts = notice.message.split(phrase);
  const before = parts[0];
  const after = parts[1];
  if (parts.length !== 2 || before === undefined || after === undefined) return notice.message;
  return <>{before}<span className="keep-together">{phrase}</span>{after}</>;
}

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
    <p className="result-caption">검색 결과: {candidates.length}건</p>
    {state === "idle" && <p className="result-message">앨범 제목이나 아티스트를 입력한 뒤 후보 찾기를 눌러 주세요.</p>}
    {state === "loading" && <div className="loading-record"><span />후보를 찾고 있습니다.</div>}
    {state === "empty" && <p className="result-message">일치하는 공개 fixture 후보가 없습니다. 검색어를 확인해 다시 시도해 주세요.</p>}
    {state === "error" && <p className="result-message">검색을 완료하지 못했습니다. 위 복구 안내를 확인해 주세요.</p>}
    {candidates.map((candidate) => {
      const selected = selectedCandidate?.id === candidate.id;
      return <button className={`candidate-row${selected ? " selected" : ""}`} type="button" key={candidate.id} onClick={() => onSelect(candidate)} aria-pressed={selected}><span><strong>{candidate.title}</strong><small>{candidate.artist}</small></span><span className="mono">{candidate.id}</span><span>{candidate.source}</span><span className="selection-label">{selected ? "선택됨" : "선택"}</span></button>;
    })}
  </div>;
}

export function ReviewDesk(): React.JSX.Element {
  const [candidates, setCandidates] = useState<readonly Candidate[]>([]);
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [query, setQuery] = useState("Fixture Album");
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
    const [outcome, recommendationOutcome] = await Promise.all([
      requestBff(
        ky.post(`/api/fixture/candidates/${encodeURIComponent(candidate.id)}/evidence`, { throwHttpErrors: false }),
        evidenceReadySchema
      ),
      requestBff(ky.post("/api/fixture/recommendations", { json: { selectedCandidateId: candidate.id }, throwHttpErrors: false }), recommendationSchema)
    ]);
    if (requestId !== evidenceRequestId.current) return;
    if (outcome.kind === "success") {
      const recommendationMatchesSelection = recommendationOutcome.kind === "success"
        && recommendationOutcome.value.reviewCandidateId === candidate.id;
      const recommendation: Recommendation | undefined = recommendationMatchesSelection && recommendationOutcome.kind === "success"
        ? {
          ...recommendationOutcome.value.recommendation,
          policyVersion: recommendationOutcome.value.policyVersion,
          reviewCandidateId: recommendationOutcome.value.reviewCandidateId
        }
        : undefined;
      const recommendationError = recommendationOutcome.kind === "failure"
        ? koreanFailure(recommendationOutcome.message)
        : recommendationMatchesSelection
          ? undefined
          : koreanFailure("BACKEND_CONTRACT_ERROR");
      setSelectedEvidence({
        ...outcome.value,
        recommendation,
        recommendationError: recommendationError === undefined ? undefined : `${recommendationError.message} ${recommendationError.recovery}`
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
    setNotice({ message: "fixture 검토 기록을 저장했습니다. 외부 쓰기는 수행하지 않았습니다.", tone: "success" });
  }

  const visibleEvidence = evidenceState(health, selectedEvidence);
  const saveEnabled = selectedCandidate !== null && saveState.kind !== "saving";
  const healthLabel = health.kind === "loading" ? "연결 확인 중" : health.kind === "ready" ? "연결됨" : "조치 필요";

  return <main className="desk-shell">
    <header className="masthead"><div><p className="eyebrow">MUSIC KG / REVIEW DESK</p><h1>앨범 근거 검토</h1></div><dl className="environment-record" aria-label="실행 환경"><div><dt>모드</dt><dd data-testid="fixture-label">fixture only</dd></div><div><dt>백엔드 상태</dt><dd>{healthLabel}</dd></div></dl></header>
    <nav className="task-navigation" aria-label="검토 단계"><a href="#candidate-search">1. 후보 검색</a><a href="#review-record">2. 검토 기록</a><a href="#evidence-review">3. 근거 확인</a></nav>
    <section className="workspace" aria-label="fixture 검토 작업공간">
      <section className="work-sheet" aria-labelledby="task-heading">
        <section id="candidate-search"><p className="section-index">01 / 후보 검색</p><h2 id="task-heading">어떤 앨범을 검토할까요?</h2><p className="instruction">제목이나 아티스트를 입력하면 공개 fixture 후보만 찾습니다. 후보는 자동으로 <span className="keep-together">선택되지 않습니다.</span></p><div className="search-row"><label htmlFor="album-search">앨범 또는 아티스트</label><input id="album-search" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" disabled={searchState === "loading"} onClick={() => void search()}><MagnifyingGlass size={18} weight="bold" aria-hidden="true" />{searchState === "loading" ? "검색 중" : "후보 찾기"}</button></div><ResultRegion candidates={candidates} onSelect={(candidate) => void selectCandidate(candidate)} selectedCandidate={selectedCandidate} state={searchState} /></section>
        <section className="review-form" id="review-record" aria-labelledby="review-heading"><p className="section-index">02 / 검토 기록</p><h2 id="review-heading">선택한 후보에 검토 메모를 남깁니다.</h2><p className="selection-feedback" id="selection-feedback">{selectedCandidate === null ? "저장하려면 검색 결과에서 후보를 먼저 선택해 주세요." : <><strong>선택 후보:</strong> {selectedCandidate.title} · <span className="mono">{selectedCandidate.id}</span></>}</p><div className="field-grid"><label htmlFor="rating">평점 (1–5)<input id="rating" type="number" min="1" max="5" value={rating} onChange={(event) => setRating(event.target.value)} /></label><label htmlFor="review">검토 메모<textarea id="review" value={review} onChange={(event) => setReview(event.target.value)} placeholder="fixture 검토에 남길 메모" /></label></div><button type="button" className="save-button" disabled={!saveEnabled} aria-describedby="selection-feedback" onClick={() => void saveReview()}><FloppyDisk size={18} weight="fill" aria-hidden="true" />{saveState.kind === "saving" ? "저장 중" : "fixture에 저장"}</button>{saveState.kind === "success" && <dl className="source-record" data-testid="save-confirmation"><div><dt>저장 ID</dt><dd className="mono">{saveState.value.reviewId}</dd></div><div><dt>저장 상태</dt><dd>{saveState.value.status}</dd></div></dl>}</section>
        {notice !== null && <p className={`notice ${notice.tone}`} role="status">{notice.tone === "success" ? <CheckCircle size={18} weight="fill" aria-hidden="true" /> : <WarningCircle size={18} weight="fill" aria-hidden="true" />}<span>{noticeMessage(notice)}</span></p>}
      </section>
      <section className="evidence-workspace" id="evidence-review" aria-label="근거 검토"><EvidencePathViewer evidence={visibleEvidence} /><EvidenceSynthesisPanel evidence={visibleEvidence} /></section>
    </section>
  </main>;
}
