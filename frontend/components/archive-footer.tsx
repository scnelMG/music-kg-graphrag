import Link from "next/link";

export function ArchiveFooter(): React.JSX.Element {
  return <footer className="archive-footer" aria-label="서비스 정보">
    <p>음악과 개인 기록의 출처를 구분해 보여주는 근거 중심 아카이브입니다.</p>
    <nav aria-label="서비스 안내">
      <Link href="/method">추천 방식</Link>
      <Link href="/privacy">개인정보 처리</Link>
      <Link href="/terms">이용 조건</Link>
    </nav>
  </footer>;
}
