"use client";

import { CheckCircle, FloppyDisk, WarningCircle } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";

import { AlbumArt } from "./album-art";
import type { Album, Availability, ExistingRecord, RecordState, SaveState, Track, TrackState } from "./connected-music-desk";

type ListeningRecordSectionProps = Readonly<{
  readonly archiveCandidate: ExistingRecord | null;
  readonly archivedRecord: ExistingRecord | null;
  readonly availability: Availability;
  readonly favouriteTrack: string;
  readonly loadingMoreRecords: boolean;
  readonly onArchive: (recordHandle: string) => Promise<void>;
  readonly onCancelArchive: () => void;
  readonly onFavouriteTrackChange: (value: string) => void;
  readonly onLoadMoreRecords: () => Promise<void>;
  readonly onOwnedChange: (value: boolean) => void;
  readonly onReloadRecords: () => Promise<void>;
  readonly onRequestArchive: (record: ExistingRecord) => void;
  readonly onRestore: (record: ExistingRecord) => Promise<void>;
  readonly onSave: () => Promise<void>;
  readonly onSentimentChange: (value: string) => void;
  readonly onSelectRecord: (record: ExistingRecord) => void;
  readonly owned: boolean;
  readonly nextRecordCursor: string | null;
  readonly recordMessage: string;
  readonly records: readonly ExistingRecord[];
  readonly recordState: RecordState;
  readonly saveEnabled: boolean;
  readonly saveMessage: string;
  readonly saveState: SaveState;
  readonly selected: Album | null;
  readonly selectedExistingRecord: ExistingRecord | undefined;
  readonly sentiment: string;
  readonly sentiments: readonly string[];
  readonly trackMessage: string;
  readonly trackState: TrackState;
  readonly tracks: readonly Track[];
}>;

