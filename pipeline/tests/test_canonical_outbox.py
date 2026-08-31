from __future__ import annotations

from pathlib import Path
from typing import LiteralString, final
from uuid import UUID

import psycopg
import pytest
from rdflib import Graph, URIRef
from rdflib.namespace import RDF
from testcontainers.postgres import PostgresContainer

from pipeline.canonical_outbox import (
    CanonicalGraphRows,
    CanonicalOutboxStore,
    ClaimedOutboxEvent,
    PsycopgDatabase,
    ReleaseGroupRow,
    ReleaseRow,
    ReviewRow,
    canonical_projection_event,
)
from pipeline.validate_rdf import validate_rdf_path

MUSIC = "https://w3id.org/music-kg-graphrag/ontology#"
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
POSTGRES_IMAGE = "postgres:16-alpine"


@final
class RecordingDatabase:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[str, ...]]] = []
        self.claimed: bool = False

    def execute(
        self,
        query: LiteralString,
        parameters: tuple[str, ...] = (),
    ) -> list[tuple[str, ...]]:
        self.executed.append((query, parameters))
        if "RETURNING event.id::text" in query and not self.claimed:
            self.claimed = True
            return [
                (
                    "11111111-1111-1111-1111-111111111111",
                    "REVIEW",
                    "22222222-2222-2222-2222-222222222222",
                    "REVIEW_SAVED",
                    "1",
                    "2026-07-31T12:00:00+00:00",
                    "11111111-1111-1111-1111-111111111111",
                    "7",
                ),
            ]
        return []

    def commit(self) -> None:
        return


def test_claim_due_event_uses_canonical_outbox_state_transition() -> None:
    # Given
    database = RecordingDatabase()
    store = CanonicalOutboxStore(database)

    # When
    claimed = store.claim_due()

    # Then
    assert claimed == ClaimedOutboxEvent(
        event_id=UUID("11111111-1111-1111-1111-111111111111"),
        aggregate_type="REVIEW",
        aggregate_id=UUID("22222222-2222-2222-2222-222222222222"),
        event_type="REVIEW_SAVED",
        attempt=1,
        generation_id=UUID("11111111-1111-1111-1111-111111111111"),
        generation_number=7,
        lease_started_at="2026-07-31T12:00:00+00:00",
    )
    query = database.executed[0][0]
    assert "FOR UPDATE SKIP LOCKED" in query
    assert "state = 'PROCESSING'" in query
    assert "RETRYABLE_FAILED" in query


def test_canonical_rows_become_named_generation_graph(tmp_path: Path) -> None:
    # Given
    event = ClaimedOutboxEvent(
        event_id=UUID("11111111-1111-1111-1111-111111111111"),
        aggregate_type="REVIEW",
        aggregate_id=UUID("22222222-2222-2222-2222-222222222222"),
        event_type="REVIEW_SAVED",
        attempt=1,
        generation_id=UUID("11111111-1111-1111-1111-111111111111"),
        generation_number=7,
        lease_started_at="2026-07-31T12:00:00+00:00",
    )
    rows = CanonicalGraphRows(
        release_groups=(
            ReleaseGroupRow(
                stable_id="33333333-3333-3333-3333-333333333333",
                title="Canonical album",
                artist_id="44444444-4444-4444-4444-444444444444",
                artist_name="Canonical artist",
            ),
        ),
        releases=(
            ReleaseRow(
                stable_id="55555555-5555-5555-5555-555555555555",
                release_group_id="33333333-3333-3333-3333-333333333333",
                title="Canonical edition",
                external_id="release-external-id",
            ),
        ),
        reviews=(
            ReviewRow(
                stable_id="66666666-6666-6666-6666-666666666666",
                user_id="77777777-7777-7777-7777-777777777777",
                user_name="Canonical listener",
                release_group_id="33333333-3333-3333-3333-333333333333",
                rating_value="4",
                context_value="",
            ),
        ),
    )

    # When
    projection = canonical_projection_event(event, rows, tmp_path)

    # Then
    assert projection.graph_iri.endswith(
        "/graph/postgresql/generation/11111111-1111-1111-1111-111111111111",
    )
    graph = Graph().parse(projection.rdf_path, format="turtle")
    release = URIRef(
        "https://w3id.org/music-kg-graphrag/id/release/55555555-5555-5555-5555-555555555555",
    )
    review = URIRef(
        "https://w3id.org/music-kg-graphrag/id/review/66666666-6666-6666-6666-666666666666",
    )
    assert (release, RDF.type, URIRef(f"{MUSIC}Release")) in graph
    assert (review, URIRef(f"{MUSIC}ratingValue"), None) in graph
    assert validate_rdf_path(projection.rdf_path).conforms is True


