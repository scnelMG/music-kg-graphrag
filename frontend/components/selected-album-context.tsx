import { WarningCircle } from "@phosphor-icons/react/ssr";

import type { Album, ExistingRecord, RecordLookupState } from "../lib/connected-music-contract";
import { AlbumArt } from "./album-art";

type SelectedAlbumContextProps = Readonly<{
  readonly recordLookupMessage: string;
  readonly recordLookupState: RecordLookupState;
  readonly selected: Album | null;
  readonly selectedExistingRecord: ExistingRecord | undefined;
}>;

export function SelectedAlbumContext({ recordLookupMessage, recordLookupState, selected, selectedExistingRecord }: SelectedAlbumContextProps): React.JSX.Element {
  return <div className="selected-record" aria-live="polite">
    {selected === null
      ? <p className="record-prompt">검색 결과에서 앨범 하나를 고르면 감상과 <span className="keep-together">최애곡을 남길 수 있어요.</span></p>
      : <><div className="selected-album"><AlbumArt album={selected} /><div><strong>{selected.title}</strong><span>{selected.artist}</span></div></div>
        {selectedExistingRecord !== undefined && <p className="notice" role="status">이미 Notion에 기록한 음반입니다. 저장하면 새 페이지 대신 기존 기록을 갱신합니다.</p>}
        {recordLookupState === "loading" && <p className="record-prompt" role="status">Notion에서 기존 기록을 확인하고 있습니다.</p>}
        {recordLookupState === "error" && <p className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>{recordLookupMessage}</span></p>}
      </>}
  </div>;
}
