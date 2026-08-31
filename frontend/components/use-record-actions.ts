"use client";

import { useEffect, useState } from "react";

import {
  failureText,
  savedSchema,
  type Album,
  type Availability,
  type ExistingRecord,
  type RecordState,
  type RecordLookupState,
  type SaveState,
  type Track,
  type TrackState
} from "../lib/connected-music-contract";
import type { CatalogEdition } from "../lib/music-catalog-contract";
import type { UserConfirmedYouTubeVideo } from "../lib/youtube-playback-contract";
import { personalWriteConfirmationHeader } from "../lib/personal-write-intent";
import { personalWriteBff, requestBff } from "../lib/review-bff-contract";

type RecordActionsOptions = {
  readonly availability: Availability;
  readonly favouriteTrack: string;
  readonly owned: boolean;
  readonly recordState: RecordState;
  readonly recordLookupState: RecordLookupState;
  readonly records: readonly ExistingRecord[];
  readonly reloadPersonalWorkspace: () => Promise<void>;
  readonly selected: Album | null;
  readonly selectedEdition: CatalogEdition | null;
  readonly selectedTrack: Track | undefined;
  readonly sentiment: string;
  readonly trackState: TrackState;
  readonly verifiedYouTubeVideo: UserConfirmedYouTubeVideo | null;
  readonly writeAccess: boolean;
};

export function useRecordActions(options: RecordActionsOptions) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [archiveCandidate, setArchiveCandidate] = useState<ExistingRecord | null>(null);
  const [archivedRecord, setArchivedRecord] = useState<ExistingRecord | null>(null);

  useEffect(() => {
    setSaveState("idle");
    setSaveMessage("");
  }, [options.selected?.catalogId, options.selected?.catalogSource, options.selectedEdition?.releaseMbid]);

  const saveEnabled = options.writeAccess
    && options.availability === "ready"
    && options.recordState === "ready"
    && options.recordLookupState === "ready"
    && options.selected !== null
    && (options.selected.catalogSource === "ITUNES" || options.selectedEdition !== null)
    && options.trackState === "ready"
    && options.selectedTrack !== undefined
    && options.sentiment.length > 0
    && options.favouriteTrack.length > 0
    && saveState !== "saving";

  async function save(): Promise<void> {
    if (!saveEnabled || options.selected === null) return;
    if (options.selected.catalogSource === "MUSICBRAINZ" && options.selectedEdition === null) return;
    setSaveState("saving");
    setSaveMessage("");
    const outcome = await requestBff(personalWriteBff("/api/music/records", {
      headers: { [personalWriteConfirmationHeader]: "true" },
      json: {
        albumTitle: options.selected.title,
        artist: options.selected.artist,
        artistCredits: options.selected.artistCredits,
        coverUrl: options.selected.coverUrl,
        favouriteTrack: options.favouriteTrack.trim(),
        favouriteRecordingMbid: options.selectedTrack.recordingMbid,
        owned: options.owned,
        catalogId: options.selected.catalogId,
        catalogSource: options.selected.catalogSource,
        releaseGroupMbid: options.selected.catalogSource === "MUSICBRAINZ" ? options.selected.releaseGroupMbid : "",
        releaseMbid: options.selected.catalogSource === "MUSICBRAINZ" ? options.selectedEdition?.releaseMbid ?? "" : "",
        sentiment: options.sentiment,
        youtubeChannelTitle: options.selected.catalogSource === "MUSICBRAINZ" ? options.verifiedYouTubeVideo?.channelTitle ?? "" : "",
        youtubeRecordingMbid: options.selected.catalogSource === "MUSICBRAINZ" ? options.verifiedYouTubeVideo?.recordingMbid ?? "" : "",
        youtubeVideoId: options.selected.catalogSource === "MUSICBRAINZ" ? options.verifiedYouTubeVideo?.videoId ?? "" : "",
        youtubeVideoTitle: options.selected.catalogSource === "MUSICBRAINZ" ? options.verifiedYouTubeVideo?.title ?? "" : ""
      },
      method: "POST",
      throwHttpErrors: false
    }), savedSchema);
    if (outcome.kind === "failure") {
      setSaveState("error");
      setSaveMessage(failureText(outcome));
      return;
    }
    await options.reloadPersonalWorkspace();
    setSaveState("success");
    setSaveMessage(outcome.value.operation === "CREATED"
      ? "Notion 음악 감상 데이터베이스에 새 기록을 저장했습니다."
      : "Notion의 같은 음반 기록을 최신 내용으로 갱신했습니다.");
  }

  async function archiveRecord(recordHandle: string): Promise<void> {
    if (!options.writeAccess) return;
    const archived = options.records.find((record) => record.recordHandle === recordHandle) ?? null;
    const outcome = await requestBff(personalWriteBff(`/api/music/records/${encodeURIComponent(recordHandle)}`, {
      headers: { [personalWriteConfirmationHeader]: "true" }, method: "DELETE", throwHttpErrors: false
    }), savedSchema);
    if (outcome.kind === "failure") {
      setSaveState("error");
      setSaveMessage(failureText(outcome));
      return;
    }
    setSaveState("success");
    setSaveMessage("Notion 기록을 보관 처리했습니다.");
    setArchiveCandidate(null);
    setArchivedRecord(archived);
    await options.reloadPersonalWorkspace();
  }

  async function restoreRecord(record: ExistingRecord): Promise<void> {
    if (!options.writeAccess) return;
    const outcome = await requestBff(personalWriteBff(`/api/music/records/${encodeURIComponent(record.recordHandle)}/restore`, {
      headers: { [personalWriteConfirmationHeader]: "true" }, method: "POST", throwHttpErrors: false
    }), savedSchema);
    if (outcome.kind === "failure") {
      setSaveState("error");
      setSaveMessage(failureText(outcome));
      return;
    }
    setArchivedRecord(null);
    setSaveState("success");
    setSaveMessage("Notion 기록을 복원했습니다.");
    await options.reloadPersonalWorkspace();
  }

  return { archiveCandidate, archiveRecord, archivedRecord, restoreRecord, save, saveEnabled, saveMessage,
    saveState, setArchiveCandidate };
}
