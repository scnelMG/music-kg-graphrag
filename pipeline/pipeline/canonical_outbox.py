from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import TYPE_CHECKING, LiteralString, Protocol, final
from uuid import UUID

import psycopg
from psycopg import sql
from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF, XSD

from .projection_models import ProjectionEvent

if TYPE_CHECKING:
    from pathlib import Path


MUSIC = Namespace("https://w3id.org/music-kg-graphrag/ontology#")
IDENTIFIER_ROOT = "https://w3id.org/music-kg-graphrag/id"


class SqlDatabase(Protocol):
    def execute(
        self,
        query: LiteralString,
        parameters: tuple[str, ...] = (),
    ) -> list[tuple[str, ...]]: ...

    def commit(self) -> None: ...


@final
class PsycopgDatabase:
    def __init__(self, database_url: str) -> None:
        self._connection: psycopg.Connection[tuple[str, ...]] = psycopg.connect(
            database_url,
        )

    def execute(
        self,
        query: LiteralString,
        parameters: tuple[str, ...] = (),
    ) -> list[tuple[str, ...]]:
        with self._connection.cursor() as cursor:
            _ = cursor.execute(sql.SQL(query), parameters)
            if cursor.description is None:
                return []
            return cursor.fetchall()

    def commit(self) -> None:
        self._connection.commit()

    def close(self) -> None:
        self._connection.close()


@dataclass(frozen=True, slots=True)
class ClaimedOutboxEvent:
    event_id: UUID
    aggregate_type: str
    aggregate_id: UUID
    event_type: str
    attempt: int
    generation_id: UUID
    generation_number: int
    lease_started_at: str


@dataclass(frozen=True, slots=True)
class ReleaseGroupRow:
    stable_id: str
    title: str
    artist_id: str
    artist_name: str


@dataclass(frozen=True, slots=True)
class ReleaseRow:
    stable_id: str
    release_group_id: str
    title: str
    external_id: str


@dataclass(frozen=True, slots=True)
class ReviewRow:
    stable_id: str
    user_id: str
    user_name: str
    release_group_id: str
    rating_value: str
    context_value: str


@dataclass(frozen=True, slots=True)
class CanonicalGraphRows:
    release_groups: tuple[ReleaseGroupRow, ...]
    releases: tuple[ReleaseRow, ...]
    reviews: tuple[ReviewRow, ...] = ()


