import type { Metadata } from "next";

import { ServicePage } from "../../components/service-page";

export const metadata: Metadata = { description: "음악 아카이브가 후보를 찾고 근거를 표시하는 방식을 설명합니다.", title: "추천 방식" };

export default function MethodPage(): React.JSX.Element {
  return <ServicePage eyebrow="서비스 원칙" title="추천이 만들어지는 방식">
    <section><h2>후보보다 근거가 먼저입니다.</h2><p>개인 기록은 Notion에서 읽고, 정규화한 앨범과 아티스트 관계를 개인 GraphDB에 투영합니다. 추천 후보는 이미 기록한 음반을 제외한 뒤 같은 아티스트와 확인된 MusicBrainz 태그 연결에서 결정론적으로 찾습니다.</p></section>
    <section><h2>현재 사용하는 검색</h2><p>앨범 검색은 MusicBrainz를 우선하고 결과가 없을 때 한국 iTunes Store 카탈로그를 보조로 사용합니다. 영구 pgvector 검증 전에는 벡터 검색을 사용하지 않습니다.</p></section>
    <section><h2>문장 생성의 역할</h2><p>선택형 설명 기능은 그래프가 이미 고른 근거만 짧게 정리합니다. 모델이 새 앨범을 만들거나 순위를 바꾸지 못하며, 연결되지 않았거나 근거가 부족하면 결정론적 추천만 남깁니다.</p></section>
    <section><h2>표시하지 않는 정보</h2><p>공개 화면에는 Notion 페이지 식별자, 개인 감상, 보유 여부, 점수, 내부 그래프 경로와 공급자 자격 증명을 보내지 않습니다.</p></section>
  </ServicePage>;
}
