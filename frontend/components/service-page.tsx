import type { ReactNode } from "react";

import { ArchiveFooter } from "./archive-footer";
import { ArchiveNavigation } from "./archive-navigation";

type ServicePageProps = Readonly<{
  readonly children?: ReactNode;
  readonly eyebrow: string;
  readonly title: ReactNode;
}>;

export function ServicePage({ children, eyebrow, title }: ServicePageProps): React.JSX.Element {
  return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal service-page" id="main-content" tabIndex={-1}>
    <ArchiveNavigation mode="service" />
    <header className="service-page-header"><p className="section-kicker">{eyebrow}</p><h1>{title}</h1></header>
    <article className="service-page-content">{children}</article>
    <ArchiveFooter />
  </main></>;
}
