from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Protocol, TypedDict

from rdflib import Graph, Literal, Namespace
from rdflib.namespace import XSD

if TYPE_CHECKING:

    class TopologyDecoder(Protocol):
        def __call__(self, value: str) -> TopologyContract: ...

    decode_topology: TopologyDecoder
else:
    from json import loads as decode_topology


class ServiceContract(TypedDict):
    health_endpoint: str
    host: str
    public_route: bool
    responsibilities: list[str]


class TopologyContract(TypedDict):
    backup_owner: str
    restore_order: list[str]
    services: dict[str, ServiceContract]


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GRAPHDB_CONFIG = REPOSITORY_ROOT / "deployment" / "graphdb" / "repository-config.ttl"
TOPOLOGY_CONTRACT = REPOSITORY_ROOT / "deployment" / "topology-contract.json"
SAIL = Namespace("http://www.openrdf.org/config/sail#")
SAIL_SHACL = Namespace("http://rdf4j.org/config/sail/shacl#")


def test_repository_config_creates_shacl_sail_from_the_start() -> None:
    # Given
    graph = Graph()

    # When
    _ = graph.parse(GRAPHDB_CONFIG, format="turtle")

    # Then
    shacl_sails = tuple(
        subject
        for subject in graph.subjects(
            SAIL.sailType,
            Literal("rdf4j:ShaclSail"),
        )
    )
    assert len(shacl_sails) == 1
    shacl_sail = shacl_sails[0]
    assert (
        shacl_sail,
        SAIL_SHACL.validationEnabled,
        Literal("true", datatype=XSD.boolean),
    ) in graph
    assert (
        shacl_sail,
        SAIL_SHACL.shapesGraph,
        RDF4J_SHACL_GRAPH,
    ) in graph
    assert tuple(graph.objects(shacl_sail, SAIL.delegate))


RDF4J_SHACL_GRAPH = Namespace("http://rdf4j.org/schema/rdf4j#").SHACLShapeGraph


def test_release_compose_pins_graphdb_and_keeps_port_private() -> None:
    # Given / When
    compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    lock = (REPOSITORY_ROOT / "deployment" / "image-digests.lock").read_text(
        encoding="utf-8",
    )

    # Then
    expected = (
        "ontotext/graphdb@sha256:e66ad4c6cbec16bb209735d4f777c97bab8c508cdd7709d916abe854612052d3"
    )
    assert f"image: {expected}" in compose
    assert f"graphdb={expected}" in lock
    assert "7200:7200" not in compose
    assert "graph-private:" in compose
    assert "internal: true" in compose


def test_compose_has_private_noninteractive_graphdb_projection_path() -> None:
    # Given / When
    compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    dockerfile = (
        REPOSITORY_ROOT / "deployment" / "graphdb" / "projector.Dockerfile"
    ).read_text(encoding="utf-8")
    lock = (REPOSITORY_ROOT / "deployment" / "image-digests.lock").read_text(
        encoding="utf-8",
    )

    # Then
    assert "graphdb-projector:" in compose
    assert 'profiles: ["graphdb-integration"]' in compose
    assert "condition: service_completed_successfully" in compose
    assert "--graphdb-url" in compose
    assert "http://graphdb:7200" in compose
    assert "graph-private" in compose
    assert "http://localhost:7200/rest/repositories" in compose
    assert "http://localhost:7200/ || exit 1" not in compose
    assert "graphdb-projector=" in lock
    assert dockerfile.startswith("FROM ghcr.io/astral-sh/uv@sha256:")


def test_bootstrap_verifies_existing_shacl_config_and_project_shapes() -> None:
    # Given / When
    compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    bootstrap = compose.split("  graphdb-bootstrap:", 1)[1].split(
        "  graphdb-projector:",
        1,
    )[0]

    # Then
    assert "pipeline.graphdb_bootstrap" in bootstrap
    assert "grep -q" not in bootstrap
    assert "curlimages/curl" not in bootstrap


def test_topology_contract_has_no_public_graphdb_route_and_restore_is_canonical_first() -> None:
    # Given / When
    contract = decode_topology(
        TOPOLOGY_CONTRACT.read_text(encoding="utf-8"),
    )

    # Then
    graphdb = contract["services"]["graphdb"]
    assert graphdb["public_route"] is False
    assert graphdb["host"] == "external-stateful-host"
    assert contract["backup_owner"]
    assert contract["restore_order"][:2] == [
        "restore-postgres",
        "recreate-graphdb-repository",
    ]


def test_task7_docs_name_canonical_outbox_and_runtime_verification() -> None:
    # Given / When
    topology = (REPOSITORY_ROOT / "docs" / "deployment-topology.md").read_text(
        encoding="utf-8",
    )
    graphdb = (REPOSITORY_ROOT / "deployment" / "graphdb" / "README.md").read_text(
        encoding="utf-8",
    )

    # Then
    for document in (topology, graphdb):
        assert "pipeline.project_outbox" in document
        assert "pipeline.project_graph" in document
        assert "PostgreSQL-outbox" in document
        assert "fresh-volume" in document
    assert "pinned GraphDB runtime path is verified" in topology
    assert "real GraphDB runtime path is verified" in graphdb
