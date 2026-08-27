export function PublicMusicDeskFallback(): React.JSX.Element {
  return <><div className="connection-status" role="status">연결 상태: <strong>공개 앨범 검색 준비 중</strong></div>
    <section className="public-discovery-home" aria-label="공개 음악 탐색"><section className="public-explore-fallback"><h2>음악 탐색을 준비하고 있습니다.</h2><p>잠시 후 장르와 앨범을 찾아볼 수 있습니다.</p><div className="genre-actions" aria-hidden="true"><button type="button" disabled>드림 팝</button><button type="button" disabled>인디 록</button><button type="button" disabled>포크</button><button type="button" disabled>전자음악</button></div></section></section>
    <section className="journal-workspace public-workspace" aria-busy="true" aria-label="공개 음악 탐색 작업공간"><section className="journal-page" aria-labelledby="search-heading-fallback"><section className="search-section"><h2 id="search-heading-fallback">듣고 싶은 앨범을 찾아보세요.</h2><p className="instruction">앨범명이나 가수명으로 앨범과 수록곡을 찾습니다.</p><div className="search-row"><label htmlFor="album-search-fallback">앨범명 또는 가수</label><input id="album-search-fallback" placeholder="예: Kind of Blue 또는 김사월" disabled /><button type="button" disabled>음반 찾기</button></div></section></section></section>
  </>;
}
