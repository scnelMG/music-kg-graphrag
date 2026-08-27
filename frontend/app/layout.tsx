import type { Metadata } from "next";
import React, { type ReactNode } from "react";

import { publicSiteUrl } from "../lib/site-url";
import "./styles.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  applicationName: "음악 아카이브",
  description: "실제 앨범을 찾고, 개인 기록과 그래프 근거로 다음에 들을 음악을 발견하는 아카이브입니다.",
  metadataBase: publicSiteUrl(),
  openGraph: {
    description: "실제 앨범과 개인 기록을 근거로 오늘 들을 음악을 발견합니다.",
    locale: "ko_KR",
    siteName: "음악 아카이브",
    title: "음악 아카이브",
    type: "website",
    url: "/"
  },
  robots: { follow: true, index: true },
  title: { default: "음악 아카이브", template: "%s | 음악 아카이브" },
  twitter: {
    card: "summary_large_image",
    description: "실제 앨범과 개인 기록을 근거로 오늘 들을 음악을 발견합니다.",
    title: "음악 아카이브"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return <html lang="ko">
    <head>
      <link rel="preconnect" href="https://coverartarchive.org" crossOrigin="anonymous" />
    </head>
    <body>{children}</body>
  </html>;
}
