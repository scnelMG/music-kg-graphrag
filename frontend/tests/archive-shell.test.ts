import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ArchiveFooter } from "../components/archive-footer";
import { ArchiveMasthead } from "../components/archive-masthead";

describe("editorial archive shell", () => {
  beforeAll(() => vi.stubGlobal("React", React));
  afterAll(() => vi.unstubAllGlobals());

  it("gives public visitors one shared navigation and a concise promise", () => {
    const markup = renderToStaticMarkup(React.createElement(ArchiveMasthead, { mode: "public" }));

    expect(markup).toContain("aria-label=\"주요 탐색\"");
    expect(markup).toContain("오늘, 다시 들을 한 장");
    expect(markup).toContain("음악 찾기");
    expect(markup).toContain("추천 방식");
    expect(markup).toContain("아카이브 관리");
    expect(markup).toContain("aria-current=\"page\"");
  });

  it("keeps exactly the three public trust destinations in the footer", () => {
    const markup = renderToStaticMarkup(React.createElement(ArchiveFooter));

    expect(markup.match(/href=/g)).toHaveLength(3);
    expect(markup).toContain("추천 방식");
    expect(markup).toContain("개인정보 처리");
    expect(markup).toContain("이용 조건");
  });
});
