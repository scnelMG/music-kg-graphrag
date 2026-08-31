import { ArchiveFooter } from "../components/archive-footer";
import { ArchiveMasthead } from "../components/archive-masthead";
import { FontLoader } from "../components/font-loader";
import { PublicMusicDeskLoader } from "../components/public-music-desk-loader";

export default function Page(): React.JSX.Element {
  return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal" id="main-content" tabIndex={-1}>
    <ArchiveMasthead mode="public" />
    <PublicMusicDeskLoader />
    <ArchiveFooter />
  </main><FontLoader /></>;
}