@final
class CanonicalOutboxStore:
    def __init__(self, database: SqlDatabase) -> None:
        self._database = database

    def claim_due(self) -> ClaimedOutboxEvent | None:
        rows = self._database.execute(
            """
            WITH candidate AS (
                SELECT id
                FROM outbox_events
                WHERE (
                    state IN ('PENDING', 'RETRYABLE_FAILED')
                    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                ) OR (
                    state = 'PROCESSING'
                    AND processed_at <= now() - interval '5 minutes'
                )
                ORDER BY created_at, id
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            ), generation_lock AS MATERIALIZED (
                SELECT pg_advisory_xact_lock(71407)
            ), generation AS (
                INSERT INTO projection_generations(id, generation, status, created_at)
                SELECT candidate.id,
                       COALESCE((SELECT max(generation) FROM projection_generations), 0) + 1,
                       'ACTIVE', now()
                FROM candidate CROSS JOIN generation_lock
                ON CONFLICT (id) DO UPDATE
                SET status = 'ACTIVE', completed_at = NULL
                RETURNING id, generation
            ), claimed AS (
                UPDATE outbox_events event
                SET state = 'PROCESSING', attempts = attempts + 1, processed_at = now()
                FROM candidate
                WHERE event.id = candidate.id
                RETURNING event.id::text, event.aggregate_type,
                          event.aggregate_id::text, event.event_type, event.attempts::text,
                          event.processed_at::text
            )
            SELECT claimed.*, generation.id::text, generation.generation::text
            FROM claimed CROSS JOIN generation
            """,
        )
        self._database.commit()
        if not rows:
            return None
        (
            event_id,
            aggregate_type,
            aggregate_id,
            event_type,
            attempt,
            lease_started_at,
            generation_id,
            generation_number,
        ) = rows[0]
        return ClaimedOutboxEvent(
            event_id=UUID(event_id),
            aggregate_type=aggregate_type,
            aggregate_id=UUID(aggregate_id),
            event_type=event_type,
            attempt=int(attempt),
            generation_id=UUID(generation_id),
            generation_number=int(generation_number),
            lease_started_at=lease_started_at,
        )

    def graph_rows(self) -> CanonicalGraphRows:
        release_group_rows = self._database.execute(
            """
            SELECT release_group.id::text, release_group.title,
                   COALESCE(credited.artist_id, ''), COALESCE(credited.artist_name, '')
            FROM release_groups release_group
            LEFT JOIN LATERAL (
                SELECT artist.id::text AS artist_id, artist.name AS artist_name
                FROM credits credit
                JOIN artists artist ON artist.id = credit.artist_id
                WHERE credit.release_group_id = release_group.id
                ORDER BY credit.position, credit.id
                LIMIT 1
            ) credited ON true
            ORDER BY release_group.id
            """,
        )
        release_rows = self._database.execute(
            """
            SELECT release.id::text, release.release_group_id::text, release.title,
                   COALESCE(min(identifier.external_id), release.id::text)
            FROM releases release
            LEFT JOIN external_identifiers identifier ON identifier.release_id = release.id
            LEFT JOIN deletion_state deletion
              ON deletion.entity_kind = 'RELEASE' AND deletion.entity_id = release.id
            WHERE deletion.state IS NULL OR deletion.state = 'PENDING'
            GROUP BY release.id, release.release_group_id, release.title
            ORDER BY release.id
            """,
        )
        review_rows = self._database.execute(
            """
            SELECT review.id::text, review.user_id::text, app_user.display_name,
                   release.release_group_id::text, review.rating::text,
                   COALESCE(context.value, '')
            FROM reviews review
            JOIN users app_user ON app_user.id = review.user_id
            JOIN releases release ON release.id = review.release_id
            LEFT JOIN review_contexts context ON context.review_id = review.id
            WHERE review.deleted_at IS NULL
            ORDER BY review.id, context.id
            """,
        )
        return CanonicalGraphRows(
            release_groups=tuple(ReleaseGroupRow(*row) for row in release_group_rows),
            releases=tuple(ReleaseRow(*row) for row in release_rows),
            reviews=tuple(ReviewRow(*row) for row in review_rows),
        )

    def mark_succeeded(self, event: ClaimedOutboxEvent) -> bool:
        transitioned = self._database.execute(
            """
            UPDATE outbox_events
            SET state = 'SUCCEEDED', next_attempt_at = NULL,
                last_redacted_error_code = NULL, processed_at = now()
            WHERE id = %s::uuid AND state = 'PROCESSING'
              AND processed_at = %s::timestamptz
            RETURNING id::text
            """,
            (str(event.event_id), event.lease_started_at),
        )
        if transitioned:
            _ = self._database.execute(
                """
                UPDATE projection_generations SET completed_at = now()
                WHERE id = %s::uuid
                """,
                (str(event.generation_id),),
            )
        self._database.commit()
        return bool(transitioned)

    def mark_retryable(self, event: ClaimedOutboxEvent, error_code: str) -> bool:
        delay = 1 << min(event.attempt - 1, 5)
        transitioned = self._database.execute(
            """
            UPDATE outbox_events
            SET state = 'RETRYABLE_FAILED',
                next_attempt_at = now() + make_interval(secs => %s::int),
                last_redacted_error_code = %s, processed_at = NULL
            WHERE id = %s::uuid AND state = 'PROCESSING'
              AND processed_at = %s::timestamptz
            RETURNING id::text
            """,
            (str(delay), error_code, str(event.event_id), event.lease_started_at),
        )
        if transitioned:
            _ = self._database.execute(
                """
                UPDATE projection_generations SET status = 'STALE', completed_at = now()
                WHERE id = %s::uuid
                """,
                (str(event.generation_id),),
            )
        self._database.commit()
        return bool(transitioned)

    def mark_terminal(self, event: ClaimedOutboxEvent, error_code: str) -> bool:
        transitioned = self._database.execute(
            """
            UPDATE outbox_events
            SET state = 'TERMINAL_FAILED', next_attempt_at = NULL,
                last_redacted_error_code = %s, processed_at = now()
            WHERE id = %s::uuid AND state = 'PROCESSING'
              AND processed_at = %s::timestamptz
            RETURNING id::text
            """,
            (error_code, str(event.event_id), event.lease_started_at),
        )
        if transitioned:
            _ = self._database.execute(
                """
                UPDATE projection_generations SET status = 'STALE', completed_at = now()
                WHERE id = %s::uuid
                """,
                (str(event.generation_id),),
            )
        self._database.commit()
        return bool(transitioned)

    def owns_lease(self, event: ClaimedOutboxEvent) -> bool:
        rows = self._database.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM outbox_events
                WHERE id = %s::uuid AND state = 'PROCESSING'
                  AND processed_at = %s::timestamptz
            )::text
            """,
            (str(event.event_id), event.lease_started_at),
        )
        return bool(rows and rows[0][0] == "true")

    def replay_terminal(self, event_id: UUID) -> bool:
        rows = self._database.execute(
            "SELECT replay_terminal_outbox_event(%s::uuid, now())::text",
            (str(event_id),),
        )
        self._database.commit()
        return bool(rows and rows[0][0] == "true")


def canonical_projection_event(
    event: ClaimedOutboxEvent,
    rows: CanonicalGraphRows,
    directory: Path,
) -> ProjectionEvent:
    graph = Graph()
    complete_release_groups = {
        release_group.stable_id
        for release_group in rows.release_groups
        if release_group.artist_id and release_group.artist_name
    }
    for release_group in rows.release_groups:
        group = URIRef(f"{IDENTIFIER_ROOT}/release-group/{release_group.stable_id}")
        _ = graph.add(
            (group, MUSIC.title, Literal(release_group.title, datatype=XSD.string)),
        )
        _ = graph.add(
            (group, MUSIC.stableId, Literal(release_group.stable_id, datatype=XSD.string)),
        )
        if release_group.stable_id in complete_release_groups:
            artist = URIRef(f"{IDENTIFIER_ROOT}/artist/{release_group.artist_id}")
            _ = graph.add((artist, RDF.type, MUSIC.Artist))
            _ = graph.add(
                (artist, MUSIC.title, Literal(release_group.artist_name, datatype=XSD.string)),
            )
            _ = graph.add((group, RDF.type, MUSIC.ReleaseGroup))
            _ = graph.add((group, MUSIC.createdBy, artist))
    for release in rows.releases:
        subject = URIRef(f"{IDENTIFIER_ROOT}/release/{release.stable_id}")
        group = URIRef(f"{IDENTIFIER_ROOT}/release-group/{release.release_group_id}")
        _ = graph.add((subject, MUSIC.releaseOf, group))
        _ = graph.add((subject, MUSIC.title, Literal(release.title, datatype=XSD.string)))
        _ = graph.add(
            (subject, MUSIC.stableId, Literal(release.stable_id, datatype=XSD.string)),
        )
        _ = graph.add(
            (subject, MUSIC.externalId, Literal(release.external_id, datatype=XSD.string)),
        )
        if release.release_group_id in complete_release_groups:
            _ = graph.add((subject, RDF.type, MUSIC.Release))
    for review in rows.reviews:
        subject = URIRef(f"{IDENTIFIER_ROOT}/review/{review.stable_id}")
        user = URIRef(f"{IDENTIFIER_ROOT}/user/{review.user_id}")
        group = URIRef(f"{IDENTIFIER_ROOT}/release-group/{review.release_group_id}")
        _ = graph.add((user, RDF.type, MUSIC.User))
        _ = graph.add((user, MUSIC.title, Literal(review.user_name, datatype=XSD.string)))
        _ = graph.add((subject, MUSIC.targetReleaseGroup, group))
        _ = graph.add(
            (subject, MUSIC.ratingValue, Literal(review.rating_value, datatype=XSD.decimal)),
        )
        rating_label = {"5": "loved", "4": "liked", "3": "mixed"}.get(
            review.rating_value,
            "disliked",
        )
        _ = graph.add(
            (subject, MUSIC.ratingLabel, Literal(rating_label, datatype=XSD.string)),
        )
        complete_review = bool(
            review.context_value and review.release_group_id in complete_release_groups,
        )
        if review.context_value:
            digest = hashlib.sha256(review.context_value.encode()).hexdigest()
            context = URIRef(f"{IDENTIFIER_ROOT}/listening-context/{digest}")
            _ = graph.add((context, RDF.type, MUSIC.ListeningContext))
            _ = graph.add(
                (context, MUSIC.title, Literal(review.context_value, datatype=XSD.string)),
            )
            _ = graph.add((subject, MUSIC.hasListeningContext, context))
        if complete_review:
            _ = graph.add((user, MUSIC.wroteReview, subject))
            _ = graph.add((subject, RDF.type, MUSIC.UserReview))

    directory.mkdir(parents=True, exist_ok=True)
    rdf_path = directory / f"outbox-{event.event_id}.ttl"
    _ = graph.serialize(destination=rdf_path, format="turtle")
    return ProjectionEvent(
        event_id=str(event.event_id),
        source="postgresql",
        generation=str(event.generation_id),
        rdf_path=rdf_path,
        fixture_retry_failures=0,
    )