def test_v1_valid_incomplete_credit_rows_preserve_values_and_conform(tmp_path: Path) -> None:
    # Given
    event = ClaimedOutboxEvent(
        event_id=UUID("11111111-1111-1111-1111-111111111111"),
        aggregate_type="REVIEW",
        aggregate_id=UUID("22222222-2222-2222-2222-222222222222"),
        event_type="REVIEW_SAVED",
        attempt=1,
        generation_id=UUID("11111111-1111-1111-1111-111111111111"),
        generation_number=7,
        lease_started_at="2026-07-31T12:00:00+00:00",
    )
    rows = CanonicalGraphRows(
        release_groups=(
            ReleaseGroupRow(
                stable_id="33333333-3333-3333-3333-333333333333",
                title="Credit pending",
                artist_id="",
                artist_name="",
            ),
        ),
        releases=(
            ReleaseRow(
                stable_id="55555555-5555-5555-5555-555555555555",
                release_group_id="33333333-3333-3333-3333-333333333333",
                title="Canonical edition",
                external_id="55555555-5555-5555-5555-555555555555",
            ),
        ),
    )

    # When
    projection = canonical_projection_event(event, rows, tmp_path)
    graph = Graph().parse(projection.rdf_path, format="turtle")

    # Then
    group = URIRef(
        "https://w3id.org/music-kg-graphrag/id/release-group/33333333-3333-3333-3333-333333333333",
    )
    assert (group, URIRef(f"{MUSIC}title"), None) in graph
    assert validate_rdf_path(projection.rdf_path).conforms is True


@pytest.mark.integration
def test_real_postgres_claim_success_and_terminal_replay() -> None:
    # Given
    migration = (
        REPOSITORY_ROOT
        / "backend"
        / "src"
        / "main"
        / "resources"
        / "db"
        / "migration"
        / "V1__canonical_music_core.sql"
    ).read_text(encoding="utf-8")
    event_id = UUID("11111111-1111-1111-1111-111111111111")
    aggregate_id = UUID("22222222-2222-2222-2222-222222222222")

    with PostgresContainer(POSTGRES_IMAGE, driver=None) as postgres:
        database_url = postgres.get_connection_url(driver=None)
        with psycopg.connect(database_url) as connection:
            connection.execute(migration)
            connection.execute(
                """
                INSERT INTO outbox_events(
                    id, aggregate_type, aggregate_id, event_type,
                    payload_json, state, attempts, created_at
                ) VALUES (%s, 'REVIEW', %s, 'REVIEW_SAVED', '{}', 'PENDING', 0, now())
                """,
                (event_id, aggregate_id),
            )
        database = PsycopgDatabase(database_url)
        store = CanonicalOutboxStore(database)

        # When
        claimed = store.claim_due()
        assert claimed is not None
        store.mark_terminal(claimed, "SHACL_NONCONFORMANT")
        replayed = store.replay_terminal(event_id)
        reclaimed = store.claim_due()

        # Then
        assert replayed is True
        assert reclaimed is not None
        assert reclaimed.event_id == event_id
        assert reclaimed.attempt == 2
        database.close()


@pytest.mark.integration
def test_expired_holder_cannot_finish_new_lease_and_generation_is_stable() -> None:
    # Given
    migration = (
        REPOSITORY_ROOT
        / "backend"
        / "src"
        / "main"
        / "resources"
        / "db"
        / "migration"
        / "V1__canonical_music_core.sql"
    ).read_text(encoding="utf-8")
    event_id = UUID("11111111-1111-1111-1111-111111111111")
    aggregate_id = UUID("22222222-2222-2222-2222-222222222222")
    with PostgresContainer(POSTGRES_IMAGE, driver=None) as postgres:
        database_url = postgres.get_connection_url(driver=None)
        with psycopg.connect(database_url) as connection:
            connection.execute(migration)
            connection.execute(
                """
                INSERT INTO outbox_events(
                    id, aggregate_type, aggregate_id, event_type,
                    payload_json, state, attempts, created_at
                ) VALUES (%s, 'REVIEW', %s, 'REVIEW_SAVED', '{}', 'PENDING', 0, now())
                """,
                (event_id, aggregate_id),
            )
        first_database = PsycopgDatabase(database_url)
        second_database = PsycopgDatabase(database_url)
        first_store = CanonicalOutboxStore(first_database)
        second_store = CanonicalOutboxStore(second_database)
        first = first_store.claim_due()
        assert first is not None
        with psycopg.connect(database_url) as connection:
            connection.execute(
                "UPDATE outbox_events SET processed_at = "
                "now() - interval '6 minutes' WHERE id = %s",
                (event_id,),
            )

        # When
        second = second_store.claim_due()
        assert second is not None
        first_owns_lease = first_store.owns_lease(first)
        second_owns_lease = second_store.owns_lease(second)
        stale_transitioned = first_store.mark_succeeded(first)

        # Then
        assert first_owns_lease is False
        assert second_owns_lease is True
        assert stale_transitioned is False
        assert second.generation_id == first.generation_id == event_id
        with psycopg.connect(database_url) as connection:
            state, attempts = connection.execute(
                "SELECT state, attempts FROM outbox_events WHERE id = %s",
                (event_id,),
            ).fetchone()
            generation_count = connection.execute(
                "SELECT count(*) FROM projection_generations WHERE id = %s",
                (event_id,),
            ).fetchone()[0]
        assert state == "PROCESSING"
        assert attempts == 2
        assert generation_count == 1
        first_database.close()
        second_database.close()
