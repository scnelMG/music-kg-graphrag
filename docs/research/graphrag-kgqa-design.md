# GraphRAG And KGQA Design

Access date for all sources: 2026-07-01.

## Decision

Use GraphRAG as an evidence composition pattern, not as a license for the LLM to answer from general knowledge. For this project, GraphRAG means: parse the user question, retrieve graph paths with SPARQL and review/document vectors, then generate a cited answer constrained to retrieved evidence.

## Sources And Implications

| Source | Finding | Design implication |
| --- | --- | --- |
| Lewis et al., "Retrieval-Augmented Generation", https://arxiv.org/abs/2005.11401 | RAG conditions generation on retrieved external knowledge. | Every generated recommendation answer needs retrieved evidence IDs. |
| Edge et al., "From Local to Global: Graph RAG", https://arxiv.org/abs/2404.16130 | GraphRAG builds graph structure to answer broader sensemaking questions over a corpus. | Use graph structure for taste summaries and evidence paths, but do not overbuild community summarization for a small album dataset. |
| Microsoft GraphRAG docs, https://microsoft.github.io/graphrag/ | GraphRAG extracts structured graph data from text and uses graph context at query time. | This MVP already has structured KG data; prefer deterministic RDF/SPARQL retrieval before LLM extraction. |
| Microsoft Research GraphRAG project, https://www.microsoft.com/en-us/research/project/graphrag/ | Describes GraphRAG as graph plus retrieval plus prompting/summarization. | Portfolio story should emphasize graph-backed prompt context rather than a generic chatbot. |
| KGQA dataset/generalization work, https://arxiv.org/abs/2205.06573 | KGQA systems often generalize poorly across datasets and KG versions. | Keep supported question types explicit and return unsupported/no-evidence for out-of-scope natural language. |
| LLMs with KGs for QA survey, https://arxiv.org/html/2505.20099v1 | LLM+KG QA methods vary by whether KG is retrieval source, reasoning substrate, or verifier. | MVP should use KG as retrieval/source-of-truth and simple verifier, not claim full semantic parsing. |

## Supported MVP Question Types

- "Recommend albums similar to albums I rated highly."
- "What should I listen to first for this artist?"
- "Which albums fit this mood/listening context?"
- "Why did the system recommend this album?"
- "What evidence connects my favorite tracks to this candidate?"

## Music-Domain Grounding

Music KG literature suggests that natural-language music questions often need more than album-title lookup. Polifonia's competency-question approach is a useful model: define the supported question families before building the ontology and queries. For this MVP, supported questions should be album/review/taste questions; questions about detailed scores, melodic n-grams, concerts, or historical meetups should return unsupported/deferred unless fixture data exists. Sources: https://link.springer.com/chapter/10.1007/978-3-031-47243-5_17 and https://oro.open.ac.uk/85326/1/Music_Knowledge_Graphs_Paper%20%283%29.pdf

## Required Answer Contract

Each GraphRAG answer must include:

- answer text,
- evidence paths from graph query results,
- vector hits when review text influenced the answer,
- source identifiers such as MBID/QID/page ID,
- confidence or coverage marker,
- insufficient-evidence response when retrieval returns no support.

## Rejected Options

- Free-form LLM recommendation without retrieved evidence.
- Text-to-SPARQL over arbitrary user input in the first MVP.
- Using GraphRAG to invent genres, moods, or album metadata.
