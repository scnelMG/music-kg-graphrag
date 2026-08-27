import Link from "next/link";

type ArchiveMastheadProps = Readonly<{
  readonly meta?: string;
  readonly mode: "owner" | "public";
}>;

export function ArchiveMasthead({ meta, mode }: ArchiveMastheadProps): React.JSX.Element {
  const owner = mode === "owner";
  return <header className="journal-header" data-owner-access={owner ? "owner" : "visitor"}>
    <div>
      <p className="section-kicker">음악 아카이브</p>
      <h1>{owner ? "나의 음악 기록" : "이 아카이브가 고른 오늘의 음악"}</h1>
      <p className="journal-intro">{owner
        ? "오늘 다시 듣고 싶은 한 장과 내가 남긴 기록을 한곳에서 봅니다."
        : "한 장씩 살펴보고, 마음에 드는 음악을 다시 열어보세요."}</p>
    </div>
    {owner ? <p className="masthead-meta">{meta ?? "소유자 공간"}</p> : <Link className="owner-access-link" href="/owner">아카이브 관리</Link>}
  </header>;
}
