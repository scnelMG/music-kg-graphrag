import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RootLayout, { metadata } from "../app/layout";

function scriptSources(node: ReactNode): readonly string[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ readonly children?: ReactNode; readonly src?: string }>(child)) return [];
    const currentSource = child.props.src === undefined ? [] : [child.props.src];
    return [...currentSource, ...scriptSources(child.props.children)];
  });
}

function developmentScriptSources(): readonly string[] {
  const root = RootLayout({ children: null });
  if (!isValidElement<{ readonly children: ReactNode }>(root)) return [];
  const head = Children.toArray(root.props.children).find((child) => isValidElement(child) && child.type === "head");
  if (!isValidElement<{ readonly children: ReactNode }>(head)) return [];
  return scriptSources(head.props.children);
}

describe("root layout cover-art connection", () => {
  afterEach(() => vi.unstubAllEnvs());

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

  it("does not inject third-party inspection scripts into application pages", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(developmentScriptSources()).toEqual([]);

    vi.stubEnv("NODE_ENV", "production");
    expect(developmentScriptSources()).toEqual([]);
  });
});
