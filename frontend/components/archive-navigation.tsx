import Link from "next/link";

type ArchiveNavigationProps = Readonly<{
  readonly currentPath?: "/" | "/method" | "/owner" | "/owner/workspace" | "/privacy" | "/terms";
  readonly mode: "owner" | "public" | "service";
}>;

const serviceLabels = {
  "/method": "추천 방식",
  "/privacy": "개인정보 처리",
  "/terms": "이용 조건"
} as const;

export function ArchiveNavigation({ currentPath, mode }: ArchiveNavigationProps): React.JSX.Element {
  const serviceLabel = currentPath === "/method" || currentPath === "/privacy" || currentPath === "/terms"
    ? serviceLabels[currentPath]
    : null;
  return <nav className="archive-navigation" aria-label="주요 탐색">
    <Link aria-current={currentPath === "/" ? "page" : undefined} className="archive-wordmark" href="/">음악 아카이브</Link>
    <div className="archive-navigation-links">
      <Link href="/#candidate-search">음악 찾기</Link>
      {serviceLabel === null ? <Link href="/method">추천 방식</Link> : <span aria-current="page">{serviceLabel}</span>}
      {mode === "owner" || currentPath === "/owner" || currentPath === "/owner/workspace"
        ? <span aria-current="page">개인 기록</span>
        : <Link href="/owner">아카이브 관리</Link>}
    </div>
  </nav>;
}
