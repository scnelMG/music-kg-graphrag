import Link from "next/link";

export function ArchiveFooter(): React.JSX.Element {
  return <footer className="archive-footer" aria-label="서비스 정보">
    <div><strong>음악 아카이브</strong><p>실제 앨범과 개인 기록의 경계를 지키는 취향 기반 아카이브입니다.</p></div>
    <nav aria-label="서비스 안내">
      <Link href="/method">추천 방식</Link>
      <Link href="/privacy">개인정보 처리</Link>
      <Link href="/terms">이용 조건</Link>
    </nav>
  </footer>;
}
