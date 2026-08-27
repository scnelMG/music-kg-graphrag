import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import OwnerPage from "../app/owner/page";
import { ServicePage } from "../components/service-page";

describe("owner and service editorial shell", () => {
  beforeAll(() => vi.stubGlobal("React", React));
  afterAll(() => vi.unstubAllGlobals());

  it("opens owner access with the shared navigation and complete Korean heading", () => {
    const markup = renderToStaticMarkup(React.createElement(OwnerPage));
    const textContent = markup.replace(/<[^>]+>/g, "");

    expect(markup).toContain("aria-label=\"주요 탐색\"");
    expect(textContent).toContain("개인 음악 기록 열기");
    expect(markup).not.toContain("나의 Notion 기록을 엽니다");
  });

  it("keeps trust articles inside the same service navigation", () => {
    const markup = renderToStaticMarkup(React.createElement(ServicePage, {
      children: React.createElement("section", { id: "evidence" }, React.createElement("h2", null, "근거")),
      contents: [{ id: "evidence", label: "근거" }],
      currentPath: "/method",
      eyebrow: "추천 방식",
      title: "추천이 만들어지는 방식"
    }));

    expect(markup).toContain("aria-label=\"주요 탐색\"");
    expect(markup).toContain("service-page-content");
    expect(markup).toContain("aria-label=\"이 페이지의 내용\"");
    expect(markup).toContain("aria-current=\"page\"");
    expect(markup).toContain("추천이 만들어지는 방식");
  });
});
