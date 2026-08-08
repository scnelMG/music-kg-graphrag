import { CaretDown, FileMagnifyingGlass, Path, WarningCircle } from "@phosphor-icons/react/ssr";

export type EvidencePath = {
  readonly id: string;
  readonly nodes: readonly string[];
  readonly sourceIds: readonly string[];
};

export type EvidenceClaim = {
  readonly evidenceIds: readonly string[];
  readonly text: string;
};

export type EvidenceReady = {
  readonly answer: string;
  readonly claims: readonly EvidenceClaim[];
  readonly evaluation?: string;
  readonly paths: readonly EvidencePath[];
  readonly provenance?: string;
  readonly queryReference?: string;
  readonly state: "ready";
};

export type EvidenceState =
  | EvidenceReady
  | { readonly reason: string; readonly recovery: string; readonly state: "configuration-required" }
  | { readonly reason: string; readonly state: "error" }
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
        <ol className="path-list">{evidence.paths.map((path) => <li key={path.id}><strong className="mono">{path.id}</strong><p>{path.nodes.join(" → ")}</p><p className="source-line">출처 ID: {path.sourceIds.join(", ")}</p></li>)}</ol>
        {evidence.queryReference !== undefined && <details className="metadata-record"><summary>SPARQL 질의 참조 <CaretDown size={16} weight="bold" aria-hidden="true" /></summary><code>{evidence.queryReference}</code></details>}
        {evidence.provenance !== undefined && <dl className="source-record"><div><dt>프로비넌스</dt><dd>{evidence.provenance}</dd></div></dl>}
      </>}
    </section>
  );
}

export function EvidenceSynthesisPanel({ evidence }: EvidencePanelProps): React.JSX.Element {
  return (
    <section className="evidence-panel" aria-labelledby="synthesis-heading" aria-live="polite">
      <header className="panel-heading"><FileMagnifyingGlass size={20} weight="fill" aria-hidden="true" /><div><p className="section-index">04 / 근거 종합</p><h2 id="synthesis-heading">Evidence synthesis</h2></div></header>
      {evidence.state !== "ready" ? <EvidenceStateMessage evidence={evidence} /> : <>
        <p className="synthesis-answer">{evidence.answer}</p>
        <h3>근거</h3>
        <ol className="claim-list">{evidence.claims.map((claim) => <li key={`${claim.text}-${claim.evidenceIds.join("-")}`}><p>{claim.text}</p><p className="source-line">근거 ID: {claim.evidenceIds.join(", ")}</p></li>)}</ol>
        {evidence.evaluation !== undefined && <dl className="source-record"><div><dt>평가 메타데이터</dt><dd>{evidence.evaluation}</dd></div></dl>}
      </>}
    </section>
  );
}
