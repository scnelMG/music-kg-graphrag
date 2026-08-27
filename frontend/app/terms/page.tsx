import type { Metadata } from "next";
import Link from "next/link";

import { ServicePage } from "../../components/service-page";

export const metadata: Metadata = { description: "음악 아카이브의 이용 범위와 데이터 출처를 설명합니다.", title: "이용 조건" };

export default function TermsPage(): React.JSX.Element {
  return <ServicePage eyebrow="서비스 범위" title="이용 조건">
    <section><h2>개인 음악 아카이브</h2><p>이 서비스는 공개 음악 탐색과 한 명의 소유자가 관리하는 개인 기록 공간을 제공합니다. 공개 방문자는 개인 기록을 읽거나 변경할 수 없습니다.</p></section>
    <section><h2>카탈로그 정보</h2><p>앨범명, 아티스트, 발매일과 커버는 외부 카탈로그가 제공한 사실을 표시합니다. 제공자의 수정이나 장애에 따라 결과가 달라지거나 일시적으로 보이지 않을 수 있습니다.</p></section>
    <section><h2>추천의 한계</h2><p>추천은 개인 기록에서 확인된 관계를 설명하는 탐색 보조 기능입니다. 통계적 취향 예측, 전문적인 음악 평가 또는 항상 새로운 결과를 보장하지 않습니다.</p></section>
    <Link className="service-return-link" href="/">음악 아카이브로 돌아가기</Link>
  </ServicePage>;
}
