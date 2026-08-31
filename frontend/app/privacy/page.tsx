import type { Metadata } from "next";

import { ServicePage } from "../../components/service-page";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  description: "음악 아카이브의 공개 탐색과 소유자 기록 데이터 경계를 설명합니다.",
  openGraph: { url: "/privacy" },
  title: "개인정보 처리"
};

const contents = [
  { id: "public-visitors", label: "공개 방문자" },
  { id: "owner-records", label: "소유자 기록" },
  { id: "external-providers", label: "외부 제공자" },
  { id: "retention", label: "삭제와 보관" }
] as const;

export default function PrivacyPage(): React.JSX.Element {
  return <ServicePage contents={contents} currentPath="/privacy" eyebrow="데이터 경계" title="개인정보 처리 안내">
    <section id="public-visitors"><h2>공개 방문자</h2><p>공개 검색어는 앨범과 수록곡을 찾는 요청에만 사용합니다. 좋아요 목록은 이 브라우저에만 저장됩니다. 공개 방문자의 좋아요를 Notion이나 개인 그래프에 기록하지 않습니다.</p></section>
    <section id="owner-records"><h2>소유자 기록</h2><p>개인 기록은 소유자가 연결한 Notion 데이터베이스가 원본입니다. 소유자 확인 쿠키는 HttpOnly로 설정하며 브라우저 JavaScript에 토큰과 Notion 자격 증명을 노출하지 않습니다.</p></section>
    <section id="external-providers"><h2>외부 데이터 제공자</h2><p>앨범 검색과 커버 표시를 위해 MusicBrainz, Cover Art Archive와 한국 iTunes Store의 공개 카탈로그를 사용할 수 있습니다. 각 서비스 요청에는 해당 제공자의 정책이 적용됩니다.</p></section>
    <section id="retention"><h2>삭제와 보관</h2><p>소유자는 기록을 Notion에서 보관하고 다시 복원할 수 있습니다. 공개 방문자의 브라우저 좋아요는 브라우저 사이트 데이터 삭제로 지울 수 있습니다.</p></section>
  </ServicePage>;
}
