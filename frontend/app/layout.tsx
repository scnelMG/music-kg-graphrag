import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  description: "앨범을 찾고, 듣고 싶은 이유와 근거를 함께 기록하는 음악 기록장입니다.",
  title: "내 음악 기록"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return <html lang="ko">
    <body>{children}</body>
  </html>;
}