export function ListeningRecordSection({
  archiveCandidate,
  archivedRecord,
  availability,
  favouriteTrack,
  loadingMoreRecords,
  onArchive,
  onCancelArchive,
  onFavouriteTrackChange,
  onLoadMoreRecords,
  onOwnedChange,
  onReloadRecords,
  onRequestArchive,
  onRestore,
  onSave,
  onSentimentChange,
  onSelectRecord,
  owned,
  nextRecordCursor,
  recordMessage,
  records,
  recordState,
  saveEnabled,
  saveMessage,
  saveState,
  selected,
  selectedExistingRecord,
  sentiment,
  sentiments,
  trackMessage,
  trackState,
  tracks
}: ListeningRecordSectionProps): React.JSX.Element {
  const archiveConfirmButton = useRef<HTMLButtonElement>(null);
  const archiveTrigger = useRef<HTMLButtonElement>(null);
  const restoreConfirmButton = useRef<HTMLButtonElement>(null);
  const restoreTrigger = useRef<HTMLButtonElement>(null);
  const saveConfirmButton = useRef<HTMLButtonElement>(null);
  const saveTrigger = useRef<HTMLButtonElement>(null);
  const saveResult = useRef<HTMLParagraphElement>(null);
  const archiveResult = useRef<HTMLParagraphElement>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState<ExistingRecord | null>(null);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);

  useEffect(() => {
    if (archiveCandidate !== null) archiveConfirmButton.current?.focus();
  }, [archiveCandidate]);

  useEffect(() => {
    if (restoreConfirmation !== null) restoreConfirmButton.current?.focus();
  }, [restoreConfirmation]);

  useEffect(() => {
    if (saveConfirmationOpen) saveConfirmButton.current?.focus();
  }, [saveConfirmationOpen]);

  useEffect(() => {
    if (saveState === "success" && archivedRecord === null) saveResult.current?.focus();
  }, [archivedRecord, saveMessage, saveState]);

  useEffect(() => {
    if (archivedRecord !== null) archiveResult.current?.focus();
  }, [archivedRecord]);

  useEffect(() => { setSaveConfirmationOpen(false); }, [selected?.releaseGroupMbid]);

  function cancelArchive(): void {
    onCancelArchive();
    archiveTrigger.current?.focus();
  }

  function cancelRestore(): void {
    setRestoreConfirmation(null);
    restoreTrigger.current?.focus();
  }

  function cancelSave(): void {
    setSaveConfirmationOpen(false);
    saveTrigger.current?.focus();
  }

  return <section className="listening-note" id="listening-record" aria-labelledby="record-heading">
    <p className="section-kicker">내 기록</p><h2 id="record-heading">이 앨범을 어떻게 들었나요?</h2>
    <div className="selected-record" aria-live="polite">
      {selected === null
        ? <p className="record-prompt">검색 결과에서 앨범 하나를 고르면 감상과 수록곡을 입력할 수 있습니다.</p>
        : <><div className="selected-album"><AlbumArt album={selected} /><div><strong>{selected.title}</strong><span>{selected.artist}</span></div></div>
          {selectedExistingRecord !== undefined && <p className="notice" role="status">이미 Notion에 기록한 음반입니다. 저장하면 새 페이지 대신 기존 기록을 갱신합니다.</p>}
        </>}
    </div>
    {selected !== null && <section className="record-editor" aria-label={`${selected.title} 감상 기록`}>
      <div className="field-grid">
        <label htmlFor="sentiment">개인 감상평<select id="sentiment" value={sentiment} onChange={(event) => onSentimentChange(event.target.value)} disabled={availability !== "ready" || sentiments.length === 0}><option value="">선택해 주세요</option>{sentiments.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label htmlFor="favourite-track-select">개인 최애곡<select id="favourite-track-select" value={favouriteTrack} onChange={(event) => onFavouriteTrackChange(event.target.value)} disabled={trackState !== "ready"}><option value="">{trackState === "loading" ? "수록곡을 불러오는 중" : "수록곡을 선택해 주세요"}</option>{tracks.map((track) => <option key={track.recordingMbid} value={track.title}>{track.position}. {track.title}</option>)}</select></label>
      </div>
      {trackState === "error" || trackState === "empty" ? <p className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>{trackMessage}</span></p> : null}
      <label className="owned-field" htmlFor="owned"><input id="owned" type="checkbox" checked={owned} onChange={(event) => onOwnedChange(event.target.checked)} />앨범을 보유하고 있어요</label>
      <button type="button" className="save-button" disabled={!saveEnabled} onClick={(event) => { saveTrigger.current = event.currentTarget; setSaveConfirmationOpen(true); }}><FloppyDisk size={18} weight="fill" aria-hidden="true" />{saveState === "saving" ? "Notion에 저장 중" : selectedExistingRecord === undefined ? "Notion에 기록 저장" : "Notion 기록 갱신"}</button>
      {saveConfirmationOpen && <section className="save-confirmation" role="alertdialog" aria-labelledby="save-confirmation-title" aria-describedby="save-confirmation-description"><strong id="save-confirmation-title">이 기록을 Notion에 저장할까요?</strong><p id="save-confirmation-description">{selected.title}의 감상과 최애곡이 개인 음악 감상 데이터베이스에 반영됩니다.</p><div><button type="button" className="record-edit" onClick={cancelSave}>저장하지 않기</button><button type="button" className="save-button" ref={saveConfirmButton} onClick={() => { setSaveConfirmationOpen(false); void onSave(); }}>Notion에 저장하기</button></div></section>}
      {saveState === "success" && <p className="notice success" ref={saveResult} role="status" tabIndex={-1}><CheckCircle size={18} weight="fill" aria-hidden="true" /><span>{saveMessage}</span></p>}
      {saveState === "error" && <p className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>{saveMessage}</span></p>}
    </section>}
    <section className="record-list" aria-labelledby="record-list-heading">
      <p className="section-kicker">내 기록 관리</p>
      <h3 id="record-list-heading">Notion에 저장된 음반</h3>
      {recordState === "loading" ? <div className="loading-record"><span />Notion 기록을 불러오고 있습니다.</div>
        : recordState === "error" ? <div className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><div><span>{recordMessage}</span><button className="record-edit" type="button" onClick={() => void onReloadRecords()}>기록 다시 불러오기</button></div></div>
          : records.length === 0 ? <p className="result-message">아직 저장된 기록이 없습니다.</p> : <><div className="record-list-grid">{records.map((record) => <article key={record.recordHandle} className="record-entry"><AlbumArt album={record} /><div className="record-entry-body"><p className="entry-eyebrow">내가 남긴 기록</p><strong>{record.albumTitle}</strong><span>{record.artistCredits.join(", ")} · 최애곡 {record.favouriteTrack}</span><span>마지막 기록 수정 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(record.lastEditedAt))}</span></div><div className="record-actions"><button type="button" className="record-edit" onClick={() => onSelectRecord(record)}>기록 수정</button><button type="button" className="record-archive" onClick={(event) => { archiveTrigger.current = event.currentTarget; onRequestArchive(record); }}>Notion에서 보관</button></div>{archiveCandidate?.recordHandle === record.recordHandle && <section className="archive-confirmation" role="alertdialog" aria-labelledby={`archive-title-${record.recordHandle}`} aria-describedby={`archive-description-${record.recordHandle}`}><strong id={`archive-title-${record.recordHandle}`}>이 기록을 Notion에서 보관할까요?</strong><p id={`archive-description-${record.recordHandle}`}>{record.albumTitle}은 목록과 추천 근거에서 숨겨집니다. 이 작업은 Notion에서 되돌릴 수 있습니다.</p><div><button type="button" className="record-edit" onClick={cancelArchive}>보관하지 않기</button><button type="button" className="record-archive" ref={archiveConfirmButton} onClick={() => void onArchive(record.recordHandle)}>보관하기</button></div></section>}</article>)}</div>{nextRecordCursor !== null && <button type="button" className="record-list-more" disabled={loadingMoreRecords} onClick={() => void onLoadMoreRecords()}>{loadingMoreRecords ? "다음 기록을 불러오는 중" : "다음 기록 더 보기"}</button>}</>}
      {saveState === "success" && archivedRecord === null && selected === null && <p className="notice success" ref={saveResult} role="status" tabIndex={-1}><CheckCircle size={18} weight="fill" aria-hidden="true" /><span>{saveMessage}</span></p>}
      {archivedRecord !== null && <p className="notice success" ref={archiveResult} role="status" tabIndex={-1}><span>{archivedRecord.albumTitle} 기록을 보관했습니다.</span><button type="button" className="record-edit" onClick={(event) => { restoreTrigger.current = event.currentTarget; setRestoreConfirmation(archivedRecord); }}>보관 취소</button></p>}
      {restoreConfirmation !== null && <section className="save-confirmation" role="alertdialog" aria-labelledby="restore-confirmation-title" aria-describedby="restore-confirmation-description"><strong id="restore-confirmation-title">이 기록을 Notion에 복원할까요?</strong><p id="restore-confirmation-description">{restoreConfirmation.albumTitle}이 다시 개인 음악 감상 데이터베이스와 추천 근거에 포함됩니다.</p><div><button type="button" className="record-edit" onClick={cancelRestore}>복원하지 않기</button><button type="button" className="save-button" ref={restoreConfirmButton} onClick={() => { setRestoreConfirmation(null); void onRestore(restoreConfirmation); }}>Notion에서 복원하기</button></div></section>}
    </section>
  </section>;
}
