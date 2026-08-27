import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PublicDiscoveryDeck, type PublicDiscoveryAlbum } from "../components/public-discovery-deck";
import { PublicDiscoveryHome } from "../components/public-discovery-home";

const album: PublicDiscoveryAlbum = {
  artist: "잔나비",
  artistCredits: ["잔나비"],
  catalogId: "release-group-one",
  catalogSource: "MUSICBRAINZ",
  catalogUrl: "",
  coverUrl: "",
  firstReleaseDate: "2024-01-01",
  primaryType: "Album",
  publicCurationReason: "shared-tag",
  releaseGroupMbid: "release-group-one",
  searchScore: 1,
  sharedMusicBrainzTag: "indie rock",
  title: "소곡집 I"
};

describe("public editorial components", () => {
  beforeAll(() => vi.stubGlobal("React", React));
  afterAll(() => vi.unstubAllGlobals());

  it("keeps the discovery stage stable and uses concise actions", () => {
    const markup = renderToStaticMarkup(React.createElement(PublicDiscoveryDeck, {
      albums: [album],
      label: "오늘의 큐레이션",
      onOpenAlbum: () => undefined
    }));

    expect(markup).toContain("discovery-stage-frame");
    expect(markup).toContain(">수록곡 보기</button>");
    expect(markup).not.toContain("소곡집 I 수록곡 보기");
  });

  it("presents the four genres as an editorial collection", () => {
    const markup = renderToStaticMarkup(React.createElement(PublicDiscoveryHome, {
      graphTaste: null,
      insightMessage: "",
      insightState: "ready",
      onOpenAlbum: () => undefined
    }));

    expect(markup).toContain("genre-collection");
    expect(markup).toContain("몽환적인 기타와 겹겹의 목소리");
    expect(markup).toContain("선명한 리듬과 전자적인 질감");
  });

  it("reserves the full discovery stage while recommendations load", () => {
    const markup = renderToStaticMarkup(React.createElement(PublicDiscoveryHome, {
      graphTaste: null,
      insightMessage: "",
      insightState: "loading",
      onOpenAlbum: () => undefined
    }));

    expect(markup).toContain("public-discovery-skeleton");
    expect(markup).toContain("aria-busy=\"true\"");
    expect(markup).toContain("오늘의 음악을 고르는 중입니다.");
  });
});
