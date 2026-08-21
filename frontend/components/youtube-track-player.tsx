"use client";

import { Play, YoutubeLogo } from "@phosphor-icons/react/ssr";
import { useEffect, useState } from "react";

import type { Track } from "../lib/connected-music-contract";
import type { UserConfirmedYouTubeVideo, YouTubeSearchCandidate } from "../lib/youtube-playback-contract";

type YouTubeCandidatePickerProps = Readonly<{
  readonly candidateMessage: string;
  readonly candidateState: "error" | "idle" | "loading" | "ready";
  readonly candidates: readonly YouTubeSearchCandidate[];
  readonly onLoadCandidates: () => Promise<void>;
  readonly onConfirmCandidate: (video: YouTubeSearchCandidate) => void;
  readonly selectedVideo: UserConfirmedYouTubeVideo | null;
  readonly track: Track | undefined;
}>;

function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function YouTubePlayback({ video }: Readonly<{ video: UserConfirmedYouTubeVideo }>): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0&origin=${encodeURIComponent(origin)}`;
  return <section className="youtube-playback" aria-label={`${video.title} YouTube 재생`}>
    {!isOpen
      ? <button className="youtube-play-button" type="button" onClick={() => setIsOpen(true)}><Play size={18} weight="fill" aria-hidden="true" />미리 듣기</button>
      : <iframe allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="youtube-player" referrerPolicy="strict-origin-when-cross-origin" src={embedUrl} title="YouTube 미리 듣기" />}
    <a href={videoUrl(video.videoId)} rel="noreferrer" target="_blank"><YoutubeLogo size={18} weight="fill" aria-hidden="true" />YouTube에서 열기</a>
  </section>;
}

export function YouTubeCandidatePicker({
  candidateMessage,
  candidateState,
  candidates,
  onLoadCandidates,
  onConfirmCandidate,
  selectedVideo,
  track
}: YouTubeCandidatePickerProps): React.JSX.Element | null {
  const [candidateToConfirm, setCandidateToConfirm] = useState<YouTubeSearchCandidate | null>(null);
  useEffect(() => { setCandidateToConfirm(null); }, [track?.recordingMbid]);
  if (track === undefined) return null;
  return <section className="youtube-candidate-picker" aria-labelledby="youtube-candidate-heading">
    <div><p className="section-kicker">YouTube 확인</p><h3 id="youtube-candidate-heading">{track.title}의 영상</h3></div>
    <p>검색 결과는 자동 연결하지 않습니다. 제목·채널·재생 내용을 확인한 뒤에만 이 곡에 연결하세요.</p>
    <button className="record-edit" disabled={candidateState === "loading"} type="button" onClick={() => void onLoadCandidates()}>
      {candidateState === "loading" ? "YouTube 후보를 찾는 중" : "YouTube 후보 찾기"}
    </button>
    {candidateState === "error" && <p className="notice error" role="status">{candidateMessage}</p>}
    {candidateState === "ready" && candidates.length === 0 && <p className="result-message" role="status">확인할 영상을 찾지 못했습니다. 임의의 영상을 연결하지 않습니다.</p>}
    {candidates.length > 0 && <div className="youtube-candidate-list">{candidates.map((candidate) => <article className="youtube-candidate" key={candidate.videoId}>
      <div><strong>{candidate.title}</strong><span>{candidate.channelTitle}</span></div>
      <div className="youtube-candidate-actions"><a href={videoUrl(candidate.videoId)} rel="noreferrer" target="_blank">YouTube에서 확인</a><button className="record-edit" type="button" onClick={() => setCandidateToConfirm(candidate)}>영상 확인</button></div>
    </article>)}</div>}
    {candidateToConfirm !== null && <section className="youtube-confirmation" role="alertdialog" aria-labelledby="youtube-confirmation-title">
      <strong id="youtube-confirmation-title">이 영상이 {track.position}. {track.title}과 같은 곡인가요?</strong>
      <p>{candidateToConfirm.title} · {candidateToConfirm.channelTitle}</p>
      <div><button className="record-edit" type="button" onClick={() => setCandidateToConfirm(null)}>연결하지 않기</button><button className="save-button" type="button" onClick={() => { onConfirmCandidate(candidateToConfirm); setCandidateToConfirm(null); }}>확인하고 이 곡에 연결</button></div>
    </section>}
    {selectedVideo !== null && <div className="youtube-selected" role="status"><strong>{selectedVideo.title}</strong><span>{selectedVideo.channelTitle}</span><p>선택한 영상은 저장 후에도 이 곡에만 연결됩니다.</p><YouTubePlayback video={selectedVideo} /></div>}
  </section>;
}
