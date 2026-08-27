"use client";

import { CheckCircle, WarningCircle } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";

import type { ExistingRecord, RecordState, SaveState } from "../lib/connected-music-contract";
import { AlbumArt } from "./album-art";
import { YouTubePlayback } from "./youtube-track-player";

const recordDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul"
});

export type RecordArchiveProps = Readonly<{
  readonly archiveCandidate: ExistingRecord | null;
  readonly archivedRecord: ExistingRecord | null;
  readonly canWrite: boolean;
  readonly loadingMoreRecords: boolean;
  readonly nextRecordCursor: string | null;
  readonly onArchive: (recordHandle: string) => Promise<void>;
  readonly onCancelArchive: () => void;
  readonly onLoadMoreRecords: () => Promise<void>;
  readonly onReloadRecords: () => Promise<void>;
  readonly onRequestArchive: (record: ExistingRecord) => void;
  readonly onRestore: (record: ExistingRecord) => Promise<void>;
  readonly onSelectRecord: (record: ExistingRecord) => void;
  readonly recordMessage: string;
  readonly records: readonly ExistingRecord[];
  readonly recordState: RecordState;
  readonly saveMessage: string;
  readonly saveState: SaveState;
  readonly selectedRecordVisible: boolean;
}>;

export function RecordArchive(props: RecordArchiveProps): React.JSX.Element {
  const archiveConfirmButton = useRef<HTMLButtonElement>(null);
  const archiveTrigger = useRef<HTMLButtonElement>(null);
  const restoreConfirmButton = useRef<HTMLButtonElement>(null);
  const restoreTrigger = useRef<HTMLButtonElement>(null);
  const archiveResult = useRef<HTMLParagraphElement>(null);
  const saveResult = useRef<HTMLParagraphElement>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState<ExistingRecord | null>(null);

  useEffect(() => {
    if (props.archiveCandidate !== null) archiveConfirmButton.current?.focus();
  }, [props.archiveCandidate]);
  useEffect(() => {
    if (restoreConfirmation !== null) restoreConfirmButton.current?.focus();
  }, [restoreConfirmation]);
  useEffect(() => {
    if (props.archivedRecord !== null) archiveResult.current?.focus();
  }, [props.archivedRecord]);
  useEffect(() => {
    if (props.saveState === "success" && !props.selectedRecordVisible) saveResult.current?.focus();
  }, [props.saveMessage, props.saveState, props.selectedRecordVisible]);

  function cancelArchive(): void {
    props.onCancelArchive();
    archiveTrigger.current?.focus();
  }

  function cancelRestore(): void {
    setRestoreConfirmation(null);
    restoreTrigger.current?.focus();
  }

  return <section className="record-list" aria-labelledby="record-list-heading">
    <p className="section-kicker">{props.canWrite ? "내 기록 관리" : "기록 보관함"}</p>
    <h3 id="record-list-heading">Notion에 저장된 음반</h3>
    {props.recordState === "loading" ? <div className="loading-record"><span />Notion 기록을 불러오고 있습니다.</div>
      : props.recordState === "error" ? <div className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><div><span>{props.recordMessage}</span><button className="record-edit" type="button" onClick={() => void props.onReloadRecords()}>기록 다시 불러오기</button></div></div>
        : props.records.length === 0 ? <p className="result-message">아직 저장된 기록이 없습니다.</p> : <><div className="record-list-grid">{props.records.map((record) => <article key={record.recordHandle} className="record-entry"><AlbumArt album={record} /><div className="record-entry-body"><p className="entry-eyebrow">내가 남긴 기록</p><strong>{record.albumTitle}</strong><span>{record.artistCredits.join(", ")} · 최애곡 {record.favouriteTrack}</span><span>마지막 기록 수정 {recordDateFormatter.format(new Date(record.lastEditedAt))}</span>{record.catalogSource === "LEGACY" && <span>카탈로그 연결 전 기록입니다. 음반 검색으로 새 기록을 보완할 수 있어요.</span>}{record.youtubeVideoId.length === 11 && record.youtubeRecordingMbid.length > 0 && record.youtubeVideoTitle.length > 0 && record.youtubeChannelTitle.length > 0 && <YouTubePlayback video={{ channelTitle: record.youtubeChannelTitle, recordingMbid: record.youtubeRecordingMbid, thumbnailUrl: "", title: record.youtubeVideoTitle, videoId: record.youtubeVideoId }} />}</div>{props.canWrite && <div className="record-actions">{record.catalogSource !== "LEGACY" && <button type="button" className="record-edit" onClick={() => props.onSelectRecord(record)}>기록 수정</button>}<button type="button" className="record-archive" onClick={(event) => { archiveTrigger.current = event.currentTarget; props.onRequestArchive(record); }}>Notion에서 보관</button></div>}{props.canWrite && props.archiveCandidate?.recordHandle === record.recordHandle && <section className="archive-confirmation" aria-labelledby={`archive-title-${record.recordHandle}`} aria-describedby={`archive-description-${record.recordHandle}`}><strong id={`archive-title-${record.recordHandle}`}>이 기록을 Notion에서 보관할까요?</strong><p id={`archive-description-${record.recordHandle}`}>{record.albumTitle} 기록은 목록과 추천 근거에서 숨겨집니다. 이 작업은 Notion에서 되돌릴 수 있습니다.</p><div><button type="button" className="record-edit" onClick={cancelArchive}>보관하지 않기</button><button type="button" className="record-archive" ref={archiveConfirmButton} onClick={() => void props.onArchive(record.recordHandle)}>보관하기</button></div></section>}</article>)}</div>{props.nextRecordCursor !== null && <button type="button" className="record-list-more" disabled={props.loadingMoreRecords} onClick={() => void props.onLoadMoreRecords()}>{props.loadingMoreRecords ? "다음 기록을 불러오는 중" : "다음 기록 더 보기"}</button>}</>}
    {props.saveState === "success" && !props.selectedRecordVisible && props.archivedRecord === null && <p className="notice success" ref={saveResult} role="status" tabIndex={-1}><CheckCircle size={18} weight="fill" aria-hidden="true" /><span>{props.saveMessage}</span></p>}
    {props.saveState === "error" && !props.selectedRecordVisible && <p className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>{props.saveMessage}</span></p>}
    {props.canWrite && props.archivedRecord !== null && <p className="notice success" ref={archiveResult} role="status" tabIndex={-1}><span>{props.archivedRecord.albumTitle} 기록을 보관했습니다.</span><button type="button" className="record-edit" onClick={(event) => { restoreTrigger.current = event.currentTarget; setRestoreConfirmation(props.archivedRecord); }}>보관 취소</button></p>}
    {props.canWrite && restoreConfirmation !== null && <section className="save-confirmation" aria-labelledby="restore-confirmation-title" aria-describedby="restore-confirmation-description"><strong id="restore-confirmation-title">이 기록을 Notion에 복원할까요?</strong><p id="restore-confirmation-description">{restoreConfirmation.albumTitle} 기록이 다시 개인 음악 감상 데이터베이스와 추천 근거에 포함됩니다.</p><div><button type="button" className="record-edit" onClick={cancelRestore}>복원하지 않기</button><button type="button" className="save-button" ref={restoreConfirmButton} onClick={() => { setRestoreConfirmation(null); void props.onRestore(restoreConfirmation); }}>Notion에서 복원하기</button></div></section>}
  </section>;
}
