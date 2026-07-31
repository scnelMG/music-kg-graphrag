import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  description: "Fixture-only evidence review desk for the music KG demo.",
  title: "음악 지식 그래프 | 검토 데스크"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return <html lang="ko"><body>{children}</body></html>;
}
