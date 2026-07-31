import { WarningCircle } from "@phosphor-icons/react/ssr";

import type { FixtureAdapterUnavailable } from "../lib/fixture-adapter";

type FixtureAdapterUnavailableProps = {
  readonly state: FixtureAdapterUnavailable;
};

export function FixtureAdapterUnavailableView({ state }: FixtureAdapterUnavailableProps): React.JSX.Element {
  return (
    <main className="desk-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">MUSIC KG / REVIEW DESK</p>
          <h1>외부 백엔드 연결 상태</h1>
        </div>
        <dl className="environment-record" aria-label="실행 환경">
          <div><dt>모드</dt><dd data-testid="fixture-label">fixture disabled</dd></div>
          <div><dt>상태</dt><dd>unavailable</dd></div>
        </dl>
      </header>
      <section className="workspace" aria-label="복구 안내">
        <section className="work-sheet" aria-labelledby="unavailable-heading">
          <p className="section-index">CONFIGURATION / RECOVERABLE</p>
          <h2 id="unavailable-heading">fixture 어댑터를 사용할 수 없습니다.</h2>
          <p className="instruction">후보를 만들거나 저장하지 않았습니다. 설정을 복구한 뒤 같은 화면에서 다시 시도해 주세요.</p>
          <p className="notice" data-testid="external-backend-unavailable" role="status">
            <WarningCircle size={18} weight="fill" aria-hidden="true" />
            <span><strong>{state.code}</strong><br />{state.message}<br />{state.recovery}</span>
          </p>
        </section>
      </section>
    </main>
  );
}
