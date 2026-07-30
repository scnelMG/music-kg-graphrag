# Related Work: Music Knowledge Graphs And Recommendation

Access date for all sources: 2026-07-01.

## Design Position

This MVP should not start with a neural recommender. It should first build a small, auditable music knowledge graph and retrieve explicit graph paths. Music-domain KG literature supports this direction more directly than generic recommender papers: music KGs are commonly built with RDF, ontology modules, SPARQL queries, provenance, competency questions, and links across metadata, works, performances, symbolic content, and cultural context.

## Music KG And Semantic-Web Literature

| Source | What it contributes | Design implication |
| --- | --- | --- |
| Polifonia Ontology Network, https://link.springer.com/chapter/10.1007/978-3-031-47243-5_17 | Builds a semantic backbone for musical heritage with modules for Music Meta, Representation, Source/provenance, and Instrument; emphasizes competency questions and interoperability. | Todo 5 should keep ontology modular: metadata/review/source/provenance first, symbolic-score detail deferred. Use competency questions to drive SPARQL query design. |
| Music Meta Ontology, ISMIR 2023, https://archives.ismir.net/ismir2023/paper/000102.pdf | Aligns music metadata to Music Ontology, DOREMUS, and Wikidata, and models artists, ensembles, genres, influences, collaborations, activity periods, and provenance. | Reuse the idea of alignment rather than inventing isolated classes; include aliases, source provenance, and artist/ensemble distinctions where needed. |
| DOREMUS knowledge graph, https://www.researchgate.net/publication/327711083_DOREMUS_A_Graph_of_Linked_Musical_Works_17th_International_Semantic_Web_Conference_Monterey_CA_USA_October_8-12_2018_Proceedings_Part_II | Presents a linked graph of musical works and events such as performances, filling a gap between library description and music metadata. | Keep album/review/recommendation scope for MVP, but document `Performance`/event modeling as a later extension instead of over-modeling now. |
| Knowledge Graph Construction from MusicXML with SPARQL Anything, https://oro.open.ac.uk/85326/1/Music_Knowledge_Graphs_Paper%20%283%29.pdf | Shows SPARQL can construct music KGs from symbolic MusicXML, extract melodic information and n-grams, and populate music-note ontologies. | SPARQL is viable for music feature extraction, but symbolic-score KG is out of MVP. Keep the pipeline extensible for future MusicXML/score ingestion. |
| MusicBrainz-to-RDF/LinkedBrainz discussion in KG identification work, https://www.jaypujara.org/pubs/2013/pujara%3Aiswc13/pujara_iswc13.pdf | Discusses mapping MusicBrainz relational data into RDF/Music Ontology via LinkedBrainz/D2RQ. | MusicBrainz identity plus RDF lifting is an established pattern; generate RDF from normalized relational data, not raw API JSON. |
| Polifonia KG development guidelines, https://polifonia-project.github.io/ecosystem/polifonia-project/rulebook/ontology-KG-development-documentation-guidelines.html | Requires KG documentation, repository metadata, and SPARQL endpoint information for ontology/KG assets. | Later docs should include ontology scope, URI strategy, endpoint/load instructions, and query examples. |

## KG Recommender Sources And Implications

| Source | What it contributes | Design implication |
| --- | --- | --- |
| Wang et al., "KGAT: Knowledge Graph Attention Network for Recommendation", KDD 2019, https://arxiv.org/abs/1905.07854 | Models high-order user-item-attribute connectivity and uses attention to weight neighbors. | Defer KGAT-style training; represent high-order paths now and store path evidence so a learned ranker can be added later. |
| Wang et al., "Knowledge Graph Convolutional Networks for Recommender Systems", WWW 2019, https://arxiv.org/abs/1904.12575 | Uses multi-hop neighbor sampling to address sparsity and cold start, with experiments including music recommendation. | Keep entity neighborhoods small and typed; MVP queries should limit hops and expose why a neighbor was used. |
| Wang et al., "RippleNet", CIKM 2018, https://arxiv.org/abs/1803.03467 | Propagates user preference through KG links from a user's historical interactions. | UserReview nodes should connect to albums, tracks, moods, and genres so preference propagation has explicit anchors. |
| Wang et al., "Knowledge-aware Path Recurrent Network", https://arxiv.org/abs/1811.04540 | Uses paths as recommendation explanations and reports music-dataset experiments. | Recommendation responses must include relation paths, not only scores. |
| Xian et al., "Policy-Guided Path Reasoning", https://arxiv.org/abs/1906.05237 | Couples recommendation with interpretable multi-hop path search. | Use simple SPARQL path templates first; do not claim causal explanations unless the path is actually used in ranking. |
| Guo et al., "A Survey on Knowledge Graph-Based Recommender Systems", https://arxiv.org/abs/2003.00911 | Summarizes KG recommendation families and notes both accuracy and explanation benefits. | Document this MVP as rule/query/evidence grounded, not as a trained KG recommender. |

## Concrete Requirements For Later Todos

- Ontology must model UserReview, rating label, favorite track, mood, genre, listening context, and external source IDs.
- GraphRAG and recommendation APIs must return evidence paths such as `UserReview -> targetAlbum -> hasGenre -> Album`.
- Offline evaluation must include explanation coverage and no-evidence behavior, not only ranking metrics.
- Neural KG ranking is rejected for MVP because the project will not have enough user interactions for meaningful training.
- Symbolic-score and musicological feature KGs are deferred; the MVP models album listening records and metadata, but the ontology should leave a future extension path for performances, instruments, MusicXML, and melodic features.

## Rejected Options

- Collaborative filtering first: rejected because one user's album records are sparse and cannot support reliable neighborhood learning.
- End-to-end neural KG recommender first: rejected because it would obscure the portfolio's strongest story: auditable backend, ontology, SPARQL, SHACL, and grounded GraphRAG.
- Popularity-only recommendations: rejected because they do not use the user's personal review evidence.
