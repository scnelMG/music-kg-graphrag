import Link from "next/link";

type ArchiveNavigationProps = Readonly<{
  readonly mode: "owner" | "public" | "service";
}>;

export function ArchiveNavigation({ mode }: ArchiveNavigationProps): React.JSX.Element {
  return <nav className="archive-navigation" aria-label="주요 탐색">
    <Link className="archive-wordmark" href="/">음악 아카이브</Link>
    <div className="archive-navigation-links">
      <Link href="/#candidate-search">음악 찾기</Link>
      <Link href="/method">추천 방식</Link>
      {mode === "owner"
        ? <span aria-current="page">개인 기록</span>
        : <Link href="/owner">아카이브 관리</Link>}
    </div>
  </nav>;
}
