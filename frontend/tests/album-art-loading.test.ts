import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AlbumArt } from "../components/album-art";

describe("AlbumArt loading state", () => {
  beforeAll(() => vi.stubGlobal("React", React));
  afterAll(() => vi.unstubAllGlobals());

  it("shows an honest loading label until remote cover art has decoded", () => {
    const markup = renderToStaticMarkup(React.createElement(AlbumArt, {
      album: { coverUrl: "https://coverartarchive.org/release-group/example/front-250", title: "Kind of Blue" }
    }));

    expect(markup).toContain("불러오는 중");
    expect(markup).not.toContain("표지 불러오는 중");
    expect(markup).toContain("album-art-image is-loading");
  });

  it("shows the missing label when no cover URL is available", () => {
    const markup = renderToStaticMarkup(React.createElement(AlbumArt, {
      album: { coverUrl: "", title: "Kind of Blue" }
    }));

    expect(markup).toContain("표지 없음");
  });

  it("loads only explicitly prioritized hero artwork eagerly", () => {
    const album = { coverUrl: "https://coverartarchive.org/release-group/example/front-250", title: "Kind of Blue" };
    const previewMarkup = renderToStaticMarkup(React.createElement(AlbumArt, { album, size: "hero" }));
    const primaryMarkup = renderToStaticMarkup(React.createElement(AlbumArt, { album, priority: true, size: "hero" }));

    expect(previewMarkup).toContain('loading="lazy"');
    expect(previewMarkup).not.toContain('fetchPriority="high"');
    expect(primaryMarkup).toContain('fetchPriority="high"');
    expect(primaryMarkup).not.toContain('loading="lazy"');
  });
});
