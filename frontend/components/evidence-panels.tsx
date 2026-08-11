import { BookOpen, FileMagnifyingGlass, Path, WarningCircle } from "@phosphor-icons/react/ssr";

export type EvidenceRecord = {
  readonly id: string;
  readonly subjectId: string;
  readonly summary: string;
};

export type EvidenceClaim = {
  readonly evidenceIds: readonly string[];
  readonly text: string;
};

export type Recommendation = {
  readonly candidateId: string;
  readonly evidenceIds: readonly string[];
  readonly policyVersion: string;
  readonly reviewCandidateId: string;
  readonly score: {
    readonly diversity: number;
    readonly metadataRelevance: number;
    readonly novelty: number;
    readonly pathStrength: number;
    readonly personalEvidence: number;
  };
  readonly title: string;
  readonly totalScore: number;
};

export type EvidenceReady = {
  readonly answer: string;
  readonly claims: readonly EvidenceClaim[];
  readonly evaluation?: string;
  readonly recommendation?: Recommendation;
  readonly recommendationError?: string;
  readonly records: readonly EvidenceRecord[];
  readonly selectionStatus: "FIXTURE_SELECTED";
  readonly state: "ready";
};

export type EvidenceState =
  | EvidenceReady
  | { readonly reason: string; readonly recovery: string; readonly state: "configuration-required" }
  | { readonly reason: string; readonly state: "error" }
  | { readonly state: "loading" }
  | { readonly candidateId?: string; readonly candidateSource?: string; readonly state: "no-evidence" };

type InsightNoteProps = {
  readonly evidence: EvidenceState;
};

function assertNever(value: never): never {
  throw new TypeError(`처리하지 않은 근거 상태: ${String(value)}`);
}

function InsightState({ evidence }: InsightNoteProps): React.JSX.Element {
  switch (evidence.state) {
    case "configuration-required":
      return <div className="insight-state"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>추천과 근거를 연결하려면 설정이 필요합니다.</strong><p>{evidence.reason} {evidence.recovery}</p></div></div>;
    case "error":
      return <div className="insight-state"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>근거를 불러오지 못했습니다.</strong><p>{evidence.reason}</p></div></div>;
    case "no-evidence":
      return <div className="insight-state" data-testid="insight-empty"><BookOpen size={20} weight="fill" aria-hidden="true" /><div><strong>음반을 고르면 여기에서 이유를 읽을 수 있어요.</strong><p>추천 문장과 연결 근거는 실제 데이터가 도착했을 때만 보여줍니다.</p></div></div>;
    case "loading":
      return <div className="insight-state"><FileMagnifyingGlass size={20} weight="fill" aria-hidden="true" /><div><strong>추천 이유를 읽는 중입니다.</strong><p>선택한 음반과 연결된 기록을 확인하고 있어요.</p></div></div>;
    case "ready":
      return <></>;
    default:
      return assertNever(evidence);
  }
}

function RecommendationNote({ evidence }: { readonly evidence: EvidenceReady }): React.JSX.Element | null {
  if (evidence.recommendation === undefined && evidence.recommendationError === undefined) return null;
  if (evidence.recommendationError !== undefined) {
    return <div className="insight-state" data-testid="recommendation-unavailable"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>추천 정보는 잠시 뒤 다시 확인해 주세요.</strong><p>{evidence.recommendationError}</p></div></div>;
  }
  const recommendation = evidence.recommendation;
  if (recommendation === undefined) return null;
  return <section className="recommendation-note" data-testid="recommendation-panel" aria-label="추천 결과">
    <p className="section-kicker">다음으로 들어볼 음반</p>
    <h3>{recommendation.title}</h3>
    <p>선택한 음반과 연결된 취향 단서를 바탕으로 찾았습니다.</p>
    <details className="technical-disclosure">
      <summary>추천 점수와 근거 보기</summary>
      <dl className="technical-record">
        <div><dt>추천 점수</dt><dd>{recommendation.totalScore}</dd></div>
        <div><dt>개인 기록 단서</dt><dd>{recommendation.score.personalEvidence}</dd></div>
        <div><dt>연결 강도</dt><dd>{recommendation.score.pathStrength}</dd></div>
        <div><dt>메타데이터 관련도</dt><dd>{recommendation.score.metadataRelevance}</dd></div>
        <div><dt>새로움</dt><dd>{recommendation.score.novelty}</dd></div>
        <div><dt>다양성</dt><dd>{recommendation.score.diversity}</dd></div>
        <div><dt>추천 기준</dt><dd className="mono">{recommendation.policyVersion}</dd></div>
        <div><dt>연결 근거 ID</dt><dd className="mono">{recommendation.evidenceIds.join(", ")}</dd></div>
      </dl>
    </details>
  </section>;
}

export function InsightNote({ evidence }: InsightNoteProps): React.JSX.Element {
  return <section className="insight-note" id="evidence-review" aria-labelledby="insight-heading" aria-live="polite">
    <header className="insight-heading"><Path size={20} weight="fill" aria-hidden="true" /><div><p className="section-kicker">듣기 전에</p><h2 id="insight-heading">추천과 근거</h2></div></header>
    {evidence.state !== "ready" ? <InsightState evidence={evidence} /> : <>
      <RecommendationNote evidence={evidence} />
      <section className="evidence-answer" aria-labelledby="answer-heading">
        <p className="section-kicker">이 추천을 꺼낸 이유</p>
        <h3 id="answer-heading" data-testid="graphrag-answer">{evidence.answer}</h3>
        <ol className="claim-list">{evidence.claims.map((claim) => <li key={`${claim.text}-${claim.evidenceIds.join("-")}`}><p>{claim.text}</p></li>)}</ol>
      </section>
      <details className="technical-disclosure">
        <summary>근거 경로 자세히 보기</summary>
        <ol className="path-list">{evidence.records.map((record) => <li key={record.id}><strong className="mono">{record.id}</strong><p>{record.summary}</p><p className="source-line">대상 ID: {record.subjectId}</p></li>)}</ol>
        <dl className="technical-record">
          <div><dt>선택 상태</dt><dd>{evidence.selectionStatus}</dd></div>
          {evidence.evaluation !== undefined && <div><dt>평가 정보</dt><dd>{evidence.evaluation}</dd></div>}
        </dl>
      </details>
    </>}
  </section>;
}
