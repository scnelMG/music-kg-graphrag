import { OwnerSessionForm } from "../../components/owner-session-form";
import { FontLoader } from "../../components/font-loader";

export const dynamic = "force-dynamic";

export default function OwnerPage(): React.JSX.Element {
  return <><main className="music-journal access-page" id="main-content" tabIndex={-1}>
    <section className="access-sheet" aria-labelledby="owner-session-heading">
      <p className="section-kicker">개인 기록 관리</p>
      <h1 id="owner-session-heading">나의 Notion 기록을 엽니다.</h1>
      <p className="instruction">이 화면은 개인 기록을 관리하는 소유자만 사용합니다. 토큰은 세션 쿠키로만 보관되며 브라우저 코드나 Notion에 저장되지 않습니다.</p>
      <OwnerSessionForm />
    </section>
  </main><FontLoader /></>;
}
