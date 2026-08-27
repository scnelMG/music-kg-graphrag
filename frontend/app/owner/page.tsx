import { ArchiveNavigation } from "../../components/archive-navigation";
import { OwnerSessionForm } from "../../components/owner-session-form";
import { FontLoader } from "../../components/font-loader";

export const dynamic = "force-dynamic";

export default function OwnerPage(): React.JSX.Element {
  return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal access-page" id="main-content" tabIndex={-1}>
    <ArchiveNavigation mode="service" />
    <section className="access-sheet" aria-labelledby="owner-session-heading">
      <div className="access-copy"><p className="section-kicker">개인 기록 관리</p>
      <h1 id="owner-session-heading"><span className="keep-phrase">개인 음악 기록</span><span className="title-line"> 열기</span></h1>
      <p className="instruction">소유자 확인 후 최근 기록과 오늘 다시 들을 앨범을 관리합니다.</p>
      <dl className="access-facts"><div><dt>보관 위치</dt><dd>기록은 연결한 Notion에만 저장됩니다.</dd></div><div><dt>세션 처리</dt><dd>토큰은 브라우저 코드나 Notion에 저장되지 않습니다.</dd></div></dl></div>
      <OwnerSessionForm />
    </section>
  </main><FontLoader /></>;
}
