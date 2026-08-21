"use client";

import ky from "ky";
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
  type TrackState
} from "../lib/connected-music-contract";
import type { CatalogEdition } from "../lib/music-catalog-contract";
import type { UserConfirmedYouTubeVideo } from "../lib/youtube-playback-contract";
import { personalWriteConfirmationHeader } from "../lib/personal-write-intent";
import { requestBff } from "../lib/review-bff-contract";

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
  }, [options.selected?.releaseGroupMbid, options.selectedEdition?.releaseMbid]);

  const saveEnabled = options.writeAccess
    && options.availability === "ready"
    && options.recordState === "ready"
    && options.recordLookupState === "ready"
    && options.selected !== null
    && options.selectedEdition !== null
    && options.trackState === "ready"
    && options.sentiment.length > 0
    && options.favouriteTrack.length > 0
    && saveState !== "saving";

  async function save(): Promise<void> {
    if (!saveEnabled || options.selected === null || options.selectedEdition === null) return;
    setSaveState("saving");
    setSaveMessage("");
    const outcome = await requestBff(ky.post("/api/music/records", {
      headers: { [personalWriteConfirmationHeader]: "true" },
      json: {
        albumTitle: options.selected.title,
        artist: options.selected.artist,
        artistCredits: options.selected.artistCredits,
        coverUrl: options.selected.coverUrl,
        favouriteTrack: options.favouriteTrack.trim(),
        owned: options.owned,
        releaseGroupMbid: options.selected.releaseGroupMbid,
        releaseMbid: options.selectedEdition.releaseMbid,
        sentiment: options.sentiment,
        youtubeChannelTitle: options.verifiedYouTubeVideo?.channelTitle ?? "",
        youtubeRecordingMbid: options.verifiedYouTubeVideo?.recordingMbid ?? "",
        youtubeVideoId: options.verifiedYouTubeVideo?.videoId ?? "",
        youtubeVideoTitle: options.verifiedYouTubeVideo?.title ?? ""
      },
      throwHttpErrors: false
    }), savedSchema);
    if (outcome.kind === "failure") {
      setSaveState("error");
      setSaveMessage(failureText(outcome));
      return;
    }
    setSaveState("success");
    setSaveMessage(outcome.value.operation === "CREATED"
      ? "Notion 음악 감상 데이터베이스에 새 기록을 저장했습니다."
      : "Notion의 같은 음반 기록을 최신 내용으로 갱신했습니다.");
    await options.reloadPersonalWorkspace();
  }

  async function archiveRecord(recordHandle: string): Promise<void> {
    if (!options.writeAccess) return;
    const archived = options.records.find((record) => record.recordHandle === recordHandle) ?? null;
    const outcome = await requestBff(ky.delete(`/api/music/records/${encodeURIComponent(recordHandle)}`, {
      headers: { [personalWriteConfirmationHeader]: "true" }, throwHttpErrors: false
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
    const outcome = await requestBff(ky.post(`/api/music/records/${encodeURIComponent(record.recordHandle)}/restore`, {
      headers: { [personalWriteConfirmationHeader]: "true" }, throwHttpErrors: false
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
