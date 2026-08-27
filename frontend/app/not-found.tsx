import Link from "next/link";

import { ServicePage } from "../components/service-page";

export default function NotFound(): React.JSX.Element {
  return <ServicePage eyebrow="404" title="이 페이지를 찾지 못했습니다.">
    <section><h2>음악 탐색은 계속할 수 있습니다.</h2><p>주소가 바뀌었거나 공개되지 않은 페이지입니다. 공개 아카이브에서 실제 앨범과 수록곡을 다시 찾아보세요.</p></section>
    <Link className="service-return-link" href="/">음악 아카이브로 돌아가기</Link>
  </ServicePage>;
}
