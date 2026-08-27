import { ArchiveNavigation } from "./archive-navigation";

type ArchiveMastheadProps = Readonly<{
  readonly meta?: string;
  readonly mode: "owner" | "public";
}>;

export function ArchiveMasthead({ meta, mode }: ArchiveMastheadProps): React.JSX.Element {
  const owner = mode === "owner";
  return <header className="journal-header" data-owner-access={owner ? "owner" : "visitor"}>
    <ArchiveNavigation currentPath={owner ? "/owner/workspace" : "/"} mode={owner ? "owner" : "public"} />
    <div className="masthead-composition">
      <div>
        <p className="section-kicker">{owner ? "개인 음악 기록" : "오늘의 큐레이션"}</p>
        <h1>{owner ? <span className="keep-phrase">나의 음악 기록</span> : "오늘, 다시 들을 한 장"}</h1>
        <p className="journal-intro">{owner
          ? "최근에 남긴 기록과 지금 다시 들을 앨범을 한곳에서 봅니다."
          : <>아카이브의 취향을 따라 한 장씩 듣고, <span className="keep-phrase">마음에 드는 음악</span>을 다시 열어보세요.</>}</p>
      </div>
      {owner && <p className="masthead-meta">{meta ?? "소유자 공간"}</p>}
    </div>
  </header>;
}
