import { FileMagnifyingGlass, Path, WarningCircle } from "@phosphor-icons/react/ssr";

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

type EvidencePanelProps = {
  readonly evidence: EvidenceState;
};

function assertNever(value: never): never {
  throw new TypeError(`처리하지 않은 근거 상태: ${String(value)}`);
}

function EvidenceStateMessage({ evidence }: EvidencePanelProps): React.JSX.Element {
  switch (evidence.state) {
    case "configuration-required":
      return <div className="evidence-state"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>근거 서비스 설정이 필요합니다.</strong><p>{evidence.reason} {evidence.recovery}</p></div></div>;
    case "error":
      return <div className="evidence-state"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>근거를 불러오지 못했습니다.</strong><p>{evidence.reason}</p></div></div>;
    case "no-evidence":
      return <div className="evidence-state"><FileMagnifyingGlass size={20} weight="fill" aria-hidden="true" /><div><strong>연결된 근거가 없습니다.</strong><p>선택한 후보에 대한 그래프 경로와 인용 자료가 제공되지 않았습니다. 근거가 연결되기 전에는 답변을 만들지 않습니다.</p>{evidence.candidateId !== undefined && <dl className="source-record"><div><dt>선택 후보 ID</dt><dd className="mono">{evidence.candidateId}</dd></div>{evidence.candidateSource !== undefined && <div><dt>후보 출처</dt><dd>{evidence.candidateSource}</dd></div>}</dl>}</div></div>;
    case "loading":
      return <div className="evidence-state"><FileMagnifyingGlass size={20} weight="fill" aria-hidden="true" /><div><strong>근거를 불러오는 중입니다.</strong><p>선택한 fixture 후보의 근거 레코드와 종합 답변을 확인하고 있습니다.</p></div></div>;
    case "ready":
      return <></>;
    default:
      return assertNever(evidence);
  }
}

export function EvidencePathViewer({ evidence }: EvidencePanelProps): React.JSX.Element {
  return (
    <section className="evidence-panel" aria-labelledby="evidence-path-heading">
      <header className="panel-heading"><Path size={20} weight="fill" aria-hidden="true" /><div><p className="section-index">03 / 근거 경로</p><h2 id="evidence-path-heading">Evidence path</h2></div></header>
      {evidence.state !== "ready" ? <EvidenceStateMessage evidence={evidence} /> : <>
        <ol className="path-list">{evidence.records.map((record) => <li key={record.id}><strong className="mono">{record.id}</strong><p>{record.summary}</p><p className="source-line">대상 ID: {record.subjectId}</p></li>)}</ol>
        <dl className="source-record"><div><dt>선택 상태</dt><dd>{evidence.selectionStatus}</dd></div></dl>
      </>}
    </section>
  );
}

export function EvidenceSynthesisPanel({ evidence }: EvidencePanelProps): React.JSX.Element {
  return (
    <section className="evidence-panel" aria-labelledby="synthesis-heading" aria-live="polite">
      <header className="panel-heading"><FileMagnifyingGlass size={20} weight="fill" aria-hidden="true" /><div><p className="section-index">04 / 근거 종합</p><h2 id="synthesis-heading">Evidence synthesis</h2></div></header>
      {evidence.state !== "ready" ? <EvidenceStateMessage evidence={evidence} /> : <>
        {evidence.recommendation !== undefined && <section className="recommendation-record" data-testid="recommendation-panel" aria-label="Recommendation record">
          <h3>Recommendation</h3>
          <p><strong>{evidence.recommendation.title}</strong></p>
          <dl className="source-record">
            <div><dt>Policy</dt><dd className="mono">{evidence.recommendation.policyVersion}</dd></div>
            <div><dt>Review candidate ID</dt><dd className="mono">{evidence.recommendation.reviewCandidateId}</dd></div>
            <div><dt>Total score</dt><dd>{evidence.recommendation.totalScore}</dd></div>
            <div><dt>Personal evidence</dt><dd>{evidence.recommendation.score.personalEvidence}</dd></div>
            <div><dt>Path strength</dt><dd>{evidence.recommendation.score.pathStrength}</dd></div>
            <div><dt>Metadata relevance</dt><dd>{evidence.recommendation.score.metadataRelevance}</dd></div>
            <div><dt>Novelty</dt><dd>{evidence.recommendation.score.novelty}</dd></div>
            <div><dt>Diversity</dt><dd>{evidence.recommendation.score.diversity}</dd></div>
            <div><dt>Evidence IDs</dt><dd className="mono">{evidence.recommendation.evidenceIds.join(", ")}</dd></div>
          </dl>
        </section>}
        {evidence.recommendation === undefined && evidence.recommendationError !== undefined && <div className="evidence-state" data-testid="recommendation-unavailable"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>Recommendation unavailable</strong><p>{evidence.recommendationError}</p></div></div>}
        <p className="synthesis-answer" data-testid="graphrag-answer">{evidence.answer}</p>
        <h3>근거</h3>
        <ol className="claim-list">{evidence.claims.map((claim) => <li key={`${claim.text}-${claim.evidenceIds.join("-")}`}><p>{claim.text}</p><p className="source-line">근거 ID: {claim.evidenceIds.join(", ")}</p></li>)}</ol>
        {evidence.evaluation !== undefined && <dl className="source-record"><div><dt>평가 메타데이터</dt><dd>{evidence.evaluation}</dd></div></dl>}
      </>}
    </section>
  );
}
