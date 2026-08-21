"use client";

import ky from "ky";
import { useEffect, useMemo, useRef, useState } from "react";

import { failureText, type ExistingRecord, type OwnerAccess, type Track } from "../lib/connected-music-contract";
import { youtubeCandidatesSchema, type UserConfirmedYouTubeVideo, type YouTubeSearchCandidate } from "../lib/youtube-playback-contract";
import { requestBff } from "../lib/review-bff-contract";

type YouTubeCandidateState = "error" | "idle" | "loading" | "ready";

type YouTubeCandidatesOptions = Readonly<{
  readonly artist: string;
  readonly existingRecord: ExistingRecord | undefined;
  readonly ownerAccess: OwnerAccess;
  readonly selectedTrack: Track | undefined;
}>;

function storedVideo(record: ExistingRecord | undefined, track: Track | undefined): UserConfirmedYouTubeVideo | null {
  if (record === undefined || track === undefined || record.youtubeRecordingMbid !== track.recordingMbid
    || record.youtubeVideoId.length !== 11 || record.youtubeVideoTitle.length === 0 || record.youtubeChannelTitle.length === 0) {
    return null;
  }
  return {
    channelTitle: record.youtubeChannelTitle,
    recordingMbid: record.youtubeRecordingMbid,
    thumbnailUrl: "",
    title: record.youtubeVideoTitle,
    videoId: record.youtubeVideoId
  };
}

export function useYouTubeCandidates(options: YouTubeCandidatesOptions) {
  const track = options.selectedTrack;
  const [candidates, setCandidates] = useState<readonly YouTubeSearchCandidate[]>([]);
  const [candidateState, setCandidateState] = useState<YouTubeCandidateState>("idle");
  const [candidateMessage, setCandidateMessage] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<UserConfirmedYouTubeVideo | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setCandidates([]);
    setCandidateState("idle");
    setCandidateMessage("");
    setSelectedVideo(storedVideo(options.existingRecord, track));
  }, [options.existingRecord, track]);

  async function loadCandidates(): Promise<void> {
    if (options.ownerAccess !== "owner" || track === undefined) return;
    const requestGeneration = generation.current + 1;
    generation.current = requestGeneration;
    setCandidateState("loading");
    setCandidateMessage("");
    const outcome = await requestBff(ky.get("/api/music/youtube/candidates", {
      searchParams: { artist: options.artist, recordingMbid: track.recordingMbid, title: track.title },
      throwHttpErrors: false
    }), youtubeCandidatesSchema);
    if (requestGeneration !== generation.current) return;
    if (outcome.kind === "failure") {
      setCandidateState("error");
      setCandidateMessage(failureText(outcome));
      return;
    }
    setCandidates(outcome.value.candidates);
    setCandidateState("ready");
  }

  function confirmCandidate(candidate: YouTubeSearchCandidate): void {
    if (track === undefined) return;
    setSelectedVideo({ ...candidate, recordingMbid: track.recordingMbid });
  }

  return { candidateMessage, candidateState, candidates, confirmCandidate, loadCandidates, selectedVideo, track };
}
