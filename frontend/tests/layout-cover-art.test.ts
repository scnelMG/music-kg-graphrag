import { Children, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import RootLayout, { metadata } from "../app/layout";

describe("root layout cover-art connection", () => {
  it("publishes complete service metadata for search and social previews", () => {
    expect(metadata.applicationName).toBe("음악 아카이브");
    expect(metadata.alternates).toMatchObject({ canonical: "/" });
    expect(metadata.openGraph).toMatchObject({
      description: expect.any(String),
      locale: "ko_KR",
      siteName: "음악 아카이브",
      title: "음악 아카이브",
      type: "website",
      url: "/"
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "음악 아카이브" });
    expect(metadata.robots).toMatchObject({ follow: true, index: true });
  });

  it("preconnects directly to Cover Art Archive without routing cover bytes through this service", () => {
    const root = RootLayout({ children: null }) as ReactElement<{ children: ReactNode }>;
    const [head] = Children.toArray(root.props.children) as ReactElement<{ children: ReactNode }>[];
    const [link] = Children.toArray(head.props.children) as ReactElement[];

    expect(head.type).toBe("head");
    expect(link.props).toMatchObject({ crossOrigin: "anonymous", href: "https://coverartarchive.org", rel: "preconnect" });
  });
});
