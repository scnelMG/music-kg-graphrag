import type { PublicGenre, PublicGenreState } from "./use-public-genre-explore";

const genreOptions = [
  { description: "몽환적인 기타와 겹겹의 목소리", key: "dream-pop", label: "드림 팝" },
  { description: "거친 질감과 선명한 밴드의 에너지", key: "indie-rock", label: "인디 록" },
  { description: "담백한 악기와 오래 남는 이야기", key: "folk", label: "포크" },
  { description: "선명한 리듬과 전자적인 질감", key: "electronic", label: "전자음악" }
] as const satisfies readonly Readonly<{ readonly description: string; readonly key: PublicGenre; readonly label: string }>[];

type PublicGenreCollectionProps = Readonly<{
  readonly activeGenre: PublicGenre | null;
  readonly hasDiscovery: boolean;
  readonly message: string;
  readonly onSelect: (genre: PublicGenre) => void;
  readonly state: PublicGenreState;
}>;

export function PublicGenreCollection({ activeGenre, hasDiscovery, message, onSelect, state }: PublicGenreCollectionProps): React.JSX.Element {
  const loading = state === "loading";
  return <section className="genre-collection" aria-live="polite">
    <h2>{hasDiscovery ? "취향의 결을 바꿔보세요." : "원하는 흐름부터 찾아보세요."}</h2>
    <p>네 가지 흐름에서 실제 앨범과 EP를 골라 오늘의 큐레이션으로 엽니다.</p>
    <div className="genre-collection-grid">{genreOptions.map((genre) => <button className="genre-option" type="button"
      aria-pressed={activeGenre === genre.key} disabled={loading} key={genre.key} onClick={() => onSelect(genre.key)}>
      <strong>{genre.label}</strong><span>{genre.description}</span>
    </button>)}</div>
    {message.length > 0 && <p className="genre-message" role="status">{message}</p>}
  </section>;
}
