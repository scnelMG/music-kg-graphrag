# Graph Database Comparison

Access date for all sources: 2026-07-01.

## Decision

Use Ontotext GraphDB for the MVP RDF/OWL/SPARQL/SHACL surface. Keep Neo4j as a documented extension path for property-graph analytics and GraphRAG ecosystem examples. Reject Apache Jena Fuseki as the primary portfolio graph store because it is excellent as a SPARQL server but weaker as an enterprise-facing GraphDB story. Reject managed cloud graph DBs for MVP because they add account, cost, and deployment overhead.

## Comparison

| Option | Strengths | Weaknesses | MVP decision |
| --- | --- | --- | --- |
| Ontotext GraphDB | RDF and SPARQL support, semantic inferencing, RDF formats, REST/admin APIs, local developer path, enterprise positioning. Source: https://graphdb.ontotext.com/documentation/11.0/ | License/version choices must be documented; local memory settings need care. | Selected primary graph store. |
| Neo4j | Strong property graph ecosystem, Cypher, GDS algorithms, vector/GraphRAG tooling. Sources: https://neo4j.com/docs/graph-data-science/current/ and https://neo4j.com/docs/neo4j-graphrag-python/current/ | RDF/OWL/SHACL are not the native center; would shift the project away from ontology-first design. | Comparison and future extension. |
| Apache Jena Fuseki | Open SPARQL server, close to standards, lightweight local option. Source: https://jena.apache.org/documentation/fuseki2/ | Less portfolio signal for enterprise graph product operations; fewer integrated workbench/GraphRAG affordances. | Rejected as primary; useful fallback for tests. |
| Amazon Neptune | Managed graph database with RDF/SPARQL and property graph APIs, high availability, security, backups. Source: https://docs.aws.amazon.com/neptune/latest/userguide/intro.html | Requires AWS setup/cost and is too heavy for a reproducible local portfolio demo. | Deferred cloud deployment option. |

## Music KG Fit

- Music KG literature points toward RDF/ontology/SPARQL when the goal is interoperability, provenance, and cultural/musicological context. Polifonia builds a modular ontology network for music metadata, representation, provenance/source, and instruments: https://link.springer.com/chapter/10.1007/978-3-031-47243-5_17
- Music Meta aligns music metadata with Music Ontology, DOREMUS, and Wikidata, which supports this project's decision to align external identifiers instead of creating a closed model: https://archives.ismir.net/ismir2023/paper/000102.pdf
- DOREMUS shows a music-domain linked graph can connect works, events, and institution catalog data: https://www.researchgate.net/publication/327711083_DOREMUS_A_Graph_of_Linked_Musical_Works_17th_International_Semantic_Web_Conference_Monterey_CA_USA_October_8-12_2018_Proceedings_Part_II
- MusicXML KG construction work shows SPARQL-based extraction can reach symbolic music features, but that scope should be deferred for this album/review MVP: https://oro.open.ac.uk/85326/1/Music_Knowledge_Graphs_Paper%20%283%29.pdf

Exact Ontotext GraphDB music-domain production case studies were scarce in the accessible literature. The stronger evidence chain is: music-domain KG literature validates RDF/SPARQL/provenance modeling; GraphDB is selected as the RDF/SPARQL/SHACL store that best supports that modeling locally for this MVP.

## RDF/OWL/SPARQL/SHACL Fit

- RDF gives the core triple model for album, artist, track, review, mood, genre, and source entities. Source: https://www.w3.org/TR/rdf11-concepts/
- OWL should be used sparingly for class/property semantics and not as a replacement for application constraints. Source: https://www.w3.org/TR/owl2-overview/
- SHACL should validate required fields and relationship shape before GraphDB load. Source: https://www.w3.org/TR/shacl/
- SPARQL should be the evidence extraction layer for recommendation paths.

## Implementation Requirements

- Todo 5 must create RDF/OWL assets and SHACL shapes before any GraphDB load script.
- Todo 12 must load fixture TTL without manual UI steps and run at least five query files.
- API code must not expose raw SPARQL injection surfaces; later Todo 14 should use fixed templates or whitelisted parameters.
- GraphDB must be rebuildable from PostgreSQL-derived RDF, not used as the system of record.
- The graph model should include `Source` and provenance relations from the start because music KG literature treats provenance/alignment as central, not decorative.
