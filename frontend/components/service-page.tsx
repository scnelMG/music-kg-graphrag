import type { ReactNode } from "react";
import Link from "next/link";

import { ArchiveFooter } from "./archive-footer";

type ServicePageProps = Readonly<{
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
}>;

export function ServicePage({ children, eyebrow, title }: ServicePageProps): React.JSX.Element {
  return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal service-page" id="main-content" tabIndex={-1}>
    <header className="service-page-header"><Link href="/">음악 아카이브</Link><p className="section-kicker">{eyebrow}</p><h1>{title}</h1></header>
    <article className="service-page-content">{children}</article>
    <ArchiveFooter />
  </main></>;
}
