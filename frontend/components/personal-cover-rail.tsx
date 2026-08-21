"use client";

import { ArrowUpRight } from "@phosphor-icons/react/ssr";

import { AlbumArt } from "./album-art";
import type { ExistingRecord } from "../lib/connected-music-contract";

type PersonalCoverRailProps = Readonly<{
  readonly onSelectRecord: (record: ExistingRecord) => void;
  readonly records: readonly ExistingRecord[];
}>;

export function PersonalCoverRail({ onSelectRecord, records }: PersonalCoverRailProps): React.JSX.Element | null {
  if (records.length === 0) return null;

  return <section className="personal-cover-rail" data-testid="personal-cover-rail" aria-labelledby="recent-records-heading">
    <div className="cover-rail-heading">
      <div><p className="section-kicker">최근 기록</p><h2 id="recent-records-heading">내가 들은 앨범</h2></div>
      <span>{records.length}개 기록</span>
    </div>
    <div className={`cover-rail-scroller${records.length === 1 ? " is-single" : ""}`} role="list">
      {records.slice(0, 7).map((record) => <div key={record.recordHandle} role="listitem"><button className={`cover-rail-item${records.length === 1 ? " is-single" : ""}`} type="button" onClick={() => onSelectRecord(record)} aria-label={`${record.albumTitle} 기록 수정`}>
        <AlbumArt album={record} size="cover-rail" />
        <span className="cover-rail-copy"><strong>{record.albumTitle}</strong><small>{record.artistCredits.join(", ")}</small></span>
        <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
      </button></div>)}
    </div>
  </section>;
}
