"use client";

import { CheckCircle, FloppyDisk, WarningCircle } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";

import type { Album, Availability, ExistingRecord, RecordLookupState, SaveState, Track, TrackState } from "../lib/connected-music-contract";
import type { UserConfirmedYouTubeVideo, YouTubeSearchCandidate } from "../lib/youtube-playback-contract";
import { YouTubeCandidatePicker } from "./youtube-track-player";

export type RecordEditorProps = Readonly<{
  readonly archivedRecord: ExistingRecord | null;
  readonly availability: Availability;
  readonly canWrite: boolean;
  readonly onConfirmYoutubeCandidate: (video: YouTubeSearchCandidate) => void;
  readonly onFavouriteTrackChange: (recordingMbid: string) => void;
  readonly onLoadYoutubeCandidates: () => Promise<void>;
  readonly onOwnedChange: (value: boolean) => void;
  readonly onSave: () => Promise<void>;
  readonly onSentimentChange: (value: string) => void;
  readonly owned: boolean;
  readonly recordLookupState: RecordLookupState;
  readonly saveEnabled: boolean;
  readonly saveMessage: string;
  readonly saveState: SaveState;
  readonly selected: Album | null;
  readonly selectedExistingRecord: ExistingRecord | undefined;
  readonly selectedTrack: Track | undefined;
  readonly selectedYoutubeVideo: UserConfirmedYouTubeVideo | null;
  readonly sentiment: string;
  readonly sentiments: readonly string[];
  readonly trackMessage: string;
  readonly trackState: TrackState;
  readonly tracks: readonly Track[];
  readonly youtubeCandidateMessage: string;
  readonly youtubeCandidateState: "error" | "idle" | "loading" | "ready";
  readonly youtubeCandidates: readonly YouTubeSearchCandidate[];
}>;

export function RecordEditor(props: RecordEditorProps): React.JSX.Element | null {
  const confirmButton = useRef<HTMLButtonElement>(null);
  const saveTrigger = useRef<HTMLButtonElement>(null);
  const saveResult = useRef<HTMLParagraphElement>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  useEffect(() => {
    if (confirmationOpen) confirmButton.current?.focus();
  }, [confirmationOpen]);
  useEffect(() => {
    if (props.saveState === "success" && props.archivedRecord === null) saveResult.current?.focus();
  }, [props.archivedRecord, props.saveMessage, props.saveState]);
  useEffect(() => { setConfirmationOpen(false); }, [props.selected?.catalogId, props.selected?.catalogSource]);

  if (props.selected === null) return null;
  if (!props.canWrite) return <p className="record-prompt" role="status">기록 수정은 소유자 모드에서만 할 수 있습니다.</p>;
  if (props.recordLookupState !== "ready") return null;

  function cancelSave(): void {
    setConfirmationOpen(false);
    saveTrigger.current?.focus();
  }

  const selected = props.selected;
  return <section className="record-editor" aria-label={`${selected.title} 감상 기록`}>
    <div className="field-grid">
      <label htmlFor="sentiment">개인 감상평<select id="sentiment" value={props.sentiment} onChange={(event) => props.onSentimentChange(event.target.value)} disabled={props.availability !== "ready" || props.sentiments.length === 0}><option value="">선택해 주세요</option>{props.sentiments.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <label htmlFor="favourite-track-select">개인 최애곡<select id="favourite-track-select" value={props.selectedTrack?.recordingMbid ?? ""} onChange={(event) => props.onFavouriteTrackChange(event.target.value)} disabled={props.trackState !== "ready"}><option value="">{props.trackState === "loading" ? "수록곡을 불러오는 중" : "수록곡을 선택해 주세요"}</option>{props.tracks.map((track) => <option key={track.recordingMbid} value={track.recordingMbid}>{track.position}. {track.title}</option>)}</select></label>
    </div>
    {props.trackState === "error" || props.trackState === "empty" ? <p className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>{props.trackMessage}</span></p> : null}
    <label className="owned-field" htmlFor="owned"><input id="owned" type="checkbox" checked={props.owned} onChange={(event) => props.onOwnedChange(event.target.checked)} />앨범을 보유하고 있어요</label>
    <YouTubeCandidatePicker candidateMessage={props.youtubeCandidateMessage} candidateState={props.youtubeCandidateState}
      candidates={props.youtubeCandidates} onLoadCandidates={props.onLoadYoutubeCandidates} onConfirmCandidate={props.onConfirmYoutubeCandidate}
      selectedVideo={props.selectedYoutubeVideo} track={selected.catalogSource === "MUSICBRAINZ" ? props.selectedTrack : undefined} />
    <button type="button" className="save-button" disabled={!props.saveEnabled} onClick={(event) => { saveTrigger.current = event.currentTarget; setConfirmationOpen(true); }}><FloppyDisk size={18} weight="fill" aria-hidden="true" />{props.saveState === "saving" ? "Notion에 저장 중" : props.selectedExistingRecord === undefined ? "Notion에 기록 저장" : "Notion 기록 갱신"}</button>
    {confirmationOpen && <section className="save-confirmation" aria-labelledby="save-confirmation-title" aria-describedby="save-confirmation-description"><strong id="save-confirmation-title">이 기록을 Notion에 저장할까요?</strong><p id="save-confirmation-description">{selected.title} 기록의 감상과 최애곡이 개인 음악 감상 데이터베이스에 반영됩니다.</p><div><button type="button" className="record-edit" onClick={cancelSave}>저장하지 않기</button><button type="button" className="save-button" ref={confirmButton} onClick={() => { setConfirmationOpen(false); void props.onSave(); }}>Notion에 저장하기</button></div></section>}
    {props.saveState === "success" && <p className="notice success" ref={saveResult} role="status" tabIndex={-1}><CheckCircle size={18} weight="fill" aria-hidden="true" /><span>{props.saveMessage}</span></p>}
    {props.saveState === "error" && <p className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>{props.saveMessage}</span></p>}
  </section>;
}
