import type { ReactNode } from "react";

import { ArchiveFooter } from "./archive-footer";
import { ArchiveNavigation } from "./archive-navigation";

type ServicePageProps = Readonly<{
  readonly children: ReactNode;
  readonly contents?: readonly Readonly<{ id: string; label: string }>[];
  readonly currentPath?: "/method" | "/privacy" | "/terms";
  readonly eyebrow: string;
  readonly title: ReactNode;
}>;

export function ServicePage({ children, contents = [], currentPath, eyebrow, title }: ServicePageProps): React.JSX.Element {
  return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal service-page" id="main-content" tabIndex={-1}>
    <ArchiveNavigation currentPath={currentPath} mode="service" />
    <header className="service-page-header"><p className="section-kicker">{eyebrow}</p><h1>{title}</h1></header>
    {contents.length > 0 && <nav className="service-contents" aria-label="이 페이지의 내용"><span>이 페이지에서</span><ol>{contents.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}</ol></nav>}
    <article className="service-page-content">{children}</article>
    <ArchiveFooter />
  </main></>;
}
