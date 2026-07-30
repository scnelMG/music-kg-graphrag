# Recommendation Design

Access date for all sources: 2026-07-01.

## MVP Recommendation Shape

The MVP recommendation engine should be a hybrid, evidence-first system:

1. Candidate generation from graph paths: shared artist, genre, mood, listening context, favorite track, and review links.
2. Candidate support from vector similarity over review text or album descriptions using pgvector.
3. Ranking with transparent weighted rules for the portfolio MVP.
4. Response with explicit graph paths and retrieved text snippets.
5. No-evidence fallback instead of unsupported free-form recommendations.

The music KG literature changes the recommendation design in one important way: recommendations should not be based only on genre similarity. Music-domain graphs commonly distinguish works, recordings/releases, artists/ensembles, instruments, sources/provenance, symbolic content, events, and cultural context. The MVP can stay smaller, but it should avoid a dead-end schema that cannot later represent performances, instruments, editions, aliases, and source-specific claims.

## Research Grounding

| Source | Finding | Implementation implication |
| --- | --- | --- |
| KGAT, https://arxiv.org/abs/1905.07854 | High-order KG connectivity improves recommendation and attention can help interpret neighbor importance. | Store graph paths and relation types now; learned attention can be future work. |
| KGCN, https://arxiv.org/abs/1904.12575 | Multi-hop neighborhoods help cold-start and sparse interactions. | Limit path search to 1-3 hops for MVP and record hop count in evidence. |
| RippleNet, https://arxiv.org/abs/1803.03467 | User preferences can propagate from known items over KG links. | Model UserReview as the source of user preference, not as an unstructured note only. |
| Explainable Recommendation survey, https://arxiv.org/abs/1804.11192 | Explanations can be model-intrinsic or post-hoc and should be evaluated separately from accuracy. | Evaluate explanation coverage and faithfulness, not just top-k ranking. |
| PGPR, https://arxiv.org/abs/1906.05237 | Path reasoning can produce interpretable recommendation paths. | API responses should carry paths used for ranking, not decorative explanations. |
| pgvector, https://github.com/pgvector/pgvector | Provides vector similarity search inside PostgreSQL with indexes such as HNSW/IVFFlat. | Use pgvector first to avoid operating a separate vector DB in the MVP. |
| Polifonia Ontology Network, https://link.springer.com/chapter/10.1007/978-3-031-47243-5_17 | Music KGs need interoperable modules for metadata, representation, source/provenance, and instruments. | Recommendation explanations should cite source/provenance and keep future instrument/performance expansion possible. |
| DOREMUS, https://www.researchgate.net/publication/327711083_DOREMUS_A_Graph_of_Linked_Musical_Works_17th_International_Semantic_Web_Conference_Monterey_CA_USA_October_8-12_2018_Proceedings_Part_II | Music graphs can link works to events/performances and institutional metadata. | Defer event/performance recommendation, but do not overload Album with all future music concepts. |

## Offline Evaluation Examples

- Fixture set: 30-50 logged albums with ratings, favorite tracks, moods, and review text.
- Leave-one-out check: hide one highly rated album and verify it appears in top-k from similar graph/vector evidence.
- Explanation coverage: percentage of recommendations with at least one path from user evidence to candidate.
- No-evidence rate: percentage of queries correctly returning insufficient evidence.
- Diversity sanity check: top-k should not collapse to one artist unless the query asks for that artist.
- Manual qualitative rubric: answer cites true source paths, avoids invented metadata, and marks weak evidence.

## Failure Cases To Test

- Album has MBID but no cover art.
- Album has Last.fm tags that conflict with MusicBrainz genre.
- User asks for a mood with no matching review evidence.
- Candidate is popular but has no graph/vector support from user taste.
- Korean/indie album has incomplete external metadata and needs manual override.

## Rejected Claims

- "Accurate AI recommendation": rejected unless backed by documented evaluation.
- "Personalized at scale": rejected because MVP has one user's sparse dataset.
- "LLM knows music taste": rejected; LLM can only verbalize retrieved evidence.
