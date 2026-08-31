import * as React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const nextAlbum: PublicDiscoveryAlbum = {
  ...album,
  artist: "김사월",
  coverUrl: "https://coverartarchive.org/release-group/next/front-250",
  releaseGroupMbid: "release-group-two",
  title: "헤븐"
};

describe("public editorial components", () => {
  beforeAll(() => vi.stubGlobal("React", React));
  afterAll(() => vi.unstubAllGlobals());

  it("keeps the discovery stage stable and uses concise actions", () => {
    const markup = renderToStaticMarkup(React.createElement(PublicDiscoveryDeck, {
      albums: [album, nextAlbum],
      label: "오늘의 큐레이션",
      onOpenAlbum: () => undefined
    }));

    expect(markup).toContain("discovery-stage-frame");
    expect(markup).toContain("discovery-next-preview");
    expect(markup).toContain("aria-hidden=\"true\"");
    expect(markup).toContain(">수록곡 보기</button>");
    expect(markup).not.toContain("소곡집 I 수록곡 보기");
  });

  it("presents the four genres as an editorial collection", () => {
    const markup = renderToStaticMarkup(React.createElement(PublicDiscoveryHome, {
      graphTaste: null,
      insightMessage: "",
      insightState: "ready",
      onRetryInsight: () => undefined,
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
      onRetryInsight: () => undefined,
      onOpenAlbum: () => undefined
    }));

    expect(markup).toContain("public-discovery-skeleton");
    expect(markup).toContain("aria-busy=\"true\"");
    expect(markup).toContain("오늘의 음악을 고르는 중입니다.");
  });

  it("offers an explicit recovery action when public curation fails", () => {
    const markup = renderToStaticMarkup(React.createElement(PublicDiscoveryHome, {
      graphTaste: null,
      insightMessage: "연결이 지연되고 있습니다.",
      insightState: "error",
      onRetryInsight: () => undefined,
      onOpenAlbum: () => undefined
    }));

    expect(markup).toContain("다시 불러오기");
    expect(markup).toContain("장르나 앨범 검색으로 계속 탐색");
  });

  it("centers the completed stage and preserves the short Korean mobile heading", () => {
    const deckStyles = readFileSync(resolve("app/styles/deck.css"), "utf8");
    const responsiveStyles = readFileSync(resolve("app/styles/responsive.css"), "utf8");

    expect(deckStyles).toMatch(/\.deck-finish\s*\{[^}]*justify-items:\s*center;[^}]*text-align:\s*center;/s);
    expect(deckStyles).toMatch(/\.deck-finish \.discovery-open\s*\{[^}]*justify-self:\s*center;/s);
    expect(responsiveStyles).toMatch(/\.public-discovery-heading h2\s*\{[^}]*white-space:\s*nowrap;/s);
  });
});
