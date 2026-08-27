"use client";

import type { RecordArchiveProps } from "./record-archive";
import type { RecordEditorProps } from "./record-editor";
import { RecordArchive } from "./record-archive";
import { RecordEditor } from "./record-editor";
import { SelectedAlbumContext } from "./selected-album-context";

type ListeningRecordSectionProps = Readonly<{
  readonly archive: RecordArchiveProps;
  readonly editor: RecordEditorProps;
  readonly recordLookupMessage: string;
}>;

export function ListeningRecordSection({ archive, editor, recordLookupMessage }: ListeningRecordSectionProps): React.JSX.Element {
  return <section className="listening-note" id="listening-record" aria-labelledby="record-heading">
    <p className="section-kicker">내 기록</p>
    <h2 id="record-heading">이 앨범을 어떻게 들었나요?</h2>
    <SelectedAlbumContext recordLookupMessage={recordLookupMessage} recordLookupState={editor.recordLookupState}
      selected={editor.selected} selectedExistingRecord={editor.selectedExistingRecord} />
    <RecordEditor {...editor} />
    <RecordArchive {...archive} />
  </section>;
}
